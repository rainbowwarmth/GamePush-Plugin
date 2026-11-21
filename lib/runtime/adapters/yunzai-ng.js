/**
 * yunzai-ng 适配器
 *
 * yunzai-ng 无全局对象，一切经 `ctx`（PluginContext）：
 *   - KV：ctx.kv；配置：ctx.config；数据目录：ctx.dataDir；日志：ctx.logger
 *   - 渲染：ctx.render(template, data) —— 渲染器用 `resolve(templateRoot, template)` 定位，
 *     传绝对路径可直接命中（resolve 遇到绝对路径会忽略 base），故沿用云崽式 tplFile 绝对路径。
 *   - 回收：ctx.registry / ctx.signal —— 统一走 lifecycle 登记
 *
 * 版本历史走官方 `ctx.sql()`：库落在 `<data>/sql/<插件名>/<库名>.db`，连接与关闭由内核管理，
 * WebUI 的存储面板也能直接浏览。表结构与远端同步复用 `store.js`，与其余框架同一套 SQL。
 */
import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { seg } from "@yunzai-ng/core"
import { pluginName, pluginPath, pluginResources } from "../detect.js"
import { buildMigrations, createStore } from "../store.js"
import { onUnload as registerUnload } from "../lifecycle.js"
import { mapYunzaiNgButtonRows } from "../buttons.js"

let _ctx = null
let _logger = console
let _dataDir = ""
let db = null

/** 迁移只跑一次：ctx.sql 的库句柄由内核缓存，重复 migrate 只是多一次版本查询 */
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
 *
 * 内核把插件的库放在 `<data>/sql/<插件名>/<库名>.db`；ctx.dataDir 是
 * `<data>/plugin/<插件名>`，上两级即 `<data>`。目录名必须与内核的命名一致，
 * 否则会另起一个库、历史数据看起来「消失」。
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
 *
 * `ctx.sql()` 返回 Promise，而适配器的 `init()` 是同步的 —— 因此句柄惰性获取，
 * 所有方法先 `await ready()`。内核按库名缓存同一个 Promise，不会重复开库。
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
      // 打开/迁移失败不留下坏缓存，否则重试永远拿到同一个 rejection
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

    db = createStore(createNgSqlDriver(ctx, { name: pluginName }), { signal: ctx.signal })

    // 旧版本插件把库自管在 <dataDir>/sql 下；首次切到 ctx.sql 时只读合并一次，
    // 补上自管库比内核旧库多出来的记录。标记文件防止重复导入。
    const selfManaged = path.join(_dataDir, "sql", `${pluginName}.db`)
    const marker = path.join(_dataDir, "sql", ".merged-into-ctx-sql")
    db.importDatabase(selfManaged, marker)
      .then(imported => {
        if (imported) _logger.info(`[${pluginName}] 已合并自管库历史记录: ${selfManaged}`)
      })
      .catch(error => {
        _logger.warn(`[${pluginName}] 合并自管库失败，将在下次启动重试: ${error.message}`)
      })

    // 启动即同步远端版本库（版本一致则跳过下载）。不 await：网络耗时不该拖慢 setup
    db.startupSync()
  },
  dispose: async () => {
    // 连接由内核按插件名统一关闭，这里只等未完成的写入落盘
    await db?.close().catch(() => {})
  }
}
