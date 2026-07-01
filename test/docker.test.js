import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  normalizeDockerConfig,
  getDockerBuildMode,
  ensureDockerImageTag
} from '../src/modules/docker/config.js'
import {
  sanitizeImageRepo,
  parseProjectNameFromComposeContent,
  parseProjectNameFromEnvContent
} from '../src/modules/docker/index.js'

describe('docker', () => {
  describe('normalizeDockerConfig', () => {
    it('null 输入返回 null', () => {
      assert.equal(normalizeDockerConfig(null), null)
    })

    it('填充 image/container 默认值结构', () => {
      const normalized = normalizeDockerConfig({
        image: { name: 'my-app', tag: 'v1', buildMode: 'local' },
        compose: { service: 'web' }
      })
      assert.equal(normalized.image.name, 'my-app')
      assert.equal(normalized.image.buildMode, 'local')
      assert.deepEqual(normalized.container, {
        name: undefined,
        hostPort: undefined,
        port: undefined,
        startArgs: undefined
      })
      assert.deepEqual(normalized.compose, { service: 'web' })
    })
  })

  describe('getDockerBuildMode', () => {
    it('默认 remote', () => {
      assert.equal(getDockerBuildMode({ image: {} }), 'remote')
      assert.equal(getDockerBuildMode(undefined), 'remote')
    })

    it('读取 buildMode', () => {
      assert.equal(
        getDockerBuildMode({ image: { buildMode: 'local' } }),
        'local'
      )
    })
  })

  describe('ensureDockerImageTag', () => {
    it('无 tag 时自动写入时间戳格式', () => {
      const config = {
        deploy: {
          docker: {
            image: { name: 'app' }
          }
        }
      }
      ensureDockerImageTag(config)
      assert.match(config.deploy.docker.image.tag, /^\d{8}_\d{6}$/)
    })

    it('已有 tag 时不覆盖', () => {
      const config = {
        deploy: {
          docker: {
            image: { name: 'app', tag: 'stable' }
          }
        }
      }
      ensureDockerImageTag(config)
      assert.equal(config.deploy.docker.image.tag, 'stable')
    })
  })

  describe('sanitizeImageRepo', () => {
    it('清理空格与特殊字符', () => {
      assert.equal(sanitizeImageRepo(' @scope/app #1 '), 'scope_app_1_')
    })

    it('去掉前导 - 与 _（仅首个字符）', () => {
      assert.equal(sanitizeImageRepo('__my-app'), '_my-app')
    })
  })

  describe('parseProjectNameFromComposeContent', () => {
    it('解析顶层 name', () => {
      const content = `name: qf_bid_assistant\nservices:\n  front:\n    image: app\n`
      assert.equal(parseProjectNameFromComposeContent(content), 'qf_bid_assistant')
    })

    it('空内容返回空字符串', () => {
      assert.equal(parseProjectNameFromComposeContent(''), '')
    })
  })

  describe('parseProjectNameFromEnvContent', () => {
    it('解析 COMPOSE_PROJECT_NAME', () => {
      const content = 'COMPOSE_PROJECT_NAME=offline_stack\nFOO=bar\n'
      assert.equal(parseProjectNameFromEnvContent(content), 'offline_stack')
    })
  })
})
