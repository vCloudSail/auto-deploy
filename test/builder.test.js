import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import Builder from '../src/modules/builder.js'
import settings from '../src/settings.js'
import {
  createTempDir,
  removeTempDir,
  writeFiles
} from './helpers/fs-fixture.js'

describe('builder', () => {
  const originalCwd = process.cwd()
  /** @type {string[]} */
  const tempDirs = []

  afterEach(() => {
    process.chdir(originalCwd)
    settings.deployConfig = null
    while (tempDirs.length) {
      removeTempDir(tempDirs.pop())
    }
  })

  function setupCwd(files) {
    const dir = createTempDir()
    tempDirs.push(dir)
    writeFiles(dir, files)
    process.chdir(dir)
    settings.deployConfig = { projectName: 'test-app', env: 'prod' }
    return dir
  }

  describe('deletePkgFile', () => {
    it('删除存在的 zip', async () => {
      const dir = setupCwd({})
      const pkg = path.join(dir, 'pkg.zip')
      fs.writeFileSync(pkg, 'data')
      await Builder.deletePkgFile('pkg.zip')
      assert.equal(fs.existsSync(pkg), false)
    })

    it('支持绝对路径', async () => {
      const dir = setupCwd({})
      const pkg = path.join(dir, 'abs.zip')
      fs.writeFileSync(pkg, 'data')
      await Builder.deletePkgFile(pkg)
      assert.equal(fs.existsSync(pkg), false)
    })

    it('文件不存在时静默', async () => {
      setupCwd({})
      await assert.doesNotReject(() =>
        Builder.deletePkgFile('missing.zip')
      )
    })

    it('空路径直接返回', async () => {
      await assert.doesNotReject(() => Builder.deletePkgFile(''))
      await assert.doesNotReject(() => Builder.deletePkgFile(undefined))
    })
  })

  describe('zip', () => {
    it('空 dist 目录拒绝打包', async () => {
      setupCwd({ 'dist/.keep': '' })
      fs.rmSync(path.join(process.cwd(), 'dist', '.keep'))
      const builder = new Builder('prod')
      await assert.rejects(
        () => builder.zip('dist'),
        /不存在或为空/
      )
    })

    it('非空 dist 生成 zip', async () => {
      setupCwd({
        'dist/index.html': '<html>ok</html>',
        'dist/assets/app.js': 'console.log(1)'
      })
      const builder = new Builder('prod')
      const result = await builder.zip('dist')
      assert.ok(result.size > 0)
      assert.match(result.name, /auto-deploy\[test-app\]_prod_\d+\.zip/)
      assert.equal(fs.existsSync(path.join(process.cwd(), result.name)), true)
    })
  })

  describe('build', () => {
    it('空 buildCmd 抛错', async () => {
      setupCwd({})
      const builder = new Builder('prod')
      await assert.rejects(() => builder.build(''), /buildCmd is null/)
    })

    it('成功命令返回尾部日志', async () => {
      setupCwd({})
      const builder = new Builder('prod')
      const cmd =
        process.platform === 'win32'
          ? 'echo build-ok'
          : 'echo build-ok'
      const tail = await builder.build(cmd)
      assert.ok(Array.isArray(tail))
      assert.ok(tail.some((line) => line.includes('build-ok')))
    })

    it('失败命令附带 outputTail', async () => {
      setupCwd({})
      const builder = new Builder('prod')
      const cmd =
        process.platform === 'win32'
          ? 'cmd /c "echo err-line1&& echo err-line2&& exit 1"'
          : 'sh -c "echo err-line1; echo err-line2; exit 1"'
      try {
        await builder.build(cmd)
        assert.fail('应抛出构建失败')
      } catch (err) {
        assert.match(String(err.message), /退出码 1/)
        assert.ok(Array.isArray(err.outputTail))
        assert.ok(err.outputTail.length >= 1)
      }
    })
  })
})
