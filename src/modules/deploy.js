import path from 'node:path'

import { execHook, getDefaultOperator } from '../utils/index.js'
import logger from '../utils/logger.js'
import SSHClient from './ssh.js'
import Builder from './builder.js'
import dayjs from 'dayjs'
import settings from '@/settings.js'
import { delayer } from '@/utils/delayer.js'

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
  try {
    let action = '',
      operator = await getDefaultOperator()
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
    logger.info('服务器追加操作日志成功', { success: true })
  } catch (error) {
    logger.error('服务器追加操作日志失败：' + error)
  }
}

/**
 * 备份
 * @param {SSHClient} client
 * @param {{deployPath:string,deployFolder:string,backupPath:string}} config
 */
export async function backup(
  client,
  { deployPath, deployFolder, backupPath } = {}
) {
  logger.info('开始备份服务器当前版本', { loading: true })
  try {
    let needBackUp = true
    try {
      await client.exec(`stat ${deployPath}${deployFolder}`)
    } catch (error) {
      logger.warn('部署文件夹不存在，跳过备份')
      needBackUp = false
    }

    if (needBackUp) {
      await execHook('backupBefore')

      // logger.info('备份文件夹 -> ' + backupPath)

      let backupName = `${deployFolder}_bak_${dayjs().format(
        'YYYYMMDD_HH_mm_ss'
      )}`

      await client.exec(`mkdir -p ${backupPath}`).catch((err) => err)
      await client.exec(
        `cd ${deployPath}/${deployFolder};tar -zcvf ${backupPath}/${backupName}.tar.gz ./`
      )
      // await client.exec(
      //   `cp -r ${deployPath}${deployFolder} ${backupPath}/${backupName}`
      // )

      logger.info(`备份当前版本成功 -> ${backupPath}/${backupName}.tar.gz`, {
        success: true
      })

      await appendRecord(client, {
        success: true,
        mode: 'backup',
        message: ` -> ${backupName}.tar.gz`
      })
      await execHook('backupAfter')
    }
  } catch (error) {
    await appendRecord(client, {
      success: false,
      mode: 'backup',
      message: error
    })
    throw new Error(`备份失败（${error}）`)
  }
}

/**
 * 回退版本
 * @param {SSHClient} client
 * @param {{backupPath:string,version:string|number}} options
 */
