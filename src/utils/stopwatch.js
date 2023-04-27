/**
 * 秒表
 */
export default class Stopwatch {
  duration = 0
  timer = null
  startTime = 0
  constructor() {}
  start() {
    if(!this.startTime)
    {
      
    this.startTime = performance.mark()
    }
    this.timer = setInterval(() => {
      duration
    }, 1)
  }
  stop() {}
  clear() {
    this.duration = 0
  }
}
