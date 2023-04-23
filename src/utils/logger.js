import ora from 'ora'

const spinner = ora()

export class Logger {
  isDebug = false
  constructor(debug = false) {
    this.isDebug = debug
  }

  log(type = 'log', message) {
    switch (type) {
      case 'warn':
        spinner.warn(message)
        break
      case 'error':
        spinner.fail(message)
        break
      case 'success':
        spinner.succeed(message)
        break
      case 'info':
      default:
        spinner.info(message)
        break
    }
  }

  loading(message) {
    if (message === false) {
      return spinner.stop()
    }
    return spinner.start(message)
  }

  success(message) {
    this.log('success', message)
  }

  warn(message) {
    this.log('warn', message)
  }

  error(message) {
    this.log('error', message)
  }

  info(message) {
    this.log('info', message)
  }

  debug(type, message) {}
}

const logger = new Logger()

export default logger
