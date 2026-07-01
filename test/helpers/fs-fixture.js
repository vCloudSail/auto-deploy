import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * @param {string} [prefix]
 */
export function createTempDir(prefix = 'autodeploy-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

/**
 * @param {string} dir
 */
export function removeTempDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true })
}

/**
 * @param {string} dir
 * @param {Record<string, string>} files 相对路径 -> 内容
 */
export function writeFiles(dir, files) {
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, content, 'utf8')
  }
}
