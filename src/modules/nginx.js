import logger from '@/utils/logger'

export default class NginxHelper {
  /** @type {import("index").SSHClient} */
  client
  /** @type {import("index").DeployConfig} */
  deployConfig
  /** @type {import("index").DeployConfig['nginx']} */
  get config() {
    return this.deployConfig.nginx
  }
  get fileName() {
    return this.deployConfig?.deploy.docker
      ? 'default'
      : this.config.fileName || this.deployConfig.projectName
  }
  get confContent() {
    const apiConfig =
      typeof this.config.api === 'object'
        ? this.config.api
        : {
            url: this.config.api,
            websocket: false,
            eventstream: false
          }
    const confContent = `${
      apiConfig.websocket
        ? `map \\$http_upgrade \\$connection_upgrade{
  default upgrade;
  '' close;
}

`
        : ''
    }server {
  listen ${
    this.deployConfig.deploy.docker ? 8080 : this.config.listen || 8080
  }; # 前端端口
  server_name  ${
    this.deployConfig.deploy.docker
      ? 'localhost'
      : this.config.serverName || '127.0.0.1'
  }; # 服务器ip
  location / {
    root   ${
      this.deployConfig.deploy.docker
        ? '/usr/share/nginx/html'
        : this.deployConfig.deploy.deployPath
    };
    index  index.html index.htm;
    try_files \\$uri \\$uri/ /index.html =404;
  }  
  location ^~ ${apiConfig.prefix || '/api'} {
    proxy_pass ${apiConfig.url};
    proxy_set_header Host \\$host;
    proxy_set_header X-Real-IP \\$remote_addr;
    proxy_set_header X-Forwarded-For \\$proxy_add_x_forwarded_for;
    proxy_http_version 1.1;
    ${apiConfig.websocket ? '' : '# '}proxy_set_header Upgrade \\$http_upgrade;
    ${
      apiConfig.websocket ? '' : '# '
    }proxy_set_header Connection \\$connection_upgrade;
    ${apiConfig.eventstream ? '' : '# '}proxy_buffering off;
  }
  ${this.config.customContent || ''}
}`
    return confContent
  }
  /**
   *
   * @param {import("index").SSHClient} client
   * @param {import("index").DeployConfig} deployConfig
   */
  constructor(client, deployConfig) {
    this.client = client
    this.deployConfig = deployConfig
  }
  async generateConf(path) {
    path = path || this.config?.confPath || '/etc/nginx/conf.d'

    try {
      await this.client.exec(`stat ${path}`)
    } catch (error) {
      logger.warn('nginx未安装，跳过生成配置文件')
      return
    }

    await this.client.exec(
      `cd ${path}; echo "${this.confContent}" > ${this.fileName}.conf`
    )

    return path + `/${this.fileName}.conf`
  }
  async reload() {
    try {
      await this.client.exec('nginx -t')
      await this.client.exec('nginx -s reload')
      return true
    } catch (error) {
      return false
    }
  }

  /**
   * 检查配置文件是否存在
   * @param {import("index").SSHClient} client
   * @param {import("index").DeployConfig} config
   */
  static async checkConfExist(client, config) {
    if (!config.nginx) {
      return false
    }

    try {
      const result = await client.exec(
        `stat ${config.confPath || '/etc/nginx/conf.d/'}${
          config.nginx.fileName || config.projectName
        }.conf`
      )
      if (result?.includes('Size')) {
        return true
      }
      return false
    } catch (error) {
      return false
    }
  }
}
