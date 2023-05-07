/**
 * ERROR：处理当前操作时发生了严重的问题/失败，此类日志是需要尽快处理的。
 * WARN：警告等级，并没有阻止应用程序继续，当检测到意外的应用程序问题时会发出告警日志。对于这个等级的日志一般检查一下以决定是否应该解决。
 * INFO：应用程序的正常行为
 * DEBUG：这个等级是为开发人员准备的，它以详细的方式提供诊断信息，通常用于获取诊断、故障排除或测试应用程序所需的信息。
 * TRACE：捕获有关应用程序行为的所有详细信息，主要用于详细跟踪应用程序逻辑。
 */
let _logger = {
  ...console,
  success(...msg) {
    console.log(...msg)
  }
}

let logger = {
  log(type = 'log', ...message) {
    try {
      switch (type) {
        case 'warn':
          _logger.warn(...message)
          break
        case 'error':
          _logger.error(...message)
          break
        case 'success':
          _logger.success(...message)
          break
        case 'info':
        default:
          _logger.info(...message)
          break
      }
    } catch (error) {}
  },

  loading(message) {
    return _logger.loading?.(message)
  },

  success(...message) {
    this.log('success', ...message)
  },

  warn(...message) {
    this.log('warn', ...message)
  },

  error(...message) {
    this.log('error', ...message)
  },

  info(...message) {
    this.log('info', ...message)
  },

  debug(...message) {
    this.log('debug', ...message)
  }
}

/**
 *
 * @param {import("index").Logger} newLogger
 */
export function setLogger(newLogger) {
  _logger = newLogger
  console.log('设置日志器')
}

export default logger
