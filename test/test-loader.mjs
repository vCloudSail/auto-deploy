import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const srcRoot = path.join(root, 'src')

/**
 * @param {string} specifier
 * @param {import('node:module').defaultResolveContext} context
 * @param {import('node:module').defaultResolve} nextResolve
 */
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const rel = specifier.slice(2)
    const base = path.join(srcRoot, rel)
    const withJs = base.endsWith('.js') ? base : `${base}.js`
    if (fs.existsSync(withJs)) {
      return nextResolve(pathToFileURL(withJs).href, context)
    }
  }

  if (
    (specifier.startsWith('./') || specifier.startsWith('../')) &&
    context.parentURL
  ) {
    const parentDir = path.dirname(fileURLToPath(context.parentURL))
    const base = path.resolve(parentDir, specifier)
    if (!path.extname(base)) {
      const withJs = `${base}.js`
      if (fs.existsSync(withJs)) {
        return nextResolve(pathToFileURL(withJs).href, context)
      }
    }
  }

  return nextResolve(specifier, context)
}
