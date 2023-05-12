import inquirer from 'inquirer'
// import { PasswordCacher } from './utils/cacher.js'
import path from 'node:path'
import ora from 'ora'
import winston from 'winston'
import logger from './utils/logger.js'

const spinner = ora()
process.$debug = true

logger.add(
  new winston.transports.Console({
    format: {
      transform(data) {
        if (data.level === 'info') {
          if (data.loading) {
            spinner.start(data.message)
            return
          } 
          spinner.stop()
          spinner.info(data.message)
        } else {
          spinner.stop()
          spinner[data.level]?.(data.message)
        }
        return false
      }
    }
  })
)
async function test() {
  // console.log(path.resolve())
  // console.log(PasswordCacher.get('asd'))
  // PasswordCacher.set('asd', 'asdasdasdasdasd')
  logger.log('debug', 'asdasd')
  logger.log('info', 'asdasd', { loading: true })

  setTimeout(() => {
    logger.log('warn', 'asdasd')
    logger.debug('asdasd')

    logger.log('error', 'asdasd')

    logger.log('info', 'asdasd')
  }, 5000)
}

test()
