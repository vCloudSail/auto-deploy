import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'

import {
  sanitizeProjectName,
  readProjectManifest,
  hasProjectManifest,
  resolveProjectMeta
} from '../src/utils/project-meta.js'
import {
  createTempDir,
  removeTempDir,
  writeFiles
} from './helpers/fs-fixture.js'

describe('project-meta', () => {
  /** @type {string[]} */
  const tempDirs = []

  afterEach(() => {
    while (tempDirs.length) {
      removeTempDir(tempDirs.pop())
    }
  })

  function fixture(files) {
    const dir = createTempDir()
    tempDirs.push(dir)
    writeFiles(dir, files)
    return dir
  }

  describe('sanitizeProjectName', () => {
    it('替换非法文件名字符', () => {
      assert.equal(sanitizeProjectName('foo/bar:baz'), 'foo_bar_baz')
    })

    it('空值返回空字符串', () => {
      assert.equal(sanitizeProjectName(''), '')
      assert.equal(sanitizeProjectName(null), '')
    })
  })

  describe('readProjectManifest', () => {
    it('解析 package.json', () => {
      const cwd = fixture({
        'package.json': JSON.stringify({ name: '@scope/my-app' })
      })
      const manifest = readProjectManifest(cwd)
      assert.equal(manifest?.name, '@scope_my-app')
      assert.equal(manifest?.source, 'package.json')
    })

    it('解析 pyproject.toml', () => {
      const cwd = fixture({
        'pyproject.toml': `[project]\nname = "bid-assistant"\nversion = "1.0.0"\n`
      })
      const manifest = readProjectManifest(cwd)
      assert.equal(manifest?.name, 'bid-assistant')
      assert.equal(manifest?.source, 'pyproject.toml')
    })

    it('解析 Cargo.toml', () => {
      const cwd = fixture({
        'Cargo.toml': `[package]\nname = "my-rust-app"\nversion = "0.1.0"\n`
      })
      assert.equal(readProjectManifest(cwd)?.name, 'my-rust-app')
    })

    it('解析 composer.json', () => {
      const cwd = fixture({
        'composer.json': JSON.stringify({ name: 'vendor/php-app' })
      })
      assert.equal(readProjectManifest(cwd)?.name, 'vendor_php-app')
    })

    it('解析 go.mod 取 module 最后一段', () => {
      const cwd = fixture({
        'go.mod': 'module github.com/example/my-go-service\n\ngo 1.22\n'
      })
      assert.equal(readProjectManifest(cwd)?.name, 'my-go-service')
    })

    it('解析 pom.xml artifactId', () => {
      const cwd = fixture({
        'pom.xml': '<project><artifactId>java-app</artifactId></project>'
      })
      assert.equal(readProjectManifest(cwd)?.name, 'java-app')
    })

    it('解析 build.gradle rootProject.name', () => {
      const cwd = fixture({
        'build.gradle': "rootProject.name = 'gradle-app'\n"
      })
      assert.equal(readProjectManifest(cwd)?.name, 'gradle-app')
    })

    it('解析 .csproj AssemblyName，否则用文件名', () => {
      const cwd = fixture({
        'WebApp.csproj': '<Project><AssemblyName>DotNetApp</AssemblyName></Project>'
      })
      assert.equal(readProjectManifest(cwd)?.name, 'DotNetApp')

      const cwd2 = fixture({
        'Fallback.csproj': '<Project></Project>'
      })
      assert.equal(readProjectManifest(cwd2)?.name, 'Fallback')
    })

    it('无效 JSON 时继续尝试其他清单', () => {
      const cwd = fixture({
        'package.json': '{ invalid',
        'go.mod': 'module example/fallback\n'
      })
      assert.equal(readProjectManifest(cwd)?.name, 'fallback')
    })

    it('无清单时返回 null', () => {
      const cwd = fixture({ 'README.md': '# hello' })
      assert.equal(readProjectManifest(cwd), null)
    })
  })

  describe('hasProjectManifest', () => {
    it('有可读名称时返回 true', () => {
      const cwd = fixture({
        'package.json': JSON.stringify({ name: 'app' })
      })
      assert.equal(hasProjectManifest(cwd), true)
    })

    it('清单存在但无法解析名称时仍返回 true', () => {
      const cwd = fixture({
        'package.json': JSON.stringify({ version: '1.0.0' })
      })
      assert.equal(hasProjectManifest(cwd), true)
    })

    it('仅有 .csproj 时返回 true', () => {
      const cwd = fixture({
        'App.csproj': '<Project></Project>'
      })
      assert.equal(hasProjectManifest(cwd), true)
    })

    it('无任何清单时返回 false', () => {
      const cwd = fixture({})
      assert.equal(hasProjectManifest(cwd), false)
    })
  })

  describe('resolveProjectMeta', () => {
    it('优先使用 config.projectName', () => {
      const cwd = fixture({
        'package.json': JSON.stringify({ name: 'from-pkg' })
      })
      const meta = resolveProjectMeta(cwd, {
        projectName: 'explicit/name',
        env: 'prod'
      })
      assert.equal(meta.projectName, 'explicit_name')
      assert.equal(meta.source, 'config.projectName')
    })

    it('其次使用清单名称', () => {
      const cwd = fixture({
        'pyproject.toml': `[project]\nname = "from-manifest"\n`
      })
      const meta = resolveProjectMeta(cwd, { env: 'prod' })
      assert.equal(meta.projectName, 'from-manifest')
      assert.equal(meta.source, 'pyproject.toml')
    })

    it('无清单时使用目录名', () => {
      const cwd = fixture({})
      const meta = resolveProjectMeta(cwd, { env: 'prod' })
      assert.equal(meta.projectName, path.basename(cwd))
      assert.equal(meta.source, 'cwd')
    })

    it('无清单且目录名为 . 时回退到 env', () => {
      const cwd = fixture({})
      const meta = resolveProjectMeta(cwd, { env: 'staging' })
      assert.equal(meta.projectName, path.basename(cwd))
      assert.equal(meta.source, 'cwd')
    })
  })
})
