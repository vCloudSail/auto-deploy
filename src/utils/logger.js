import config from '@/conifg'
import dayjs from 'dayjs'
import winston from 'winston'

/**
 * ERROR：处理当前操作时发生了严重的问题/失败，此类日志是需要尽快处理的。
 * WARN：警告等级，并没有阻止应用程序继续，当检测到意外的应用程序问题时会发出告警日志。对于这个等级的日志一般检查一下以决定是否应该解决。
 * INFO：应用程序的正常行为
 * DEBUG：这个等级是为开发人员准备的，它以详细的方式提供诊断信息，通常用于获取诊断、故障排除或测试应用程序所需的信息。
 * TRACE：捕获有关应用程序行为的所有详细信息，主要用于详细跟踪应用程序逻辑。
 */

const nowStr = dayjs().toString('YYYY_MM_DD_HH_mm_ss')

/** @type { winston.Logger} */
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({
      dirname: config.logPath,
      filename: 'info'
    }),
    new winston.transports.Console()
  ]
})

// logger.log= function(le)
/**
 *
 * @param {import("index").Logger} newLogger
 */
export function addLogger(newLogger) {
  logger.add(newLogger)
  logger.log('新增日志器')
}

export default logger
