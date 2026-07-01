#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'

import { createRequire } from 'module'
import { createCommand } from 'commander'
import { cosmiconfig } from 'cosmiconfig'
import { createPromptModule } from 'inquirer'
import chalk from 'chalk'
import ora from 'ora'
import winston from 'winston'

import autodeploy, {
  addTransport,
  hasProjectManifest
} from '../dist/index.js'

const spinner = ora()
const basePath = import.meta.url.replace(/file:\/+(.*auto-deploy)\/.*/gi, '$1')

/**
 * @param {number} index
 * @param {number} total
 * @param {string} text
 */
function formatStepPrefix(index, total, text) {
  if (!index || !total) {
    return text
  }
  return `${chalk.gray(`[${index}/${total}]`)} ${text}`
}

/**
 * @param {string} msg
 * @param {Record<string, unknown>} data
 */
function formatConsoleMessage(msg, data) {
  if (data.cliContext) {
    return chalk.dim(`  ${msg}`)
  }

  const index = /** @type {number | undefined} */ (data.stepIndex)
  const total = /** @type {number | undefined} */ (data.stepTotal)

  if (
    data.cliStep === 'start' ||
    data.cliStep === 'done' ||
    data.cliStep === 'skip' ||
    data.cliStep === 'fail'
  ) {
    return formatStepPrefix(index, total, msg)
  }

  if (data.buildTail && index && total) {
    const lines = msg.split('\n')
    lines[0] = formatStepPrefix(index, total, lines[0])
    return lines.join('\n')
  }

  return msg
}

const logger = addTransport(
  new winston.transports.Console({
    format: {
      transform(data) {
        const hostPrefix = data.host ? `[${data.host}] ` : ''
        const msg = hostPrefix + formatConsoleMessage(data.message, data)

        if (data.level === 'info') {
          if (data.section || String(data.message || '').startsWith('── ')) {
            spinner.stop()
            spinner.info(msg)
            return false
          }
          if (data.cliContext) {
            spinner.stop()
            console.log(msg)
            return false
          }
          if (data.loading) {
            if (data.buildTail) {
              if (spinner.isSpinning) {
                spinner.text = msg
              } else {
                spinner.start(msg)
              }
            } else {
              spinner.start(msg)
            }
            return false
          } else if (data.success) {
            const lines = msg.split('\n')
            spinner.succeed(chalk.green(lines[0]))
            for (let i = 1; i < lines.length; i++) {
              console.log(chalk.dim(lines[i]))
            }
            return false
          }
          if (data.cliStep === 'skip') {
            spinner.stop()
            spinner.info(chalk.yellow(msg))
            return false
          }
          spinner.stop()
          spinner.info(msg)
        } else {
          if (!msg) return false

          spinner.stop()
          switch (data.level) {
            case 'warn': {
              const lines = msg.split('\n')
              spinner.warn(lines[0])
              for (let i = 1; i < lines.length; i++) {
                console.log(chalk.dim(lines[i]))
              }
              break
            }
            case 'error': {
              const lines = msg.split('\n')
              spinner.fail(chalk.red(lines[0]))
              for (let i = 1; i < lines.length; i++) {
                console.error(chalk.red(lines[i]))
              }
              break
            }
            case 'debug':
              spinner.info(chalk.dim(msg))
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

program
  .name('auto-deploy')
  .description('基于nodejs的WEB前端自动化部署cli工具')
  .version(pkg.version, '-v, -V, -version')
  .option('-d, --debug [debug]', '是否开启调试模式', false)

program
  .usage('[env] [options]')
  .option('-e, --env <env>', '指定目标环境')
  .option('-bak, --backup [backup]', '部署前是否备份当前服务器版本')
  .option('-rb, --rollback [rollback]', '回退到指定版本', 0)
  .option('--file [file]', '部署指定文件(zip压缩包)')
  .parse(process.argv)

const options = program.opts()

function initConfig() {
  fs.writeFileSync(
    path.resolve(process.cwd(), 'deploy.config.cjs'),
    fs.readFileSync(path.resolve(basePath, 'deploy.config.cjs'))
  )
  fs.writeFileSync(
    path.resolve(process.cwd(), 'deploy.config.d.ts'),
    fs.readFileSync(path.resolve(basePath, 'index.d.ts'))
  )
}

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
    const configPath = path.resolve(process.cwd(), 'deploy.config.cjs')
    logger.debug('配置文件路径：' + configPath)

    if (!fs.existsSync(configPath) && hasProjectManifest(process.cwd())) {
      throw new Error('__INIT_DEFAULT_CONFIG__')
    }

    const searchResult = await explorer.search(process.cwd())
    logger.debug('从执行路径加载配置文件：' + configPath)

    if (!searchResult?.config) {
      throw new Error('未找到有效的 deploy 配置')
    }

    originConfig = searchResult.config
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.debug('加载配置文件出错：' + error)

    if (message === '__INIT_DEFAULT_CONFIG__') {
      spinner.warn('不存在配置文件，将创建默认配置文件')
      initConfig()
      return
    }

    const configPath = path.resolve(process.cwd(), 'deploy.config.cjs')
    if (fs.existsSync(configPath)) {
      spinner.fail(`配置文件加载失败：${message}`)
      if (message.includes('package.json')) {
        console.error(
          chalk.yellow(
            '提示：请从 deploy.config.cjs 中删除 require("./package.json")，并改用 projectName 字段；项目名也会自动从清单文件或目录名解析。'
          )
        )
      }
      process.exit(1)
      return
    }

    spinner.warn('不存在配置文件，将创建默认配置文件')
    initConfig()
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
  if (!config?.env) {
    config.env = options.env
  }

  logger.debug(
    `目标环境为：${config.env} ${config.name}\r\n ${JSON.stringify(config)}`
  )
  config.prompt = prompt

  autodeploy(config, {
    ...options,
    backup: options.backup,
    rollback: options.rollback
  })
}

main()
