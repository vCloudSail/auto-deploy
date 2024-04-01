import fs from 'node:fs'
import path from 'node:path'
import settings from './settings.js'
import SSHClient from './modules/ssh.js'
import Builder from './modules/builder.js'
import { backup, deploy, rollback } from './modules/deploy.js'
import {
  execHook,
  getDeployConfigPath,
  checkDeployConfig,
  formatFileSize
} from './utils/index.js'
import logger, { addTransport } from './utils/logger.js'
import { delayer } from './utils/delayer.js'
import dayjs from 'dayjs'
import intersection from 'lodash/intersection.js'

export { addTransport }
/**
 *
 * @param {import('index').DeployConfig} config
 * @param {import('index').DeployOptions} options
 */
export default async function autodeploy(config, options) {
  const packageResult = fs
    .readFileSync(path.resolve(process.cwd(), 'package.json'))
    .toString()

  logger.debug('package.json：' + packageResult)

  settings.projectPackage = JSON.parse(packageResult)
  settings.deployConfig = config
  settings.deployConfig.projectName = (
    settings.deployConfig.projectName ||
    settings.projectPackage.name ||
    ''
  ).replace(/\/|\\|:|\*|\?|"|<|>|\|/g, '_')

  const startTime = new Date()

  if (options.rollback) {
    logger.info(
      `版本回退 [${config.projectName}] -> (${config.name || config.env})`
    )
  } else {
    logger.info(
      `自动化部署 [${config.projectName}] -> (${config.name || config.env})`
    )
  }

  function logOnExit(code) {
    let action = '',
      level = 'info'

    switch (code) {
      case 1001:
        level = 'warn'
        action = '用户强制退出，'
        break
    }

    logger.log(
      level,
      `${action}部署结束，总耗时：${(new Date() - startTime) / 1000}秒 \r\n\r\n`
    )
  }

  function forceExit() {
    process.exit(1001)
  }
  ;['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGKILL', 'SIGBREAK'].forEach((item) => {
    process.once(item, forceExit)
  })
  process.once('exit', logOnExit)

  try {
    checkDeployConfig(config)

    const servers = Array.isArray(config.server)
      ? config.server
      : [config.server]

    config.deploy.deployPath = config.deploy.deployPath
      .trim()
      .replace(/[/]$/gim, '')
    config.deploy.backupPath = getDeployConfigPath(
      config,
      config.deploy.backupPath,
      '_backup'
    )
    config.deploy.logPath = getDeployConfigPath(
      config,
      config.deploy.logPath,
      '_logs'
    )

    let finishMsg = ''
    let successCount = 0,
      failCount = 0

    if (!!options.rollback) {
      let sshClients = [],
        backupList
      for (let server of servers) {
        const sshClient = new SSHClient(
          { ...server, agent: config.agent },
          config
        )
        try {
          await sshClient.connect()
        } catch (error) {
          process.exit(0)
          return
        }
        sshClients.push(sshClient)

        const list = (await sshClient.exec('ls -t ' + config.deploy.backupPath))
          ?.replace(/[\n]$/, '')
          .split('\n')
        if (!list) {
          continue
        }

        if (backupList) {
          // 计算并集
          backupList = intersection(backupList, list)
        } else {
          backupList = list
        }
      }

      if (backupList.length === 0) {
        logger.warn('未找到备份文件，退出回滚')
        sshClients.forEach((item) => item.disconnect())
        process.exit(0)
        return
      }

      const { version } = await settings.deployConfig?.prompt?.([
        {
          type: 'list',
          name: 'version',
          message:
            '请选择回退的目标版本（多个服务器时，只会展示相同名称的备份）',
          choices: backupList
            ?.filter((item) => /[.]tar[.]gz$/gi.test(item))
            .map((item) => {
              return {
                value: item,
                label: item.replace('.tar.gz', '')
              }
            })
        }
      ])

      for (let client of sshClients) {
        try {
          await rollback(client, {
            backupPath: config.deploy.backupPath,
            deployPath: config.deploy.deployPath,
            backupList,
            version
          })
          successCount++
        } catch (error) {
          failCount++
        }
        client.disconnect()
      }

      finishMsg = `共${servers.length}个服务器回滚到版本${version}：${successCount}个成功，${failCount}个失败`
    } else {
      logger.info(
        `部署信息：` +
          `\r\n    - 目标服务器： ${servers
            .map((item) => item.host)
            .join(', ')}` +
          `\r\n    - 部署路径： ${config.deploy.deployPath}` +
          `\r\n    - 是否备份： ${options.backup ? '是' : '否'}` +
          (options.backup
            ? `\r\n    - 备份路径: ${config.deploy.backupPath}`
            : '')
      )
      // #region 构建/打包项目

      /** 打包压缩后的输出文件名 */
      const builder = new Builder(config.env)

      let outputPkgName = builder.outputPkgName
      const distPath = config.build?.distPath || 'dist'

      const buildCmd =
        config.build?.cmd != null
          ? config.build?.cmd
          : `npm run ${config.build?.script || 'build'}`

      if (buildCmd) {
        logger.info(`构建项目中：${buildCmd}`, { loading: true })
        await execHook('buildBefore', { config })
        try {
          await builder.build(buildCmd)
        } catch (error) {
          logger.error('构建失败：' + error)
          throw ''
        }
        logger.info(`构建项目成功：${buildCmd}`, { success: true })
        await execHook('buildAfter', { config })
      } else {
        logger.warn('未配置构建命令，跳过构建')
      }

      await execHook('compressBefore', { config })
      logger.info(`压缩项目中：${distPath} -> ${outputPkgName}`, {
        loading: true
      })
      try {
        const buildRes = await builder.zip(distPath)

        let zipSize = formatFileSize(buildRes.size)
        logger.info(
          `压缩项目成功： ${distPath} -> ${outputPkgName} (size: ${zipSize})`,
          { success: true }
        )
        await execHook('compressAfter', { config })
      } catch (error) {
        logger.error('压缩失败 ->' + error)
        throw ''
      }
      // #endregion

      // #region 部署到服务器

      const backupName = `bak_${dayjs().format('YYYYMMDD_HH_mm_ss')}`
      for (let server of servers) {
        const sshClient = new SSHClient(
          { ...server, agent: config.agent },
          config
        )
        try {
          // logger.info(`连接服务器中 -> ${server?.host}:${server?.port}`, {
          //   loading: true
          // })
          try {
            await sshClient.connect()
          } catch (error) {
            process.exit(0)
            return
          }

          let res

          logger.info(`--------部署到服务器开始 (${sshClient.host})--------`)
          res = await deploy(sshClient, config, {
            backup: options.backup,
            backupName,
            pkgPath: outputPkgName
          })
          logger.info(`--------部署到服务器结束 (${sshClient.host})--------`)

          if (res) {
            successCount++
          } else {
            failCount++
          }
        } catch (error) {
          failCount++
        } finally {
          try {
            sshClient.disconnect()
          } catch (error) {}
        }
      }

      // #endregion

      try {
        logger.info('删除本地部署文件中', { loading: true })

        await builder.deleteZip()

        logger.info(`删除本地部署文件成功 -> ${outputPkgName}`, {
          success: true
        })
      } catch (error) {
        logger.error('删除本地部署文件失败 -> ' + error)
      }

      finishMsg = `共${servers.length}个服务器部署到${config.name}：${successCount}个成功，${failCount}个失败`
    }

    if (successCount === servers.length) {
      logger.info(finishMsg, {
        success: true
      })
    } else if (failCount === servers.length) {
      logger.error(finishMsg)
    } else {
      logger.warn(finishMsg)
    }

    await delayer(1)

    process.exit(1)
  } catch (error) {
    logger.error((error || '') + '')
    process.exit(0)
  }
}
