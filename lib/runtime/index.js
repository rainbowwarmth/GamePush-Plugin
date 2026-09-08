/**
 * 运行时抽象层 (RAL - Runtime Abstraction Layer)
 *
 * 统一不同框架（Miao-Yunzai / Trss-Yunzai / Karin / yunzai-ng）的 API 差异，
 * 业务逻辑只依赖 rt 抽象接口，不直接访问全局变量或框架特有 API。
 */
import { BotName } from "../../components/path.js"

/** 运行时单例 */
export const rt = {
  /** @type {string} 框架名称 */
  BotName: "",
  /** @type {object} 日志接口 */
  logger: null,
  /** @type {object} KV 存储 { get, set, del } */
  kv: null,
  /** @type {object} 数据库 { getMainData, getPreData, storeMainSizeData, storePreSizeData } */
  db: null,
  /** @type {object} HTTP 请求 { get, post }（各框架共用同一 request 模块） */
  http: null,
  /** @type {object} 配置管理 */
  config: null,
  /** @type {string} 数据目录 */
  dataDir: "",
  /** @type {string} 插件根目录 */
  pluginRoot: "",
  /** @type {Function} 主动群推送 (botId, gid, msg, pushChangeType) */
  sendGroupMsg: null,
  /** @type {Function} 转发消息 (e, msgs) */
  makeForward: null,
  /** @type {Function} 截图渲染 (tplName, data) → segment/null */
  render: null,
  /** @type {Function} 事件归一化 (rawEvent) → NormalizedEvent */
  normalizeEvent: null,
  /** @type {Function} 插件基类（Yunzai/Karin 用 class 继承，yng 为 null） */
  plugin: null,
  /** @type {object} 消息段工具 */
  segment: null,
  /** @type {object} 通用工具 */
  common: null,
  /** @type {object|null} yunzai-ng 上下文 */
  ctx: null,
  /** @private */
  _adapter: null,
  /** @private */
  _initPromise: null
}

/**
 * 初始化运行时（yng 在 setup(ctx) 中调用）
 * @param {object} ctx - yunzai-ng 上下文
 */
export async function initRuntime(ctx) {
  rt.ctx = ctx
  const { default: adapter, initAdapter } = await import("./yunzai-ng.js")
  // initAdapter 在后台启动数据库同步（不阻塞 setup）；真正用到库的定时任务/命令
  // 会在首次打开库前 await 同步收尾，保证替换库文件先于任何 ctx.sql 连接
  initAdapter(ctx)
  rt._adapter = adapter
  _applyAdapter(ctx)
}

/**
 * 确保运行时已初始化（Yunzai/Karin 通过兼容层惰性调用）
 */
export async function ensureInit() {
  if (rt._adapter) return
  rt._initPromise ??= (async () => {
    if (rt._adapter) return
    let mod
    switch (BotName) {
      case "Karin":
        mod = await import("./karin.js")
        break
      case "Yunzai-NG":
        mod = await import("./yunzai-ng.js")
        break
      default:
        mod = await import("./yunzai.js")
        break
    }
    rt._adapter = mod.default
    _applyAdapter()
  })()
  return rt._initPromise
}

function _applyAdapter(ctx) {
  const a = rt._adapter
  rt.BotName = a.BotName
  rt.logger = a.logger
  rt.kv = a.kv
  rt.db = a.db
  rt.http = a.http
  rt.config = a.config
  rt.dataDir = a.dataDir
  rt.pluginRoot = a.pluginRoot
  rt.sendGroupMsg = a.sendGroupMsg
  rt.makeForward = a.makeForward
  rt.render = a.render
  rt.normalizeEvent = a.normalizeEvent
  rt.plugin = a.plugin ?? null
  rt.segment = a.segment ?? null
  rt.common = a.common ?? null
}
