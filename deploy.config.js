const configs = {
  dev: {
    env: 'dev',
    name: '开发环境',
    server: {
      host: '192.168.xxx.xxx',
      port: '22',
      username: 'xxx'
      // password: '' // 非必填
    },
    build: {
      cmd: 'build'
      // distPath: 'dist' // 非必填，默认dist
    },
    deploy: {
      // bakupPath: '/xxx/xxx', // 非必填，默认deployPath+_backup
      deployPath: '/home/xxx'
    }
  }
}

module.exports = configs
