export default class DockerHelper {
  /** @type {import("index").SSHClient} */
  client
  /** @type {import("index").DeployConfig} */
  deployConfig
  /** @type {import("index").DeployConfig['deploy']['docker']} */
  get config() {
    return this.deployConfig.deploy.docker
  }
  /** 基础名称 */
  get baseName() {
    return this.config.name || this.deployConfig.projectName
  }
  /** 镜像名称 */
  get imageName() {
    return this.baseName.replace(/[\s@#/]+/g, '_').replace(/^[-_]/g, '')
  }
  /** 容器名称 */
  get containerName() {
    return this.imageName + '_container'
  }
  get nginxConfig() {
    return this.deployConfig.nginx
  }
  get dockfile() {
    return `FROM  nginx:latest
LABEL maintainer="cloudsail" description="${this.imageName}" version="1.0"

#设置时区
RUN /bin/cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime \
&& echo "Asia/Shanghai" >/etc/timezone

# 删除原有的default.conf文件
RUN rm /etc/nginx/conf.d/default.conf
RUN rm /usr/share/nginx/html/*

VOLUME /tmp

# COPY ./dist /usr/share/nginx/html
# 增加自定义default.conf文件到对应目录
ADD default.conf  /etc/nginx/conf.d/

EXPOSE 8080
ENTRYPOINT ["nginx", "-g", "daemon off;"]`
  }
  constructor(clinet, deployConfig) {
    this.client = clinet
    this.deployConfig = deployConfig
  }

  async build() {
    await this.createDockerFile()
    await this.buildImage()
  }
  createDockerFile() {
    return this.client.exec(
      `cd ${this.deployConfig.deploy.deployPath}; echo '${this.dockfile}' > Dockerfile`
    )
  }
  /** 构建镜像 */
  buildImage() {
    return this.client.exec(
      `cd ${this.deployConfig.deploy.deployPath}; docker build -t ${this.imageName} .`
    )
  }
  /** 重新加载 */
  async reload() {
    await this.removeContainer().catch((err) => false)
    await this.startContainer()
  }
  /** 启动容器 */
  startContainer() {
    return this.client.exec(`docker run -itd \
--restart=always \
-v ${this.deployConfig.deploy.deployPath}/dist:/usr/share/nginx/html \
-p ${
      this.config.hostPort
    }:8080 \
--name ${this.containerName} ${this.imageName} 
${this.config.startArgs || ''}`)
  }
  /** 移除容器 */
  async removeContainer() {
    await this.client.exec(`docker rm -f ${this.containerName}`)
    // await this.client.exec(`docker rmi -f ${this.imageName}`)
  }
}
