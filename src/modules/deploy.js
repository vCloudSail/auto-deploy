import fs from 'node:fs'
import path from 'node:path'

import {
  execHook,
  getDefaultOperator,
  extractRemoteZip,
  shouldUseSudoForDeployFiles
} from '../utils/index.js'
import {
  fail,
  uploadDone,
  shortLocalPath,
  shortRemotePath
} from '../utils/cli-log.js'
import { formatFileSize } from '../utils/index.js'
import logger from '../utils/logger.js'
import SSHClient from './ssh.js'
import dayjs from 'dayjs'
import settings from '@/settings.js'
import { delayer } from '@/utils/delayer.js'
import NginxHelper from './nginx.js'
import DockerHelper from './docker/index.js'
import { getDockerBuildMode } from './docker/config.js'

/**
 * @param {SSHClient} client
 * @param {import('index').DeployConfig} config
 * @param {string} command
 */
function deployFileExec(client, config, command) {
  return client.exec(command, undefined, {
    useSudo: shouldUseSudoForDeployFiles(config)
  })
}

/**
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

    await deployFileExec(client, config, `mkdir -p ${config.deploy.logPath}`).catch(
      (err) => err
    )
    await deployFileExec(
      client,
      config,
      `echo "[${dayjs().format('YYYY-MM-DD HH:mm:ss.SSS')}] [${
        success ? 'Success' : 'Fail'
      }] ${operator}执行${action}${success ? '成功' : '失败'}${
        message ? `${message || '无'}` : ''
      }" >> ${config.deploy.logPath}/${today}.log`
    )
    logger.debug(`操作日志已写入（${action}）`, { host: client.host })
  } catch (error) {
    logger.debug(`操作日志写入失败（${action}）：${error}`, {
      host: client.host
    })
  }
}

/**
 * @param {SSHClient} client
 * @param {{deployPath:string,deployFolder:string,backupPath:string,backupName:string, stepRunner?: ReturnType<import('../utils/cli-run.js').createStepRunner>}} config
 */
