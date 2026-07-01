import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

import logger from '@/utils/logger'
import NginxHelper from '../nginx.js'
import { normalizeDockerConfig } from './config.js'

export {
  normalizeDockerConfig,
  ensureDockerImageTag,
  getDockerBuildMode
} from './config.js'

/**
 * @param {string} name
 */
export function sanitizeImageRepo(name) {
  return String(name || '')
    .replace(/[\s@#/]+/g, '_')
    .replace(/^[-_]/g, '')
}

/**
 * 从 compose 文件内容解析顶层 name（Compose 规范）
 * @param {string} content
 */
export function parseProjectNameFromComposeContent(content) {
  if (!content) {
    return ''
  }
  const match = content.match(
    /^[ \t]*name[ \t]*:[ \t]*['"]?([^'"\s#]+)['"]?/im
  )
  return match?.[1]?.trim() || ''
}

/**
 * @param {string} content
 */
export function parseProjectNameFromEnvContent(content) {
  if (!content) {
    return ''
  }
  const match = content.match(
    /^[ \t]*COMPOSE_PROJECT_NAME[ \t]*=[ \t]*['"]?([^'"\s#]+)['"]?/im
  )
  return match?.[1]?.trim() || ''
}

export default class DockerHelper {
  /** @type {import("index").SSHClient | null} */
  client
  /** @type {import("index").DeployConfig} */
  deployConfig

  /** @type {import("index").DeployConfig['deploy']['docker']} */
  get config() {
    return this.deployConfig.deploy.docker
  }

  get normalized() {
    return normalizeDockerConfig(this.config)
  }

  get imageCfg() {
    return this.normalized?.image ?? {}
  }

  get containerCfg() {
    return this.normalized?.container ?? {}
  }

  /**
   * @param {import("index").SSHClient | null} client
   * @param {import("index").DeployConfig} deployConfig
   */
  constructor(client, deployConfig) {
    this.client = client
    this.deployConfig = deployConfig
  }

  resolveImageRepo() {
    return sanitizeImageRepo(
      this.imageCfg.name ?? this.deployConfig.projectName
    )
  }

  get imageRepo() {
    return this.resolveImageRepo()
  }

  get tag() {
    return this.imageCfg.tag || 'latest'
  }

  get fullImage() {
    return `${this.imageRepo}:${this.tag}`
  }

  get containerName() {
    return this.containerCfg.name || `${this.imageRepo}_container`
  }

  get buildMode() {
    return this.imageCfg.buildMode || 'remote'
  }

  get distMode() {
    return this.imageCfg.distMode || 'mount'
  }

  get useCompose() {
    return !!this.normalized?.compose?.file
  }

  get deployRoot() {
    return this.deployConfig.deploy.deployPath.replace(/\/$/g, '')
  }

  getComposeWorkDir() {
    const workDir = this.normalized?.compose?.workDir
    if (workDir) {
      return workDir.replace(/\/$/g, '')
    }
    return this.deployRoot
  }

  getContainerPort() {
    return this.containerCfg.port ?? 8080
  }

  getHostPort() {
    if (this.containerCfg.hostPort != null && this.containerCfg.hostPort !== '') {
      return this.containerCfg.hostPort
    }
    if (this.deployConfig.nginx?.listen != null) {
      return this.deployConfig.nginx.listen
    }
    throw new Error('请配置 docker.container.hostPort 或 nginx.listen')
  }

  getImageTarFileName() {
    return `auto-deploy_image_${this.tag}.tar`
  }

  getImageTarRemotePath() {
    const dir = (this.imageCfg.tarDir || this.deployRoot).replace(/\/$/g, '')
    return `${dir}/${this.getImageTarFileName()}`
  }

  needsDistSubfolder() {
    return this.distMode === 'mount' || this.useCompose
  }

  getMinimalNginxConf() {
    const port = this.getContainerPort()
    return `server {
  listen ${port};
  server_name localhost;
  location / {
    root /usr/share/nginx/html;
    index index.html index.htm;
    try_files $uri $uri/ /index.html;
  }
}
`
  }

  getDockerfileContent() {
    const baseImage = this.imageCfg.baseImage || 'nginx:latest'
    const copyBlock =
      this.distMode === 'embed'
        ? 'COPY ./dist /usr/share/nginx/html\n'
        : '# dist 通过 volume 挂载，构建上下文需包含 default.conf\n'

    return `FROM ${baseImage}
LABEL maintainer="cloudsail" description="${this.imageRepo}" version="1.0"

RUN /bin/cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime \\
&& echo "Asia/Shanghai" >/etc/timezone

RUN rm -f /etc/nginx/conf.d/default.conf
RUN rm -rf /usr/share/nginx/html/*

${copyBlock}ADD default.conf /etc/nginx/conf.d/

EXPOSE ${this.getContainerPort()}
ENTRYPOINT ["nginx", "-g", "daemon off;"]
`
  }

  resolveProjectDockerfile() {
    if (!this.imageCfg.dockerfile) {
      return null
    }
    const p = path.resolve(process.cwd(), this.imageCfg.dockerfile)
    return fs.existsSync(p) ? p : null
  }

  /**
   * @param {string} content
   * @param {string} remotePath
   */
  async writeTempAndUpload(content, remotePath) {
    if (!this.client) {
      throw new Error('SSH 客户端未连接，无法上传文件')
    }
    const tmp = path.join(
      os.tmpdir(),
      `autodeploy-${Date.now()}-${path.basename(remotePath)}`
    )
    fs.writeFileSync(tmp, content, 'utf8')
    try {
      await this.client.upload(tmp, remotePath)
    } finally {
      try {
        fs.unlinkSync(tmp)
      } catch (_e) {
        /* ignore */
      }
    }
  }

  async ensureRemoteDocker() {
    await this.client.exec('docker version')
  }

  getComposeFilePath(workDir) {
    const file = this.normalized.compose.file
    if (file.startsWith('/')) {
      return file
    }
    return `${workDir}/${file}`
  }

  resolveLocalComposePath() {
    if (!this.normalized?.compose?.file) {
      return null
    }
    const local = path.resolve(process.cwd(), this.normalized.compose.file)
    return fs.existsSync(local) ? local : null
  }

  /**
   * @param {string} workDir
   * @param {string} composeFile
   */
  async readComposeYamlContent(workDir, composeFile) {
    const local = this.resolveLocalComposePath()
    if (local) {
      return fs.readFileSync(local, 'utf8')
    }
    if (this.client) {
      return (await this.client.exec(`cat ${composeFile}`)) || ''
    }
    return ''
  }

  /**
   * @param {string} workDir
   */
  async readComposeEnvContent(workDir) {
    const compose = this.normalized?.compose
    if (compose?.envFile) {
      const localEnv = path.resolve(process.cwd(), compose.envFile)
      if (fs.existsSync(localEnv)) {
        return fs.readFileSync(localEnv, 'utf8')
      }
    }
    const localDotEnv = path.resolve(process.cwd(), '.env')
    if (fs.existsSync(localDotEnv)) {
      return fs.readFileSync(localDotEnv, 'utf8')
    }
    if (this.client) {
      try {
        return (await this.client.exec(`cat ${workDir}/.env`)) || ''
      } catch (_e) {
        return ''
      }
    }
    return ''
  }

  /**
   * @param {string} workDir
   * @param {string} composeFile
   */
  async detectProjectNameFromComposeLs(workDir, composeFile) {
    if (!this.client) {
      return ''
    }
    try {
      const out = await this.client.exec(
        'docker compose ls --format "{{.Name}}\t{{.ConfigFiles}}"'
      )
      if (!out) {
        return ''
      }
      const normalizedTarget = composeFile.replace(/\\/g, '/')
      for (const line of out.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('NAME')) {
          continue
        }
        const tab = trimmed.indexOf('\t')
        if (tab === -1) {
          continue
        }
        const name = trimmed.slice(0, tab).trim()
        const configs = trimmed.slice(tab + 1).trim()
        if (
          configs.includes(normalizedTarget) ||
          configs.includes(path.posix.basename(normalizedTarget))
        ) {
          return name
        }
      }
    } catch (_e) {
      /* ignore */
    }
    return ''
  }

  /**
   * 解析 compose 项目名；未配置 projectName 时自动从 compose / .env / 现网栈推断
   */
  async resolveComposeProjectName() {
    const compose = this.normalized?.compose
    if (compose?.projectName) {
      return compose.projectName
    }

    const workDir = this.getComposeWorkDir()
    const composeFile = this.getComposeFilePath(workDir)

    const yamlContent = await this.readComposeYamlContent(workDir, composeFile)
    const fromYaml = parseProjectNameFromComposeContent(yamlContent)
    if (fromYaml) {
      logger.debug(
        `compose.projectName 从 compose name 解析: ${fromYaml}`
      )
      return fromYaml
    }

    const envContent = await this.readComposeEnvContent(workDir)
    const fromEnv = parseProjectNameFromEnvContent(envContent)
    if (fromEnv) {
      logger.debug(
        `compose.projectName 从 .env COMPOSE_PROJECT_NAME 解析: ${fromEnv}`
      )
      return fromEnv
    }

    const fromLs = await this.detectProjectNameFromComposeLs(
      workDir,
      composeFile
    )
    if (fromLs) {
      logger.debug(`compose.projectName 从 docker compose ls 匹配: ${fromLs}`)
      return fromLs
    }

    const fromDir = path.posix.basename(workDir)
    logger.debug(`compose.projectName 使用 workDir 目录名: ${fromDir}`)
    return fromDir
  }

  async ensureComposeStack() {
    const workDir = this.getComposeWorkDir()
    const composeFile = this.getComposeFilePath(workDir)
    const mode = this.normalized?.compose?.mode || 'managed'

    if (mode === 'remote' && !this.normalized?.compose?.workDir) {
      throw new Error('compose.mode 为 remote 时必须配置 compose.workDir')
    }

    await this.client.exec(`test -d ${workDir}`)
    await this.client.exec(`test -f ${composeFile}`)
    await this.client.exec('docker compose version')
  }

  async prepareBuildContextOnServer() {
    const root = this.deployRoot
    await this.client.exec(`mkdir -p ${root}`)

    const customDockerfile = this.resolveProjectDockerfile()
    if (customDockerfile) {
      await this.client.upload(customDockerfile, `${root}/Dockerfile`)
    } else {
      await this.writeTempAndUpload(
        this.getDockerfileContent(),
        `${root}/Dockerfile`
      )
    }

    const nginxConf = this.deployConfig.nginx
      ? new NginxHelper(this.client, this.deployConfig).confContentForFile
      : this.getMinimalNginxConf()
    await this.writeTempAndUpload(nginxConf, `${root}/default.conf`)
  }

  async buildRemote() {
    await this.prepareBuildContextOnServer()
    await this.client.exec(
      `cd ${this.deployRoot} && docker build -t ${this.fullImage} .`
    )
  }

  /**
   * @param {string} [tarPath]
   */
  async loadImageRemote(tarPath) {
    const remoteTar = tarPath || this.getImageTarRemotePath()
    await this.client.exec(`docker load -i ${remoteTar}`)
  }

  async uploadComposeContext() {
    const compose = this.normalized.compose
    const workDir = this.getComposeWorkDir()
    const mode = compose.mode || 'managed'

    await this.client.exec(`mkdir -p ${workDir}`)

    const shouldSyncFile =
      mode === 'managed' || compose.syncComposeFile === true

    if (shouldSyncFile && compose.file) {
      const localCompose = path.resolve(process.cwd(), compose.file)
      if (!fs.existsSync(localCompose)) {
        throw new Error(`本地 compose 文件不存在: ${localCompose}`)
      }
      const remoteName = path.basename(compose.file)
      await this.client.upload(localCompose, `${workDir}/${remoteName}`)
    }

    if (mode === 'managed' && compose.envFile) {
      const localEnv = path.resolve(process.cwd(), compose.envFile)
      if (fs.existsSync(localEnv)) {
        await this.client.upload(localEnv, `${workDir}/.env`)
      }
    }
  }

  buildComposeEnvPrefix() {
    const compose = this.normalized.compose
    const vars = {
      IMAGE_NAME: this.imageRepo,
      IMAGE_TAG: this.tag,
      CONTAINER_NAME: this.containerName,
      ...(compose.env || {})
    }
    return Object.entries(vars)
      .map(([k, v]) => `${k}=${String(v).replace(/"/g, '\\"')}`)
      .join(' ')
  }

  /**
   * @param {string} [projectName]
   */
  async runCompose(projectName) {
    await this.ensureComposeStack()

    const mode = this.normalized.compose.mode || 'managed'
    if (mode === 'managed' || this.normalized.compose.syncComposeFile) {
      await this.uploadComposeContext()
    }

    const workDir = this.getComposeWorkDir()
    const composeFile = this.getComposeFilePath(workDir)
    const project = projectName || (await this.resolveComposeProjectName())
    const envPrefix = this.buildComposeEnvPrefix()
    logger.debug(
      `docker compose up -p ${project} -f ${composeFile}${this.normalized.compose.service ? ` (${this.normalized.compose.service})` : ''}`
    )
    const forceRecreate =
      this.normalized.compose.forceRecreate !== false
        ? '--force-recreate'
        : ''
    const service = this.normalized.compose.service
      ? ` ${this.normalized.compose.service}`
      : ''

    await this.client.exec(
      `cd ${workDir} && ${envPrefix} docker compose -f ${composeFile} -p ${project} up -d --remove-orphans ${forceRecreate}${service}`
    )
  }

  async removeContainer() {
    await this.client.exec(`docker rm -f ${this.containerName}`).catch(() => false)
  }

  async startContainer() {
    const port = this.getHostPort()
    const containerPort = this.getContainerPort()
    const volumeMount =
      this.distMode === 'mount'
        ? `-v ${this.deployRoot}/dist:/usr/share/nginx/html `
        : ''

    return this.client.exec(
      `docker run -d --restart=always ${volumeMount}-p ${port}:${containerPort} --name ${this.containerName} ${this.fullImage} ${this.containerCfg.startArgs || ''}`
    )
  }

  /**
   * @returns {Promise<{ fullImage: string, service?: string, project?: string } | void>}
   */
  async reload() {
    if (this.useCompose) {
      const project = await this.resolveComposeProjectName()
      await this.runCompose(project)
      return {
        fullImage: this.fullImage,
        service: this.normalized.compose.service,
        project
      }
    }
    await this.removeContainer()
    await this.startContainer()
    return { fullImage: this.fullImage }
  }

}
