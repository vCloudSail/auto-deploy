#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'

import { createRequire } from 'module'
import { createCommand } from 'commander'
import { cosmiconfig } from 'cosmiconfig'
import { createPromptModule } from 'inquirer'
import ora from 'ora'
import winston from 'winston'

// import autodeploy, { setLogger } from '../src/main.js'

import autodeploy, { addTransport } from '../dist/index.js'

const spinner = ora()
const basePath = import.meta.url.replace(/file:\/+(.*auto-deploy)\/.*/gi, '$1')

const logger = addTransport(
  new winston.transports.Console({
    format: {
      transform(data) {
        const msg = (data.host ? `[${data.host}] ` : '') + data.message

        if (data.level === 'info') {
          if (data.loading) {
            spinner.start(msg)
            return false
          } else if (data.success) {
            spinner.succeed(msg)
            return false
          }
          spinner.stop()
          spinner.info(msg)
        } else {
          if (!msg) return false

          spinner.stop()
          switch (data.level) {
            case 'warn':
              spinner.warn(msg)
              break
            case 'error':
              spinner.fail(msg)
              break
            case 'debug':
              spinner.info(msg)
              break
          }
        }
        return false
      }
    }
  })
)

const require = createRequire(import.meta.url)

const pkg = require('../package.json')

const prompt = createPromptModule()
const program = createCommand()

// const autodeploy = '../dist/index.umd.cjs')

program
  .name('auto-deploy')
  .description('基于nodejs的WEB前端自动化部署cli工具')
  .version(pkg.version, '-v, -V, -version') // 从package.json中读取当前工具的最新版本号
  .option('-d, --debug [debug]', '是否开启调试模式', false)

program
  .usage('[env] [options]') // 使用方式介绍
  .option('-e, --env <env>', '指定目标环境')
  .option('-bak, --backup [backup]', '部署前是否备份当前服务器版本')
  .option('-rb, --rollback [rollback]', '回退到指定版本', 0)
  .parse(process.argv) // 格式化参数 返回参数的配置

const options = program.opts()

async function main() {
  process.$debug = !!options.debug

  const explorer = cosmiconfig('deploy')

  let originConfig
  if (options.debug) {
    logger.level = 'debug'
  }
  logger.debug('当前执行目录：' + process.cwd())
  logger.debug('当前文件目录：' + import.meta.url)

  try {
    const searchResult = await explorer.search(process.cwd())

    originConfig = searchResult.config
  } catch (error) {
    spinner.warn('不存在配置文件，将创建默认配置文件')

    fs.writeFileSync(
      path.resolve(process.cwd(), 'deploy.config.js'),
      fs.readFileSync(path.resolve(basePath, 'deploy.config.js'))
    )
    return
  } finally {
    fs.writeFileSync(
      path.resolve(process.cwd(), 'deploy.config.d.ts'),
      fs.readFileSync(path.resolve(basePath, 'index.d.ts'))
    )
  }

  let configs = []
  if (Array.isArray(originConfig)) {
    configs = originConfig
  } else if (originConfig instanceof Object) {
    Object.keys(originConfig).forEach((key) => {
      let config = originConfig[key]
      configs.push({
        ...config,
        env: config.env || key
      })
    })
  }

  if (!configs || configs.length === 0) {
    console.error('配置文件有误，请检查')
    return process.exit(0)
  }

  if (!options.env) {
    const { env } = await prompt([
      {
        type: 'list',
        name: 'env',
        message: '请选择目标环境',
        choices: configs?.map((item) => {
          return {
            value: item.env,
            name: `${item.name}`
          }
        })
      }
    ])
    options.env = env
  }

  if (!options.rollback && options.backup == null) {
    const { backup } = await prompt([
      {
        type: 'list',
        name: 'backup',
        message: '是否备份当前版本?',
        default: false,
        choices: [
          {
            name: '是',
            value: true
          },
          {
            name: '否',
            value: false
          }
        ]
      }
    ])
    options.backup = backup
  }

  let config = configs.find((item) => item.env === options.env)
  if (!config.env) {
    config.env = options.env
  }

  logger.debug(
    `目标环境为：${config.env} ${config.name}\r\n ${JSON.stringify(config)}`
  )
  config.prompt = prompt

  // if (options.rollback === true) {
  //   return
  // }
  autodeploy(config, { backup: options.backup, rollback: options.rollback })
}

main()
