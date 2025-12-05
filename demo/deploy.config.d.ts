// #region ssh
export interface SSHClientProxyConfig {
  host: string
  port: number
  username?: string
  password?: string
  type?: 'http' | 'socks4' | 'socks5' | 'telnet'
}
export interface SSHClientConfig {
  /** 主机地址 */
  host: string
  /** 主机SSH端口 */
  port: string
  /** 用户名 */
  username: string
  /** 密码 */
  password?: string
  /** 私钥内容或路径 */
  privateKey?: string
  /** 是否在执行命令前加上sudo前缀，使用了agent时默认为true（针对跳板机或使用非root用户连接） */
  cmdUseSudo?: boolean
  /**
   * 代理配置（例如 HTTP 代理）
   *
   * 如果配置了 proxy，则会优先通过代理建立到目标主机的连接
   */
  proxy?: SSHClientProxyConfig
}

export interface SSHClient {
  /**
   * 连接
   */
  connect(): Promise<boolean>
  /**
   * 断开连接
   */
  disconnect(): void
  /**
   * 上传文件
   */
  upload(localPath: string, remotePath: string): Promise<boolean>

  /**
   * 下载文件
   */
  download(remotePath: string, localPath: localPath): Promise<boolean>

  /**
   * 执行命令
   */
  exec(
    command: string,
    receiveDataCallback: (data: any) => void
  ): Promise<boolean | string>
}
// #endregion

// #region logger
export interface Logger {
  loading(message): void
  success(message): void
  warn(message): void
  error(message): void
  info(message): void
  debug(message): void
}

// #endregion

// #region 回滚
export interface RollbackOptions {
  backupPath: string
  backupList: any
  deployPath: string
  version: string | number
}
// #endregion

// #region hooks
function DeployHookFn<T>(
  options: { config: DeployConfig; client: SSHClient } & T
): Promise<boolean>

export interface DeployHooks {
  /** 部署之前 */
  deployBefore: { config: DeployConfig }
  /** 构建之前 */
  buildBefore: { config: DeployConfig }
  /** 构建之后 */
  buildAfter: { config: DeployConfig }
  /** 压缩之前 */
  compressBefore: { config: DeployConfig }
  /** 压缩之后 */
  compressAfter: { config: DeployConfig }
  /** 上传之前，如果是多个服务器则会多次触发 */
  uploadBefore: typeof DeployHookFn
  /** 上传之后，如果是多个服务器则会多次触发 */
  uploadAfter: typeof DeployHookFn
  /** 备份之前，如果是多个服务器则会多次触发 */
  backupBefore: typeof DeployHookFn
  /** 备份之后，如果是多个服务器则会多次触发 */
  backupAfter: typeof DeployHookFn
  /** 部署之后 */
  deployAfter: typeof DeployHookFn
}

// #endregion
export interface DeployConfigMap {
  [key: string]: DeployConfig
}
export interface DeployConfig {
  /** 部署环境 */
  env: string
  /** 部署环境名称 */
  name: string
  /** 项目名称，如果不传默认取package.json的name字段 */
  projectName?: string
  /** 服务器配置 */
  server: SSHClientConfig
  /** 跳板机配置 */
  agent?: SSHClientConfig
  /**
   * 代理配置（例如 HTTP 代理）
   *
   * 如果配置了 proxy，则会优先通过代理建立到目标主机的连接
   */
  proxy?: SSHClientProxyConfig
  /** 编译配置 */
  build: {
    /** (优先级比cmd高)编译命令，实际运行为npm run $script */
    script: string
    /** 编译命令，实际运行为npm run $cmd */
    cmd: string
    /** 输出文件夹 */
    distPath: string
  }
  /** 部署配置 */
  deploy: {
    /**
     * 构建压缩包上传路径
     *
     * PS:用于某些堡垒机、需要跳板机的服务器使用非root账户登录时上传使用，
     * 此类场景通常都只有一部分文件夹的操作权限，
     * 而sftp是不支持权限提升的
     */
    uploadPath: string
    /** 部署路径，路径的最后一个文件夹为部署文件夹 */
    deployPath: string
    /** 备份路径，默认为deployPath+_backup */
    backupPath: string
    /** 备份路径，默认为deployPath_logs */
    logPath: string
    /**
     * docker镜像构建配置
     *
     * 1. Dockerfile放在项目根目录下(.dockerfile)，如果不存在则自动生成
     * 2.
     */
    docker: {
      /** 镜像名称，默认取projectName */
      name: string
      /** 主机端口，如果配置了nginx，可以不传此参数 */
      hostPort: string | number
      /** 启动镜像额外参数 */
      startArgs: string
    }
  }
  hooks: DeployHooks
  /** nginx配置，自动在服务器的nginx/conf.d目录下创建nginx配置文件（仅当配置文件不存在的时候） */
  nginx: {
    /** nginx配置文件路径，默认为/etc/nginx/conf.d */
    confPath?: ''
    /** nginx配置文件名，默认取projectName */
    fileName: string
    /** 监听端口 */
    listen: number
    /** 服务IP/域名 */
    serverName?: string
    /** 其他自定义配置内容 */
    customContent?: string
    /** api服务地址（反向代理） */
    api:
      | string
      | {
          url: string
          /** api接口前缀，默认为/api */
          prefix: '/api'
          /** 是否websocket接口 */
          websocket: boolean
          /** 是否有eventstream接口 */
          eventstream: boolean
        }
  }
  /** 终端交互方法，配置文件中无需配置 */
  readonly prompt: import('inquirer').PromptFunction
}

export interface DeployOptions {
  /** 是否备份 */
  backup: boolean
  /** 是否恢复历史版本，如果是Number类型则表示还原上几个版本 */
  rollback: boolean | number | string
  /** 文件路径，传了就表示部署指定文件 */
  file?: string
}

// export interface DeployRunningPromptDataMap {
//   chooseRollbackItem: Array<{
//     value: string
//     label: string
//   }>
//   enterSSHPassword: null
// }

// export interface DeployRunningPrompt<
//   T extends keyof DeployRunningPromptDataMap
// > {
//   method: T
//   data: DeployRunningPromptDataMap[T]
//   type:
//     | 'input'
//     | 'number'
//     | 'confirm'
//     | 'list'
//     | 'rawlist'
//     | 'expand'
//     | 'checkbox'
//     | 'password'
//     | 'editor'
// }

export default function autodeploy(
  config: DeployConfig,
  options: DeployOptions,
  hooks,
  Run
): Promise<void>
