import { exec } from 'child-process-promise'
import logger from './logger'

/**
 * @param {keyof import("index").DeployHooks} name
 * @param {object} options
 */
export async function execHook(name, options = {}) {
  try {
    const config = options?.config
    if (config?.hooks?.[name]) {
      logger.info(`执行Hooks(${name})中`, { loading: true })
      await config.hooks[name](options)
      logger.info(`执行Hooks(${name})成功`, { success: true })
    }
  } catch (error) {
    logger.error(`执行Hook(${name})出错 -> ${error}`)
    // throw new Error(`执行Hook(${name})出错 -> ${error.message}`)
  }
}

/**
 *
 * @param {import('@/modules/ssh').default} client
 * @param {object} param
 * @param {string} param.backupPath
 */
export async function getRollbackList(client, { backupPath } = {}) {
  const list = await client.exec(`ls ${backupPath}`)
  return list
}

/**
 *
 * @param {import('index').DeployConfig} config
 * @param {string} path
 * @param {string} defaultName
 * @returns
 */
export function getDeployConfigPath(config, path, defaultName = '') {
  return (
    path != null
      ? path
      : config.deploy.deployPath.trim().replace(/[/]$/gim, '') + defaultName
  )
    .trim()
    .replace(/[/]$/gim, '')
}

export async function getDefaultOperator() {
  let { stderr, stdout, error } = await exec('git config user.name')

  if (stdout) {
    stdout = stdout.replace(/[\r|\n]/, '')
  }

  logger.debug('默认作者姓名 ' + stdout)

  return stdout || ''
}

/**
 *
 * @param {import('index').DeployConfig} config
 */
export function checkDeployConfig(config) {
  if (!config.deploy?.deployPath) {
    throw new Error('未填写部署路径 -> deploy.deployPath')
  }
}
