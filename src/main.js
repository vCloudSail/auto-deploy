import SSHClient from './modules/ssh.js'
import { backup, deploy } from './modules/deploy.js'
import { execHook } from './utils/index.js'
import logger from './utils/logger.js'
/**
 *
 * @param {import('index').DeployConfig} config
 * @param {import('index').DeployOptions} options
 */
export default async function autodeploy(config, options) {
  execHook._config = config

  const startTime = new Date()
  try {
    await execHook('deployBefore')

    const sshClient = new SSHClient({ ...config.server, agent: config.agent })

    logger.loading(
      `正在通过SSH2连接服务器 -> ${config.server?.host}:${config.server?.port}`
    )
    try {
      await sshClient.connect()
    } catch (error) {
      logger.error('连接服务器失败，请检查用户名、密码和代理配置： ' + error)
      return
    }
    logger.success(
      `连接到服务器成功 -> ${config.server?.host}:${config.server?.port}`
    )

    if (options.rollback) {
      return
    }

    await deploy(sshClient, config, options.backup)

    await sshClient.disconnect()

    await execHook('deployAfter')
  } catch (error) {
    logger.error(error.message)
  } finally {
    logger.info(`总耗时：${(new Date() - startTime) / 1000}秒`)
  }
}
