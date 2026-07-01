import fs from 'node:fs'
import path from 'node:path'
import settings from './settings.js'
import SSHClient from './modules/ssh.js'
import Builder from './modules/builder.js'
import DockerLocalBuilder from './modules/docker/local.js'
import { ensureDockerImageTag, getDockerBuildMode } from './modules/docker/config.js'
import { backup, deploy, rollback } from './modules/deploy.js'
import {
  execHook,
  getDeployConfigPath,
  checkDeployConfig,
  resolveDeployPath,
  formatFileSize,
  askRebuildWhenDistExists,
  resolveProjectMeta
} from './utils/index.js'
import {
  buildDeployPlan,
  createStepRunner,
  resolveBuildCmd
} from './utils/cli-run.js'
import logger, { addTransport } from './utils/logger.js'
import {
  deployHeader,
  rollbackHeader,
  progress,
  fail,
  section,
  deploySummary,
  deployContextLines,
  shortLocalPath
} from './utils/cli-log.js'
import { delayer } from './utils/delayer.js'
import dayjs from 'dayjs'
import intersection from 'lodash/intersection.js'

export { addTransport }
export {
  hasProjectManifest,
  resolveProjectMeta,
  resolveProjectName
} from './utils/project-meta.js'
/**
 *
 * @param {import('index').DeployConfig} config
 * @param {import('index').DeployOptions} options
 */
