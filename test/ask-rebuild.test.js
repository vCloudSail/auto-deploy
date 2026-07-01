import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { askRebuildWhenDistExists } from '../src/utils/dist-build-prompt.js'
import { getDemoConfig } from './helpers/demo-config.js'
import {
  createTempDir,
  removeTempDir,
  writeFiles
} from './helpers/fs-fixture.js'

describe('askRebuildWhenDistExists', () => {
  const originalCwd = process.cwd()
  /** @type {string[]} */
  const tempDirs = []

  afterEach(() => {
    process.chdir(originalCwd)
    while (tempDirs.length) {
      removeTempDir(tempDirs.pop())
    }
  })

  function useDistFixture(files = { 'dist/index.html': '<html></html>' }) {
    const dir = createTempDir()
    tempDirs.push(dir)
    writeFiles(dir, files)
    process.chdir(dir)
    return dir
  }

  it('dist 不存在时直接返回 true（需要构建）', async () => {
    const dir = createTempDir()
    tempDirs.push(dir)
    process.chdir(dir)
    const result = await askRebuildWhenDistExists(undefined, { distPath: 'dist' })
    assert.equal(result, true)
  })

  it('dist 已有内容且无 prompt 时使用 defaultRebuild', async () => {
    useDistFixture()
    assert.equal(
      await askRebuildWhenDistExists(undefined, {
        distPath: 'dist',
        defaultRebuild: false
      }),
      false
    )
    assert.equal(
      await askRebuildWhenDistExists(undefined, {
        distPath: 'dist',
        defaultRebuild: true
      }),
      true
    )
  })

  it('mock prompt 选择不重新构建', async () => {
    useDistFixture()
    const prompt = () =>
      Promise.resolve({ rebuild: false })
    assert.equal(
      await askRebuildWhenDistExists(prompt, { distPath: 'dist' }),
      false
    )
  })

  it('mock prompt 选择重新构建', async () => {
    useDistFixture()
    const prompt = () =>
      Promise.resolve({ rebuild: true })
    assert.equal(
      await askRebuildWhenDistExists(prompt, { distPath: 'dist' }),
      true
    )
  })

  it('等待超时后使用默认值', async () => {
    useDistFixture()
    const prompt = () =>
      new Promise(() => {
        /* 永不 resolve，触发超时 */
      })
    prompt.ui = { close() {} }

    const result = await askRebuildWhenDistExists(prompt, {
      distPath: 'dist',
      defaultRebuild: false,
      timeoutMs: 80
    })
    assert.equal(result, false)
  })

  it('prompt 抛错时回退 defaultRebuild', async () => {
    useDistFixture()
    const prompt = () => Promise.reject(new Error('stdin closed'))
    assert.equal(
      await askRebuildWhenDistExists(prompt, {
        distPath: 'dist',
        defaultRebuild: true
      }),
      true
    )
  })

  it('与 demo dev 配置默认 distPath 一致', async () => {
    useDistFixture()
    const config = getDemoConfig('dev')
    const distPath = config.build?.distPath || 'dist'
    assert.equal(distPath, 'dist')
    assert.equal(
      await askRebuildWhenDistExists(undefined, {
        distPath,
        defaultRebuild: false
      }),
      false
    )
  })
})
