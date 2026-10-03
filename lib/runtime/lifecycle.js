/**
 * 生命周期与资源回收
 *
 * 六框架里只有 yunzai-ng（AbortSignal）和 JiuLi（onUnload）提供原生卸载钩子，
 * 其余框架没有。这里做一层统一记账：
 *   - 任何模块级资源（chokidar watcher / SQLite 句柄 / 定时器）都登记进 cleanup 队列
 *   - JiuLi 热重载会「整张插件模块图重新求值」，若不交接就会句柄泄漏、重复起 watcher
 *   - 因此模块级资源用 globalThis 交接：新模块图启动时先收走旧图的资源
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