export async function backup(
  client,
  { deployPath, deployFolder, backupPath, backupName, stepRunner } = {}
) {
  const hostMeta = { host: client.host }

  try {
    let needBackUp = true
    try {
      await client.exec(`stat ${deployPath}${deployFolder}`)
    } catch (_error) {
      if (stepRunner) {
        stepRunner.skip('备份', '部署文件夹不存在', hostMeta)
      } else {
        logger.warn('部署文件夹不存在，跳过备份', hostMeta)
      }
      needBackUp = false
    }

    if (!needBackUp) {
      return
    }

    if (stepRunner) {
      stepRunner.start('备份当前版本', hostMeta)
    }

    await execHook('backupBefore', client)

    backupName =
      backupName ||
      `${deployFolder}_bak_${dayjs().format('YYYYMMDD_HH_mm_ss')}`

    await client.exec(`mkdir -p ${backupPath}`).catch((err) => {
      logger.debug('创建备份文件夹失败 -> ' + err, hostMeta)
    })
    await client.exec(
      `cd ${deployPath}/${deployFolder};tar -zcvf ${backupPath}/${backupName}.tar.gz ./`
    )

    if (stepRunner) {
      stepRunner.succeed(`${backupName}.tar.gz`)
    } else {
      logger.info(`备份完成 · ${backupName}.tar.gz`, {
        ...hostMeta,
        success: true
      })
    }

    await appendRecord(client, {
      success: true,
      mode: 'backup',
      message: ` -> ${backupName}.tar.gz`
    })
    await execHook('backupAfter', client)
  } catch (error) {
    if (stepRunner) {
      stepRunner.failStep(error, hostMeta)
    }
    throw new Error(fail('备份', error))
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

    logger.info(`回退到 ${version}…`, {
      host: client.host,
      loading: true
    })

    const tempPath = deployPath + '_rb_' + Date.now() + '/'

    await client.exec(
      `mkdir -p ${tempPath};tar -zxvPf ${backupPath}/${version} -C ${tempPath}`
    )
    await client.exec(`rm -rf ${deployPath};mv -f ${tempPath} ${deployPath};`)

    logger.info(`回退完成 · ${version}`, {
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
 * @param {SSHClient} client
 * @param {import('index').DeployConfig} config
 * @param {object} options
 * @param {boolean} options.backup
 * @param {string} options.backupName
 * @param {string} options.pkgPath
 * @param {string} [options.imageTarLocalPath]
 * @param {ReturnType<import('../utils/cli-run.js').createStepRunner>} [options.stepRunner]
 * @returns {Promise<{ ok: boolean, fullImage?: string }>}
 */
export async function deploy(client, config, options = {}) {
  /** @type {import('./docker/index.js').default | null} */
  let dockerHelper = null
  /** @type {{ fullImage: string, service?: string, project?: string } | void} */
  let reloadMeta

  const steps = options.stepRunner
  const hostMeta = { host: client.host }

  try {
    await execHook('deployBefore', { config, client })

    let deployPath = config.deploy?.deployPath?.trim().replace(/[/]$/gim, ''),
      deployFolder

    const backupPath = config.deploy?.backupPath

    const deployPathArr = deployPath.split('/')

    deployFolder = deployPathArr.pop()
    deployPath = deployPathArr.join('/') + '/'

    if (!deployPath || !deployFolder) {
      throw new Error('部署路径或文件夹错误')
    }

    await execHook('uploadBefore', { config, client })
    try {
      if (config.deploy.uploadPath) {
        await client
          .exec(`mkdir -p ${config.deploy.uploadPath}`)
          .catch((err) => err)
      }
      await deployFileExec(client, config, `mkdir -p ${config.deploy.deployPath}`).catch(
        (err) => err
      )

      let localPath = path.resolve(process.cwd(), options.pkgPath)
      let remotePath = `${
        (config.deploy.uploadPath || deployPath).replace(/[/]$/, '') + '/'
      }${options.pkgPath}`

      const zipStat = fs.existsSync(localPath) ? fs.statSync(localPath) : null

      if (steps) {
        steps.start('上传压缩包', hostMeta)
      }

      await client.upload(localPath, remotePath)

      if (steps) {
        steps.succeed(
          zipStat?.size != null ? formatFileSize(zipStat.size) : '',
          shortLocalPath(localPath),
          `→ ${shortRemotePath(remotePath)}`
        )
      } else {
        logger.info(uploadDone(localPath, remotePath, zipStat?.size), {
          ...hostMeta,
          success: true
        })
      }

      if (config.deploy.uploadPath) {
        logger.debug(
          `调整压缩包位置 ${shortRemotePath(remotePath)} → ${shortRemotePath(deployPath + options.pkgPath)}`,
          hostMeta
        )
        await deployFileExec(client, config, `mv -f ${remotePath} ${deployPath}`)
      }

      if (
        getDockerBuildMode(config.deploy?.docker) === 'local' &&
        options.imageTarLocalPath
      ) {
        const tarHelper = new DockerHelper(client, config)
        const remoteTar = tarHelper.getImageTarRemotePath()
        const localTar = path.isAbsolute(options.imageTarLocalPath)
          ? options.imageTarLocalPath
          : path.resolve(process.cwd(), options.imageTarLocalPath)

        const tarStat = fs.existsSync(localTar) ? fs.statSync(localTar) : null

        if (steps) {
          steps.start('上传镜像包', hostMeta)
        }

        await deployFileExec(
          client,
          config,
          `mkdir -p ${path.posix.dirname(remoteTar).replace(/\\/g, '/')}`
        ).catch((err) => err)
        await client.upload(localTar, remoteTar)

        if (steps) {
          steps.succeed(
            tarStat?.size != null ? formatFileSize(tarStat.size) : '',
            shortLocalPath(localTar),
            `→ ${shortRemotePath(remoteTar)}`
          )
        } else {
          logger.info(uploadDone(localTar, remoteTar, tarStat?.size), {
            ...hostMeta,
            success: true
          })
        }
      }

      await execHook('uploadAfter', { config, client })
    } catch (error) {
      if (steps) {
        steps.failStep(error, hostMeta)
      } else {
        logger.error(fail('上传', error), hostMeta)
      }
      throw error
    }

    if (options.backup) {
      await backup(client, {
        deployPath,
        deployFolder,
        backupPath,
        backupName: options.backupName,
        stepRunner: steps
      })
    }

    let unzipTempFolder = `autodeploy_${deployFolder}_temp`
    const dockerHelperForPath = config.deploy?.docker
      ? new DockerHelper(client, config)
      : null
    let unzipPath =
      deployPath +
      unzipTempFolder +
      (dockerHelperForPath?.needsDistSubfolder() ? '/dist' : '')
    let originTempFolder = `${deployFolder}_cache_${
      (Math.random() + 100) * 1000
    }`
    const remoteZipPath = deployPath + options.pkgPath
    logger.debug(
      '解压命令：' + `unzip/python -> ${remoteZipPath} -d ${unzipPath}`
    )

    try {
      if (steps) {
        steps.start('解压', hostMeta)
      }

      await deployFileExec(client, config, `mkdir -p ${unzipPath}`).catch(
        () => false
      )
      await extractRemoteZip(client, remoteZipPath, unzipPath)
      await deployFileExec(
        client,
        config,
        `cd ${deployPath}; mv -f ${deployFolder} ${originTempFolder};mv -f ${unzipTempFolder} ${deployFolder};rm -rf ${originTempFolder}`
      )

      if (steps) {
        steps.succeed(deployFolder)
      }

      if (config.deploy?.docker) {
        dockerHelper = new DockerHelper(client, config)

        try {
          await dockerHelper.ensureRemoteDocker()
        } catch (error) {
          if (steps) {
            steps.failStep(error, hostMeta)
          } else {
            logger.error(fail('Docker 不可用', error), hostMeta)
          }
          return { ok: false }
        }

        const workDir = dockerHelper.getComposeWorkDir()
        if (
          workDir !== dockerHelper.deployRoot &&
          dockerHelper.needsDistSubfolder()
        ) {
          logger.debug(`同步 dist 到 ${workDir}/dist`, hostMeta)
          await client
            .exec(
              `mkdir -p ${workDir}/dist && cp -rf ${dockerHelper.deployRoot}/dist/. ${workDir}/dist/`
            )
            .catch((err) => err)
        }

        try {
          logger.debug(
            `buildMode=${dockerHelper.buildMode} distMode=${dockerHelper.distMode}`,
            hostMeta
          )
          if (dockerHelper.buildMode === 'remote') {
            if (steps) {
              steps.start('构建镜像', hostMeta)
            }
            await dockerHelper.buildRemote()
            if (steps) {
              steps.succeed(dockerHelper.fullImage)
            }
          } else {
            if (steps) {
              steps.start('加载镜像', hostMeta)
            }
            await dockerHelper.loadImageRemote()
            if (steps) {
              steps.succeed(dockerHelper.fullImage)
            }
          }
        } catch (error) {
          if (steps) {
            steps.failStep(error, hostMeta)
          } else {
            logger.error(fail('镜像处理', error), hostMeta)
          }
          return { ok: false }
        }

        try {
          if (steps) {
            steps.start('重启服务', hostMeta)
          }
          reloadMeta = await dockerHelper.reload()
          const serviceParts = [
            reloadMeta?.service,
            reloadMeta?.project
              ? `compose 项目 ${reloadMeta.project}`
              : ''
          ].filter(Boolean)
          if (steps) {
            steps.succeed(...serviceParts)
          }
        } catch (error) {
          if (steps) {
            steps.failStep(error, hostMeta)
          } else {
            logger.error(fail('服务重启', error), hostMeta)
          }
          return { ok: false }
        }
      }

      const dockerMeta = dockerHelper
      await appendRecord(client, {
        success: true,
        mode: 'deploy',
        message: dockerMeta
          ? ` · ${dockerMeta.fullImage}`
          : ` · 版本迭代`
      })
    } catch (error) {
      if (steps) {
        steps.failStep(error, hostMeta)
      } else {
        logger.error(fail('解压', error), hostMeta)
      }
      await deployFileExec(
        client,
        config,
        `cd ${deployPath};mv -f ${originTempFolder} ${deployFolder}`
      ).catch((err) => err)
      throw error
    } finally {
      if (config.nginx && !config.deploy?.docker) {
        if (await NginxHelper?.checkConfExist(client, config)) {
          if (steps) {
            steps.skip('Nginx 配置', '配置文件已存在', hostMeta)
          } else {
            logger.warn('Nginx配置文件已存在，跳过自动生成', hostMeta)
          }
        } else {
          try {
            if (steps) {
              steps.start('生成 Nginx 配置', hostMeta)
            }

            const nginxHelper = new NginxHelper(client, config)
            const nginxConfPath = await nginxHelper.generateConf()
            await nginxHelper.reload()

            if (steps) {
              steps.succeed(shortRemotePath(nginxConfPath))
            }
          } catch (error) {
            if (steps) {
              steps.failStep(error, hostMeta)
            } else {
              logger.error(fail('Nginx 配置', error), hostMeta)
            }
          }
        }
      }

      try {
        await deployFileExec(client, config, `rm -rf ${deployPath}${options.pkgPath}`)
        logger.debug(`已清理远端临时包 ${options.pkgPath}`, hostMeta)
      } catch (error) {
        logger.debug(fail('清理远端临时包', error), hostMeta)
      }
    }

    await delayer(1)

    if (steps) {
      steps.start('部署完成', hostMeta)
      steps.succeed(
        dockerHelper ? dockerHelper.fullImage : deployFolder
      )
    }

    await execHook('deployAfter', { config, client })
    return {
      ok: true,
      fullImage: dockerHelper?.fullImage || reloadMeta?.fullImage
    }
  } catch (error) {
    await appendRecord(client, {
      success: false,
      mode: 'deploy',
      message: error instanceof Error ? error.message : String(error)
    })
    if (steps) {
      steps.failStep(error, hostMeta)
    } else {
      logger.error(fail('部署', error), hostMeta)
    }
    return { ok: false }
  }
}
