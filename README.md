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
      // bakupPath: '/xxx/xxx', // 非必填，默认deployPath+_backup
      deployPath: '/home/xxx',
    }
  }
}

module.exports = configs

```

### 参数

**注意！！！目前没有做参数校验，所以请按照规范填写参数**

| 名称             | 描述                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------ |
| env              | 环境key                                                                                    |
| name             | 环境名称                                                                                   |
| server           | 服务器配置                                                                                 |
| - host           | 主机IP/域名                                                                                |
| - port           | ssh端口                                                                                    |
| - username       | 用户名                                                                                     |
| - password(可选) | 密码                                                                                       |
| agent            | 跳板机配置（参数与server相同）                                                             |
| build            | 构建配置                                                                                   |
| - cmd/script     | 构建命令(如果是cmd，则命令为$cmd，如果是script则命令为npm run $script)，默认为script=build |
| - distPath       | 构建后的输出路径，默认为dist                                                               |
| deploy           | 部署配置                                                                                   |
| - deployPath     | 部署路径（不存在会自动创建）                                                               |
| - backupPath     | 备份路径（不存在会自动创建）                                                               |

### 使用

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

## 功能 & 计划
- [x] 自动化部署
  + [x] 支持动态输入服务器密码，避免将密码放在配置文件中造成泄露 
  + [x] 在本机缓存已输入的密码（加密处理），避免每次都要去找密码（存放位置：{用户文件夹}/.auto-deploy/password下）
  + [ ] 部署到Windows服务器(理论上windows运行ssh server也是可以用的，但目前没测试过)
  + [x] 部署到Linux服务器
  + [x] 备份功能
    * [x] 部署时提供命令行列表选项
- [x] 版本回退
  + [x] 支持指定回退到上几个版本
  + [x] 当没有指定回退版本时，为用户提供备份列表选项，用户可选择指定版本回退
- [x] 部署日志记录
  - [x] 本地日志
  - [ ] 服务器日志 
- [x] 支持非npm、nodejs项目(配置build.cmd参数)
- [ ] Docker镜像部署
- [ ] 自动配置Nginx


## 注意事项
- **本工具目前只能在nodejs环境下运行，web环境请勿使用**
  - ~~由于使用了一些nodejs的cli应用库，导致构建后运行异常，所以目前没有进行构建和压缩，直接使用源码运行~~

## 参与贡献
1. Fork 本仓库
2. 新建 Feat_xxx 分支
3. 提交代码
4. 新建 Pull Request