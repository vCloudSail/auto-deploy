#!/usr/bin/env node

import { createRequire } from 'module'
import { createCommand } from 'commander'
import { cosmiconfig } from 'cosmiconfig'
import { createPromptModule } from 'inquirer'
import autodeploy from '../src/main.js'
// import autodeploy from '../dist/index.umd.cjs'

const require = createRequire(import.meta.url)

const pkg = require('../package.json')

const prompt = createPromptModule()
const program = createCommand()

// const autodeploy = '../dist/index.umd.cjs')

program
  .name('auto-deploy')
  .description('一个WEB前端自动化部署cli工具')
  .version(pkg.version, '-v, -V, -version') // 从package.json中读取当前工具的最新版本号
  .option('-d, --debug', '是否开启调试模式', false)

program
  .usage('[env] [options]') // 使用方式介绍
  .option('-e, --env <env>', '指定目标环境')
  .option('-bak, --backup', '部署前是否备份当前服务器版本')
  .option('-rb, --rollback', '回退到指定版本', false)
  .parse(process.argv) // 格式化参数 返回参数的配置

const options = program.opts()

async function run() {
  const explorer = cosmiconfig('deploy')
  const explorer1 = cosmiconfig('config')

  let originConfig

  options.debug && console.log('当前执行目录：', process.cwd())

  try {
    const searchResult = await explorer.search(process.cwd())
    const sad = await explorer1.search(process.cwd() + '/.git')
    console.log('git配置', sad)
    originConfig = searchResult.config
  } catch (error) {
    console.error('无法获取到配置文件，请检查配置文件是否存在')
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
  if (options.backup == null) {
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

run()
