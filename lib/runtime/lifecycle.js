/**
 * 生命周期与资源回收
 */

const HANDOFF_KEY = "__GamePushHandoff"

/** @type {Set<Function>} */
const cleanups = new Set()

let disposed = false

/**
 * 登记一个清理回调
 * @param {Function} fn 清理函数（可为 async）
 * @returns {Function} 取消登记
 */
export function onUnload(fn) {
  if (typeof fn !== "function") return () => {}
  cleanups.add(fn)
  return () => cleanups.delete(fn)
}

/**
 * 执行所有清理回调并清空队列
 * @returns {Promise<void>}
 */
export async function dispose() {
  if (disposed) return
  disposed = true
  const tasks = [...cleanups].reverse()
  cleanups.clear()
  for (const fn of tasks) {
    try {
      await fn()
    } catch (error) {
      ;(globalThis.logger ?? console).warn(`[GamePush-Plugin] 资源回收失败: ${error?.message}`)
    }
  }
}

/**
 * 交接上一个模块图的资源（JiuLi 热重载用）
 *
 * 只在「目录型入口」的模块顶层调用一次：先收走旧图资源，再注册自己的 handoff。
 * @param {object} [logger]
 */
export async function adoptPrevious(logger) {
  const previous = globalThis[HANDOFF_KEY]
  if (typeof previous === "function") {
    try {
      await previous()
    } catch (error) {
      ;(logger ?? globalThis.logger ?? console).warn(
        `[GamePush-Plugin] 上一份模块图交还资源失败: ${error?.message}`
      )
    }
  }
  globalThis[HANDOFF_KEY] = () => dispose()
}

/** 是否已释放 */
export function isDisposed() {
  return disposed
}
