# auto-deploy

## 介绍

这是一个基于nodejs的WEB前端自动化部署cli工具，降低前端开发人员部署项目的难度，提高开发、部署效率

### 有何不同
目前，前端自动化部署主流方案有git web hooks、jenkins以及原始的scp命令，跟这些方案项目有什么区别呢？
- 低成本，简易上手，敲个命令行就可以部署，降低与运维人员沟通成本
- 极灵活，开发人员可根据开发需求、进度灵活部署，比如产品临时有个小调整需求但又不需要提交到git的
- 多场景，避免了git hooks在某些场景下的不适用（比如git hooks会增加服务器压力，泄露源码）
- 轻量级，不用安装jenkins那么重的框架
- 多平台，基于nodejs开发，在任何一个平台都可以运行

### 项目依赖

- 日志器：winston
- 命令行交互：inquirer


### 项目结构
| 名称           | 描述                                                   |
| -------------- | ------------------------------------------------------ |
| bin            | 命令行入口代码                                         |
| demo           | 演示例子                                               |
| public         | 公共文件夹                                             |
| src            | 项目代码                                               |
| .gitignore     | git提交忽略文件配置                                    |
| .npmignore     | npm发布忽略文件配置                                    |
| .prettierrc.js | prettier配置文件                                       |
| index.d.ts     | 类型定义文件                                           |
| jsconfig.json  | 使用vscode必要文件，用于提供语法提示                   |
| package.json   |                                                        |
| README.md      | 项目描述文档，一个好的readme文件可以让他人快速熟悉项目 |
| vite.config.js | vite配置文件                                           |

### npm命令
- npm run clear: 用于重装依赖，删除package-lock.json、.eslintcache文件，移除node_modules
- npm run reinstall: 重装依赖，报错应该是由于文件夹占用，重新运行一次即可
- npm test: 运行单元测试（发布前建议执行）

### CLI 输出说明

控制台默认只展示关键步骤（构建、打包、连接、上传、解压、镜像、服务重启、部署完成），文案简短，用 `·` 分隔补充信息；本地路径仅显示文件名，远端路径保留 POSIX 形式。

步骤带 `[当前/总数]` 前缀（如 `[3/7] 上传压缩包…`），完成后附带耗时。部署开始时会打印项目、环境、服务器、Docker 等上下文行。

每台服务器以 `── 192.168.x.x ──` 作为阶段标题。进行中的步骤显示 spinner（如 `上传压缩包…`），完成后显示 `✔`。

查看技术细节（`buildMode`、compose 项目名解析、解压方式、临时文件清理等）请加 `--debug` / `-d`：

```shell
autodeploy test -d
```

## 安装\使用

### 安装

首先，全局安装插件

```shell
# npm
npm i @cloudsail/auto-deploy -g
# yarn
yarn global add @cloudsail/auto-deploy
```

在项目的根目录下，创建 `deploy.config.cjs`（可选；未检测到配置且目录像项目根目录——存在 `package.json`、`pyproject.toml`、`go.mod` 等常见清单时，会自动生成 `deploy.config.cjs` 与 `deploy.config.d.ts`）

```javascript
// deploy.config.cjs
const configs = {
  dev: {
    env: 'dev',
    name: '开发环境',
    server: {
      host: '192.168.xxx.xxx',
      port: '22',
      username: 'xxx',
      // password: 'xxx' // 这里为了提高安全性，password可以不定义，通过命令行输入
    },
    build: {
      script: 'build' // script参数会自动在前面拼接npm run
      // cmd: 'npm run build' , // 如果配置cmd参数，则要写前缀
      // distPath: 'dist' // 非必填，默认dist
    },
    deploy: {
      deployPath: '/home/xxx',
      // backupPath: '/home/xxx_backup', // 非必填，默认 deployPath + _backup
      // logPath: '/home/xxx_logs', // 非必填，默认deployPath+_logs
    }
  }
}

module.exports = configs

```

### 配置文件（deploy.config.cjs）

