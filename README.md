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


## 安装\使用

### 安装

首先，全局安装插件

```shell
# npm
npm i auto-deploy -g
# yarn
yarn add auto-deploy -g
```

在项目的根目录下，创建deploy.config.js（可选，运行时auto-deploy未检测到配置文件时，会自动创建）

```javascript
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
      // bakupPath: '/home/xxx_backup', // 非必填，默认deployPath+_backup
      // logPath: '/home/xxx_logs', // 非必填，默认deployPath+_logs
    }
  }
}

module.exports = configs

```

### 配置文件(deploy.config.js)

| 名称               | 描述                                                                      |
| ------------------ | ------------------------------------------------------------------------- |
| env                | 环境key                                                                   |
| name               | 环境名称                                                                  |
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
| - cmd(可选)        | 构建命令：$cmd，如何指定为false，则表示不进行构建                         |
| - distPath         | 构建后的输出路径，默认为dist                                              |
| deploy             | 部署配置                                                                  |
| - uploadPath(可选) | 部署包上传路径                                                            |
| - deployPath       | 部署路径（不存在会自动创建）                                              |
| - backupPath(可选) | 备份路径（不存在会自动创建）                                              |
| - docker(可选)     | 部署到docker的配置                                                        |
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
   - 如果配置了deployu.docker参数，则生成的配置文件会放入容器中，且配置文件名称强制为default.conf
   - 反之，生成的配置文件会放入ningx安装目录(默认为/etc/nginx)/conf.d中
  
### 使用

支持以下参数，可通过autodeploy --help查看
- -rb 回退版本号或名称
- -bak 本次部署是否备份
- -env 部署环境

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
配置deploy.docker属性即可实现部署到服务器的docker容器中
详细参数可参考deploy.config.d.ts

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
- [ ] Docker镜像部署
- [x] 自动生成Nginx配置文件（当nginx配置文件不存在时）


## 注意事项
- **本工具目前只能在nodejs环境下运行，web环境请勿使用**
  - ~~由于使用了一些nodejs的cli应用库，导致构建后运行异常，所以目前没有进行构建和压缩，直接使用源码运行~~

## 参与贡献
1. Fork 本仓库
2. 新建 Feat_xxx 分支
3. 提交代码
4. 新建 Pull Request