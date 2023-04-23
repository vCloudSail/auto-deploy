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
