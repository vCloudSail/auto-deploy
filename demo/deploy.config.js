const package = require('./package.json')

/** @type {import('./deploy.config').DeployConfigMap} */
const configs = {
  dev: {
    env: 'dev',
    name: '开发环境',
    server: {
      host: '192.168.14.211',
      port: '22',
      username: 'root'
      // password: '' // 非必填
    },
    build: {
      // script: 'build' // script参数会自动在前面拼接npm run
      cmd: '' // 如果配置cmd参数，则要写前缀
      // distPath: 'dist' // 非必填，默认dist
    },
    deploy: {
      deployPath: '/home/tichaincloud/web/test',
      // bakupPath: '/home/xxx_backup', // 非必填，默认deployPath+_backup
      // logPath: '/home/xxx_logs', // 非必填，默认deployPath+_logs
      docker: {
        hostPort: 18080
      }
    },
    nginx: {
      listen: 18080,
      serverName: '192.168.14.211',
      api: {
        url: 'http://127.0.0.1:8089/api'
        // websocket: true,
        // eventstream: true
      }
    }
  }
}

module.exports = configs
