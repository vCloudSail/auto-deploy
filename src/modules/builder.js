import path from 'node:path'
import fs from 'node:fs'

import archiver from 'archiver'
import { exec } from 'child-process-promise'

/**
 * 构建器
 */
export default class Builder {
  /**
   * @type {string}
   */
  env
  outputFullPath
  get outputPkgName() {
    return `auto-deploy-${this.env}.zip`
  }

  constructor(env) {
    if (!env) {
      throw new Error('请传入环境名称')
    }

    this.env = env
  }

  /**
   * 删除本地文件
   * @returns
   */
  deleteZip() {
    return new Promise((resolve, reject) => {
      // console.log(
      //   path.resolve(process.cwd(), this.outputPkgName))
      fs.unlink(path.resolve('', this.outputPkgName), function (error) {
        if (error) {
          reject(error)
        } else {
          resolve(true)
        }
      })
    })
  }

  /**
   * 压缩，返回压缩后的大小
   * @param {string} inputPath
   * @param {number} level
   * @returns {Promise<{name:string,size:number}>}
   */
  zip(inputPath = 'dist/', level = 9) {
    return new Promise(async (resolve, reject) => {
      const outputPkgName = this.outputPkgName
      // 创建文件输出流
      const output = fs.createWriteStream(
        path.resolve(process.cwd(), outputPkgName)
      )
      const archive = archiver('zip', {
        zlib: { level: level || 9 } // 设置压缩级别
      })
      // 文件输出流结束
      output.on('close', () => {
        // console.log(
        //   chalk.green(`[Builder]: 压缩文件总共 ${archive.pointer()} 字节----`)
        // )
        // console.log(chalk.green('[Builder]: 压缩文件夹完毕'))
        resolve({
          name: outputPkgName,
          size: archive.pointer()
        })
      })
      // 数据源是否耗尽
      output.on('end', () => {
        // console.log(chalk.red('[Builder]: 压缩失败，数据源已耗尽'))
        reject()
      })
      // 存档警告
      archive.on('warning', (err) => {
        if (err.code === 'ENOENT') {
          // console.log(chalk.red('[Builder]: stat故障和其他非阻塞错误'))
        } else {
          // console.log(chalk.red('[Builder]: 压缩失败'))
        }
        reject(err)
      })
      // 存档出错
      archive.on('error', (err) => {
        // console.log(chalk.red('[Builder]: 存档错误，压缩失败 -> ', err))
        reject(err)
      })
      // 通过管道方法将输出流存档到文件
      archive.pipe(output)

      // 打包dist里面的所有文件和目录
      archive.directory(inputPath, false)
      // archive.directory(`../${Config.buildDist}/`, false)

      // 完成归档
      archive.finalize()
    })
  }

  build(buildCmd) {
    // console.log(chalk.blue('[Builder]: 开始编译项目'))
    return new Promise(async (resolve, reject) => {
      if (!buildCmd) {
        return reject('buildCmd is null')
      }
      const { error, stdout, stderr } = await exec(buildCmd)

      if (error) {
        // console.error(error)
        reject(error)
      } else if (stdout) {
        resolve(stdout)
        // console.log(chalk.green('[Builder]: 编译完成'))
      } else {
        // console.error(stderr)
        reject(stderr)
      }
    })
  }

  start() {}
}
