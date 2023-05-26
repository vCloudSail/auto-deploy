// import settings from '@/settings'
import dayjs from 'dayjs'
import winston from 'winston'

const logPath = './.deploy-logs'
const logFileBaseName = dayjs().format('YYYY-MM-DD')

/**
 * ERROR：处理当前操作时发生了严重的问题/失败，此类日志是需要尽快处理的。
 * WARN：警告等级，并没有阻止应用程序继续，当检测到意外的应用程序问题时会发出告警日志。对于这个等级的日志一般检查一下以决定是否应该解决。
 * INFO：应用程序的正常行为
 * DEBUG：这个等级是为开发人员准备的，它以详细的方式提供诊断信息，通常用于获取诊断、故障排除或测试应用程序所需的信息。
 * TRACE：捕获有关应用程序行为的所有详细信息，主要用于详细跟踪应用程序逻辑。
 */

const fileTransportFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.align(),
  // winston.format.colorize({level:true}),
  winston.format.printf(
    (info) =>
      `[${info.timestamp}] [${info.level.toUpperCase()}]${info.message || ''}`
    // typeof info === 'string'
    //   ? info
    //   : `[${info.timestamp}] [${info.level.toUpperCase()}]${info.message || ''}`
  )
)

/** @type {winston.Logger} */
const logger = winston.createLogger({
  transports: [
    new winston.transports.File({
      format: fileTransportFormat,
      level: 'info',
      dirname: logPath, // settings.logPath,
      filename: `${logFileBaseName}.info.log`
    }),
    new winston.transports.File({
      format: fileTransportFormat,
      level: 'error',
      dirname: logPath, // settings.logPath,
      filename: `${logFileBaseName}.error.log`
    })
    // new winston.transports.Console({
    //   format: winston.format.combine(
    //     winston.format.printf((i) => `${i.level}: ${i.timestamp} ${i.message}`)
    //   )
    // })
  ]
})

// if (process.$debug) {
//   logger.add(
//     new winston.transports.File({
//       level: 'debug',
//       dirname: logPath, // settings.logPath,
//       filename: logFileBaseName + '.debug'
//     })
//   )
// }

/**
 *
 * @param {winston.transport} transport
 * @returns {winston.Logger}
 */
export function addTransport(transport) {
  logger.add(transport)
  logger.debug('新增日志器')
  return logger
}

export default logger
