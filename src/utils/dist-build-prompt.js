import fs from 'node:fs'
import path from 'node:path'

/**
 * dist 目录是否存在且非空
 * @param {string} distPath 相对项目根目录
 */
export function distHasContent(distPath) {
  const abs = path.resolve(process.cwd(), distPath)
  if (!fs.existsSync(abs)) {
    return false
  }
  const stat = fs.statSync(abs)
  if (!stat.isDirectory()) {
    return true
  }
  return fs.readdirSync(abs).length > 0
}

/**
 * dist 已有内容时询问是否重新构建；超时则使用默认值（基于 inquirer，与 CLI 一致）
 * @param {import('inquirer').PromptModule | undefined} prompt
 * @param {object} opts
 * @param {string} opts.distPath
 * @param {boolean} [opts.defaultRebuild=true]
 * @param {number} [opts.timeoutMs=10000]
 * @returns {Promise<boolean>} true 表示执行重新构建
 */
export async function askRebuildWhenDistExists(
  prompt,
  { distPath, defaultRebuild = true, timeoutMs = 10000 } = {}
) {
  if (!distHasContent(distPath)) {
    return true
  }

  if (!prompt) {
    return defaultRebuild
  }

  const timeoutSec = Math.max(1, Math.round(timeoutMs / 1000))
  const defaultIndex = defaultRebuild ? 0 : 1
  const defaultLabel = defaultRebuild ? '是，重新构建' : '否，使用现有产物'

  const run = prompt([
    {
      type: 'list',
      name: 'rebuild',
      message: `检测到 ${distPath} 目录已有内容，是否重新构建？（${timeoutSec}s 后默认「${defaultRebuild ? '是' : '否'}」）`,
      choices: [
        { name: '是，重新构建', value: true },
        { name: '否，使用现有产物', value: false }
      ],
      default: defaultIndex
    }
  ])

  return new Promise((resolve) => {
    let settled = false

    const timer = setTimeout(() => {
      if (settled) {
        return
      }
      settled = true
      run.ui?.close()
      console.log('')
      console.log(`等待超时（${timeoutSec}s），默认：${defaultLabel}`)
      resolve(defaultRebuild)
    }, timeoutMs)

    run
      .then((answers) => {
        if (settled) {
          return
        }
        settled = true
        clearTimeout(timer)
        resolve(answers.rebuild)
      })
      .catch(() => {
        if (settled) {
          return
        }
        settled = true
        clearTimeout(timer)
        resolve(defaultRebuild)
      })
  })
}
