import fs from 'node:fs'
import path from 'node:path'

const INVALID_NAME_CHARS = /[/\\:*?"<>|]/g

/** @type {Array<{ file: string | ((cwd: string) => string | null), source: string, read: (content: string, filePath?: string) => string | null }>} */
const MANIFEST_READERS = [
  {
    file: 'package.json',
    source: 'package.json',
    read(content) {
      try {
        const json = JSON.parse(content)
        return json?.name ? String(json.name) : null
      } catch {
        return null
      }
    }
  },
  {
    file: 'pyproject.toml',
    source: 'pyproject.toml',
    read(content) {
      const projectBlock = content.match(/\[project\][\s\S]*?(?=\n\[|$)/i)
      const block = projectBlock?.[0] || content
      const match = block.match(/^\s*name\s*=\s*["']([^"']+)["']/m)
      return match?.[1] || null
    }
  },
  {
    file: 'Cargo.toml',
    source: 'Cargo.toml',
    read(content) {
      const packageBlock = content.match(/\[package\][\s\S]*?(?=\n\[|$)/i)
      const block = packageBlock?.[0] || content
      const match = block.match(/^\s*name\s*=\s*["']([^"']+)["']/m)
      return match?.[1] || null
    }
  },
  {
    file: 'composer.json',
    source: 'composer.json',
    read(content) {
      try {
        const json = JSON.parse(content)
        return json?.name ? String(json.name) : null
      } catch {
        return null
      }
    }
  },
  {
    file: 'go.mod',
    source: 'go.mod',
    read(content) {
      const match = content.match(/^\s*module\s+(\S+)/m)
      if (!match?.[1]) {
        return null
      }
      const parts = match[1].replace(/\/$/, '').split('/')
      return parts[parts.length - 1] || null
    }
  },
  {
    file: 'pom.xml',
    source: 'pom.xml',
    read(content) {
      const match = content.match(/<artifactId>([^<]+)<\/artifactId>/i)
      return match?.[1]?.trim() || null
    }
  },
  {
    file: 'build.gradle.kts',
    source: 'build.gradle.kts',
    read(content) {
      return readGradleRootProjectName(content)
    }
  },
  {
    file: 'build.gradle',
    source: 'build.gradle',
    read(content) {
      return readGradleRootProjectName(content)
    }
  },
  {
    file: (cwd) => findFirstFile(cwd, '.csproj'),
    source: 'csproj',
    read(content, filePath) {
      const assembly = content.match(/<AssemblyName>([^<]+)<\/AssemblyName>/i)
      if (assembly?.[1]) {
        return assembly[1].trim()
      }
      if (filePath) {
        return path.basename(filePath, '.csproj')
      }
      return null
    }
  }
]

/**
 * @param {string} content
 */
function readGradleRootProjectName(content) {
  const patterns = [
    /rootProject\.name\s*=\s*["']([^"']+)["']/,
    /archivesBaseName\s*=\s*["']([^"']+)["']/,
    /archivesBaseName\s*=\s*['"]([^'"]+)['"]/
  ]
  for (const pattern of patterns) {
    const match = content.match(pattern)
    if (match?.[1]) {
      return match[1]
    }
  }
  return null
}

/**
 * @param {string} cwd
 * @param {string} suffix
 */
function findFirstFile(cwd, suffix) {
  try {
    const entry = fs
      .readdirSync(cwd, { withFileTypes: true })
      .find((item) => item.isFile() && item.name.endsWith(suffix))
    return entry ? path.join(cwd, entry.name) : null
  } catch {
    return null
  }
}

/**
 * @param {string} name
 */
export function sanitizeProjectName(name) {
  return String(name || '')
    .replace(INVALID_NAME_CHARS, '_')
    .trim()
}

/**
 * @param {string} cwd
 */
export function readOptionalPackageJson(cwd) {
  const pkgPath = path.resolve(cwd, 'package.json')
  if (!fs.existsSync(pkgPath)) {
    return null
  }
  try {
    return JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
  } catch {
    return null
  }
}

/**
 * @param {string} cwd
 * @returns {{ name: string, source: string, path: string } | null}
 */
export function readProjectManifest(cwd) {
  for (const reader of MANIFEST_READERS) {
    const filePath =
      typeof reader.file === 'function'
        ? reader.file(cwd)
        : path.resolve(cwd, reader.file)

    if (!filePath || !fs.existsSync(filePath)) {
      continue
    }

    try {
      const content = fs.readFileSync(filePath, 'utf8')
      const name = reader.read(content, filePath)
      if (name) {
        return {
          name: sanitizeProjectName(name),
          source: reader.source,
          path: filePath
        }
      }
    } catch {
      /* try next */
    }
  }
  return null
}

/**
 * 当前目录是否像项目根目录（存在常见清单文件）
 * @param {string} cwd
 */
export function hasProjectManifest(cwd) {
  if (readProjectManifest(cwd)) {
    return true
  }

  const staticFiles = [
    'package.json',
    'pyproject.toml',
    'Cargo.toml',
    'composer.json',
    'go.mod',
    'pom.xml',
    'build.gradle',
    'build.gradle.kts'
  ]

  for (const file of staticFiles) {
    if (fs.existsSync(path.resolve(cwd, file))) {
      return true
    }
  }

  return !!findFirstFile(cwd, '.csproj')
}

/**
 * @param {string} cwd
 * @param {import('index').DeployConfig} config
 */
export function resolveProjectMeta(cwd, config) {
  const explicit = config.projectName?.trim()
  if (explicit) {
    return {
      projectName: sanitizeProjectName(explicit),
      packageInfo: readOptionalPackageJson(cwd),
      manifest: readProjectManifest(cwd),
      source: 'config.projectName'
    }
  }

  const manifest = readProjectManifest(cwd)
  if (manifest?.name) {
    return {
      projectName: manifest.name,
      packageInfo:
        manifest.source === 'package.json'
          ? readOptionalPackageJson(cwd)
          : null,
      manifest,
      source: manifest.source
    }
  }

  const dirName = path.basename(cwd)
  if (dirName && dirName !== '.') {
    return {
      projectName: sanitizeProjectName(dirName),
      packageInfo: null,
      manifest: null,
      source: 'cwd'
    }
  }

  const envName = config.env || 'default'
  return {
    projectName: sanitizeProjectName(envName),
    packageInfo: null,
    manifest: null,
    source: 'env'
  }
}

/**
 * @param {import('index').DeployConfig} config
 */
export function resolveProjectName(config) {
  return resolveProjectMeta(process.cwd(), config).projectName
}
