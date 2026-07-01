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
        image: {
          name: 'my-web-dev',
          buildMode: 'remote', // remote | local（local 需本机 Docker）
          distMode: 'mount' // mount | embed
        },
        container: {
          hostPort: 18080
        }
        // compose: {
        //   mode: 'managed',
        //   file: './docker-compose.yml',
        //   projectName: 'my-web-dev'
        // }
        // compose 接入远端已有栈:
        // compose: {
        //   mode: 'remote',
        //   workDir: '/opt/myapp',
        //   file: 'docker-compose.yml',
        //   projectName: 'myapp', // 可选，不配则从 compose 文件 / workDir 自动解析
        //   service: 'web',
        //   syncComposeFile: false
        // }
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
  },
  prod1: {
    env: 'prod',
    name: '线上环境',
    proxy: {
      host: '192.168.15.77',
      port: 7890,
      type: 'socks5'
    },
    server: [
      {
        host: '121.37.2.208',
        port: '22',
        username: 'root'
      }
    ],
    build: {
      // script: 'build:prod' // script参数会自动在前面拼接npm run
      cmd: '' , // 如果配置cmd参数，则要写前缀
      // distPath: 'dist' // 非必填，默认dist
    },
    deploy: {
      deployPath: '/data/apps/web/testtt'
      // bakupPath: '/home/xxx_backup', // 非必填，默认deployPath+_backup
      // logPath: '/home/xxx_logs', // 非必填，默认deployPath+_logs
    }
  }
}

module.exports = configs
