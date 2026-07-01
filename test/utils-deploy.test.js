import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import {
  resolveDeployPath,
  shouldUseSudoForDeployFiles,
  checkDeployConfig,
  getDeployConfigPath,
  formatFileSize
} from '../src/utils/index.js'
import { distHasContent } from '../src/utils/dist-build-prompt.js'
import {
  createTempDir,
  removeTempDir,
  writeFiles
} from './helpers/fs-fixture.js'

describe('utils-deploy', () => {
  const originalCwd = process.cwd()
  /** @type {string[]} */
  const tempDirs = []

  afterEach(() => {
    process.chdir(originalCwd)
    while (tempDirs.length) {
      removeTempDir(tempDirs.pop())
    }
  })

  function chdirFixture(files) {
    const dir = createTempDir()
    tempDirs.push(dir)
    writeFiles(dir, files)
    process.chdir(dir)
    return dir
  }

  describe('resolveDeployPath', () => {
    it('优先使用 deploy.deployPath', () => {
      const p = resolveDeployPath({
        env: 'prod',
        deploy: { deployPath: '/var/www/app/' }
      })
      assert.equal(p, '/var/www/app')
    })

    it('Docker 且无路径时使用 /tmp/autodeploy 模板', () => {
      const p = resolveDeployPath({
        env: 'prod',
        projectName: 'my app',
        deploy: { docker: { image: { name: 'x' } } }
      })
      assert.equal(p, '/tmp/autodeploy-my_app-prod')
    })

    it('非 Docker 且无路径返回空', () => {
      assert.equal(resolveDeployPath({ env: 'prod', deploy: {} }), '')
    })
  })

  describe('shouldUseSudoForDeployFiles', () => {
    it('/tmp 路径不使用 sudo', () => {
      const use = shouldUseSudoForDeployFiles({
        env: 'prod',
        projectName: 'app',
        server: { host: 'x', cmdUseSudo: true },
        deploy: { docker: { image: { name: 'app' } } }
      })
      assert.equal(use, false)
    })

    it('非 /tmp 且 cmdUseSudo 为 true 时使用 sudo', () => {
      const use = shouldUseSudoForDeployFiles({
        env: 'prod',
        server: { host: 'x', cmdUseSudo: true },
        deploy: { deployPath: '/var/www/app' }
      })
      assert.equal(use, true)
    })
  })

  describe('checkDeployConfig', () => {
    it('无 deployPath 且非 Docker 时抛错', () => {
      assert.throws(
        () => checkDeployConfig({ env: 'prod', deploy: {} }),
        /未填写部署路径/
      )
    })

    it('Docker 模式允许无 deployPath', () => {
      assert.doesNotThrow(() =>
        checkDeployConfig({
          env: 'prod',
          projectName: 'app',
          deploy: { docker: { image: { name: 'app' } } }
        })
      )
    })
  })

  describe('getDeployConfigPath', () => {
    it('拼接默认后缀', () => {
      assert.equal(
        getDeployConfigPath(
          { deploy: { deployPath: '/var/www/app/' } },
          null,
          '/nginx.conf'
        ),
        '/var/www/app/nginx.conf'
      )
    })

    it('显式 path 优先', () => {
      assert.equal(
        getDeployConfigPath(
          { deploy: { deployPath: '/var/www/app' } },
          '/custom/path'
        ),
        '/custom/path'
      )
    })
  })

  describe('formatFileSize', () => {
    it('KB/MB 格式化', () => {
      assert.equal(formatFileSize(1024), '1.00 KB')
      assert.match(formatFileSize(1024 * 1024), /MB/)
    })

    it('0 或空返回 undefined', () => {
      assert.equal(formatFileSize(0), undefined)
    })
  })

  describe('distHasContent', () => {
    it('目录不存在返回 false', () => {
      chdirFixture({})
      assert.equal(distHasContent('dist'), false)
    })

    it('空目录返回 false', () => {
      chdirFixture({ 'dist/.gitkeep': '' })
      fs.rmSync(path.join(process.cwd(), 'dist', '.gitkeep'))
      assert.equal(distHasContent('dist'), false)
    })

    it('有文件返回 true', () => {
      chdirFixture({ 'dist/index.html': '<html></html>' })
      assert.equal(distHasContent('dist'), true)
    })

    it('dist 为单文件时返回 true', () => {
      chdirFixture({ dist: 'bundle' })
      assert.equal(distHasContent('dist'), true)
    })
  })
})
