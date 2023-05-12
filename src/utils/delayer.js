/* eslint-disable */

/**
 * 异步延时器
 * @param {number} duration 等待时间
 * @param {(cancelFn:(reason?: any) => void)=>void} injection 传入参数为Promise的reject
 * @returns {import('./utils').CancelPromise}
 */
export function delayer(duration, injection) {
  let _resolve,
    _reject,
    _timer,
    result = new Promise((resolve, reject) => {
      injection?.(reject)
      _reject = reject
      _resolve = resolve
      _timer = setTimeout(() => {
        resolve(true)
      }, duration)
    })
  result.cancel = (reason) => {
    _reject?.(reason ?? new Error('cancel'))
    clearTimeout(_timer)
  }
  return result
}
