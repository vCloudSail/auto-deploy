import settings from './settings.js'
import SSHClient from './modules/ssh.js'
import { backup, deploy, rollback } from './modules/deploy.js'
import {
  execHook,
  getDeployConfigPath,
  checkDeployConfig
} from './utils/index.js'
import logger, { addTransport } from './utils/logger.js'
import { delayer } from './utils/delayer.js'

export { addTransport }
/**
 *
 * @param {import('index').DeployConfig} config
 * @param {import('index').DeployOptions} options
 */
export default async function autodeploy(config, options) {
  settings.deployConfig = config

  const startTime = new Date()

  if (options.rollback) {
    logger.info(`版本回退（${config.name || config.env}）`)
  } else {
    logger.info(`自动化部署（${config.name || config.env}）`)
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

    const sshClient = new SSHClient(
      { ...config.server, agent: config.agent },
      config
    )
    logger.info(
      `连接服务器中 -> ${config.server?.host}:${config.server?.port}`,
      { loading: true }
    )
    try {
      await sshClient.connect()
    } catch (error) {
      process.exit(0)
      return
    }

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

    if (!!options.rollback) {
      await rollback(sshClient, {
        backupPath: config.deploy.backupPath,
        deployPath: config.deploy.deployPath,
        version: options.rollback
      })
    } else {
      await deploy(sshClient, config, options.backup)
    }
    await delayer(1)

    sshClient.disconnect()
    process.exit(1)
  } catch (error) {
    logger.error((error || '') + '')
    process.exit(0)
  }
}
