import path from 'node:path'

import { execHook, formatFileSize, getDefaultOperator } from '../utils/index.js'
import logger from '../utils/logger.js'
import SSHClient from './ssh.js'
import dayjs from 'dayjs'
import settings from '@/settings.js'
import { delayer } from '@/utils/delayer.js'
import NginxHelper from './nginx.js'
import DockerHelper from './docker.js'

/**
 * 备份
 * @param {SSHClient} client
 * @param {object} options
 * @param {boolean} options.success
 * @param {'deploy'|'backup'|'rollback'} options.mode
 * @param {import('index').DeployConfig} options.config
 * @param {string} options.message
 */
async function appendRecord(
  client,
  {
    mode = 'deploy',
    config = settings.deployConfig,
    message = '',
    success
  } = {}
) {
  let action = '',
    operator = await getDefaultOperator()
  try {
    switch (mode) {
      case 'backup':
        action = '备份'
        break
      case 'deploy':
        action = '部署'
        break
      case 'rollback':
        action = '版本回退'
        break
    }

    const today = dayjs().format('YYYY-MM-DD')

    await client.exec(`mkdir -p ${config.deploy.logPath}`).catch((err) => err)
    await client.exec(
      `echo "[${dayjs().format('YYYY-MM-DD HH:mm:ss.SSS')}] [${
        success ? 'Success' : 'Fail'
      }] ${operator}执行${action}${success ? '成功' : '失败'}${
        message ? `${message || '无'}` : ''
      }" >> ${config.deploy.logPath}/${today}.log`
    )
    logger.info(`服务器追加操作日志成功（${action}）`, {
      host: client.host,
      success: true
    })
  } catch (error) {
    logger.error(`服务器追加操作日志失败（${action}）：` + error, {
      host: client.host
    })
  }
}

/**
 * 备份
 * @param {SSHClient} client
 * @param {{deployPath:string,deployFolder:string,backupPath:string,backupName:string}} config
 */
export async function backup(
  client,
  { deployPath, deployFolder, backupPath, backupName } = {}
) {
  logger.info('开始备份服务器当前版本', { host: client.host, loading: true })
  try {
    let needBackUp = true
    try {
      await client.exec(`stat ${deployPath}${deployFolder}`)
    } catch (error) {
      logger.warn('部署文件夹不存在，跳过备份', { host: client.host })
      needBackUp = false
    }

    if (needBackUp) {
      await execHook('backupBefore', client)

      // logger.info('备份文件夹 -> ' + backupPath)

      backupName =
        backupName ||
        `${deployFolder}_bak_${dayjs().format('YYYYMMDD_HH_mm_ss')}`

      await client.exec(`mkdir -p ${backupPath}`).catch((err) => {
        logger.debug('创建备份文件夹失败 -> ' + err, {
          host: client.host
        })
      })
      await client.exec(
        `cd ${deployPath}/${deployFolder};tar -zcvf ${backupPath}/${backupName}.tar.gz ./`
      )
      // await client.exec(
      //   `cp -r ${deployPath}${deployFolder} ${backupPath}/${backupName}`
      // )

      logger.info(`备份当前版本成功 -> ${backupPath}/${backupName}.tar.gz`, {
        host: client.host,
        success: true
      })

      await appendRecord(client, {
        success: true,
        mode: 'backup',
        message: ` -> ${backupName}.tar.gz`
      })
      await execHook('backupAfter', client)
    }
  } catch (error) {
    // await appendRecord(client, {
    //   success: false,
    //   mode: 'backup',
    //   message: error
    // })
    throw new Error(`备份失败 -> ${error}`)
  }
}

/**
 * 回退版本
 * @param {SSHClient} client
 * @param {import('index').RollbackOptions} options
 */