| 名称               | 描述                                                                      |
| ------------------ | ------------------------------------------------------------------------- |
| env                | 环境key                                                                   |
| name               | 环境名称                                                                  |
| projectName(可选)  | 项目名称；未配置时从项目清单、当前目录名、`env` 自动解析（用于 zip 命名、Docker 镜像名等） |
| server             | 服务器配置                                                                |
| - host             | 主机IP/域名                                                               |
| - port             | ssh端口                                                                   |
| - username         | 用户名                                                                    |
| - password(可选)   | 密码                                                                      |
| agent(可选)        | 跳板机配置（参数与server相同）                                            |
| proxy(可选)        | 代理配置                                            |
| - host             | 代理服务器地址                                                            |
| - port             | 代理服务器端口                                                            |
| - username(可选)   | 代理用户名（HTTP Basic Auth 或 SOCKS5 用户名密码认证）                   |
| - password(可选)   | 代理密码（HTTP Basic Auth 或 SOCKS5 用户名密码认证）                     |
| - type(可选)       | 代理类型，支持 http / socks4 / socks5 / telnet，默认 http                |
| build              | 构建配置                                                                  |
| - script           | 构建命令：npm run $script ，默认script=build                              |
| - cmd(可选)        | 构建命令；设为空字符串 `''` 表示跳过构建（直接使用已有 `distPath`）      |
| - distPath         | 构建后的输出路径，默认为dist                                              |
| deploy             | 部署配置                                                                  |
| - uploadPath(可选) | 部署包上传路径                                                            |
| - deployPath       | 部署路径（不存在会自动创建）；仅 Docker 部署时可省略，自动用 `/tmp/autodeploy-...` |
| - backupPath(可选) | 备份路径（不存在会自动创建）                                              |
| - docker(可选)     | Docker 部署，详见下文 [Docker部署](#docker部署)；未配置 compose 时走单容器 |
| - docker.image     | 镜像配置（对象或字符串）；见 [Docker部署](#docker部署)                    |
| - docker.container | 容器运行配置（端口、容器名等）；单容器模式生效                            |
| - docker.compose   | Compose 编排配置，见 [compose 字段说明](#docker部署)                      |
| - docker.compose.projectName | （可选）Compose 项目名；不配时从 compose 文件 / `.env` / `workDir` 自动解析，见下方 |
| - docker.compose.service     | 只更新 yml 里某一个服务（`services` 下的 key），避免重建 redis/db 等      |
| - docker.compose.workDir     | 服务器上执行 compose 的目录；`mode: remote` 时必填                        |
| nginx(可选)        | nginx配置，注意：如果是部署到docker中，自动生成的conf则会放入docker容器内 |
| hooks(可选)        | 生命周期钩子                                                              |
| - deployBefore     | 部署之前                                                                  |
| - buildBefore      | 构建之前                                                                  |
| - buildAfter       | 构建之后                                                                  |
| - compressBefore   | 压缩之前                                                                  |
| - compressAfter    | 压缩之后                                                                  |
| - uploadBefore     | 上传之前                                                                  |
| - uploadAfter      | 上传之后                                                                  |
| - backupBefore     | 备份之前                                                                  |
| - backupAfter      | 备份之后                                                                  |
| - deployAfter      | 部署之后                                                                  |

**注意事项：**
- **尽量使用root登录，如果无法使用root，尽量给账号分配操作部署目录的父目录权限，否则有可能因为权限问题导致部署失败**
- **目前没有做参数校验，所以请按照规范填写参数**
- **对于使用了跳板机的服务器，由于权限问题，可能无法使用docker部署和自动生成nginx配置功能**

#### 配置优先级

1. 配置了deploy.docker参数，则表示部署到docker容器中，每次部署目录都会重新构建镜像
2. 配置了nginx参数，则表示自动生成nginx配置文件
   - 如果配置了 deploy.docker 参数，则生成的配置文件会放入容器中，且配置文件名称强制为 default.conf
   - 反之，生成的配置文件会放入ningx安装目录(默认为/etc/nginx)/conf.d中
  
### 使用

支持以下参数，可通过 `autodeploy --help` 查看：
- `-e, --env` 指定部署环境
- `-bak, --backup` 部署前是否备份
- `-rb, --rollback` 回退到指定版本（数字表示上几个版本）
- `--file` 指定已有 zip，跳过构建与压缩
- `-d, --debug` 输出调试信息

#### 基础使用

获取使用帮助
```shell
autodeploy -h
```

一键部署
```shell
# 选择环境
autodeploy

# 指定环境
autodeploy -env [env]

# 指定备份当前版本
autodeploy -bak

# 版本回退
autodeploy -rb

# 回退到上一个版本
autodeploy -rb -1
```

#### Docker部署

配置 `deploy.docker` 可将前端部署到服务器的 Docker 容器中，支持：

| 能力 | 配置 |
|------|------|
| 本地 / 远端构建镜像 | `buildMode: 'local' \| 'remote'`（local 需本机安装 Docker） |
| dist 挂载 / 内置进镜像 | `distMode: 'mount' \| 'embed'` |
| 自定义镜像与容器 | `docker.image`、`docker.container` 分开配置 |
| Docker Compose | 配置 `compose.file` 后走 compose；`compose.mode: 'remote'` 可接入服务器已有栈 |
| 镜像就绪后自动重启 | 单容器 `docker run` 或 `docker compose up -d` |

**推荐配置结构**

```javascript
docker: {
  image: {
    name: 'my-frontend',
    tag: '20250520_120000', // 可选，未写则自动生成
    buildMode: 'remote',
    distMode: 'mount',
    dockerfile: './Dockerfile',
    baseImage: 'nginx:latest',
    tarDir: '/data/docker-tars'
  },
  container: {
    name: 'my-frontend-web',
    hostPort: 18080,
    port: 8080,
    startArgs: ''
  },
  compose: { /* 可选 */ }
}
```

**`docker.image`（镜像：构建与打包）**

| 字段 | 说明 |
|------|------|
| `name` | 镜像仓库名（不含 tag） |
| `tag` | 镜像标签；未配置时部署时自动生成时间戳 |
| `buildMode` | `remote`（服务器 build，默认）/ `local`（本机 build 后上传 tar） |
| `distMode` | `mount`（挂载宿主机 dist，默认）/ `embed`（dist 打进镜像） |
| `dockerfile` | 项目内自定义 Dockerfile（相对项目根） |
| `baseImage` | 内置模板基础镜像，默认 `nginx:latest` |
| `tarDir` | `buildMode: local` 时镜像 tar 在服务器上的目录 |

**`docker.container`（容器：运行与端口，单容器 `docker run` 时生效）**

| 字段 | 说明 |
|------|------|
| `name` | 容器名，默认 `{image.name}_container`；compose 模式以 yml 为准 |
| `hostPort` | 宿主机映射端口；也可使用 `nginx.listen` |
| `port` | 容器内监听端口，默认 `8080` |
| `startArgs` | `docker run` 额外参数 |

**`deploy.docker.compose` 字段（配置 `compose.file` 后生效）**

实际执行的命令形如：

```bash
cd {workDir} && IMAGE_NAME=... IMAGE_TAG=... docker compose -f {file} -p {projectName} up -d ...
```

| 字段 | 说明 |
|------|------|
| `file` | compose 文件路径。**managed**：相对项目根，会上传到服务器；**remote**：服务器上已有文件（相对 `workDir` 或绝对路径） |
| `mode` | `managed`（默认）：上传本地 yml 后启动；`remote`：不覆盖服务器已有编排，只在远端目录执行 `up` |
| `workDir` | 在服务器上执行 `docker compose` 的工作目录（`cd` 到此目录）。**remote 模式必填**，需与现网 compose 所在目录一致，如 `/opt/myapp` |
| `projectName` | （**可选**）对应 `docker compose -p` 的项目名。不配置时按顺序自动解析：① compose 文件顶层 `name:` → ② `workDir/.env` 里 `COMPOSE_PROJECT_NAME` → ③ `docker compose ls` 中与当前 compose 文件匹配的运行栈 → ④ `workDir` 的目录名（与 `cd workDir` 后默认行为一致）。仅当自动解析与现网不一致时再手动填写 |
| `service` | compose 里要更新的**服务名**，对应 yml 中 `services:` 下的 key（如 `web`）。配置后只对该服务执行 `up`，避免误重建同文件中的 `redis`、`db` 等；不配置则 `up` 全部服务 |
| `forceRecreate` | 是否附加 `--force-recreate`，默认 `true`，镜像 tag 变更时强制用新镜像起容器 |
| `env` | 额外注入 compose 的环境变量，会与工具自带的 `IMAGE_NAME`、`IMAGE_TAG`、`CONTAINER_NAME` 合并 |
| `envFile` | **managed** 模式：本地 `.env` 路径（相对项目根），上传到 `workDir/.env` |
| `syncComposeFile` | **remote** 模式：是否仍用本地 yml 覆盖服务器上的 compose 文件，默认 `false` |

**`projectName` 要不要配？**

一般**不用配**。已配置 `compose.workDir` 和 `compose.file` 后，工具会读取 compose 内容并推断项目名。

仅在自动推断与服务器上实际栈名不一致时（例如曾用自定义 `-p` 且 yml / `.env` 里都没写），再手动设置 `projectName`。也可在 compose 文件顶部写 `name: myapp`，或在 `.env` 写 `COMPOSE_PROJECT_NAME=myapp`。

**远端已有 Compose 栈示例：**

```javascript
docker: {
  image: { name: 'my-frontend', buildMode: 'local', distMode: 'mount' },
  container: { hostPort: 18080 },
  compose: {
    mode: 'remote',
    workDir: '/opt/myapp',              // 服务器上 compose 所在目录
    file: 'docker-compose.yml',
    // projectName: 'myapp',            // 可选；不配则从 compose / workDir 自动解析
    service: 'web',                     // 只更新 services.web
    syncComposeFile: false
  }
}
```

compose.yml 中建议使用 `${IMAGE_NAME}:${IMAGE_TAG}`，与工具注入的环境变量一致。

更完整的类型说明见 `deploy.config.d.ts`。

#### 自动生成Nginx配置文件
配置deploy.nginx属性即可实现自动生成Nginx配置文件
详细参数可参考deploy.config.d.ts

## 功能 & 计划
- [x] 自动化部署
  + [x] 支持动态输入服务器密码，避免将密码放在配置文件中造成泄露 
  + [x] 在本机缓存已输入的密码（加密处理），避免每次都要去找密码（存放位置：{用户文件夹}/.auto-deploy/password下）
  + [ ] 部署到Windows服务器(理论上windows运行ssh server也是可以用的，但目前没测试过)
  + [x] 部署到Linux服务器
  + [x] 备份功能
    * [x] 部署时提供命令行列表选项
  + [x] 支持通过跳板机、私钥连接服务器部署、备份
  + [x] 支持通过代理服务器连接目标服务器
- [x] 版本回退
  + [x] 支持指定回退到上几个版本
  + [x] 当没有指定回退版本时，为用户提供备份列表选项，用户可选择指定版本回退
- [x] 部署日志记录
  - [x] 本地日志
  - [x] 服务器日志(目前根据当前git仓库作者姓名写入简单的部署日志)
- [x] 支持非npm、nodejs项目(配置build.cmd参数)
- [x] Docker镜像部署（本地/远端构建、Compose、dist 挂载与内置）
- [x] 自动生成Nginx配置文件（当nginx配置文件不存在时）


## 注意事项
- **本工具目前只能在 Node.js 环境下运行，请勿在浏览器中使用**
- 发布到 npm 的包为构建后的 `dist`；本地开发可使用 `npm run dev` 直接运行 `bin/auto-deploy.js`

## 参与贡献
1. Fork 本仓库
2. 新建 Feat_xxx 分支
3. 提交代码前执行 `npm test`
4. 新建 Pull Request

本地示例配置见 `demo/deploy.config.js`（含 dev Docker 与 prod 静态部署）；测试用例会加载该目录做集成校验。