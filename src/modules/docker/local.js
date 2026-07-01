import fs from 'node:fs'
import path from 'node:path'

import { exec } from 'child-process-promise'

import logger from '@/utils/logger'
import DockerHelper from './index.js'
import NginxHelper from '../nginx.js'

/**
 * 递归复制目录
 * @param {string} src
 * @param {string} dest
 */
function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

/**
 * @param {unknown} error
 */
function formatDockerExecError(error) {
  const err = /** @type {{ stderr?: string; stdout?: string; message?: string }} */ (
    error
  )
  const detail = [err.stderr, err.stdout].filter(Boolean).join('\n').trim()
  if (detail) {
    const lines = detail.split('\n').filter((l) => l.trim())
    const tail = lines.slice(-8).join('\n')
    return tail || err.message || String(error)
  }
  return err.message || String(error)
}

export default class DockerLocalBuilder {
  static async checkDockerCli() {
    try {
      await exec('docker version')
    } catch (error) {
      throw new Error(
        '本地镜像打包需要安装 Docker，请先安装 Docker CLI 并确保 docker version 可执行'
      )
    }
  }

  /**
   * @param {import('index').DeployConfig} deployConfig
   * @param {string} distPath
   * @returns {Promise<string>} 本地镜像 tar 绝对路径
   */
  static async buildAndSave(deployConfig, distPath) {
    const docker = new DockerHelper(null, deployConfig)
    const cwd = process.cwd()
    const stagingDir = path.resolve(
      cwd,
      `.auto-deploy/docker-staging/${deployConfig.env}_${docker.tag}`
    )

    if (fs.existsSync(stagingDir)) {
      fs.rmSync(stagingDir, { recursive: true, force: true })
    }
    fs.mkdirSync(stagingDir, { recursive: true })

    const absDist = path.resolve(cwd, distPath)
    if (!fs.existsSync(absDist)) {
      throw new Error(`构建产物目录不存在: ${absDist}`)
    }

    copyDirSync(absDist, path.join(stagingDir, 'dist'))

    const customDockerfile = docker.resolveProjectDockerfile()
    if (customDockerfile) {
      fs.copyFileSync(customDockerfile, path.join(stagingDir, 'Dockerfile'))
    } else {
      fs.writeFileSync(
        path.join(stagingDir, 'Dockerfile'),
        docker.getDockerfileContent(),
        'utf8'
      )
    }

    const nginxConf = deployConfig.nginx
      ? new NginxHelper(null, deployConfig).confContentForFile
      : new DockerHelper(null, deployConfig).getMinimalNginxConf()
    fs.writeFileSync(
      path.join(stagingDir, 'default.conf'),
      nginxConf,
      'utf8'
    )

    const tarName = docker.getImageTarFileName()
    const tarPath = path.resolve(cwd, tarName)

    if (fs.existsSync(tarPath)) {
      fs.unlinkSync(tarPath)
    }

    logger.debug(`docker build -t ${docker.fullImage}`)
    try {
      await exec(`docker build -t ${docker.fullImage} "${stagingDir}"`)
    } catch (error) {
      throw new Error(
        `docker build 失败（${docker.fullImage}）:\n${formatDockerExecError(error)}`
      )
    }
    logger.debug(`docker save -o ${tarPath}`)
    try {
      await exec(`docker save -o "${tarPath}" ${docker.fullImage}`)
    } catch (error) {
      throw new Error(
        `docker save 失败:\n${formatDockerExecError(error)}`
      )
    }

    try {
      fs.rmSync(stagingDir, { recursive: true, force: true })
    } catch (_e) {
      /* ignore */
    }

    return tarPath
  }

  /**
   * @param {string} tarPath
   */
  static async deleteImageTar(tarPath) {
    if (tarPath && fs.existsSync(tarPath)) {
      fs.unlinkSync(tarPath)
    }
  }
}
