/**
 * rt 接口契约
 *
 * 每个适配器必须提供下列字段，业务层只依赖这些字段。开发期由 assertAdapter 校验，
 * 缺字段直接抛错——比运行到一半报 `rt.xxx is not a function` 好排查得多。
 */

/** 必需字段（undefined 即视为缺失） */
export const REQUIRED = [
  "adapter",
  "BotName",
  "logger",
  "kv",
  "db",
  "dataDir",
  "pluginRoot",
  "pluginResources",
  "segment",
  "sendGroupMsg",
  "makeForward",
  "render",
  "normalizeEvent",
  "commandButtons",
  "capabilities"
]

/**
 * 可选字段（允许 null）
 * - buildAppOptions / buildTaskExports：仅「类式插件」框架需要（云崽系 / Karin）
 * - plugin / common / config：各框架未必提供
 * - init / dispose / onUnload：生命周期
 */
export const OPTIONAL = [
  "plugin",
  "common",
  "config",
  "buildAppOptions",
  "buildTaskExports",
  "init",
  "dispose",
  "onUnload"
]

/**
 * 校验适配器实现是否符合契约
 * @param {object} adapter
 * @param {string} id
 */
export function assertAdapter(adapter, id) {
  if (!adapter || typeof adapter !== "object") {
    throw new Error(`[GamePush-Plugin] 适配器 ${id} 未导出对象`)
  }
  const missing = REQUIRED.filter((key) => adapter[key] === undefined)
  if (missing.length) {
    throw new Error(`[GamePush-Plugin] 适配器 ${id} 缺少必需字段: ${missing.join(", ")}`)
  }
  for (const key of ["sendGroupMsg", "makeForward", "render", "normalizeEvent"]) {
    if (typeof adapter[key] !== "function") {
      throw new Error(`[GamePush-Plugin] 适配器 ${id} 的 ${key} 必须是函数`)
    }
  }
  return adapter
}
