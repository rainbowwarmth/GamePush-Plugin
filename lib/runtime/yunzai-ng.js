/**
 * yunzai-ng 适配器。
 *
 * 版本状态走 ctx.kv；版本历史由插件使用 Node 内置 node:sqlite 自行维护，
 * 避免依赖内核 ctx.sql() 的 better-sqlite3 原生模块。
 */
import fs from "node:fs"
import path from "node:path"
import { seg } from "@yunzai-ng/core"
import { mapYunzaiNgButtonRows } from "./buttons.js"
import { createSqliteDb } from "./sqlite-db.js"

let _ctx = null
let _logger = null
let _dataDir = ""
let db = null

const kv = {
  async get(key) { return _ctx.kv.get(key) },
  async set(key, value) { return _ctx.kv.set(key, value) },
  async del(key) { return _ctx.kv.del(key) }
}

function migrateLegacyHistory(legacyPath, markerPath) {
  if (fs.existsSync(markerPath)) return
  db.importDatabase(legacyPath).then((imported) => {
    if (imported) _logger.info(`[GamePush-Plugin] 已导入原 yunzai-ng 版本历史: ${legacyPath}`)
    fs.mkdirSync(path.dirname(markerPath), { recursive: true })
    fs.writeFileSync(markerPath, new Date().toISOString(), "utf8")
  }).catch((error) => {
    _logger.warn(`[GamePush-Plugin] 导入原 yunzai-ng 版本历史失败，将在下次启动重试: ${error.message}`)
  })
}

async function sendGroupMsg(botId, gid, msg) {
  try {
    const content = typeof msg === "string" ? msg : msg?.text ?? msg
    await _ctx.pickBot(botId).sendMessage({ scene: "group", gid }, content)
    return true
  } catch (error) {
    _logger.error(`[GamePush-Plugin] 群消息发送失败: ${gid}`, error)
    return false
  }
}

async function makeForward(_e, msgs) {
  try {
    if (_ctx.pickBot().sendForward) {
      await _ctx.pickBot().sendForward(msgs)
      return
    }
  } catch {}
  return msgs.map((msg) => (typeof msg === "string" ? msg : msg?.text ?? String(msg))).join("\n---\n")
}

async function render(template, data) {
  try {
    if (!data?.tplFile) return await _ctx.render?.(template, data)
    const { tplFile, pluResPath, fontsPath, htmlSavePath, ...rest } = data
    return await _ctx.render?.(tplFile, rest)
  } catch (error) {
    _logger.error("[GamePush-Plugin] 渲染失败", error)
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
    reply: (msg, quote) => e.reply(
      msg,
      quote === true
        ? { quote: true }
        : quote && typeof quote === "object"
          ? quote
          : {}
    ),
    raw: e
  }
}

/** 初始化 yunzai-ng 适配器。 */
export function initAdapter(ctx) {
  _ctx = ctx
  _logger = ctx.logger ?? console
  globalThis.logger ??= _logger
  _dataDir = ctx.dataDir ?? path.join(process.cwd(), "data", "plugin", "GamePush-Plugin")

  const historyDir = path.join(_dataDir, "sql")
  db = createSqliteDb(historyDir, { signal: ctx.signal })
  ctx.signal?.addEventListener("abort", () => {
    db?.close().catch((error) => {
      _logger.warn(`[GamePush-Plugin] 关闭版本历史数据库失败: ${error.message}`)
    })
  }, { once: true })

  // 只读导入原 ctx.sql 的历史库；绝不替换、删除或修改内核管理的文件。
  const legacyDir = path.join(path.resolve(_dataDir, "..", ".."), "sql", ctx.name ?? "GamePush-Plugin")
  migrateLegacyHistory(
    path.join(legacyDir, "GamePush-Plugin.db"),
    path.join(historyDir, ".legacy-history-imported")
  )

  // 启动即同步远端版本库（版本一致则跳过下载）。不 await：网络耗时不该拖慢 setup
  db.startupSync()
}

export default {
  BotName: "Yunzai-NG",
  get logger() { return _logger },
  kv,
  get db() { return db },
  http: null,
  config: null,
  get dataDir() { return _dataDir },
  pluginRoot: "",
  sendGroupMsg,
  makeForward,
  render,
  normalizeEvent,
  commandButtons,
  plugin: null,
  segment: seg,
  common: null
}