export async function rollback(
  client,
  { backupPath, deployPath, version } = {}
) {
  try {
    await client.exec(`mkdir -p ${backupPath}`).catch((err) => err)

    const execResult = await client.exec('ls -t ' + backupPath)
    const backupFileList =
      typeof execResult === 'string'
        ? execResult?.replace(/[\n]$/, '').split('\n')
        : []

    if (!backupFileList || backupFileList.length === 0) {
      logger.warn('当前不存在历史版本')
      return
    }

    if (version === true) {
      const { _version } = await settings.deployConfig?.prompt?.([
        {
          type: 'list',
          name: '_version',
          message: '请选择回退的目标版本',
          choices: backupFileList
            ?.filter((item) => /[.]tar[.]gz$/gi.test(item))
            .map((item) => {
              return {
                value: item,
                label: item.replace('.tar.gz', '')
              }
            })
        }
      ])

      version = _version || backupFileList[0]
    } else if (typeof version === 'number') {
      version = backupFileList[Math.abs(version) - 1]
    }

    if (!version) {
      logger.error('无法找到指定历史版本，回退取消')
      return
    }

    logger.info(`正在回退历史版本 -> ${version}`, { loading: true })

    const tempPath = deployPath + '_rb_' + Date.now() + '/'

    await client.exec(
      `mkdir -p ${tempPath};tar -zxvPf ${backupPath}/${version} -C ${tempPath}`
    )
    await client.exec(`rm -rf ${deployPath};mv -f ${tempPath} ${deployPath};`)
    // await client.exec(`rm ${backupPath}/${version}`)

    logger.info(`成功回退到历史版本 -> ${version}`, { success: true })

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
 * @param {boolean} backup
 */
export async function deploy(client, config, needBackup) {
  const builder = new Builder(config.env)
  try {
    await execHook('deployBefore')

    // 删除尾部斜杠
    let deployPath = config.deploy?.deployPath?.trim().replace(/[/]$/gim, ''),
      deployFolder

    const backupPath = config.deploy?.backupPath

    const deployPathArr = deployPath.split('/')

    deployFolder = deployPathArr.pop()
    deployPath = deployPathArr.join('/') + '/'

    logger.info(
      `部署信息：` +
        `\r\n    - 部署路径： ${deployPath}` +
        `\r\n    - 部署目录： ${deployFolder}` +
        `\r\n    - 是否备份： ${needBackup ? '是' : '否'}` +
        (needBackup ? `\r\n    备份路径: ${backupPath}` : '')
    )

    if (!deployPath || !deployFolder) {
      throw new Error('部署路径或文件夹错误')
    }

    // #region 打包过程
    /** 打包压缩后的输出文件名 */
    let outputPkgName = builder.outputPkgName
    const distPath = config.build?.distPath || 'dist'

    const buildCmd = config.build?.cmd
      ? config.build?.cmd
      : `npm run ${config.build?.script || 'build'}`

    if (buildCmd) {
      logger.info(`构建项目中：${buildCmd}`, { loading: true })
      await execHook('buildBefore')
      try {
        await builder.build(buildCmd)
      } catch (error) {
        logger.error('构建失败：' + error)
        throw ''
      }
      await execHook('buildAfter')
      logger.info(`构建项目成功： npm run ${buildCmd}`, { success: true })
    } else {
      logger.warn('未配置构建命令，跳过构建')
    }

    logger.info(`压缩项目中：${distPath} -> ${outputPkgName}`, {
      loading: true
    })
    try {
      const buildRes = await builder.zip(distPath)

      logger.info(
        `压缩项目成功： ${distPath} -> ${outputPkgName} (size：${
          buildRes.size / 1024
        }KB)`,
        { success: true }
      )
    } catch (error) {
      logger.error('压缩失败 ->' + error)
      throw ''
    }
    // #endregion

    // #region 备份
    if (needBackup) {
      await backup(client, {
        deployPath,
        deployFolder,
        backupPath
      })
    }
    // #endregion

    await execHook('uploadBefore', client)
    try {
      await client
        .exec('mkdir -p ' + config.deploy.deployPath)
        .catch((err) => err)

      let localPath = path.resolve(process.cwd(), outputPkgName)
      let remotePath = `${deployPath}${outputPkgName}`

      logger.info(`上传压缩包中: ${localPath} -> ${remotePath}`, {
        loading: true
      })

      await client.upload(localPath, remotePath)

      logger.info(`上传压缩包成功: ${localPath} -> ${remotePath}`, {
        success: true
      })
      await execHook('uploadAfter', client)
    } catch (error) {
      logger.error('上传压缩包失败 -> ' + error)
      throw ''
    }

    try {
      logger.info('解压部署压缩包中...', { loading: true })

      // 先解压到临时文件夹，防止执行失败导致web无法访问
      let tempFolder = `autodeploy_${deployFolder}_temp`
      let unzipCmd = `unzip -o ${deployPath + outputPkgName} -d ${
        deployPath + tempFolder
      }`

      await client.exec(unzipCmd)
      // 解压成功后再重命名临时文件夹
      await client.exec(
        `cd ${deployPath};rm -rf ${deployFolder};mv -f ${tempFolder} ${deployFolder}`
      )

      logger.info('解压部署文件成功', { success: true })
    } catch (error) {
      logger.error('解压部署文件失败 -> ' + error)
      throw ''
    }

    await appendRecord(client, {
      success: true,
      mode: 'deploy',
      message: ` -> 版本迭代`
    })

    try {
      logger.info('删除上传的部署文件中...', { loading: true })

      await client.exec(`rm -rf ${deployPath}${outputPkgName}`)

      logger.info(`删除上传的部署文件成功 -> ${deployPath}${outputPkgName}`, {
        success: true
      })
    } catch (error) {
      logger.error('删除上传的部署文件失败 -> ' + error)
    }

    try {
      logger.info('删除本地部署文件中', { loading: true })

      await builder.deleteZip()

      logger.info(`删除本地部署文件成功 -> ${outputPkgName}`, { success: true })
    } catch (error) {
      logger.error('删除本地部署文件失败 -> ' + error)
    }

    await delayer(1)
    logger.info(
      `部署到${
        config.name
      }成功 -> ${deployPath}${deployFolder} (${new Date().toLocaleString()})`,
      { success: true }
    )
  } catch (error) {
    await appendRecord(client, {
      success: false,
      mode: 'deploy',
      message: error
    })
    logger.error(`部署到${config.name}失败${error ? ` -> ${error}` : ''}`)
  } finally {
    // await builder.deleteZip()
  }
}
