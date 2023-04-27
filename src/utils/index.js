/**
 * @param {keyof import("index").DeployHooks} name
 */
export async function execHook(name) {
  try {
    execHook._config?.hooks?.[name] && (await config[name]())
  } catch (error) {
    throw new Error(`执行Hook-${name}出错 -> ${error.message}`)
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
