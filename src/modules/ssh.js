import ssh2 from 'ssh2'
import fs from 'node:fs'
import net from 'node:net'

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
      proxy,
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
      privateKey,
      proxy
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

      if (config.proxy && !config.sock) {
        logger.info(
          `[SSHClient] 使用代理连接中 -> ${config.proxy.type || 'http'}://${
            config.proxy.host
          }:${config.proxy.port}`,
          { loading: true }
        )
        try {
          const targetPort = Number(config.port) || 22
          const sock = await this.#createProxySocket(
            config.host,
            targetPort,
            config.proxy
          )
          config = {
            ...config,
            sock,
            // 通过 sock 连接时，ssh2 不再需要 host/port
            host: undefined,
            port: undefined
          }
          logger.info(
            `[SSHClient] 通过代理建立到 ${client === this.clientAgent ? '跳板机' : '服务器'} 的连接成功`,
            { success: true }
          )
        } catch (err) {
          logger.error(
            `[SSHClient] 通过代理连接失败，请检查代理配置： ${err + ''}`
          )
          return reject(err)
        }
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
   * 通过代理创建到目标主机的 Socket
   * @param {string} host
   * @param {number} port
   * @param {{ host:string; port:number; username?:string; password?:string; type?:'http'|'socks4'|'socks5'|'telnet' }} proxy
   * @returns {Promise<import('net').Socket>}
   */
  #createProxySocket(host, port, proxy) {
    return new Promise((resolve, reject) => {
      const proxyType = proxy.type || 'http'

      if (proxyType === 'http') {
        const socket = net.connect(proxy.port, proxy.host)

        const onError = (err) => {
          socket.destroy()
          reject(err)
        }

        socket.once('error', onError)

        socket.once('connect', () => {
          let authHeader = ''
          if (proxy.username && proxy.password) {
            const token = Buffer.from(
              `${proxy.username}:${proxy.password}`
            ).toString('base64')
            authHeader = `Proxy-Authorization: Basic ${token}\r\n`
          }

          const request =
            `CONNECT ${host}:${port} HTTP/1.1\r\n` +
            `Host: ${host}:${port}\r\n` +
            authHeader +
            `Connection: keep-alive\r\n` +
            `\r\n`

          socket.write(request)
        })

        let responseBuffer = ''

        const onData = (chunk) => {
          responseBuffer += chunk.toString()
          if (responseBuffer.includes('\r\n\r\n')) {
            const firstLine = responseBuffer.split('\r\n')[0]
            const match = firstLine.match(/HTTP\/1\.[01]\s+(\d{3})/)
            const statusCode = match ? Number(match[1]) : 0

            socket.removeListener('error', onError)
            socket.removeListener('data', onData)

            if (statusCode !== 200) {
              socket.destroy()
              reject(
                new Error(
                  `[SSHClient] 代理连接失败: ${firstLine || '未知错误'}`
                )
              )
            } else {
              resolve(socket)
            }
          }
        }

        socket.on('data', onData)
        return
      }

      if (proxyType === 'socks5') {
        const socket = net.connect(proxy.port, proxy.host)

        const onError = (err) => {
          socket.destroy()
          reject(err)
        }

        socket.once('error', onError)

        socket.once('connect', () => {
          /** RFC1928 握手：VER=0x05, NMETHODS, METHODS... */
          const methods = []
          // 0x00: 不需要认证, 0x02: 用户名密码认证
          methods.push(0x00)
          if (proxy.username && proxy.password) {
            methods.push(0x02)
          }

          const buf = Buffer.alloc(2 + methods.length)
          buf[0] = 0x05
          buf[1] = methods.length
          for (let i = 0; i < methods.length; i++) {
            buf[2 + i] = methods[i]
          }
          socket.write(buf)
        })

        let stage = 0
        let chunks = []

        const onData = (chunk) => {
          chunks.push(chunk)
          const data = Buffer.concat(chunks)

          // stage 0: 认证方式协商
          if (stage === 0) {
            if (data.length < 2) return
            const ver = data[0]
            const method = data[1]
            if (ver !== 0x05) {
              socket.destroy()
              reject(new Error('[SSHClient] SOCKS5 版本错误'))
              return
            }
            chunks = []

            if (method === 0x00) {
              // 不需要认证，直接发送 CONNECT 请求
              stage = 2
              sendConnect()
            } else if (method === 0x02) {
              // 用户名密码认证
              if (!proxy.username || !proxy.password) {
                socket.destroy()
                reject(
                  new Error(
                    '[SSHClient] SOCKS5 代理要求用户名密码认证，但未配置用户名或密码'
                  )
                )
                return
              }
              stage = 1
              sendAuth()
            } else {
              socket.destroy()
              reject(
                new Error(
                  `[SSHClient] SOCKS5 不支持的认证方式: 0x${method.toString(16)}`
                )
              )
            }
            return
          }

          // stage 1: 用户名密码认证结果
          if (stage === 1) {
            if (data.length < 2) return
            const ver = data[0]
            const status = data[1]
            if (ver !== 0x01 || status !== 0x00) {
              socket.destroy()
              reject(new Error('[SSHClient] SOCKS5 用户名密码认证失败'))
              return
            }
            chunks = []
            stage = 2
            sendConnect()
            return
          }

          // stage 2: CONNECT 响应
          if (stage === 2) {
            if (data.length < 5) return
            const ver = data[0]
            const rep = data[1]
            const atyp = data[3]
            if (ver !== 0x05) {
              socket.destroy()
              reject(new Error('[SSHClient] SOCKS5 响应版本错误'))
              return
            }
            if (rep !== 0x00) {
              socket.destroy()
              reject(
                new Error(
                  `[SSHClient] SOCKS5 连接目标失败，错误码: 0x${rep.toString(16)}`
                )
              )
              return
            }

            let addrLen = 0
            if (atyp === 0x01) {
              // IPv4
              addrLen = 4
            } else if (atyp === 0x03) {
              // 域名
              addrLen = data[4]
            } else if (atyp === 0x04) {
              // IPv6
              addrLen = 16
            } else {
              socket.destroy()
              reject(
                new Error(
                  `[SSHClient] SOCKS5 不支持的 ATYP: 0x${atyp.toString(16)}`
                )
              )
              return
            }

            const replyLen = 4 + (atyp === 0x03 ? 1 : 0) + addrLen + 2
            if (data.length < replyLen) return

            socket.removeListener('error', onError)
            socket.removeListener('data', onData)
            resolve(socket)
          }
        }

        const sendAuth = () => {
          const u = Buffer.from(proxy.username || '')
          const p = Buffer.from(proxy.password || '')
          const buf = Buffer.alloc(3 + u.length + p.length)
          buf[0] = 0x01 // VER
          buf[1] = u.length
          u.copy(buf, 2)
          buf[2 + u.length] = p.length
          p.copy(buf, 3 + u.length)
          socket.write(buf)
        }

        const sendConnect = () => {
          const hostBuf = Buffer.from(host)
          const buf = Buffer.alloc(4 + 1 + hostBuf.length + 2)
          buf[0] = 0x05 // VER
          buf[1] = 0x01 // CMD = CONNECT
          buf[2] = 0x00 // RSV
          buf[3] = 0x03 // ATYP = 域名
          buf[4] = hostBuf.length
          hostBuf.copy(buf, 5)
          buf.writeUInt16BE(port, 5 + hostBuf.length)
          socket.write(buf)
        }

        socket.on('data', onData)
        return
      }

      if (proxyType === 'socks4') {
        const socket = net.connect(proxy.port, proxy.host)

        const onError = (err) => {
          socket.destroy()
          reject(err)
        }

        socket.once('error', onError)

        socket.once('connect', () => {
          // SOCKS4 协议：VER(1) + CMD(1) + PORT(2) + IP(4) + USERID(变长，以\0结尾)
          // CMD: 0x01 = CONNECT
          // 将域名解析为 IP（SOCKS4 不支持域名，需要先解析）
          // 注意：这里简化处理，假设 host 是 IP 地址
          // 如果是域名，需要先进行 DNS 解析，或者使用 SOCKS4a 扩展
          const ipParts = host.split('.')
          if (ipParts.length !== 4) {
            socket.destroy()
            reject(
              new Error(
                '[SSHClient] SOCKS4 代理不支持域名，请使用 IP 地址或使用 SOCKS4a'
              )
            )
            return
          }

          const ip = Buffer.alloc(4)
          for (let i = 0; i < 4; i++) {
            ip[i] = parseInt(ipParts[i], 10)
          }

          const userId = proxy.username || ''
          const userIdBuf = Buffer.from(userId, 'utf8')
          const buf = Buffer.alloc(8 + userIdBuf.length + 1)
          buf[0] = 0x04 // VER = SOCKS4
          buf[1] = 0x01 // CMD = CONNECT
          buf.writeUInt16BE(port, 2) // PORT
          ip.copy(buf, 4) // IP
          userIdBuf.copy(buf, 8) // USERID
          buf[8 + userIdBuf.length] = 0x00 // NULL terminator
          socket.write(buf)
        })

        const onData = (chunk) => {
          if (chunk.length < 8) return

          const nullByte = chunk[0]
          const status = chunk[1]

          socket.removeListener('error', onError)
          socket.removeListener('data', onData)

          if (nullByte !== 0x00) {
            socket.destroy()
            reject(new Error('[SSHClient] SOCKS4 响应格式错误'))
            return
          }

          if (status !== 0x5a) {
            // 0x5a = 请求被授予
            let errorMsg = '[SSHClient] SOCKS4 连接失败'
            switch (status) {
              case 0x5b:
                errorMsg = '[SSHClient] SOCKS4 连接被拒绝'
                break
              case 0x5c:
                errorMsg = '[SSHClient] SOCKS4 连接失败：无法到达目标主机'
                break
              case 0x5d:
                errorMsg = '[SSHClient] SOCKS4 连接失败：用户ID不匹配'
                break
            }
            socket.destroy()
            reject(new Error(errorMsg))
            return
          }

          resolve(socket)
        }

        socket.on('data', onData)
        return
      }

      if (proxyType === 'telnet') {
        // telnet 代理：通过 telnet 协议连接到代理服务器
        // 注意：telnet 不是标准代理协议，这里实现为连接到代理服务器后，
        // 通过 telnet 协议发送目标主机信息，然后代理服务器转发连接
        const socket = net.connect(proxy.port, proxy.host)

        const onError = (err) => {
          socket.destroy()
          reject(err)
        }

        socket.once('error', onError)

        socket.once('connect', () => {
          // 通过 telnet 协议发送目标主机和端口信息
          // 格式：CONNECT host:port\r\n
          const connectCmd = `CONNECT ${host}:${port}\r\n`
          socket.write(connectCmd)

          // 等待代理服务器响应（简单的实现，假设连接成功）
          // 实际应用中，可能需要解析 telnet 响应
          const onData = (chunk) => {
            const response = chunk.toString()
            // 简单的成功判断：如果收到响应，认为连接已建立
            // 实际应用中可能需要更严格的协议解析
            if (response.includes('200') || response.includes('OK')) {
              socket.removeListener('error', onError)
              socket.removeListener('data', onData)
              resolve(socket)
            } else if (
              response.includes('ERROR') ||
              response.includes('FAIL') ||
              response.includes('400') ||
              response.includes('500')
            ) {
              socket.destroy()
              reject(
                new Error(
                  `[SSHClient] Telnet 代理连接失败: ${response.trim()}`
                )
              )
            }
            // 如果没有明确的成功/失败标识，等待一段时间后认为连接成功
            // 这是一个简化的实现
          }

          // 设置超时，如果一定时间内没有响应，认为连接成功（简化处理）
          setTimeout(() => {
            if (socket.readable && socket.writable) {
              socket.removeListener('error', onError)
              socket.removeListener('data', onData)
              resolve(socket)
            }
          }, 1000)

          socket.on('data', onData)
        })

        return
      }

      reject(new Error(`[SSHClient] 暂不支持的代理类型: ${proxyType}`))
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
