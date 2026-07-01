import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

import { getDeployConfigPath } from '../../src/utils/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** demo 项目根目录 */
export const demoRoot = path.resolve(__dirname, '../../demo')

const require = createRequire(import.meta.url)

/**
 * @returns {Record<string, import('index').DeployConfig>}
 */
export function loadDemoConfigMap() {
  return require(path.join(demoRoot, 'deploy.config.js'))
}

/**
 * 与 bin/auto-deploy.js 一致：展开为带 env 的配置列表
 */
export function listDemoConfigs() {
  const origin = loadDemoConfigMap()
  return Object.keys(origin).map((key) => {
    const config = origin[key]
    const env = config.env || key
    return {
      key,
      env,
      config: normalizeDemoConfig(config, env)
    }
  })
}

/**
 * @param {string} envOrKey 如 dev、prod、prod1
 */
export function getDemoConfig(envOrKey) {
  const origin = loadDemoConfigMap()
  for (const [key, raw] of Object.entries(origin)) {
    const env = raw.env || key
    if (env === envOrKey || key === envOrKey) {
      return normalizeDemoConfig(raw, env)
    }
  }
  throw new Error(`未找到 demo 环境配置: ${envOrKey}`)
}

/**
 * @param {import('index').DeployConfig} config
 * @param {string} env
 */
export function normalizeDemoConfig(config, env) {
  /** @type {import('index').DeployConfig} */
  const normalized = {
    ...config,
    env,
    deploy: { ...config.deploy }
  }

  if (normalized.deploy.deployPath) {
    normalized.deploy.backupPath = getDeployConfigPath(
      normalized,
      normalized.deploy.backupPath,
      '_backup'
    )
    normalized.deploy.logPath = getDeployConfigPath(
      normalized,
      normalized.deploy.logPath,
      '_logs'
    )
  }

  return normalized
}

/**
 * dev 环境 + demo 目录下的 compose 文件（测试用，不改 demo 源文件）
 */
export function getDemoDevWithCompose() {
  const config = getDemoConfig('dev')
  return {
    ...config,
    deploy: {
      ...config.deploy,
      docker: {
        ...config.deploy.docker,
        compose: {
          mode: 'managed',
          file: './docker-compose.yml',
          projectName: 'my-web-dev',
          service: 'web'
        }
      }
    }
  }
}
