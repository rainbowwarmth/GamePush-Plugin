/**
 * yunzai-ng 适配器
 *
 * yunzai-ng 无全局对象，一切经 `ctx`（PluginContext）：
 *   - KV：ctx.kv；配置：ctx.config；数据目录：ctx.dataDir；日志：ctx.logger
 *   - 渲染：ctx.render(template, data) —— 渲染器用 `resolve(templateRoot, template)` 定位，
 *     传绝对路径可直接命中（resolve 遇到绝对路径会忽略 base），故沿用云崽式 tplFile 绝对路径。
 *   - 回收：ctx.registry / ctx.signal —— 统一走 lifecycle 登记
 *
 * 版本历史仍由插件用 node:sqlite 自管，避免依赖内核 ctx.sql() 的 better-sqlite3 原生模块。
 */
import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { seg } from "@yunzai-ng/core"
import { pluginName, pluginPath, pluginResources } from "../detect.js"
import { createSqliteDb } from "../sqlite-db.js"
import { onUnload as registerUnload } from "../lifecycle.js"
import { mapYunzaiNgButtonRows } from "../buttons.js"

let _ctx = null
let _logger = console
let _dataDir = ""
let db = null

/** 把文件系统路径转成 file:// URL（模板里直接当 href 用） */
function toFileUrl(target) {
  if (!target) return target
  const text = String(target)
  if (/^[a-z]+:\/\//i.test(text)) return text
  try {
    return pathToFileURL(text).href
  } catch {
    return text
  }
}

const kv = {
  async get(key) {
    return _ctx.kv.get(key)
  },
  async set(key, value) {
    return _ctx.kv.set(key, value)
  },
  async del(key) {
    return _ctx.kv.del(key)
  }
}

/** 只读导入原内核目录里的历史库；绝不替换、删除或修改内核管理的文件 */
function migrateLegacyHistory(legacyPath, markerPath) {
  if (fs.existsSync(markerPath)) return
  db.importDatabase(legacyPath)
    .then((imported) => {
      if (imported) _logger.info(`[${pluginName}] 已导入原 yunzai-ng 版本历史: ${legacyPath}`)
      fs.mkdirSync(path.dirname(markerPath), { recursive: true })
      fs.writeFileSync(markerPath, new Date().toISOString(), "utf8")
    })
    .catch((error) => {
      _logger.warn(`[${pluginName}] 导入原 yunzai-ng 版本历史失败，将在下次启动重试: ${error.message}`)
    })
}

async function sendGroupMsg(botId, gid, msg) {
  try {
    const content = typeof msg === "string" ? msg : (msg?.text ?? msg)
    await _ctx.pickBot(botId)?.sendMessage({ scene: "group", gid }, content)
    return true
  } catch (error) {
    _logger.error(`[${pluginName}] 群消息发送失败: ${gid}`, error)
    return false
  }
}

async function makeForward(_e, msgs) {
  try {
    const bot = _ctx.pickBot()
    if (bot?.sendForward) {
      await bot.sendForward(msgs)
      return
    }
  } catch {
    /* 回落文本拼接 */
  }
  return msgs.map((msg) => (typeof msg === "string" ? msg : (msg?.text ?? String(msg)))).join("\n---\n")
}

async function render(template, data) {
  try {
    const { tplFile, pluResPath, fontsPath, htmlSavePath, ...rest } = data ?? {}
    const target = tplFile || template
    const payload = {
      ...rest,
      ...(pluResPath ? { pluResPath: toFileUrl(pluResPath) } : {}),
      ...(fontsPath ? { fontsPath: toFileUrl(fontsPath) } : {})
    }
    return await _ctx.render(target, payload)
  } catch (error) {
    _logger.error(`[${pluginName}] 渲染失败`, error)
    return null
  }
}

function commandButtons(rows) {
  return seg.keyboard(mapYunzaiNgButtonRows(rows))
}

function normalizeEvent(e) {
  return {
    msg: e.text || "",
    isGroup: !!e.isGroup,
    groupId: String(e.group?.gid || ""),
    selfId: String(e.selfId || ""),
    userId: String(e.user?.uid || ""),
    reply: (msg, quote) =>
      e.reply(
        msg,
        quote === true ? { quote: true } : quote && typeof quote === "object" ? quote : {}
      ),
    raw: e
  }
}

export default {
  adapter: "yunzai-ng",
  BotName: "Yunzai-NG",
  get logger() {
    return _logger
  },
  kv,
  get db() {
    return db
  },
  get dataDir() {
    return _dataDir
  },
  pluginRoot: pluginPath,
  pluginResources,
  segment: seg,
  plugin: null,
  common: null,
  get config() {
    return _ctx?.config ?? null
  },
  capabilities: {
    buttons: true,
    forward: true,
    render: true,
    kv: true,
    sqlite: true,
    panels: ["yunzai-ng"]
  },
  sendGroupMsg,
  makeForward,
  render,
  normalizeEvent,
  commandButtons,
  /** yunzai-ng 走 ctx.command / ctx.cron，不消费类式插件选项 */
  buildAppOptions() {
    return null
  },
  onUnload: registerUnload,
  /** 由 initRuntime(ctx) 调用 */
  init(ctx) {
    _ctx = ctx
    _logger = ctx.logger ?? console
    globalThis.logger ??= _logger
    _dataDir = ctx.dataDir ?? path.join(process.cwd(), "data", "plugin", pluginName)

    const historyDir = path.join(_dataDir, "sql")
    // 库文件名固定取插件 package.json 的 name（GamePush-Plugin.db），不随目录名变化 —— 保证历史数据路径稳定
    db = createSqliteDb(historyDir, { signal: ctx.signal })

    // 卸载回收：NG 的官方钩子是 ctx.registry（registry 若已回收，add 会立即执行 —— 兜住
    // 「异步初始化晚于卸载」的竞态）。signal abort 与自家登记簿作为双保险；
    // 三条路径都只调 close()，而 close() 自身幂等，重复调用无副作用。
    const closeDb = () => void db?.close().catch(() => {})
    ctx.registry?.add?.(closeDb, `${pluginName}:sqlite`)
    ctx.signal?.addEventListener?.("abort", closeDb, { once: true })
    registerUnload(closeDb)

    // 只读导入原 ctx.sql 的历史库
    const legacyDir = path.join(path.resolve(_dataDir, "..", ".."), "sql", ctx.name ?? pluginName)
    migrateLegacyHistory(
      path.join(legacyDir, `${pluginName}.db`),
      path.join(historyDir, ".legacy-history-imported")
    )

    // 启动即同步远端版本库（版本一致则跳过下载）。不 await：网络耗时不该拖慢 setup
    db.startupSync()
  },
  dispose: async () => {
    await db?.close().catch(() => {})
  }
}
