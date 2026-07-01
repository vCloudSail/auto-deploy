import path from 'node:path'
import fs from 'node:fs'
import { spawn } from 'node:child_process'

import archiver from 'archiver'
import settings from '../settings.js'
import { distHasContent } from '../utils/dist-build-prompt.js'
// import { uniqueId } from 'lodash'
settings

/** 构建过程中 spinner 展示的最新行数 */
const TAIL_LINE_COUNT = 8
/** 失败时附带的日志行数 */
const TAIL_ERROR_LINE_COUNT = 30
const TAIL_UPDATE_MS = 120

/**
 * @param {number} maxLines
 * @param {(lines: string[]) => void} [onUpdate]
 */
function createLineTailer(maxLines, onUpdate) {
  let buffer = ''
  /** @type {string[]} */
  let tail = []
  /** @type {ReturnType<typeof setTimeout> | null} */
  let throttleTimer = null

  const flushUpdate = () => {
    if (!onUpdate) {
      return
    }
    const display =
      tail.length > TAIL_LINE_COUNT
        ? tail.slice(-TAIL_LINE_COUNT)
        : [...tail]
    onUpdate(display)
  }

  const scheduleUpdate = () => {
    if (throttleTimer) {
      return
    }
    throttleTimer = setTimeout(() => {
      throttleTimer = null
      flushUpdate()
    }, TAIL_UPDATE_MS)
  }

  return {
    /**
     * @param {Buffer | string} chunk
     */
    pushChunk(chunk) {
      buffer += chunk.toString()
      const parts = buffer.split(/\r?\n/)
      buffer = parts.pop() ?? ''
      for (const part of parts) {
        const line = part.replace(/\r$/, '').trimEnd()
        if (!line) {
          continue
        }
        tail.push(line)
        if (tail.length > maxLines) {
          tail = tail.slice(-maxLines)
        }
      }
      scheduleUpdate()
    },
    flush() {
      if (buffer.trim()) {
        tail.push(buffer.trimEnd())
        if (tail.length > maxLines) {
          tail = tail.slice(-maxLines)
        }
        buffer = ''
      }
      if (throttleTimer) {
        clearTimeout(throttleTimer)
        throttleTimer = null
      }
      flushUpdate()
    },
    getTail() {
      return [...tail]
    }
  }
}

/**
 * 构建器
 */
export default class Builder {
  /**
   * @type {string}
   */
  env
  /**
   * @type {string}
   */
  outputFullPath
  /**
   * @type {string}
   */
  outputPkgName

  constructor(env) {
    if (!env) {
      throw new Error('请传入环境名称')
    }

    this.env = env
    this.outputPkgName = `auto-deploy[${settings.deployConfig.projectName}]_${this.env}_${Date.now()}.zip`
  }

  /**
   * 删除本工具生成的 zip 包
   * @param {string} [pkgPath]
   */
  static async deletePkgFile(pkgPath) {
    if (!pkgPath) {
      return
    }
    const abs = path.isAbsolute(pkgPath)
      ? pkgPath
      : path.resolve(process.cwd(), pkgPath)
    try {
      await fs.promises.unlink(abs)
    } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') {
        return
      }
      throw error
    }
  }

  /**
   * 删除本地文件
   * @returns
   */
  deleteZip() {
    return Builder.deletePkgFile(this.outputPkgName)
  }

  /**
   * 压缩，返回压缩后的大小
   * @param {string} inputPath
   * @param {number} level
   * @returns {Promise<{name:string,size:number}>}
   */
  zip(inputPath = 'dist/', level = 9) {
    return new Promise(async (resolve, reject) => {
      if (!distHasContent(inputPath)) {
        reject(
          new Error(
            `打包失败：目录 "${inputPath}" 不存在或为空，请先执行构建或检查 build.distPath`
          )
        )
        return
      }

      const outputPkgName = this.outputPkgName
      const output = fs.createWriteStream(
        path.resolve(process.cwd(), outputPkgName)
      )
      const archive = archiver('zip', {
        zlib: { level: level || 9 }
      })
      output.on('close', () => {
        resolve({
          name: outputPkgName,
          size: archive.pointer()
        })
      })
      output.on('end', () => {
        reject()
      })
      archive.on('warning', (err) => {
        if (err.code === 'ENOENT') {
        } else {
        }
        reject(err)
      })
      archive.on('error', (err) => {
        reject(err)
      })
      archive.pipe(output)
      archive.directory(inputPath, false)
      archive.finalize()
    })
  }

  /**
   * @param {string} buildCmd
   * @param {(lines: string[]) => void} [onTailLines] 构建过程中最新 N 行输出
   */
  build(buildCmd, onTailLines) {
    return new Promise((resolve, reject) => {
      if (!buildCmd) {
        reject(new Error('buildCmd is null'))
        return
      }

      const tailer = createLineTailer(TAIL_ERROR_LINE_COUNT, onTailLines)
      const child = spawn(buildCmd, {
        shell: true,
        cwd: process.cwd(),
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe']
      })

      child.stdout?.on('data', (chunk) => tailer.pushChunk(chunk))
      child.stderr?.on('data', (chunk) => tailer.pushChunk(chunk))

      child.on('error', reject)
      child.on('close', (code) => {
        tailer.flush()
        if (code === 0) {
          resolve(tailer.getTail())
        } else {
          const tail = tailer.getTail().slice(-TAIL_ERROR_LINE_COUNT)
          const err = new Error(
            tail.length
              ? `构建命令退出码 ${code}（${buildCmd}）`
              : `构建命令退出码 ${code}（${buildCmd}），无控制台输出`
          )
          if (tail.length) {
            /** @type {Error & { outputTail: string[] }} */ (err).outputTail =
              tail
          }
          reject(err)
        }
      })
    })
  }

  start() {}
}
