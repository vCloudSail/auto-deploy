<!--
 * @Author: lcm
 * @Date: 2022-10-24 17:57:58
 * @LastEditors: lcm
 * @LastEditTime: 2022-12-26 13:51:00
 * @Description: 
-->
# auto-deploy

## 介绍
这是一个WEB前端自动化部署cli工具

### 项目结构
| 名称           | 描述                                                                         |
| -------------- | ---------------------------------------------------------------------------- |
| demo           | 演示例子                                                                     |
| public         | 公共文件夹                                                                   |
| src            | 项目代码                                                                     |
| .gitignore     | git提交忽略文件配置                                                          |
| .npmignore     | npm发布忽略文件配置                                                          |
| .prettierrc.js | prettier配置文件                                                             |
| jsconfig.json  | 使用vscode必要文件，用于提供语法提示                                         |
| package.json   |                                                                              |
| README.md      | 项目描述文档，一个好的readme文件可以让他人快速熟悉项目                       |
| vue.config.js  | vue-cli编译配置文件                                                          |

### npm命令
- npm run clear: 用于重装依赖，删除package-lock.json、.eslintcache文件，移除node_modules
- npm run reinstall: 重装依赖，有一定几率会报错（原因未知）


## 安装教程
```shell
npm i auto-deploy -g
```

**使用**

获取使用帮助
```shell
autodeploy -h
```

一键部署
```shell
autodeploy -env [env]
```

一键部署（自动备份）
```shell
autodeploy -env [env] -bak
```


## 功能 & 计划
- [x] 自动化部署
- [x] 自动备份
- [ ] 回退上一个版本\指定版本

## 参与贡献
1. Fork 本仓库
2. 新建 Feat_xxx 分支
3. 提交代码
4. 新建 Pull Request