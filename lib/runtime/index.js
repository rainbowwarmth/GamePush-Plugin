/**
 * 运行时抽象层（RAL - Runtime Abstraction Layer）
 *
 * 六框架的全部差异收敛在这一层。业务代码（model/、apps/）只依赖 `rt` 上的统一接口，
 * 不直接访问 global.Bot / global.segment / ctx / node-karin。
 *
 * 使用方式：
 *   - 云崽系 / Karin：首次 import 时 `await ensureInit()` 惰性装配适配器
 *   - yunzai-ng：内核调用插件的 setup(ctx)，由 `initRuntime(ctx)` 注入上下文
 */
import { adapterId, BotName, detected, pluginName, pluginPath, pluginResources, cwd, BotPackage, PluginPackage, SUPPORTED } from "./detect.js"
import { assertAdapter } from "./contract.js"
import { onUnload, dispose as disposeResources } from "./lifecycle.js"

export { onUnload, disposeResources }
export { adapterId, BotName, pluginName, pluginPath, pluginResources, cwd, BotPackage, PluginPackage, SUPPORTED }
export { detected }

/** 运行时单例：业务层唯一入口 */
export const rt = {
  /** 适配器 id：yunzai | mangocat | jiuli | karin | yunzai-ng */
  adapter: adapterId ?? "unknown",
  /** 框架名：Miao-Yunzai / Trss-Yunzai / MangoCat-Yunzai / JiuLi / Karin / Yunzai-NG */
  BotName,
  logger: null,
  kv: null,
  db: null,
  dataDir: "",
  pluginRoot: pluginPath,
  pluginResources,
  segment: null,
  plugin: null,
  common: null,
  config: null,
  sendGroupMsg: null,
  makeForward: null,
  render: null,
  normalizeEvent: null,
  commandButtons: null,
  buildAppOptions: null,
  buildTaskExports: null,
  capabilities: {},
  /** yunzai-ng 上下文（其余框架为 null） */
  ctx: null,
  /** @private */
  _adapter: null,
  /** @private */
  _initPromise: null
}

function applyAdapter(adapter) {
  rt.adapter = adapter.adapter
  rt.BotName = adapter.BotName
  rt.logger = adapter.logger
  rt.kv = adapter.kv
  rt.db = adapter.db
  rt.dataDir = adapter.dataDir
  rt.pluginRoot = adapter.pluginRoot ?? pluginPath
  rt.pluginResources = adapter.pluginResources ?? pluginResources
  rt.segment = adapter.segment ?? null
  rt.plugin = adapter.plugin ?? null
  rt.common = adapter.common ?? null
  rt.config = adapter.config ?? null
  rt.sendGroupMsg = adapter.sendGroupMsg
  rt.makeForward = adapter.makeForward
  rt.render = adapter.render
  rt.normalizeEvent = adapter.normalizeEvent
  rt.commandButtons = adapter.commandButtons ?? null
  rt.buildAppOptions = adapter.buildAppOptions ?? null
  rt.buildTaskExports = adapter.buildTaskExports ?? null
  rt.capabilities = adapter.capabilities ?? {}
}

async function loadAdapter(id) {
  switch (id) {
    case "yunzai":
      return (await import("./adapters/yunzai.js")).default
    case "mangocat":
      return (await import("./adapters/mangocat.js")).default
    case "jiuli":
      return (await import("./adapters/jiuli.js")).default
    case "karin":
      return (await import("./adapters/karin.js")).default
    case "yunzai-ng":
      return (await import("./adapters/yunzai-ng.js")).default
    default:
      throw new Error(
        `[${pluginName}] 未适配的框架（宿主 package.json name = ${BotPackage.name || "空"}）。` +
          `受支持：${SUPPORTED.join(" / ")}`
      )
  }
}

/**
 * 确保运行时已初始化（云崽系 / Karin 惰性调用）
 * @returns {Promise<typeof rt>}
 */
export async function ensureInit() {
  if (rt._adapter) return rt
  rt._initPromise ??= (async () => {
    if (rt._adapter) return rt
    const adapter = assertAdapter(await loadAdapter(adapterId), adapterId)
    applyAdapter(adapter)
    rt._adapter = adapter
    return rt
  })()
  return rt._initPromise
}

/**
 * 初始化运行时（yunzai-ng 在 setup(ctx) 中调用）
 *
 * 两个必须成立的点：
 *   1. 不能因为适配器已被 `ensureInit()` 抢先装配就跳过 `init(ctx)`。
 *      插件模块图里 lib/*.js 顶层有 `await ensureInit()`（如 model/api.js → lib/api.js），
 *      它会在 setup 之前就把 yunzai-ng 适配器 applyAdapter 进来，但此时 `_ctx` 仍是 null。
 *   2. `applyAdapter()` 会把适配器的 getter 求值后快照到 rt 上（db / dataDir / config / logger）。
 *      所以它必须在 `adapter.init(ctx)` **之后**再执行一次，否则 rt.db 会永远是 init 前的 null。
 *
 * @param {object} ctx yunzai-ng 上下文
 */
export async function initRuntime(ctx) {
  if (rt.ctx) return rt
  // 等抢先装配的 ensureInit() 收敛，拿到同一个适配器实例
  if (rt._initPromise) await rt._initPromise
  if (rt.ctx) return rt

  const adapter = rt._adapter ?? assertAdapter(await loadAdapter("yunzai-ng"), "yunzai-ng")
  rt.ctx = ctx
  adapter.init?.(ctx)
  applyAdapter(adapter)
  rt._adapter = adapter
  return rt
}

/** 释放运行时资源（热重载 / 退出） */
export async function dispose() {
  await rt._adapter?.dispose?.().catch(() => {})
  await disposeResources()
}
