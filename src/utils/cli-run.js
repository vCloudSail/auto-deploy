import { getDockerBuildMode } from '../modules/docker/config.js'
import {
  progress,
  stepDone,
  fail,
  skip as skipMsg,
  formatDuration
} from './cli-log.js'

/**
 * @param {import('index').DeployConfig} config
 */
export function resolveBuildCmd(config) {
  if (config.build?.cmd != null) {
    return config.build.cmd
  }
  return `npm run ${config.build?.script || 'build'}`
}

/**
 * @param {import('index').DeployConfig} config
 * @param {import('index').DeployOptions} options
 * @param {{ skipBuild?: boolean; useZipFile?: boolean }} runtime
 */
export function buildDeployPlan(config, options, runtime = {}) {
  /** @type {string[]} */
  const local = []
  /** @type {string[]} */
  const remote = []

  const useZipFile = runtime.useZipFile ?? !!(options.file && options.file !== true)
  const buildCmd = resolveBuildCmd(config)

  if (useZipFile) {
    local.push('providedZip')
  } else {
    if (buildCmd) {
      local.push('build')
    }
    local.push('zip')
  }

  if (
    config.deploy?.docker &&
    getDockerBuildMode(config.deploy.docker) === 'local'
  ) {
    local.push('localImage')
  }

  remote.push('uploadZip')

  if (
    config.deploy?.docker &&
    getDockerBuildMode(config.deploy.docker) === 'local'
  ) {
    remote.push('uploadImage')
  }

  if (options.backup) {
    remote.push('backup')
  }

  remote.push('extract')

  if (config.deploy?.docker) {
    const mode = getDockerBuildMode(config.deploy.docker)
    remote.push(mode === 'remote' ? 'dockerBuild' : 'dockerLoad')
    remote.push('dockerReload')
  }

  if (config.nginx && !config.deploy?.docker) {
    remote.push('nginx')
  }

  remote.push('finish')

  const servers = Array.isArray(config.server)
    ? config.server
    : [config.server]
  const serverCount = Math.max(servers.length, 1)

  return {
    local,
    remote,
    serverCount,
    total: local.length + remote.length * serverCount
  }
}

/**
 * @param {import('winston').Logger} logger
 * @param {number} totalSteps
 */
export function createStepRunner(logger, initialTotal) {
  let index = 0
  /** @type {number} */
  let currentStart = 0
  /** @type {string} */
  let currentAction = ''
  let displayTotal = initialTotal

  /**
   * @param {Record<string, unknown>} meta
   */
  function stepMeta(meta = {}) {
    return {
      cliStep: meta.cliStep,
      stepIndex: index,
      stepTotal: displayTotal,
      ...meta
    }
  }

  /**
   * @param {Record<string, unknown>} [meta]
   */
  let currentMeta = {}

  function bumpTotal() {
    displayTotal = Math.max(displayTotal, index)
  }

  return {
    get index() {
      return index
    },
    get total() {
      return displayTotal
    },
    /**
     * @param {string} action
     * @param {Record<string, unknown>} [meta]
     */
    start(action, meta = {}) {
      index += 1
      bumpTotal()
      currentStart = Date.now()
      currentAction = action
      currentMeta = meta
      logger.info(progress(action), {
        ...stepMeta({ cliStep: 'start', ...meta }),
        loading: true
      })
    },
    /**
     * @param {...string} parts
     */
    succeed(...parts) {
      const durationMs = Date.now() - currentStart
      logger.info(stepDone(currentAction, durationMs, ...parts), {
        ...stepMeta({ cliStep: 'done', durationMs, ...currentMeta }),
        success: true
      })
    },
    /**
     * @param {unknown} err
     * @param {Record<string, unknown>} [meta]
     */
    failStep(err, meta = {}) {
      const durationMs = Date.now() - currentStart
      logger.error(fail(currentAction, err), {
        ...stepMeta({ cliStep: 'fail', durationMs, ...currentMeta, ...meta })
      })
    },
    /**
     * @param {string} action
     * @param {string} reason
     * @param {Record<string, unknown>} [meta]
     */
    skip(action, reason, meta = {}) {
      index += 1
      bumpTotal()
      logger.info(skipMsg(action, reason), {
        ...stepMeta({ cliStep: 'skip', ...meta })
      })
    },
    /**
     * @param {string} message
     * @param {Record<string, unknown>} [meta]
     */
    progress(message, meta = {}) {
      logger.info(message, {
        ...stepMeta({ ...currentMeta, ...meta }),
        loading: true,
        buildTail: !!meta.buildTail
      })
    }
  }
}

export { formatDuration }
