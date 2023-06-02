import { exec } from 'child-process-promise'
import logger from './logger'

/**
 * @param {keyof import("index").DeployHooks} name
 */
export async function execHook(name) {
  try {
    execHook._config?.hooks?.[name] && (await config[name]())
  } catch (error) {
    throw new Error(`执行Hook出错(${name}) -> ${error.message}`)
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
  let { stderr, stdout, error } = await exec('git config --worktree user.name')

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
