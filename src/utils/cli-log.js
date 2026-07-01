import path from 'node:path'

import { formatFileSize } from './index.js'
import { getDockerBuildMode } from '../modules/docker/config.js'
const ELLIPSIS = '…'
const SECTION_PREFIX = '── '
const SECTION_SUFFIX = ' ──'

/**
 * 本地路径只显示文件名
 * @param {string} absPath
 */
export function shortLocalPath(absPath) {
  if (!absPath) {
    return ''
  }
  return path.basename(absPath.replace(/\\/g, '/'))
}

/**
 * 远端路径，过长时截断
 * @param {string} remotePath
 * @param {number} [maxLen=72]
 */
export function shortRemotePath(remotePath, maxLen = 72) {
  if (!remotePath) {
    return ''
  }
  const p = remotePath.replace(/\\/g, '/')
  if (p.length <= maxLen) {
    return p
  }
  return '…' + p.slice(-(maxLen - 1))
}

export { formatFileSize }

/**
 * @param {string} host
 */
export function section(host) {
  return `${SECTION_PREFIX}${host}${SECTION_SUFFIX}`
}

/**
 * @param {string} action
 * @param {string} [reason]
 */
export function skip(action, reason) {
  return reason ? `跳过${action} · ${reason}` : `跳过${action}`
}

/**
 * @param {string} action
 */
export function progress(action) {
  return action.endsWith(ELLIPSIS) ? action : `${action}${ELLIPSIS}`
}

/**
 * @param {string} action
 * @param {...string} parts
 */
export function done(action, ...parts) {
  const detail = parts.filter(Boolean).join(' · ')
  return detail ? `${action} · ${detail}` : action
}

/**
 * @param {unknown} err
 * @returns {string}
 */
function errorSummary(err) {
  if (err == null) {
    return ''
  }
  const raw =
    err instanceof Error ? err.message : String(err)
  return raw.split(/\r?\n/)[0].replace(/^Error:\s*/i, '').trim()
}

/**
 * @param {unknown} err
 * @returns {string[]}
 */
function errorDetailLines(err) {
  if (err == null || typeof err !== 'object') {
    const raw = err != null ? String(err) : ''
    return raw.split(/\r?\n/).slice(1).filter((l) => l.trim())
  }
  const outputTail = /** @type {{ outputTail?: string[] }} */ (err).outputTail
  if (Array.isArray(outputTail) && outputTail.length) {
    return outputTail
  }
  const raw = err instanceof Error ? err.message : String(err)
  return raw.split(/\r?\n/).slice(1).filter((l) => l.trim())
}

/**
 * @param {string} action
 * @param {unknown} [err]
 * @param {number} [maxDetailLines=24]
 */
export function fail(action, err, maxDetailLines = 24) {
  const head = errorSummary(err)
  const detail = errorDetailLines(err).slice(-maxDetailLines)
  if (!head && !detail.length) {
    return action
  }
  if (!detail.length) {
    return `${action} · ${head}`
  }
  const body = detail.map((line) => `  ${line}`).join('\n')
  return head ? `${action} · ${head}\n${body}` : `${action}\n${body}`
}

/**
 * @param {string} projectName
 * @param {string} envName
 */
export function deployHeader(projectName, envName) {
  return `部署 ${projectName} · ${envName}`
}

/**
 * @param {string} projectName
 * @param {string} envName
 */
export function rollbackHeader(projectName, envName) {
  return `版本回退 ${projectName} · ${envName}`
}

/**
 * @param {string} host
 * @param {string|number} [port]
 */
export function connected(host, port) {
  return port != null && port !== '' ? `已连接 ${host}:${port}` : `已连接 ${host}`
}

/**
 * @param {number} ms
 */
export function formatDuration(ms) {
  if (ms < 1000) {
    return `${Math.max(1, Math.round(ms))}ms`
  }
  return `${(ms / 1000).toFixed(1)}s`
}

/**
 * @param {number} index
 * @param {number} total
 * @param {string} action
 */
export function stepLabel(index, total, action) {
  return `[${index}/${total}] ${action}`
}

/**
 * @param {string} action
 * @param {number} durationMs
 * @param {...string} parts
 */
export function stepDone(action, durationMs, ...parts) {
  const detail = [...parts.filter(Boolean), formatDuration(durationMs)].join(' · ')
  return detail ? `${action} · ${detail}` : action
}

/**
 * @param {import('index').DeployConfig} config
 * @param {import('index').DeployOptions} options
 */
export function deployContextLines(config, options = {}) {
  const servers = Array.isArray(config.server)
    ? config.server
    : [config.server]
  const hosts = servers.map((s) => s.host).filter(Boolean).join(', ')
  const lines = [
    `项目 ${config.projectName}`,
    `环境 ${config.name || config.env}`,
    hosts ? `服务器 ${hosts}` : '',
    config.deploy?.deployPath ? `路径 ${config.deploy.deployPath}` : '',
    options.backup ? '备份 是' : '备份 否'
  ].filter(Boolean)

  const docker = config.deploy?.docker
  if (docker) {
    const image = docker.image ?? {}
    const parts = [
      `Docker ${getDockerBuildMode(docker)}`,
      image.distMode ? `dist ${image.distMode}` : '',
      docker.compose?.service ? `服务 ${docker.compose.service}` : ''
    ].filter(Boolean)
    if (parts.length) {
      lines.push(parts.join(' · '))
    }
  }

  return lines
}

/**
 * @param {number} success
 * @param {number} total
 * @param {string} envLabel
 * @param {number} seconds
 * @param {string} [artifact]
 */
export function deploySummary(success, total, envLabel, seconds, artifact) {
  const time =
    seconds >= 1 ? `${seconds.toFixed(1)}s` : `${Math.round(seconds * 1000)}ms`
  const base = `${success}/${total} 台成功 · ${envLabel} · 总耗时 ${time}`
  return artifact ? `${base}\n${artifact}` : base
}

/**
 * @param {string} localFile
 * @param {string} remotePath
 * @param {number} [size]
 */
export function uploadDone(localFile, remotePath, size) {
  const parts = [shortLocalPath(localFile)]
  if (size != null) {
    parts.unshift(formatFileSize(size))
  }
  parts.push(`→ ${shortRemotePath(remotePath)}`)
  return done('上传完成', ...parts)
}
