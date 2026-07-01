import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  shortLocalPath,
  shortRemotePath,
  skip,
  progress,
  done,
  fail,
  formatDuration,
  stepLabel,
  stepDone,
  deployContextLines,
  deploySummary,
  uploadDone
} from '../src/utils/cli-log.js'

describe('cli-log', () => {
  describe('路径缩写', () => {
    it('shortLocalPath 只保留文件名', () => {
      assert.equal(
        shortLocalPath('E:\\proj\\release\\app.zip'),
        'app.zip'
      )
    })

    it('shortRemotePath 过长时截断', () => {
      const long = '/home/user/very/deep/path/to/deploy/auto-deploy.zip'
      const out = shortRemotePath(long, 30)
      assert.ok(out.length <= 30)
      assert.ok(out.startsWith('…'))
    })
  })

  describe('步骤文案', () => {
    it('progress 追加省略号', () => {
      assert.equal(progress('构建'), '构建…')
      assert.equal(progress('构建…'), '构建…')
    })

    it('skip 带原因', () => {
      assert.equal(skip('构建', 'dist 已存在'), '跳过构建 · dist 已存在')
    })

    it('done 拼接详情', () => {
      assert.equal(done('上传完成', '1.2 MB', 'app.zip'), '上传完成 · 1.2 MB · app.zip')
    })

    it('stepLabel 格式', () => {
      assert.equal(stepLabel(2, 5, '解压'), '[2/5] 解压')
    })

    it('formatDuration', () => {
      assert.equal(formatDuration(500), '500ms')
      assert.equal(formatDuration(1500), '1.5s')
    })

    it('stepDone 含耗时', () => {
      assert.match(stepDone('构建', 1200, 'dist'), /1\.2s/)
    })
  })

  describe('fail', () => {
    it('单行 Error 消息', () => {
      assert.equal(fail('构建', new Error('command failed')), '构建 · command failed')
    })

    it('多行消息取首行摘要', () => {
      const err = new Error('line1\nline2\nline3')
      const out = fail('构建', err)
      assert.ok(out.startsWith('构建 · line1'))
      assert.ok(out.includes('  line2'))
    })

    it('outputTail 优先展示构建尾部日志', () => {
      const err = Object.assign(new Error('构建命令退出码 1'), {
        outputTail: ['error TS2304', 'Cannot find name']
      })
      const out = fail('构建', err)
      assert.ok(out.includes('error TS2304'))
      assert.ok(out.includes('Cannot find name'))
    })

    it('err 为空时只返回 action', () => {
      assert.equal(fail('上传'), '上传')
    })
  })

  describe('deployContextLines', () => {
    it('汇总项目、环境、服务器与 Docker 信息', () => {
      const lines = deployContextLines(
        {
          projectName: 'demo',
          env: 'prod',
          name: '生产',
          server: { host: '10.0.0.1' },
          deploy: {
            deployPath: '/var/www/demo',
            docker: {
              image: { buildMode: 'local', distMode: 'embed' },
              compose: { service: 'front' }
            }
          }
        },
        { backup: true }
      )
      assert.ok(lines.some((l) => l.includes('项目 demo')))
      assert.ok(lines.some((l) => l.includes('备份 是')))
      assert.ok(lines.some((l) => l.includes('Docker local')))
      assert.ok(lines.some((l) => l.includes('服务 front')))
    })
  })

  describe('deploySummary', () => {
    it('成功统计与产物', () => {
      const out = deploySummary(2, 2, '生产', 3.2, '镜像 app:v1')
      assert.match(out, /2\/2 台成功/)
      assert.match(out, /3\.2s/)
      assert.ok(out.includes('镜像 app:v1'))
    })
  })

  describe('uploadDone', () => {
    it('包含大小与路径', () => {
      const out = uploadDone('release/app.zip', '/remote/deploy/app.zip', 2048)
      assert.ok(out.includes('app.zip'))
      assert.ok(out.includes('KB'))
    })
  })
})
