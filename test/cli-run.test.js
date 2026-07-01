import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  resolveBuildCmd,
  buildDeployPlan,
  createStepRunner
} from '../src/utils/cli-run.js'

/** @type {import('index').DeployConfig} */
const baseConfig = {
  env: 'prod',
  name: '生产',
  projectName: 'demo-app',
  server: { host: '1.2.3.4', port: 22, username: 'root', password: 'x' },
  deploy: {
    deployPath: '/var/www/demo',
    distPath: 'dist'
  }
}

describe('cli-run', () => {
  describe('resolveBuildCmd', () => {
    it('使用 build.cmd 当显式配置', () => {
      assert.equal(
        resolveBuildCmd({ build: { cmd: 'pnpm build' } }),
        'pnpm build'
      )
    })

    it('cmd 为 null 时回退到 npm run script', () => {
      assert.equal(
        resolveBuildCmd({ build: { cmd: null, script: 'build:prod' } }),
        'npm run build:prod'
      )
    })

    it('默认 npm run build', () => {
      assert.equal(resolveBuildCmd({}), 'npm run build')
    })
  })

  describe('buildDeployPlan', () => {
    it('标准静态部署：build + zip + 远端三步', () => {
      const plan = buildDeployPlan(baseConfig, {})
      assert.deepEqual(plan.local, ['build', 'zip'])
      assert.deepEqual(plan.remote, ['uploadZip', 'extract', 'finish'])
      assert.equal(plan.serverCount, 1)
      assert.equal(plan.total, 5)
    })

    it('指定 zip 文件时跳过 build 与 zip', () => {
      const plan = buildDeployPlan(
        baseConfig,
        { file: './release.zip' },
        { useZipFile: true }
      )
      assert.deepEqual(plan.local, ['providedZip'])
      assert.equal(plan.total, 4)
    })

    it('build.cmd 为空字符串时不计入 build 步骤', () => {
      const plan = buildDeployPlan(
        { ...baseConfig, build: { cmd: '' } },
        {}
      )
      assert.deepEqual(plan.local, ['zip'])
      assert.equal(plan.total, 4)
    })

    it('Docker local 模式增加本地镜像与远端 load', () => {
      const config = {
        ...baseConfig,
        deploy: {
          ...baseConfig.deploy,
          docker: {
            image: { name: 'app', tag: 'v1', buildMode: 'local' }
          }
        }
      }
      const plan = buildDeployPlan(config, {})
      assert.deepEqual(plan.local, ['build', 'zip', 'localImage'])
      assert.deepEqual(plan.remote, [
        'uploadZip',
        'uploadImage',
        'extract',
        'dockerLoad',
        'dockerReload',
        'finish'
      ])
      assert.equal(plan.total, 9)
    })

    it('Docker remote 模式使用 dockerBuild', () => {
      const config = {
        ...baseConfig,
        deploy: {
          ...baseConfig.deploy,
          docker: {
            image: { name: 'app', tag: 'v1', buildMode: 'remote' }
          }
        }
      }
      const plan = buildDeployPlan(config, {})
      assert.ok(plan.remote.includes('dockerBuild'))
      assert.ok(!plan.remote.includes('dockerLoad'))
      assert.ok(!plan.local.includes('localImage'))
    })

    it('backup 与 nginx 计入远端步骤', () => {
      const nginxConfig = {
        ...baseConfig,
        nginx: { confPath: '/etc/nginx/conf.d' }
      }
      const plan = buildDeployPlan(nginxConfig, { backup: true })
      assert.deepEqual(plan.remote, [
        'uploadZip',
        'backup',
        'extract',
        'nginx',
        'finish'
      ])
    })

    it('Docker 模式不部署 nginx', () => {
      const config = {
        ...baseConfig,
        nginx: { confPath: '/etc/nginx' },
        deploy: {
          ...baseConfig.deploy,
          docker: { image: { name: 'app', buildMode: 'remote' } }
        }
      }
      const plan = buildDeployPlan(config, {})
      assert.ok(!plan.remote.includes('nginx'))
    })

    it('多机部署按服务器数量倍增远端步骤', () => {
      const config = {
        ...baseConfig,
        server: [
          baseConfig.server,
          { ...baseConfig.server, host: '5.6.7.8' }
        ]
      }
      const plan = buildDeployPlan(config, {})
      assert.equal(plan.serverCount, 2)
      assert.equal(plan.total, 2 + 3 * 2)
    })
  })

  describe('createStepRunner', () => {
    function mockLogger() {
      /** @type {Array<{ level: string, message: string, meta: object }>} */
      const entries = []
      return {
        entries,
        info(message, meta = {}) {
          entries.push({ level: 'info', message, meta })
        },
        error(message, meta = {}) {
          entries.push({ level: 'error', message, meta })
        }
      }
    }

    it('start/succeed 递增步骤并记录耗时', () => {
      const logger = mockLogger()
      const runner = createStepRunner(logger, 5)
      runner.start('构建')
      runner.succeed('dist')
      assert.equal(runner.index, 1)
      const done = logger.entries.find((e) => e.meta.cliStep === 'done')
      assert.ok(done)
      assert.equal(done.meta.stepIndex, 1)
      assert.equal(done.meta.stepTotal, 5)
      assert.match(done.message, /ms|s/)
    })

    it('skip 也占一步且动态扩展 total 避免 n > N', () => {
      const logger = mockLogger()
      const plan = buildDeployPlan(baseConfig, {})
      const runner = createStepRunner(logger, plan.total)
      runner.start('构建')
      runner.succeed()
      runner.skip('构建', '已有 dist')
      assert.equal(runner.index, 2)
      assert.ok(runner.total >= runner.index)
      const skipEntry = logger.entries.find((e) => e.meta.cliStep === 'skip')
      assert.equal(skipEntry.meta.stepIndex, 2)
      assert.ok(skipEntry.meta.stepTotal >= 2)
    })

    it('failStep 写入 error 级别', () => {
      const logger = mockLogger()
      const runner = createStepRunner(logger, 3)
      runner.start('上传')
      runner.failStep(new Error('connection reset'))
      const failEntry = logger.entries.find((e) => e.meta.cliStep === 'fail')
      assert.ok(failEntry)
      assert.equal(failEntry.level, 'error')
    })
  })
})
