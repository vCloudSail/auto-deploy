import path from 'node:path'

const settings = {
  cachePath: path.resolve(process.env.USERPROFILE, '.auto-deploy'),
  logPath: path.resolve(process.env.USERPROFILE, '.auto-deploy/logs'),
  /**
   * @type {import('index').DeployConfig}
   */
  deployConfig: null
}

export default settings
