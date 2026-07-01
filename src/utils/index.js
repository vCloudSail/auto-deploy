import { exec } from 'child-process-promise'
import logger from './logger'

export {
  distHasContent,
  askRebuildWhenDistExists
} from './dist-build-prompt.js'
export {
  ensureUnzipInstalled,
  extractRemoteZip
} from './ensure-unzip.js'
export { resolveProjectMeta, resolveProjectName, hasProjectManifest, readProjectManifest } from './project-meta.js'

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

export async function execStep({ action, fn, info } = {}) {
  if (!action || !fn) return

  try {
    logger.info(`${action}中...`, { loading: true })
    await fn()
    logger.info(`${action}成功` + info, { success: true })
  } catch (error) {
    logger.error(`${action}失败 -> ${error}`)
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
 * 解析部署路径；Docker 模式未配置 deployPath 时使用服务器临时目录
 * @param {import('index').DeployConfig} config
 */
/**
 * 部署目录在 /tmp 等路径时，文件读写无需 sudo（避免 SSH 无法输入密码）
 * @param {import('index').DeployConfig} config
 */
export function shouldUseSudoForDeployFiles(config) {
  const deployPath = resolveDeployPath(config)
  if (/^\/tmp(\/|$)/.test(deployPath)) {
    return false
  }
  const server = Array.isArray(config.server)
    ? config.server[0]
    : config.server
  return !!server?.cmdUseSudo
}

import { resolveProjectName } from './project-meta.js'

export function resolveDeployPath(config) {
  const explicit = config.deploy?.deployPath?.trim().replace(/[/]$/gim, '')
  if (explicit) {
    return explicit
  }
  if (config.deploy?.docker) {
    const project = resolveProjectName(config).replace(/[^\w.-]+/g, '_')
    const env = (config.env || 'default').replace(/[^\w.-]+/g, '_')
    return `/tmp/autodeploy-${project}-${env}`
  }
  return ''
}

/**
 *
 * @param {import('index').DeployConfig} config
 */
export function checkDeployConfig(config) {
  if (!resolveDeployPath(config)) {
    throw new Error(
      '未填写部署路径 -> deploy.deployPath（非 Docker 部署时必填）'
    )
  }
}

/**
 * 格式化文件大小
 * @param {number} size 
 * @returns 
 */
export function formatFileSize(size) {
  if (!size) {
    return
  }

  const b = size / 1024
  if (b < 1024.0) {
    return b.toFixed(2) + ' KB'
  } else if (b < 1024000.0) {
    return (b / 1024).toFixed(2) + ' MB'
  } else {
    return (b / 1024000).toFixed(2) + ' GB'
  }
}
