import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import DockerHelper from '../src/modules/docker/index.js'
import { extractRemoteZip } from '../src/utils/ensure-unzip.js'
import {
  demoRoot,
  getDemoConfig,
  getDemoDevWithCompose,
  normalizeDemoConfig
} from './helpers/demo-config.js'
import {
  createMockSSHClient,
  execIncludes
} from './helpers/mock-ssh.js'
import {
  createTempDir,
  removeTempDir,
  writeFiles
} from './helpers/fs-fixture.js'

describe('demo 环境 mock 部署链路', () => {
  const originalCwd = process.cwd()
  /** @type {string[]} */
  const tempDirs = []

  afterEach(() => {
    process.chdir(originalCwd)
    while (tempDirs.length) {
      removeTempDir(tempDirs.pop())
    }
  })

  describe('prod 静态：远端解压', () => {
    it('extractRemoteZip 走 unzip 分支（prod deployPath）', async () => {
      const config = getDemoConfig('prod')
      const client = createMockSSHClient({ host: '121.37.2.208' })
      const remoteZip = '/data/apps/web/mock-deploy.zip'
      const unzipDir = '/data/apps/web/autodeploy_testtt_temp'

      await extractRemoteZip(client, remoteZip, unzipDir)

      assert.ok(execIncludes(client.calls.exec, /command -v unzip/))
      assert.ok(execIncludes(client.calls.exec, /unzip -o/))
      assert.ok(execIncludes(client.calls.exec, /mock-deploy\.zip/))
      assert.ok(execIncludes(client.calls.exec, /autodeploy_testtt_temp/))
      assert.equal(config.deploy.deployPath, '/data/apps/web/testtt')
    })
  })

  describe('dev Docker remote', () => {
    /** @type {ReturnType<typeof createMockSSHClient>} */
    let client
    /** @type {DockerHelper} */
    let helper

    beforeEach(() => {
      const dir = createTempDir()
      tempDirs.push(dir)
      writeFiles(dir, { 'dist/index.html': '<html></html>' })
      process.chdir(dir)

      const config = normalizeDemoConfig(getDemoConfig('dev'), 'dev')
      config.projectName = 'my-web-dev'
      client = createMockSSHClient({ host: '192.168.14.211' })
      helper = new DockerHelper(client, config)
    })

    it('ensureRemoteDocker 与 buildRemote 命令', async () => {
      await helper.ensureRemoteDocker()
      await helper.prepareBuildContextOnServer()
      await helper.buildRemote()

      assert.ok(execIncludes(client.calls.exec, /docker version/))
      assert.ok(
        execIncludes(
          client.calls.exec,
          /docker build -t my-web-dev:latest/
        )
      )
      assert.ok(client.calls.upload.length >= 1)
    })

    it('无 compose 时 reload 走 docker run', async () => {
      await helper.reload()

      assert.ok(execIncludes(client.calls.exec, /docker rm -f my-web-dev_container/))
      assert.ok(
        execIncludes(
          client.calls.exec,
          /docker run -d.*-v .*\/dist:\/usr\/share\/nginx\/html.*my-web-dev:latest/
        )
      )
    })
  })

  describe('dev + managed compose（demo/docker-compose.yml）', () => {
    it('上传 compose 并 docker compose up', async () => {
      process.chdir(demoRoot)
      const config = getDemoDevWithCompose()
      const client = createMockSSHClient({
        host: '192.168.14.211',
        onExec(cmd) {
          if (cmd.includes('docker compose ls')) {
            return 'my-web-dev\t/home/tichaincloud/web/test/docker-compose.yml\n'
          }
        }
      })
      const helper = new DockerHelper(client, config)

      await helper.ensureRemoteDocker()
      await helper.prepareBuildContextOnServer()
      await helper.buildRemote()
      const meta = await helper.reload()

      assert.equal(meta?.project, 'my-web-dev')
      assert.equal(meta?.service, 'web')
      assert.ok(
        client.calls.upload.some((u) =>
          u.local.replace(/\\/g, '/').endsWith('demo/docker-compose.yml')
        )
      )
      assert.ok(
        execIncludes(
          client.calls.exec,
          /docker compose -f .*docker-compose\.yml -p my-web-dev up -d/
        )
      )
    })
  })
})
