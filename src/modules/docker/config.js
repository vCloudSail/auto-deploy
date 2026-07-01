import dayjs from 'dayjs'

/**
 * @param {import('index').DeployConfig['deploy']['docker']} docker
 */
export function normalizeDockerConfig(docker) {
  if (!docker) {
    return null
  }

  const image = docker.image ?? {}
  const container = docker.container ?? {}

  return {
    image: {
      name: image.name,
      tag: image.tag,
      buildMode: image.buildMode,
      distMode: image.distMode,
      dockerfile: image.dockerfile,
      baseImage: image.baseImage,
      tarDir: image.tarDir
    },
    container: {
      name: container.name,
      hostPort: container.hostPort,
      port: container.port,
      startArgs: container.startArgs
    },
    compose: docker.compose
  }
}

/**
 * @param {import('index').DeployConfig} deployConfig
 */
export function ensureDockerImageTag(deployConfig) {
  const image = deployConfig.deploy?.docker?.image
  if (!image || image.tag) {
    return
  }
  image.tag = dayjs().format('YYYYMMDD_HHmmss')
}

/**
 * @param {import('index').DeployConfig['deploy']['docker']} docker
 */
export function getDockerBuildMode(docker) {
  return normalizeDockerConfig(docker)?.image?.buildMode || 'remote'
}
