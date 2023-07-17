/** @type {{[key:string]:import('./deploy.config').DeployConfig}} */
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
      script: 'build' // script参数会自动在前面拼接npm run
      // cmd: 'npm run build' , // 如果配置cmd参数，则要写前缀
      // distPath: 'dist' // 非必填，默认dist
    },
    deploy: {
      deployPath: '/home/xxx'
      // bakupPath: '/home/xxx_backup', // 非必填，默认deployPath+_backup
      // logPath: '/home/xxx_logs', // 非必填，默认deployPath+_logs
    }
  }
}

module.exports = configs
