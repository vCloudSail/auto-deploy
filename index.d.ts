export interface Logger {
  loading(message): void
  success(message): void
  warn(message): void
  error(message): void
  info(message): void
  debug(message): void
}

export interface DeployHooks {
  deployBefore: () => boolean
  buildBefore: () => boolean
  buildAfter: () => boolean
  uploadBefore: () => boolean
  uploadAfter: () => boolean
  backupBefore: () => boolean
  backupAfter: () => boolean
  deployAfter: () => boolean
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
}

export interface DeployConfig {
  /** 部署环境 */
  env: string
  /** 部署环境名称 */
  name: string
  /** 服务器 */
  server: SSHClientConfig
  /** 跳板机 */
  agent: SSHClientConfig
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
    /** 部署路径，路径的最后一个文件夹为部署文件夹 */
    deployPath: string
    /** 备份路径，默认为deployPath+_backup */
    backupPath: string
    /** 备份路径，默认为deployPath_logs */
    logPath: string
  }
  hooks: DeployHooks
  /** 用户交互方法 */
  readonly prompt: import('inquirer').PromptFunction
}

export interface DeployOptions {
  /** 是否备份 */
  backup: boolean
  /** 是否恢复历史版本，如果是Number类型则表示还原上几个版本 */
  rollback: boolean | number
}
export interface DeployRunningPromptDataMap {
  chooseRollbackItem: Array<{
    value: string
    label: string
  }>
  enterSSHPassword: null
}

export interface DeployRunningPrompt<
  T extends keyof DeployRunningPromptDataMap
> {
  method: T
  data: DeployRunningPromptDataMap[T]
  type:
    | 'input'
    | 'number'
    | 'confirm'
    | 'list'
    | 'rawlist'
    | 'expand'
    | 'checkbox'
    | 'password'
    | 'editor'
}

export default function autodeploy(
  config: DeployConfig,
  options: DeployOptions,
  hooks,
  Run
): Promise<void>
