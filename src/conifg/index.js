import path from 'node:path'

const config = {
  cachePath: path.resolve(process.env.USERPROFILE, '.auto-deploy'),
  logPath: path.resolve(process.env.USERPROFILE, '.auto-deploy/logs')
}

export default config
