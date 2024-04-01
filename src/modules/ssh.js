import ssh2 from 'ssh2'
import fs from 'node:fs'

import logger from '../utils/logger.js'
import { PasswordCacher } from '../utils/cacher.js'
import path from 'node:path'
import _, { omit } from 'lodash'

const isAgent = new RegExp(/agent/).test(process.env.npm_lifecycle_event)

export const Command = {
  stat() {},
  copy(originPath, targetPath, options) {
    return `cp ${options} ${originPath} ${targetPath}`
  },
  move(originPath, targetPath, options) {}
}

/**
 * 封装ssh连接
 */
export default class SSHClient {
  /** @type {import('index').DeployConfig} */
  #deployConfig
  debug = false
  /**
   * 目标机
   * @type {ssh2.Client}
   */
  client
  /**
   * 跳板机
   * @type {ssh2.Client}
   */
  clientAgent
  /** @type {import('index').SSHClientConfig} */
  config
  /** @type {import('index').SSHClientConfig} */
  agentConfig
  /** @type {Boolean} */
  hasAgent = false
  /** @type {Boolean} */
  cmdUseSudo = false
  /** @type {ssh2.Channel} */
  sudoSuChannel
  get host() {
    return this.config.host
  }
  /**
   *
   * @param {import('index').SSHClientConfig&{agent:import('index').SSHClientConfig}} param
   * @param {import('index').DeployConfig} deployConfig
   */
  constructor(
    {
      host,
      port,
      username,
      password,
      privateKey,
      agent,
      debug,
      cmdUseSudo
    } = {},
    deployConfig
  ) {
    this.#deployConfig = deployConfig
    this.config = {
      host,
      port,
      username,
      password,
      privateKey
    }
    this.debug = debug

    // this.hasAgent = !!(agent || Config.agent)
    this.hasAgent = agent != null || isAgent
    this.cmdUseSudo = cmdUseSudo != null ? cmdUseSudo : this.hasAgent

    if (this.hasAgent) {
      this.clientAgent = new ssh2.Client() // 跳板机
      this.agentConfig = agent
    }
    // this.cacher = new JsonCacher({
    //   name: 'password',
    //   encrypt: true
    // })
    this.client = new ssh2.Client() // 目标机
  }
  /**
   *
   * @param {ssh2.Client} client
   * @param {import('ssh2').ConnectConfig} config
   * @returns
   */
  #connectAsync(client, config = {}) {
    // console.log(chalk.green('[SSHClient]: SSH连接开始', this.config))
    return new Promise(async (resolve, reject) => {
      if (client === this.clientAgent) {
        config = _.merge(this.agentConfig, config)
      } else if (client === this.client) {
        config = _.merge(this.config, config)
      } else {
        throw new Error('未知的client')
      }
      config = await this.#checkConfig(config)

      const callback = () => {
        client.off('error', onError)
        client.off('ready', onReady)
      }

      const onError = (err = 'SSH连接失败') => {
        reject(err)
        callback()
      }
      const onReady = () => {
        if (config.password) {
          PasswordCacher.set(
            `${config.host}@${config.username}`,
            config.password
          )
        }

        if (this.useSudoSu) {
          this.client.shell(false)
          // this.client.exec(command, (err, channel) => {
          //   if (err || !channel) {
          //     logger.error('无法使用提升权限(sudo su)，请检查服务器配置')
          //     reject(false)
          //   } else {
          //     this.sudoSuChannel = channel
          //     resolve(true)
          //   }
          //   callback()
          // })
          return
        }
        resolve(true)

        // logger.success('连接成功')
      }
      // if (this.debug) {
      //   config.debug = console.log
      // }
      // config.debug = function () {
      //   logger.debug(Array.from(arguments).join())
      // }
      client
        .once('ready', onReady)
        .once('error', onError)
        // .once('end', () => {
        //   // console.log(chalk.red('[SSHClient]: 目标SSH连接结束！'))
        // })
        // .once('close', () => {
        //   // console.log(chalk.red('[SSHClient]: 目标SSH连接关闭！'))
        // })
        .connect(config)
    })
  }

  /**
   *
   * @param {import('index').SSHClientConfig} config
   * @returns
   */
  async #checkConfig(config) {
    const prompt = this.#deployConfig.prompt

    if (!prompt) {
      throw new Error('[SSHClient] 未传入prompt方法，无法提供用户输入密码功能')
    }

    if (!config.username) {
      logger.warn('配置文件不存在用户名，等待手动输入')
      let { username } = await prompt?.([
        {
          type: 'input',
          message: `请输入${
            config === this.agentConfig ? '跳板机' : '服务器'
          }用户名`,
          validate: (input, answer) => {
            if (!input) {
              return '请输入用户名'
            }
            return true
          }
        }
      ])
      config.username = username
    }

    const hostKey = `${config.host}@${config.username}`

    if (config.privateKey) {
      if (
        typeof config.privateKey === 'string' &&
        fs.existsSync(config.privateKey)
      ) {
        config.privateKey = await fs.promises.readFile(config.privateKey, {
          encoding: 'utf-8'
        })
        logger.debug(config.privateKey)
      }
    } else {
      if (!config.password && PasswordCacher.has(hostKey)) {
        // logger.debug(
        //   `缓存的服务器[${hostKey}]密码为:`,
        //   PasswordCacher.get(hostKey)
        // )
        config.password = PasswordCacher.get(hostKey)
      }

      if (!config.password) {
        logger.warn('配置文件不存在密码，等待手动输入')
        let { password } = await prompt([
          {
            type: 'password',
            name: 'password',
            mask: '*',
            message: `请输入${
              config === this.agentConfig ? '跳板机' : '服务器'
            }密码（${config.host}:${config.port}@${config.username}）`,
            validate: (input, answer) => {
              if (!input) {
                return '请输入密码'
              }
              return true
            }
          }
        ])
        config.password = password
      }
    }
    return config
  }
  /** 连接服务器 */
  connect() {
    return new Promise(async (resolve, reject) => {
      if (this.hasAgent) {
        logger.info(
          `连接跳板机中 -> ${this.agentConfig?.host}:${this.agentConfig?.port}`,
          { loading: true }
        )
        await this.#connectAsync(this.clientAgent, this.agentConfig)
        logger.info(
          `连接到跳板机成功 -> ${this.agentConfig?.host}:${this.agentConfig?.port}`,
          { success: true }
        )

        this.clientAgent
          .forwardOut(
            '127.0.0.1',
            65533,
            this.config.host,
            this.config.port,
            async (err, stream) => {
              if (err) {
                this.clientAgent.end()
                reject(err)
              }

              try {
                logger.info(
                  `连接服务器中 -> ${this.config?.host}:${this.config?.port}`,
                  { loading: true }
                )
                // 连接目标机
                await this.#connectAsync(this.client, {
                  sock: stream
                })
                logger.info(
                  `连接到服务器成功 -> ${this.config?.host}:${this.config?.port}`,
                  { success: true }
                )

                resolve(true)
              } catch (error) {
                logger.error(
                  '连接服务器失败，请检查用户名、密码和代理配置： ' + error
                )
                reject(error)
              }
            }
          )
          .once('error', (err) => {
            logger.error(
              '连接跳板机失败，请检查用户名、密码和代理配置： ' + error
            )
            reject(err)
          })
        return
      }

      try {
        logger.info(
          `连接服务器中 -> ${this.config?.host}:${this.config?.port}`,
          { loading: true }
        )
        await this.#connectAsync(this.client, this.config)
        logger.info(
          `连接到服务器成功 -> ${this.config?.host}:${this.config?.port}`,
          { success: true }
        )
        resolve(true)
      } catch (error) {
        logger.error('连接服务器失败，请检查用户名、密码和代理配置： ' + error)
        reject(error)
      }
    })
  }

  /**
   * 上传
   * @param {string} localPath
   * @param {string} remotePath
   * @returns {Promise<boolean>}
   */
  upload(localPath, remotePath) {
    return new Promise((resolve, reject) => {
      return this.client.sftp((err, sftp) => {
        if (err) {
          reject(err)
        } else {
          sftp.fastPut(localPath, remotePath, (err, result) => {
            if (err) {
              reject(err)
            }
            resolve(true)
          })
        }
      })
    })
  }

  /**
   * 下载
   * @param {string} remotePath
   * @param {string} localPath
   * @returns {Promise<boolean>}
   */
  download(remotePath, localPath) {
    return new Promise((resolve, reject) => {
      return this.client.sftp((err, sftp) => {
        if (err) {
          reject(err)
        } else {
          sftp.fastGet(remotePath, localPath, (err, result) => {
            if (err) {
              reject(err)
            }
            resolve(true)
          })
        }
      })
    })
  }
  // sudoExec(command, receiveDataCallback) {
  //   return this.exec(`sudo sh -c '${command}'`, receiveDataCallback)
  // }
  /**
   * 执行命令
   * @param {string} command
   * @param {(data:any) => void} receiveDataCallback
   * @returns {Promise<boolean|string>}
   */
  exec(command, receiveDataCallback) {
    // function sudo(channel) {
    //   return new Promise((resolve, reject) => {
    //     channel.write('sudo su', (err) => {
    //       if (err) {
    //         reject(err)
    //         console.log('sudo失败')
    //         return
    //       }
    //       resolve()
    //       console.log('sudo成功')
    //     })
    //   })
    // }
    if (!command) {
      return Promise.reject(new Error('command is required'))
    }

    if (this.cmdUseSudo) {
      command = `sudo sh -c "${command}"`
    }

    return new Promise((resolve, reject) => {
      return this.client.exec(command, async (err, channel) => {
        // await sudo(channel)

        let output = ''
        if (err || !channel) {
          reject(err)
        } else {
          const cb = (code, signal) => {
            resolve(output || true)
          }

          channel
            .once('close', cb)
            // .once('end', cb)
            // .once('exit', cb)
            // .once('eof', cb)
            .on('data', function (data) {
              logger.debug('client received data: ' + data)
              receiveDataCallback?.(data)
              if (data) {
                output += data.toString()
                // output.push(data.toString())
              }
            })
            .stderr.once('data', function (data) {
              reject(data.toString())
            })
        }
      })
    })
  }

  /**
   * 断开连接
   */
  disconnect() {
    this.client.end()
    if (this.clientAgent) {
      this.clientAgent.end()
    }
  }
}
