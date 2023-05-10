/**
 * @param {keyof import("index").DeployHooks} name
 */
export async function execHook(name) {
  try {
    execHook._config?.hooks?.[name] && (await config[name]())
  } catch (error) {
    throw new Error(`执行Hook出错(${name}) -> ${error.message}`)
  }
}

/**
 *
 * @param {import('@/modules/ssh').default} client
 * @param {object} param
 * @param {string} param.backupPath
 */
export async function getRollbackList(client, { backupPath } = {}) {
  const list = await client.exec(`ls ${backupPath}`)
  return list
}

export function getBackupPath(config) {
  return (
    config?.deploy?.backupPath != null
      ? config?.deploy?.backupPath
      : config.deploy.deployPath.trim().replace(/[/]$/gim, '') + '_backup'
  )
    .trim()
    .replace(/[/]$/gim, '')
}
