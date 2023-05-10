<!--
 * @Author: lcm
 * @Date: 2022-10-24 17:57:58
 * @LastEditors: lcm
 * @LastEditTime: 2022-12-26 13:51:00
 * @Description: 
-->
# auto-deploy

## 介绍
这是一个基于nodejs的WEB前端自动化部署cli工具

### 有何不同
- 低成本，开发人员可根据开发进度灵活部署，降低与运维人员沟通成本
- 多场景，避免了git hooks在某些场景下的不适用（比如git hooks会增加服务器压力，泄露源码）
- 轻量级，不用安装jenkins那么重的框架


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

全局安装插件

```shell
npm i auto-deploy -g
```

在项目的根目录下创建deploy.config.js

```javascript
const configs = {
  dev: {
    env: 'dev',
    name: '开发环境',
    server: {
      host: '192.168.xxx.xxx',
      port: '22',
      username: 'xxx',
      password: 'xxx' // 这里为了提高安全性，password可以不定义，通过命令行输入
    },
    build: {
      cmd: 'build'
    },
    deploy: {
      deployPath: '/home/xxx'
      backupPath: '/home/xxx'
    }
  }
}

module.exports = configs

```

### 参数

| 名称             | 描述                           |
| ---------------- | ------------------------------ |
| env              | 环境key                        |
| name             | 环境名称                       |
| server           | 服务器配置                     |
| - host           | 主机IP/域名                    |
| - port           | ssh端口                        |
| - username       | 用户名                         |
| - password(可选) | 密码                           |
| agent            | 跳板机配置（参数与server相同） |
| build            | 构建配置                       |
| - cmd            | script                         | 构建命令(npm run $cmd)，默认为build |
| - distPath       | 构建后的输出路径，默认为dist   |
| deploy           | 部署配置                       |
| - deployPath     | 部署路径（不存在会自动创建） |
| - backupPath     | 备份路径（不存在会自动创建） |

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
  + [x] 在本机缓存已输入的密码（加密处理），避免每次都要去找密码（存放位置：{用户文件夹}/.auto-deploy下）
  + [ ] 部署到Windows服务器
  + [x] 部署到Linux服务器
  + [x] 备份功能
    * [x] 部署时提供命令行列表选项
- [x] 版本回退
  + [x] 支持指定回退到上几个版本
  + [x] 当没有指定回退版本时，为用户提供备份列表选项，用户可选择指定版本回退
- [ ] Docker镜像部署
- [ ] 自动配置Nginx


## 注意事项
- **本工具目前只能在nodejs环境下运行**
  - 由于使用了一些nodejs的cli应用库，导致构建后运行异常，所以目前没有进行构建和压缩，直接使用源码运行

## 参与贡献
1. Fork 本仓库
2. 新建 Feat_xxx 分支
3. 提交代码
4. 新建 Pull Request