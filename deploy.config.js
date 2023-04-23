const fs = require('fs')

const configs = {
  dev: {
    env: 'dev',
    name: '开发环境',
    server: {
      host: '192.168.xxx.xxx',
      port: '22',
      username: 'xxx',
      password: 'xxx'
    },
    build: {
      buildCmd: 'build'
    },
    deploy: {
      deployPath: '/home/xxx'
    }
  }
}

module.exports = configs
