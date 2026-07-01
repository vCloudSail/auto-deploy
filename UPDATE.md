# v1.3.0

**新增**
- Docker 部署支持 `buildMode: local | remote`（本机构建镜像 tar 上传 / 服务器构建）
- Docker 支持 `distMode: mount | embed`（dist 卷挂载 / COPY 进镜像）
- `deploy.docker` 拆分为 `docker.image`（镜像）与 `docker.container`（容器）
- 支持 Docker Compose（`compose.mode: managed | remote`，可接入服务器已有 compose 栈）
- 镜像上传或构建完成后自动重启容器 / `compose up`
- 部署时若 `distPath` 已有内容，询问是否重新构建（10 秒超时默认重新构建）
- 无 `package.json` 或多语言项目：自动识别 `pyproject.toml`、`Cargo.toml`、`composer.json`、`go.mod`、`pom.xml`、`build.gradle(.kts)`、`.csproj` 等清单解析项目名
- 配置项 `projectName`：未填写时按「配置 → 清单 → 目录名 → env」回退
- 单元测试：`npm test`（基于 Node 内置 test runner，覆盖配置解析、部署计划、Docker、demo 环境 mock 链路）

**优化**
- Dockerfile、nginx 配置改为 SFTP 上传，避免 echo 写入失败
- 部署日志记录镜像全名与构建模式
- `compose.projectName` 可选：未配置时从 compose 文件、`.env`、`docker compose ls` 或 `workDir` 自动解析
- CLI 流水线：`[n/N]` 步骤编号、耗时、跳过步骤动态补全总数；部署前输出环境上下文摘要
- 构建失败时展示控制台尾部日志（`outputTail`），便于定位编译错误
- 部署结束后自动清理本次生成的本地 zip（`--file` 指定的包不删）
- 解压逻辑增强（`ensure-unzip`）；`--debug` 输出技术细节

**修复**
- 修复步骤计数可能出现 `[5/4]` 的问题（skip 构建与计划步数不一致）
- 配置文件存在但加载失败时，不再误报「将创建默认配置」，并提示删除 `require('./package.json')`
- 默认模板 `deploy.config.cjs` 移除对 `package.json` 的硬依赖

**变更**
- `docker.image.buildMode` 须写在 `deploy.docker.image` 下（不再支持旧版扁平字段）

# v1.2.2

**变更**
- 默认配置文件由 `deploy.config.js` 改为 `deploy.config.cjs`，避免在 `"type": "module"` 项目中因 `.js` 被当作 ESM 导致 `require` 无法加载配置

**新增**
- 首次运行自动生成 `deploy.config.cjs` 与 `deploy.config.d.ts`（类型提示，内容来自包内 `index.d.ts`）

**优化**
- 改进配置文件缺失时的检测：项目根目录存在 `package.json` 但无 `deploy.config.cjs` 时，自动创建默认配置
- 升级 `cosmiconfig` 至 v9
- 构建产物 zip 命名包含项目名：`auto-deploy[项目名]_环境_时间戳.zip`
- 内部 `settings.projectPackage` 重命名为 `packageInfo`


# v1.2.1
**新增**
- 支持 SSH 连接使用代理（HTTP / SOCKS4 / SOCKS5 / Telnet），可在环境配置中通过 `proxy` 指定
- 支持 `--file` 参数，传入已有 zip 时跳过构建与压缩，直接部署
- 类型定义补充 `SSHClientProxyConfig`、`DeployConfig.proxy`，`DeployOptions.file`；`agent` 改为可选

**优化**
- 优化代理连接相关日志信息（连接过程、类型与地址）
- 构建产物 zip 文件名增加时间戳，避免多次部署互相覆盖
- Nginx 生成配置与 reload 分步输出日志；reload 前增加短暂延迟，降低配置未就绪即重载的风险
- 部署结束日志增加当前时间；多机部署结果文案调整
- CLI 将 `backup`、`rollback`、`file` 等选项完整传入部署逻辑
- README 补充 `proxy` 配置说明；demo 增加代理配置示例

**修复**
- 修正进程退出码：部署成功退出 `0`，失败退出 `1`（此前相反）
- 修复未匹配到环境配置时 `config.env` 可能报错的问题（`config?.env`）

**变更**
- 包内移除根目录 `deploy.config.d.ts`，类型定义统一维护在 `index.d.ts`；运行时仍会将最新类型同步到用户项目的 `deploy.config.d.ts`


# v1.2.0
**新增**
- 考虑到冗余服务器（容灾服务器）场景，一个配置支持多server同时部署功能
- 兼容多server同时回滚功能
- 兼容多server同时备份功能

**优化**
- 优化日志打印信息格式

**注意：开源协议已由MIT调整为GPL-3.0**

# v1.1.2
**优化**
- 优化README
- 修复日志打印错误

**注意：开源协议已由MIT调整为GPL-3.0**


# v1.1.1
**新增**
- 支持自动生成nginx配置文件（仅当配置文件不存在时）
- 支持部署到docker

**优化**
- 优化README
- 优化deploy.config.d.ts覆盖逻辑
- 优化部分已知问题

**注意：开源协议已由MIT调整为GPL-3.0**


# v1.1.0
**新增**
- 支持SSH私钥连接
- 支持通过跳板机链接服务器
- 支持非root用户登录部署、备份（权限较低，使用sudo提升命令权限）
- 配置文件支持代码提示

**优化**
- 优化生命周期钩子执行方法以及逻辑
- 优化SSHClient类


# v1.0.1

**新增**
- 增加在服务端写入操作日志的功能

**优化**
- 增加/优化部分提示


# v1.0.0

**新增**
- 支持动态输入服务器密码，避免将密码放在配置文件中造成泄露 
- 在本机缓存已输入的密码（加密处理），避免每次都要去找密码（存放位置：{用户文件夹}/.auto-deploy/password下）
- 支持不需要构建的项目部署
  
**优化**
- 优化部署、回退时目标文件夹不存在的处理逻辑
- 优化配置文件不存在的处理逻辑
- 优化日志器

**修复**
- 解决Nodejs模块无法打包的问题（nodejs打包不需要打包依赖包）


# v0.1.0
- 增加版本回退功能


# v0.0.1-fix1
- 优化部分提示文本
- 解决部署文件夹错误的问题


# v0.0.1-fix
- 增加对debug模式的判断


# v0.0.1(初始版本)
完成自动化部署基本功能
