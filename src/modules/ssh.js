import logger from '../utils/logger.js'
import inquirer from 'inquirer'
import ora from 'ora'
import ssh2 from 'ssh2'

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
  /**
   *
   * @param {import('index').SSHClientConfig&{agent:import('index').SSHClientConfig}} param
   */
  constructor({ host, port, username, password, privateKey, agent } = {}) {
    this.config = {
      host,
      port,
      username,
      password,
      privateKey
    }

    // this.hasAgent = !!(agent || Config.agent)
    this.hasAgent = agent != null || isAgent

    if (this.hasAgent) {
      this.clientAgent = new ssh2.Client() // 跳板机
      this.agentConfig = agent
    }

    this.client = new ssh2.Client() // 目标机
  }
  /**
   *
   * @param {ssh2.Client} client
   * @param {import('ssh2').ConnectConfig} config
   * @returns
   */
  #connectAsync(client, config) {
    // console.log(chalk.green('[SSHClient]: SSH连接开始', this.config))
    return new Promise(async (resolve, reject) => {
      if (client === this.clientAgent) {
        await this.checkConfig(this.agentConfig)
      } else {
        await this.checkConfig(this.config)
      }

      const callback = () => {
        client.off('error', onError)
        client.off('ready', onReady)
      }

      const onError = (err = 'SSH连接失败') => {
        reject(err)
        callback()
      }
      const onReady = () => {
        resolve(true)
        callback()
        // logger.success('连接成功')
      }

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
  async checkConfig(config) {
    logger.loading(false)

    if (!config.username) {
      let { username } = await inquirer.prompt([
        {
          type: 'input',
          name: 'username',
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

    if (!config.password) {
      let { password } = await inquirer.prompt([
        {
          type: 'password',
          name: 'password',
          mask: '*',
          message: `请输入${
            config === this.agentConfig ? '跳板机' : '服务器'
          }密码`,
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
  /** 连接服务器 */
  connect() {
    return new Promise(async (resolve, reject) => {
      if (this.hasAgent) {
        await this.#connectAsync(this.clientAgent, this.agentConfig)

        return this.clientAgent
          .forwardOut(
            '127.0.0.1',
            12345,
            this.config.host,
            this.config.port,
            async (err, stream) => {
              if (err) {
                this.clientAgent.end()
                reject(err)
              }
              try {
                // 连接目标机
                await this.#connectAsync(this.client, {
                  sock: stream,
                  username: this.config.username,
                  password: this.config.password
                })

                resolve(true)
              } catch (error) {
                reject(error)
              }
            }
          )
          .once('error', (err) => {
            reject(err)
          })
      }

      try {
        await this.#connectAsync(this.client, this.config)
        resolve(true)
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * 上传文件
   * @param {string} localPath
   * @param {string} remotePath
   * @returns {Promise<boolean>}
   */
  uploadFile(localPath, remotePath) {
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
   * 执行命令
   * @param {string} command
   * @returns {Promise<boolean>}
   */
  exec(command) {
    return new Promise((resolve, reject) => {
      return this.client.exec(command, (err, stream) => {
        if (err || !stream) {
          reject(err)
        } else {
          stream
            .on('close', (code, signal) => {
              resolve(true)
            })
            .on('data', function (data) {
              // console.log(data.toString())
            })
            .stderr.on('data', function (data) {
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
