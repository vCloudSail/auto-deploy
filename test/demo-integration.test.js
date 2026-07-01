import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { cosmiconfig } from 'cosmiconfig'
import { resolveProjectMeta } from '../src/utils/project-meta.js'
import {
  buildDeployPlan,
  createStepRunner,
  resolveBuildCmd
} from '../src/utils/cli-run.js'
import { deployContextLines } from '../src/utils/cli-log.js'
import {
  checkDeployConfig,
  resolveDeployPath,
  shouldUseSudoForDeployFiles
} from '../src/utils/index.js'
import DockerHelper from '../src/modules/docker/index.js'
import {
  demoRoot,
  getDemoConfig,
  getDemoDevWithCompose,
  listDemoConfigs,
  loadDemoConfigMap
} from './helpers/demo-config.js'
import { createTempDir, removeTempDir } from './helpers/fs-fixture.js'

describe('demo 配置集成', () => {
  const originalCwd = process.cwd()

  afterEach(() => {
    process.chdir(originalCwd)
  })

  it('deploy.config.js 可被 cosmiconfig 加载', async () => {
    const explorer = cosmiconfig('deploy')
    const result = await explorer.search(demoRoot)
    assert.ok(result?.config)
    assert.ok(result.config.dev || result.config.prod1)
  })

  it('展开 dev / prod 两套环境', () => {
    const configs = listDemoConfigs()
    const envs = configs.map((item) => item.env)
    assert.ok(envs.includes('dev'))
    assert.ok(envs.includes('prod'))
    assert.equal(configs.length, Object.keys(loadDemoConfigMap()).length)
  })

  describe('dev 环境（Docker remote）', () => {
    /** @type {import('index').DeployConfig} */
    let config

    beforeEach(() => {
      process.chdir(demoRoot)
      config = getDemoConfig('dev')
      config.projectName = resolveProjectMeta(demoRoot, config).projectName
    })

    it('从 demo/package.json 解析项目名', () => {
      assert.equal(config.projectName, '@cloudsail_auto-deploy-demo')
    })

    it('build.cmd 为空时不生成构建步骤', () => {
      assert.equal(resolveBuildCmd(config), '')
      const plan = buildDeployPlan(config, {})
      assert.deepEqual(plan.local, ['zip'])
      assert.ok(plan.remote.includes('dockerBuild'))
      assert.ok(!plan.remote.includes('nginx'))
    })

    it('部署计划包含 Docker 远端构建与重启', () => {
      const plan = buildDeployPlan(config, { backup: true })
      assert.deepEqual(plan.local, ['zip'])
      assert.deepEqual(plan.remote, [
        'uploadZip',
        'backup',
        'extract',
        'dockerBuild',
        'dockerReload',
        'finish'
      ])
      assert.equal(plan.total, 7)
    })

    it('deployContextLines 展示 Docker remote 与 dist mount', () => {
      const lines = deployContextLines(config, {})
      assert.ok(lines.some((l) => l.includes('Docker remote')))
      assert.ok(lines.some((l) => l.includes('dist mount')))
      assert.ok(lines.some((l) => l.includes('192.168.14.211')))
    })

    it('DockerHelper 解析镜像与端口', () => {
      const helper = new DockerHelper(null, config)
      assert.equal(helper.imageRepo, 'my-web-dev')
      assert.equal(helper.buildMode, 'remote')
      assert.equal(helper.distMode, 'mount')
      assert.equal(helper.getHostPort(), 18080)
      assert.equal(helper.fullImage, 'my-web-dev:latest')
      assert.equal(helper.needsDistSubfolder(), true)
    })

    it('挂载 compose 时可读取 demo/docker-compose.yml', () => {
      const withCompose = getDemoDevWithCompose()
      const helper = new DockerHelper(null, withCompose)
      assert.equal(helper.useCompose, true)
      const localCompose = helper.resolveLocalComposePath()
      assert.ok(localCompose?.endsWith('docker-compose.yml'))
      assert.ok(fs.existsSync(localCompose))
      const content = fs.readFileSync(localCompose, 'utf8')
      assert.ok(content.includes('services:'))
      assert.ok(content.includes('web:'))
    })

    it('Dockerfile 使用 mount 模式不 COPY dist', () => {
      const helper = new DockerHelper(null, config)
      const dockerfile = helper.getDockerfileContent()
      assert.ok(dockerfile.includes('volume 挂载'))
      assert.ok(!dockerfile.includes('COPY ./dist'))
    })
  })

  describe('prod 环境（静态部署）', () => {
    /** @type {import('index').DeployConfig} */
    let config

    beforeEach(() => {
      config = getDemoConfig('prod')
      config.projectName = 'demo-static'
    })

    it('checkDeployConfig 通过（已配置 deployPath）', () => {
      assert.doesNotThrow(() => checkDeployConfig(config))
      assert.equal(resolveDeployPath(config), '/data/apps/web/testtt')
    })

    it('无 Docker 时计划含 nginx（demo prod 未配 nginx，此处用 dev nginx 字段演示静态链路）', () => {
      const staticWithNginx = {
        ...config,
        nginx: getDemoConfig('dev').nginx
      }
      const plan = buildDeployPlan(staticWithNginx, {})
      assert.ok(plan.remote.includes('nginx'))
      assert.ok(!plan.remote.includes('dockerBuild'))
    })

    it('prod 默认计划：仅 zip + 上传解压完成', () => {
      const plan = buildDeployPlan(config, {})
      assert.deepEqual(plan.local, ['zip'])
      assert.deepEqual(plan.remote, ['uploadZip', 'extract', 'finish'])
    })

    it('/data 路径且 cmdUseSudo 时使用 sudo', () => {
      const withSudo = {
        ...config,
        server: { ...config.server[0], cmdUseSudo: true }
      }
      assert.equal(shouldUseSudoForDeployFiles(withSudo), true)
    })

    it('deployContextLines 含代理信息字段存在时不报错', () => {
      const lines = deployContextLines(config, { backup: false })
      assert.ok(lines.some((l) => l.includes('121.37.2.208')))
      assert.ok(lines.some((l) => l.includes('/data/apps/web/testtt')))
    })
  })

  describe('步骤 runner 与 demo dev 计划联动', () => {
    it('skip 构建后 total 仍不小于当前步骤（demo build.cmd 为空场景）', () => {
      const config = getDemoConfig('dev')
      const plan = buildDeployPlan(config, {})
      const logger = { info() {}, error() {} }
      const runner = createStepRunner(logger, plan.total)
      runner.skip('构建', '未配置 build.cmd')
      runner.start('打包')
      assert.ok(runner.total >= runner.index)
    })
  })
})

describe('demo 目录 dist 检测', () => {
  const originalCwd = process.cwd()
  /** @type {string[]} */
  const tempDirs = []

  afterEach(() => {
    process.chdir(originalCwd)
    while (tempDirs.length) {
      removeTempDir(tempDirs.pop())
    }
  })

  it('在 demo 下创建 dist 后可被 distHasContent 识别', async () => {
    const { distHasContent } = await import('../src/utils/dist-build-prompt.js')
    const dir = createTempDir()
    tempDirs.push(dir)
    process.chdir(dir)
    fs.mkdirSync('dist')
    fs.writeFileSync(path.join('dist', 'index.html'), '<html></html>')
    assert.equal(distHasContent('dist'), true)
  })
})
