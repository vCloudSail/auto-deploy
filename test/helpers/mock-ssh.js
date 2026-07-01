/**
 * 记录 exec/upload 调用的轻量 SSH mock，用于 deploy 集成测试
 * @param {object} [opts]
 * @param {string} [opts.host]
 * @param {boolean} [opts.cmdUseSudo]
 * @param {(cmd: string) => string | void} [opts.onExec]
 */
export function createMockSSHClient(opts = {}) {
  const host = opts.host || '127.0.0.1'
  /** @type {{ exec: string[], upload: Array<{ local: string, remote: string }> }} */
  const calls = { exec: [], upload: [] }

  return {
    host,
    cmdUseSudo: opts.cmdUseSudo ?? false,
    calls,
    async connect() {},
    disconnect() {},
    /**
     * @param {string} cmd
     */
    async exec(cmd) {
      calls.exec.push(cmd)
      if (opts.onExec) {
        const custom = opts.onExec(cmd)
        if (custom != null) {
          return custom
        }
      }
      if (/command -v unzip/.test(cmd)) {
        return '/usr/bin/unzip\n'
      }
      if (cmd.includes('docker version')) {
        return 'Client: Docker Engine\n'
      }
      if (cmd.includes('docker compose ls')) {
        return ''
      }
      if (cmd.includes('git config user.name')) {
        return 'tester\n'
      }
      return ''
    },
    /**
     * @param {string} local
     * @param {string} remote
     */
    async upload(local, remote) {
      calls.upload.push({ local, remote })
    }
  }
}

/**
 * @param {string[]} execCalls
 * @param {RegExp} pattern
 */
export function execIncludes(execCalls, pattern) {
  return execCalls.some((cmd) => pattern.test(cmd))
}
