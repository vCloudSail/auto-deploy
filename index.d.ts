/**
 * @typedef {object} DeployConfig
 * @property {string} name 部署环境名称
 * @property {string} host 主机地址
 * @property {string} port 端口
 * @property {string} username 用户名
 * @property {string} [password] 密码
 * @property {string} deployPath 部署路径，路径的最后一个文件夹为部署文件夹
 * @property {string} backupPath 备份路径
 * @property {string} buildCmd 编译命令，实际运行为npm run $buildCmd
 * @property {Function} deployBefore
 * @property {Function} buildBefore
 * @property {Function} buildAfter
 * @property {Function} uploadBefore
 * @property {Function} uploadAfter
 * @property {Function} backupBefore
 * @property {Function} backupAfter
 * @property {Function} deployAfter
 */

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
    /** 编译命令，实际运行为npm run $buildCmd */
    cmd: string
    /** 输出文件夹 */
    distPath: string
  }
  /** 部署配置 */
  deploy: {
    /** 部署路径，路径的最后一个文件夹为部署文件夹 */
    deployPath: string
    /** 备份路径，默认为部署路径的父路径/autp-deploy_backup */
    backupPath: string
  }
  hooks: DeployHooks
}

export interface DeployOptions {
  /** 是否备份 */
  backup: boolean
  /** 是否恢复历史版本，如果是Number类型则表示还原上几个版本 */
  rollback: boolean | number
}

export default function autodeply(config: DeployConfig): Promise<void>

