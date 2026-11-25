/**
 * yunzai-ng 适配器
 */
import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { seg } from "@yunzai-ng/core"
import { pluginName, pluginPath, pluginResources } from "../detect.js"
import { setNgContext } from "../dirs.js"
import { buildMigrations, createStore } from "../store.js"
import { onUnload as registerUnload } from "../lifecycle.js"
import { mapYunzaiNgButtonRows } from "../buttons.js"

let _ctx = null
let _logger = console
let _dataDir = ""
let db = null
const MIGRATIONS = buildMigrations()

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

/**
 * 推导 ctx.sql 的库位置
 * @param {object} ctx 插件上下文
 * @param {string} name 库名
 * @returns {{stateDir: string, location: string}} 目录与文件路径
 */
function resolveSqlPaths(ctx, name) {
  const dataDir = ctx.dataDir ?? path.join(process.cwd(), "data", "plugin", name)
  const dataRoot = path.resolve(dataDir, "..", "..")
  const stateDir = path.join(dataRoot, "sql", ctx.name ?? name)
  return { stateDir, location: path.join(stateDir, `${name}.db`) }
}

/**
 * 创建基于 ctx.sql 的 driver
 * @param {object} ctx 插件上下文
 * @param {{name: string}} options 参数
 * @returns {object} driver
 */
function createNgSqlDriver(ctx, { name }) {
  const { stateDir, location } = resolveSqlPaths(ctx, name)
  let handle = null

  /**
   * 取已迁移的库句柄
   * @returns {Promise<object>} SqlHandle
   */
  function ready() {
    if (!handle) {
      handle = ctx.sql(name).then(async sql => {
        await sql.migrate(MIGRATIONS)
        return sql
      })
      handle.catch(() => {
        handle = null
      })
    }
    return handle
  }

  return {
    name,
    stateDir,
    location,

    ready,

    async all(sql, params = []) {
      return (await ready()).all(sql, params)
    },

    async run(sql, params = []) {
      return (await ready()).run(sql, params)
    },

    /**
     * 事务：内核的 SqlHandle 已做串行化与 SAVEPOINT，这里只做接口对齐
     * @param {Function} fn 事务体
     * @returns {Promise<any>} 事务体返回值
     */
    async transaction(fn) {
      const sql = await ready()
      return sql.transaction(tx =>
        fn({
          all: (statement, params = []) => tx.all(statement, params),
          run: (statement, params = []) => tx.run(statement, params)
        })
      )
    },

    async exists() {
      return fs.existsSync(location)
    },

    /** 连接归内核所有，插件不得也不需关闭 */
    async close() {}
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
  return msgs.map(msg => (typeof msg === "string" ? msg : (msg?.text ?? String(msg)))).join("\n---\n")
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
      e.reply(msg, quote === true ? { quote: true } : quote && typeof quote === "object" ? quote : {}),
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
  buildAppOptions() {
    return null
  },
  onUnload: registerUnload,
  init(ctx) {
    _ctx = ctx
    _logger = ctx.logger ?? console
    globalThis.logger ??= _logger
    _dataDir = ctx.dataDir ?? path.join(process.cwd(), "data", "plugin", pluginName)

    // sophon 的缓存与快照一律走内核给的目录（ctx.app.paths / ctx.dataDir），
    // 不拼 process.cwd()：装成服务或 pm2 启动时 cwd 不是实例目录
    setNgContext(ctx)

    db = createStore(createNgSqlDriver(ctx, { name: pluginName }), { signal: ctx.signal })
    const selfManaged = path.join(_dataDir, "sql", `${pluginName}.db`)
    const marker = path.join(_dataDir, "sql", ".merged-into-ctx-sql")
    db.importDatabase(selfManaged, marker)
      .then(imported => {
        if (imported) _logger.info(`[${pluginName}] 已合并自管库历史记录: ${selfManaged}`)
      })
      .catch(error => {
        _logger.warn(`[${pluginName}] 合并自管库失败，将在下次启动重试: ${error.message}`)
      })

    db.startupSync()
  },
  dispose: async () => {
    await db?.close().catch(() => {})
  }
}
