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
  .option('-bak, --backup', '部署前是否备份当前服务器版本', false)
  .option('-rb, --rollback <rollback>', '回退到指定版本', false)
  .parse(process.argv) // 格式化参数 返回参数的配置

const options = program.opts()

async function run() {
  const explorer = cosmiconfig('deploy')

  let originConfig

  try {
    const searchResult = await explorer.search(process.cwd())

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

  if (!options.env) {
    const { env } = await prompt([
      {
        type: 'list',
        name: 'env',
        message: '请选择目标环境',
        choices: configs?.map((item) => {
          return {
            value: item.env,
            name: item.name
          }
        })
      }
    ])
    options.env = env
  }

  let config = configs.find((item) => item.env === options.env)
  if (!config.env) {
    config.env = options.env
  }

  console.log('目标环境为：', config.env, config.name, config)

  autodeploy(config, { backup: options.backup, rollback: options.rollback })
}

run()
