import path from 'node:path'

import { execHook } from '../utils/index.js'
import logger from '../utils/logger.js'
import SSHClient from './ssh.js'
import Builder from './builder.js'
import dayjs from 'dayjs'

/**
 * 备份
 * @param {SSHClient} client
 * @param {{deployPath:string,deployFolder:string,backupPath:string}} config
 */
export async function backup(
  client,
  { deployPath, deployFolder, backupPath } = {}
) {
  logger.loading('开始备份服务器当前版本')
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

      let backupName = `${deployFolder}_backup_${dayjs().format(
        'YYYYMMDDHHmmss'
      )}`

      await client.exec(`mkdir ${backupPath}`).catch((err) => err)
      await client.exec(
        `cd ${deployPath}/${deployFolder};tar -zcvf ${backupPath}/${backupName}.tar.gz ./`
      )
      // await client.exec(
      //   `cp -r ${deployPath}${deployFolder} ${backupPath}/${backupName}`
      // )

      logger.success(`备份当前版本成功 -> ${backupPath}/${backupName}.tar.gz`)

      await execHook('backupAfter')
    }
  } catch (error) {
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
  { backupPath, deployPath, version, chooseRollbackItem } = {}
) {
  try {
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
      version = await chooseRollbackItem?.([...backupFileList])
    } else if (typeof version === 'number') {
      version = backupFileList[Math.abs(version) - 1]
    }

    if (!version) {
      logger.error('无法找到指定历史版本，回退取消')
      return
    }

    logger.loading(`正在回退到版本${version}`)

    const tempPath = deployPath + '_rb_' + Date.now() + '/'

    await client.exec(
      `mkdir ${tempPath};tar -zxvPf ${backupPath}/${version} -C ${tempPath}`
    )
    await client.exec(`rm -rf ${deployPath};mv -f ${tempPath} ${deployPath}`)
    // await client.exec(`rm ${backupPath}/${version}`)

    logger.success(`成功回退到历史版本 -> ${version}`)
  } catch (error) {
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
        `\r\n    部署路径： ${deployPath}` +
        `\r\n    部署文件夹： ${deployFolder}` +
        `\r\n    是否备份： ${needBackup ? '是' : '否'}` +
        (needBackup ? `\r\n    备份路径: ${backupPath}` : '')
    )

    if (!deployPath || !deployFolder) {
      throw new Error('部署路径或文件夹错误')
    }

    // #region 打包过程
    /** 打包压缩后的输出文件名 */
    let outputPkgName = builder.outputPkgName
    const distPath = config.build?.distPath || 'dist'

    const buildCmd = config.build?.script || config.build?.cmd

    if (buildCmd) {
      logger.loading(`构建项目中： npm run ${buildCmd}`)
      await execHook('buildBefore')
      try {
        await builder.build(buildCmd)
      } catch (error) {
        logger.error('构建失败：' + error)
        throw ''
      }
      await execHook('buildAfter')
      logger.success(`构建项目成功： npm run ${buildCmd}`)
    } else {
      logger.warn('未配置构建命令，跳过构建')
    }

    logger.loading(`压缩项目中：${distPath} -> ${outputPkgName}`)
    try {
      const buildRes = await builder.zip(distPath)

      logger.success(
        `压缩项目成功： ${distPath} -> ${outputPkgName} (size：${
          buildRes.size / 1024
        }KB)`
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
      let localPath = path.resolve(process.cwd(), outputPkgName)
      let remotePath = `${deployPath}${outputPkgName}`

      logger.loading(`上传压缩包中: ${localPath} -> ${remotePath}`)

      await client.uploadFile(localPath, remotePath)

      logger.success(`上传压缩包成功: ${localPath} -> ${remotePath}`)
      await execHook('uploadAfter', client)
    } catch (error) {
      logger.error('上传压缩包失败 -> ' + error)
      throw ''
    }

    try {
      logger.loading('解压部署压缩包中...')

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

      logger.success('解压部署文件成功')
    } catch (error) {
      logger.error('解压部署文件失败 -> ' + error)
      throw ''
    }

    try {
      logger.loading('删除上传的部署文件中...')

      await client.exec(`rm -rf ${deployPath}${outputPkgName}`)

      logger.success(`删除上传的部署文件成功 -> ${deployPath}${outputPkgName}`)
    } catch (error) {
      logger.error('删除上传的部署文件失败 -> ' + error)
    }

    try {
      logger.loading('删除本地部署文件中')

      await builder.deleteZip()

      logger.success(`删除本地部署文件成功 -> ${outputPkgName}`)
    } catch (error) {
      logger.error('删除本地部署文件失败 -> ' + error)
    }

    logger.success(
      `部署到${
        config.name
      }成功 -> ${deployPath}${deployFolder} (${new Date().toLocaleString()})`
    )
  } catch (error) {
    logger.error(`部署到${config.name}失败${error ? ` -> ${error}` : ''}`)
  } finally {
    // await builder.deleteZip()
  }
}
