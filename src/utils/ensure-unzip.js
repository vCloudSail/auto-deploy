import logger from './logger.js'

const NO_SUDO = { useSudo: false }

/**
 * @param {import('../modules/ssh.js').default} client
 */
async function hasUnzip(client) {
  try {
    const out = await client.exec('command -v unzip', undefined, NO_SUDO)
    return typeof out === 'string' && out.trim().length > 0
  } catch {
    return false
  }
}

async function hasPython(client) {
  try {
    await client.exec(
      'command -v python3 >/dev/null 2>&1 || command -v python >/dev/null 2>&1',
      undefined,
      NO_SUDO
    )
    return true
  } catch {
    return false
  }
}

/**
 * 远端无 unzip 时尝试用系统包管理器安装（需 sudo 权限）
 * @param {import('../modules/ssh.js').default} client
 */
export async function ensureUnzipInstalled(client) {
  if (await hasUnzip(client)) {
    return
  }

  if (!client.cmdUseSudo) {
    return
  }

  logger.debug('尝试安装 unzip…', { host: client.host })

  const installCmd = [
    'if command -v unzip >/dev/null 2>&1; then',
    '  echo AUTODEPLOY_UNZIP_OK;',
    '  exit 0;',
    'fi',
    'export DEBIAN_FRONTEND=noninteractive',
    'if command -v apt-get >/dev/null 2>&1; then',
    '  apt-get update -qq && apt-get install -y -qq unzip;',
    'elif command -v yum >/dev/null 2>&1; then',
    '  yum install -y -q unzip;',
    'elif command -v dnf >/dev/null 2>&1; then',
    '  dnf install -y -q unzip;',
    'elif command -v apk >/dev/null 2>&1; then',
    '  apk add --no-cache unzip;',
    'elif command -v zypper >/dev/null 2>&1; then',
    '  zypper install -y unzip;',
    'else',
    '  echo AUTODEPLOY_UNZIP_FAIL >&2;',
    '  exit 127;',
    'fi',
    'command -v unzip >/dev/null 2>&1 && echo AUTODEPLOY_UNZIP_OK'
  ].join(' ')

  try {
    await client.exec(installCmd)
  } catch (error) {
    if (await hasUnzip(client)) {
      logger.debug('unzip 安装成功', { host: client.host })
      return
    }
    logger.debug(`自动安装 unzip 失败: ${error}`, { host: client.host })
    return
  }

  if (await hasUnzip(client)) {
    logger.debug('unzip 安装成功', { host: client.host })
  }
}

const PYTHON_EXTRACT =
  'import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])'

async function extractWithPython(client, zip, dest) {
  const pyScript = PYTHON_EXTRACT.replace(/'/g, "'\\''")
  const pyCmd = [
    `(command -v python3 >/dev/null 2>&1 && python3 -c '${pyScript}' '${zip}' '${dest}')`,
    `|| (command -v python >/dev/null 2>&1 && python -c '${pyScript}' '${zip}' '${dest}')`
  ].join(' ')
  await client.exec(pyCmd, undefined, NO_SUDO)
}

async function extractWithUnzip(client, zip, dest) {
  await client.exec(`unzip -o '${zip}' -d '${dest}'`, undefined, NO_SUDO)
}

/**
 * 远端解压 zip：优先普通用户 unzip/python，避免无谓 sudo
 * @param {import('../modules/ssh.js').default} client
 * @param {string} zipPath
 * @param {string} destPath
 */
export async function extractRemoteZip(client, zipPath, destPath) {
  const zip = zipPath.replace(/'/g, "'\\''")
  const dest = destPath.replace(/'/g, "'\\''")

  if (await hasUnzip(client)) {
    try {
      await extractWithUnzip(client, zip, dest)
      logger.debug('使用 unzip 解压', { host: client.host })
      return
    } catch (error) {
      logger.debug('unzip 解压失败: ' + error, { host: client.host })
    }
  }

  if (await hasPython(client)) {
    try {
      await extractWithPython(client, zip, dest)
      logger.debug('使用 Python 解压', { host: client.host })
      return
    } catch (error) {
      logger.debug('Python 解压失败: ' + error, { host: client.host })
    }
  } else {
    logger.debug('远端未找到 python3/python', { host: client.host })
  }

  await ensureUnzipInstalled(client)

  if (await hasUnzip(client)) {
    await extractWithUnzip(client, zip, dest)
    logger.debug('使用 unzip 解压', { host: client.host })
    return
  }

  if (await hasPython(client)) {
    await extractWithPython(client, zip, dest)
    logger.debug('使用 Python 解压', { host: client.host })
    return
  }

  throw new Error(
    '解压失败：请让运维在服务器安装 unzip 或 python3，或配置免密 sudo / 关闭 cmdUseSudo'
  )
}