export default async function autodeploy(config, options) {
  const rootPath = process.cwd()
  const projectMeta = resolveProjectMeta(rootPath, config)

  settings.packageInfo = projectMeta.packageInfo
  settings.deployConfig = config
  config.projectName = projectMeta.projectName

  logger.debug(
    `projectName 来自 ${projectMeta.source}: ${config.projectName}`
  )
  if (projectMeta.manifest) {
    logger.debug(
      `项目清单 ${projectMeta.manifest.source}：${projectMeta.manifest.name}`
    )
  } else if (projectMeta.packageInfo) {
    logger.debug('package.json：' + JSON.stringify(projectMeta.packageInfo))
  }

  const startTime = new Date()

  const envLabel = config.name || config.env
  if (options.rollback) {
    logger.info(rollbackHeader(config.projectName, envLabel))
  } else {
    logger.info(deployHeader(config.projectName, envLabel))
    for (const line of deployContextLines(config, options)) {
      logger.info(line, { cliContext: true })
    }
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

    const elapsed = (new Date() - startTime) / 1000
    logger.log(
      level,
      `${action}结束 · ${elapsed >= 1 ? `${elapsed.toFixed(1)}s` : `${Math.round(elapsed * 1000)}ms`}`
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

    const hadDeployPath = !!config.deploy?.deployPath?.trim()
    config.deploy.deployPath = resolveDeployPath(config)
    if (!hadDeployPath && config.deploy?.docker) {
      logger.debug(
        `未配置 deployPath，Docker 模式使用临时目录: ${config.deploy.deployPath}`
      )
    }
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
    /** @type {string} */
    let artifactLine = ''

    if (!!options.rollback) {
      let sshClients = [],
        backupList
      for (let server of servers) {
        const sshClient = new SSHClient(
          { ...server, agent: config.agent, proxy: config.proxy },
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

      const elapsed = (new Date() - startTime) / 1000
      finishMsg = deploySummary(
        successCount,
        servers.length,
        `回退 ${version}`,
        elapsed
      )
    } else {
      const useZipFile = !!(options.file && fs.existsSync(options.file))
      const buildCmd = resolveBuildCmd(config)
      let skipBuild = false

      if (!useZipFile && buildCmd) {
        const shouldRebuild = await askRebuildWhenDistExists(config.prompt, {
          distPath: config.build?.distPath || 'dist'
        })
        skipBuild = !shouldRebuild
      }

      const plan = buildDeployPlan(config, options, {
        skipBuild,
        useZipFile
      })
      const steps = createStepRunner(logger, plan.total)

      let outputPkgName = ''
      let builder
      /** 是否为本次部署自动生成的 zip（可安全删除） */
      let createdPkg = false
      let imageTarLocalPath = null

      try {
        if (useZipFile) {
          steps.skip('打包', '使用指定 zip')
          outputPkgName = options.file
        } else {
          builder = new Builder(config.env)
          outputPkgName = builder.outputPkgName
          createdPkg = true
          const distPath = config.build?.distPath || 'dist'

          if (buildCmd) {
            if (skipBuild) {
              steps.skip('构建', `使用已有 ${distPath}`)
            } else {
              const buildTitle = progress(`构建项目（${buildCmd}）`)
              const formatBuildProgress = (lines) => {
                if (!lines?.length) {
                  return buildTitle
                }
                return `${buildTitle}\n${lines.map((line) => `  ${line}`).join('\n')}`
              }

              steps.start(`构建项目（${buildCmd}）`)
              await execHook('buildBefore', { config })
              try {
                await builder.build(buildCmd, (lines) => {
                  steps.progress(formatBuildProgress(lines), {
                    buildTail: true
                  })
                })
                steps.succeed(buildCmd)
              } catch (error) {
                steps.failStep(error)
                throw error
              }
              await execHook('buildAfter', { config })
            }
          } else {
            logger.warn('未配置构建命令，跳过构建')
          }

          await execHook('compressBefore', { config })
          steps.start('打包')
          try {
            const buildRes = await builder.zip(distPath)
            const zipSize = formatFileSize(buildRes.size)
            steps.succeed(zipSize, outputPkgName)
            await execHook('compressAfter', { config })
          } catch (error) {
            steps.failStep(error)
            throw error
          }
        }

        if (config.deploy?.docker) {
          ensureDockerImageTag(config)
          if (getDockerBuildMode(config.deploy.docker) === 'local') {
            await DockerLocalBuilder.checkDockerCli()
            const distPath = config.build?.distPath || 'dist'
            steps.start('构建镜像')
            try {
              imageTarLocalPath = await DockerLocalBuilder.buildAndSave(
                config,
                distPath
              )
              steps.succeed(shortLocalPath(imageTarLocalPath))
            } catch (error) {
              steps.failStep(error)
              throw error
            }
          }
        }

        const backupName = `bak_${dayjs().format('YYYYMMDD_HH_mm_ss')}`
        for (let server of servers) {
          const sshClient = new SSHClient(
            { ...server, agent: config.agent, proxy: config.proxy },
            config
          )
          try {
            await sshClient.connect()
            logger.info(section(sshClient.host), { section: true })

            const res = await deploy(sshClient, config, {
              backup: options.backup,
              backupName,
              pkgPath: outputPkgName,
              imageTarLocalPath,
              stepRunner: steps
            })

            if (res?.ok) {
              successCount++
              if (res.fullImage) {
                artifactLine = `镜像 ${res.fullImage}`
              }
            } else {
              failCount++
            }
          } catch (error) {
            failCount++
            logger.error(fail('部署到服务器', error), { host: server.host })
          } finally {
            try {
              sshClient.disconnect()
            } catch (_error) {
              /* ignore */
            }
          }
        }

        const elapsed = (new Date() - startTime) / 1000
        finishMsg = deploySummary(
          successCount,
          servers.length,
          envLabel,
          elapsed,
          artifactLine
        )
      } finally {
        try {
          if (createdPkg && outputPkgName) {
            await Builder.deletePkgFile(outputPkgName)
            logger.debug(`已清理本地 zip · ${path.basename(outputPkgName)}`)
          }
          if (imageTarLocalPath) {
            await DockerLocalBuilder.deleteImageTar(imageTarLocalPath)
            logger.debug(
              `已清理本地镜像包 · ${path.basename(imageTarLocalPath)}`
            )
          }
        } catch (error) {
          logger.warn(fail('清理本地临时文件', error))
        }
      }
    }

    if (successCount === servers.length) {
      logger.info(finishMsg, { success: true })
    } else if (failCount === servers.length) {
      logger.error(finishMsg)
    } else {
      logger.warn(finishMsg)
    }

    await delayer(1)

    process.exit(0)
  } catch (error) {
    logger.error(fail('部署流程', error))
    process.exit(1)
  }
}
