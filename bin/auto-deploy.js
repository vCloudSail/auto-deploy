#!/usr/bin/env node

import { createRequire } from 'module'
import { createCommand } from 'commander'
import { cosmiconfig } from 'cosmiconfig'
import { createPromptModule } from 'inquirer'
import fs from 'node:fs'
import path from 'node:path'

// import autodeploy, { setLogger } from '../src/main.js'
import ora from 'ora'

import autodeploy , { setLogger }from '../dist/index.js'

const spinner = ora()
const basePath = import.meta.url.replace(/file:\/+(.*auto-deploy)\/.*/gi, '$1')

setLogger({
  loading(message) {
    if (message === '' || message === false) {
      return spinner.stop()
    }
    return spinner.start(message)
  },
  success(...msg) {
    return spinner.succeed(msg?.join('  '))
  },
  error(...msg) {
    return spinner.fail(msg?.join('  '))
  },
  warn(...msg) {
    return spinner.warn(msg?.join('  '))
  },
  info(...msg) {
    return spinner.info(msg?.join('  '))
  },
  debug(...msg) {
    return spinner.info(msg?.join('  '))
  }
})

const require = createRequire(import.meta.url)

const pkg = require('../package.json')

const prompt = createPromptModule()
const program = createCommand()

// const autodeploy = '../dist/index.umd.cjs')

program
  .name('auto-deploy')
  .description('基于nodejs的WEB前端自动化部署cli工具')
  .version(pkg.version, '-v, -V, -version') // 从package.json中读取当前工具的最新版本号
  .option('-d, --debug', '是否开启调试模式', false)

program
  .usage('[env] [options]') // 使用方式介绍
  .option('-e, --env <env>', '指定目标环境')
  .option('-bak, --backup', '部署前是否备份当前服务器版本')
  .option('-rb, --rollback [rollback]', '回退到指定版本', 0)

  .parse(process.argv) // 格式化参数 返回参数的配置

const options = program.opts()

async function main() {
  const explorer = cosmiconfig('deploy')

  let originConfig

  options.debug && console.log('当前执行目录：', process.cwd())

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
            name: `${item.name} - ${item.server?.host}:${item.server?.port}`
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

  options.debug && console.log('目标环境为：', config.env, config.name, config)

  // if (options.rollback === true) {
  //   return
  // }

  autodeploy(
    config,
    { backup: options.backup, rollback: options.rollback },
    {
      chooseRollbackItem: async (list) => {
        const { version } = await prompt([
          {
            type: 'list',
            name: 'version',
            message: '请选择回退的目标版本',
            choices: list?.map((item) => {
              return {
                value: item,
                name: item.replace('.tar.gz', '')
              }
            })
          }
        ])
        return version
      }
    }
  )
}

main()