export async function rollback(
  client,
  { backupPath, backupList, deployPath, version } = {}
) {
  try {
    await client.exec(`mkdir -p ${backupPath}`).catch((err) => err)

    if (!backupList || backupList.length === 0) {
      const execResult = await client.exec('ls -t ' + backupPath)
      backupList =
        typeof execResult === 'string'
          ? execResult?.replace(/[\n]$/, '').split('\n')
          : []
    }

    if (!backupList || backupList.length === 0) {
      logger.warn('当前不存在历史版本', { host: client.host })
      return
    }

    if (version === true) {
      const { _version } = await settings.deployConfig?.prompt?.([
        {
          type: 'list',
          name: '_version',
          message: '请选择回退的目标版本',
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

      version = _version || backupList[0]
    } else if (typeof version === 'number') {
      version = backupList[Math.abs(version) - 1]
    }

    if (!version) {
      logger.error('无法找到指定历史版本，回退取消', {
        host: client.host
      })
      return
    }

    logger.info(`正在回退历史版本 -> ${version}`, {
      host: client.host,
      loading: true
    })

    const tempPath = deployPath + '_rb_' + Date.now() + '/'

    await client.exec(
      `mkdir -p ${tempPath};tar -zxvPf ${backupPath}/${version} -C ${tempPath}`
    )
    await client.exec(`rm -rf ${deployPath};mv -f ${tempPath} ${deployPath};`)
    // await client.exec(`rm ${backupPath}/${version}`)

    logger.info(`成功回退到历史版本 -> ${version}`, {
      host: client.host,
      success: true
    })

    await appendRecord(client, {
      success: true,
      mode: 'rollback',
      message: ` -> ${version}`
    })
  } catch (error) {
    await appendRecord(client, {
      success: false,
      mode: 'rollback',
      message: ` -> ${version}  ${error}`
    })
    throw new Error('还原历史版本出错：' + (error || ''))
  }
}

/**
 * 备份
 * @param {SSHClient} client
 * @param {import('index').DeployConfig} config
 * @param {object} options
 * @param {boolean} options.backup
 * @param {string} options.backupName
 * @param {string} options.pkgPath
 */
export async function deploy(client, config, options = {}) {
  try {
    await execHook('deployBefore', { config, client })

    // 删除尾部斜杠
    let deployPath = config.deploy?.deployPath?.trim().replace(/[/]$/gim, ''),
      deployFolder

    const backupPath = config.deploy?.backupPath

    const deployPathArr = deployPath.split('/')

    deployFolder = deployPathArr.pop()
    deployPath = deployPathArr.join('/') + '/'

    if (!deployPath || !deployFolder) {
      throw new Error('部署路径或文件夹错误')
    }

    // let uploadPkgPath = `${deployPath}/${outputPkgName}`

    await execHook('uploadBefore', { config, client })
    try {
      if (config.deploy.uploadPath) {
        await client
          .exec(`mkdir -p ${config.deploy.uploadPath}`)
          .catch((err) => err)
      }
      await client
        .exec(`mkdir -p ${config.deploy.deployPath}`)
        .catch((err) => err)

      let localPath = path.resolve(process.cwd(), options.pkgPath)
      let remotePath = `${
        (config.deploy.uploadPath || deployPath).replace(/[/]$/, '') + '/'
      }${options.pkgPath}`

      logger.info(`上传压缩包中: ${localPath} -> ${remotePath}`, {
        host: client.host,
        loading: true
      })

      await client.upload(localPath, remotePath)

      logger.info(`上传压缩包成功: ${localPath} -> ${remotePath}`, {
        host: client.host,
        success: true
      })

      if (config.deploy.uploadPath) {
        logger.info(
          `配置了uploadPath，调整压缩包位置中: ${remotePath} -> ${deployPath}${options.pkgPath}`,
          { host: client.host, loading: true }
        )
        await client.exec(`mv -f ${remotePath} ${deployPath}`)

        logger.info(
          `调整压缩包位置成功: ${remotePath} -> ${deployPath}${options.pkgPath}`,
          { host: client.host, success: true }
        )
      }

      await execHook('uploadAfter', { config, client })
    } catch (error) {
      logger.error('上传压缩包失败 -> ' + error, { host: client.host })
      throw ''
    }

    // #region 备份
    if (options.backup) {
      await backup(client, {
        deployPath,
        deployFolder,
        backupPath,
        backupName: options.backupName
      })
    }
    // #endregion

    // 先解压到临时文件夹，防止执行失败导致web无法访问
    let unzipTempFolder = `autodeploy_${deployFolder}_temp`
    let unzipPath =
      deployPath + unzipTempFolder + (config.deploy.docker ? '/dist' : '')
    let unzipCmd = `unzip -o ${deployPath + options.pkgPath} -d ${unzipPath}`
    let originTempFolder = `${deployFolder}_cache_${
      (Math.random() + 100) * 1000
    }`
    logger.debug('unzip命令：' + unzipCmd)

    try {
      logger.info('解压部署压缩包中...', { loading: true })

      await client.exec(`mkdir -p ${unzipPath}`).catch((err) => false)
      /**
       * 解压到临时文件夹
       */
      await client.exec(unzipCmd)
      /**
       * 1. 将原始项目文件夹重命名为临时文件夹名称
       * 2. 将新的部署项目重命名为项目文件夹名称
       * 3. 删除原始项目的临时文件夹
       */
      await client.exec(
        `cd ${deployPath}; mv -f ${deployFolder} ${originTempFolder};mv -f ${unzipTempFolder} ${deployFolder};rm -rf ${originTempFolder}`
      )

      logger.info('解压部署文件成功', { host: client.host, success: true })
      if (config.deploy?.docker) {
        const dockerHelper = new DockerHelper(client, config)
        try {
          logger.info('检测到docker配置，构建docker镜像中...', {
            host: client.host,
            loading: true
          })

          if (config.nginx) {
            const nginxHelper = new NginxHelper(client, config)

            await nginxHelper.generateConf(config.deploy.deployPath)
          }
          await dockerHelper.build()

          logger.info(`构建docker镜像成功 -> ${dockerHelper.imageName}`, {
            host: client.host,
            success: true
          })
        } catch (error) {
          logger.error('构建docker镜像失败 -> ' + error, {
            host: client.host
          })
          return
        }

        try {
          logger.info('启动docker镜像中...', {
            host: client.host,
            loading: true
          })
          await dockerHelper.reload()

          logger.info(`启动docker镜像成功 -> ${dockerHelper.imageName}`, {
            host: client.host,
            success: true
          })
        } catch (error) {
          logger.error('启动docker镜像失败 -> ' + error, {
            host: client.host
          })
          return
        }
      }

      await appendRecord(client, {
        success: true,
        mode: 'deploy',
        message: ` -> 版本迭代`
      })
    } catch (error) {
      logger.error('解压部署文件失败 -> ' + error, {
        host: client.host
      })
      await client
        .exec(`cd ${deployPath};mv -f ${originTempFolder} ${deployFolder}`)
        .catch((err) => err)
      throw ''
    } finally {
      if (config.nginx && !config.deploy?.docker) {
        if (await NginxHelper?.checkConfExist(client, config)) {
          logger.warn('Nginx配置文件已存在，跳过自动生成', {
            host: client.host
          })
        } else {
          try {
            logger.info('生成Nginx配置文件中...', {
              host: client.host,
              loading: true
            })

            const nginxHelper = new NginxHelper(client, config)

            const nginxConfPath = await nginxHelper.generateConf()

            logger.info(`生成Nginx配置文件成功 -> ${nginxConfPath}`, {
              host: client.host,
              success: true
            })

            await nginxHelper.reload()

            logger.info(`Nginx重新加载配置成功 -> ${nginxConfPath}`, {
              host: client.host,
              success: true
            })
          } catch (error) {
            logger.error('生成Nginx配置文件失败 -> ' + error, {
              host: client.host
            })
          }
        }
      }

      try {
        logger.info('删除上传的部署文件中...', {
          host: client.host,
          loading: true
        })

        await client.exec(`rm -rf ${deployPath}${options.pkgPath}`)

        logger.info(
          `删除上传的部署文件成功 -> ${deployPath}${options.pkgPath}`,
          {
            host: client.host,
            success: true
          }
        )
      } catch (error) {
        logger.error('删除上传的部署文件失败 -> ' + error, {
          host: client.host
        })
      }
    }

    await delayer(1)
    logger.info(`部署成功 -> ${deployPath}${deployFolder}`, {
      host: client.host,
      success: true
    })

    await execHook('deployAfter', { config, client })
    return true
  } catch (error) {
    await appendRecord(client, {
      success: false,
      mode: 'deploy',
      message: error?.stack
    })
    error && logger.error(error?.stack + '')
    logger.error(`部署失败`, {
      host: client.host
    })
    return false
  } finally {
    // await builder.deleteZip()
  }
}
