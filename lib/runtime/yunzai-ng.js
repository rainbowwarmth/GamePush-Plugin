/**
 * yunzai-ng 适配器
 *
 * yunzai-ng 是注入式内核，无全局变量，一切走 ctx 注入。
 * 版本存储用 ctx.kv，历史数据用 ctx.sql（SQLite）。
 */
import fs from "node:fs"
import path from "node:path"
import fetch from "node-fetch"

let _ctx = null
let _logger = null
let _dataDir = ""

/** 远程数据库版本信息地址（与 karin/trss/miao 版本同源） */
const REMOTE_VERSION_URL =
  "https://cnb.cool/rainbowwarmth/resources/-/git/raw/main/GamePush-Plugin/GamePush-Plugin-version.json"

/**
 * 带超时且可外部中断的 fetch。
 *
 * 同步在后台跑（不阻塞 setup），但必须能被 ctx.signal 打断——否则一个在途下载
 * 会拖住内核的优雅停机（表现为 SIGINT 后卡住、要按第二次才强退）。
 * 插件自带的 request 不支持中断，故这里直接用 node-fetch 并接上 AbortController。
 * @param {string} url 请求地址
 * @param {{signal?: AbortSignal, timeout?: number}} [opts] 中断信号与超时
 * @returns {Promise<import("node-fetch").Response>}
 */
async function fetchWithTimeout(url, { signal, timeout = 15_000 } = {}) {
  const ctrl = new AbortController()
  const onAbort = () => ctrl.abort()
  if (signal?.aborted) ctrl.abort()
  else signal?.addEventListener("abort", onAbort, { once: true })
  const timer = setTimeout(() => ctrl.abort(), timeout)
  timer.unref?.()
  try {
    return await fetch(url, { signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener("abort", onAbort)
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

/**
 * ctx.sql 数据库驱动
 *
 * 注意：ctx.sql(库名) 的语义是"打开（或复用）一个数据库并返回 SqlHandle"，
 * 执行 SQL 要用返回句柄上的 run/all —— 不能把 SQL 文本当库名传给 ctx.sql。
 * 库名用 GamePush-Plugin：框架把库落在 <data>/sql/GamePush-Plugin/GamePush-Plugin.db，
 * 与远程库文件名一致，首启同步下载的远端库可原样落盘直接使用。
 */
class YngDbDriver {
  DB_DOWNLOAD_URL =
    "https://cnb.cool/rainbowwarmth/resources/-/git/raw/main/GamePush-Plugin/GamePush-Plugin.db"
  DB_PATH = ""
  VERSION_JSON_PATH = ""
  /** 本进程是否已通过 ctx.sql 打开过库（决定同步策略：换文件 or ATTACH 合并） */
  _opened = false
  /** 启动同步的 promise：首次打开库前 await 它，保证替换库文件先于任何连接 */
  _syncReady = null

  constructor(ctx) {
    this._ctx = ctx
  }

  /**
   * 打开（或复用）库名为 GamePush-Plugin 的数据库句柄。
   *
   * 首次打开前必须等启动同步收尾：同步在 _opened=false 时用整文件替换，
   * 一旦 ctx.sql 打开了连接，WAL 模式下再替换文件就会损坏库。同步在后台跑，
   * setup 不阻塞；真正用到库的定时任务/命令在这里等它一下（已完成则瞬时返回）。
   */
  async _db() {
    if (this._syncReady) {
      try { await this._syncReady } catch {}
    }
    this._opened = true
    return this._ctx.sql("GamePush-Plugin")
  }

  async migrate() {
    const db = await this._db()
    await db.run(
      `CREATE TABLE IF NOT EXISTS main (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game TEXT NOT NULL,
        version TEXT NOT NULL,
        size TEXT,
        time TEXT,
        UNIQUE(game, version)
      )`
    )
    await db.run(
      `CREATE TABLE IF NOT EXISTS pre (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game TEXT NOT NULL,
        ver TEXT NOT NULL,
        oldver TEXT NOT NULL,
        size TEXT,
        time TEXT,
        UNIQUE(game, ver, oldver)
      )`
    )
  }

  _time() {
    return new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })
  }

  async storeMainSizeData(game, version, size) {
    await this.migrate()
    const db = await this._db()
    const time = this._time()
    try {
      await db.run(
        `INSERT INTO main (game, version, size, time) VALUES (?, ?, ?, ?)`,
        [game, version, size, time]
      )
      _logger.debug(`[GamePush-Plugin] main 表新增: ${game}-${version} | ${size}`)
      return true
    } catch {
      return false
    }
  }

  async storePreSizeData(game, ver, oldver, size) {
    await this.migrate()
    const db = await this._db()
    const time = this._time()
    try {
      await db.run(
        `INSERT INTO pre (game, ver, oldver, size, time) VALUES (?, ?, ?, ?, ?)`,
        [game, ver, oldver, size, time]
      )
      _logger.debug(`[GamePush-Plugin] pre 表新增: ${game}-${ver} | old: ${oldver} | ${size}`)
      return true
    } catch {
      return false
    }
  }

  async getMainData(game, version = null) {
    await this.migrate()
    const db = await this._db()
    if (version) {
      return db.all(
        `SELECT * FROM main WHERE game = ? AND version = ?`,
        [game, version]
      )
    }
    return db.all(`SELECT * FROM main WHERE game = ?`, [game])
  }

  async getPreData(game, ver = null) {
    await this.migrate()
    const db = await this._db()
    if (ver) {
      return db.all(
        `SELECT * FROM pre WHERE game = ? AND ver = ?`,
        [game, ver]
      )
    }
    return db.all(`SELECT * FROM pre WHERE game = ?`, [game])
  }

  /**
   * 启动期同步（对应 karin/trss/miao 的 checkDatabase）：
   * 远端 version.json 与本地不一致或本地无库时，把远端 .db 落到 DB_PATH。
   * 后台调用、不阻塞 setup；错误全部咽下（离线容错），停机中断则静默。
   * @param {AbortSignal} [signal] 停机中断信号
   */
  async checkDatabase(signal) {
    try {
      await this.#sync(signal)
    } catch (err) {
      if (signal?.aborted) return
      _logger.warn(`[GamePush-Plugin] 远程数据库同步失败，使用本地数据：${err?.message || err}`)
    }
  }

  /** 拉远端版本信息（失败抛错，由调用方决定容错还是上报） */
  async #fetchRemoteVersion(signal) {
    const res = await fetchWithTimeout(REMOTE_VERSION_URL, { signal, timeout: 10_000 })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  }

  async #sync(signal) {
    let remoteInfo
    try {
      remoteInfo = await this.#fetchRemoteVersion(signal)
    } catch (err) {
      if (signal?.aborted) return
      const tip = fs.existsSync(this.DB_PATH) ? "沿用本地数据库" : "首次启动将使用空数据库"
      _logger.warn(`[GamePush-Plugin] 远程版本信息获取失败，${tip}：${err?.message || err}`)
      return
    }
    let localInfo = {}
    try {
      localInfo = JSON.parse(fs.readFileSync(this.VERSION_JSON_PATH, "utf8")) || {}
    } catch {}
    if (fs.existsSync(this.DB_PATH) && String(localInfo.version) === String(remoteInfo.version)) {
      _logger.info(`[GamePush-Plugin] 数据库已是最新（版本：${remoteInfo.version}）`)
      return
    }
    _logger.info(
      `[GamePush-Plugin] 本地数据库版本 ${localInfo.version || "无"} 与远程 ${remoteInfo.version ?? "未知"} 不一致，开始同步`
    )
    await this.#installRemote(remoteInfo, signal)
    _logger.info(`[GamePush-Plugin] 数据库同步完成，当前版本：${remoteInfo.version ?? "未知"}`)
  }

  /** #更新游戏版本数据 命令入口：强制拉取远端库并应用，返回新版本号 */
  async updateDatabase() {
    const remoteInfo = await this.#fetchRemoteVersion(_ctx?.signal)
    await this.#installRemote(remoteInfo, _ctx?.signal)
    return remoteInfo.version || "未知"
  }

  /**
   * 把远端库下载到临时文件并落为本地库。
   * 库已被本进程打开时不能换文件（Windows 上文件被锁；POSIX 上 unlink 会让
   * 现有连接写到孤儿 inode），改用 ATTACH 把远端数据合并进现有连接。
   */
  async #installRemote(remoteInfo, signal) {
    const tmp = `${this.DB_PATH}.download`
    const res = await fetchWithTimeout(this.DB_DOWNLOAD_URL, { signal, timeout: 60_000 })
    if (!res.ok) throw new Error(`下载数据库失败（HTTP ${res.status}）`)
    const buf = Buffer.from(await res.arrayBuffer())
    // 校验 SQLite 文件头，防止把网关错误页写成数据库
    if (buf.length < 16 || buf.slice(0, 16).toString("latin1") !== "SQLite format 3\0") {
      throw new Error("下载数据不是有效的 SQLite 文件")
    }
    fs.mkdirSync(path.dirname(this.DB_PATH), { recursive: true })
    fs.writeFileSync(tmp, buf)

    if (this._opened) {
      await this.#mergeRemote(tmp)
    } else {
      // 旧库与 WAL 边车一并清掉再换入新文件，避免新库配旧 WAL
      for (const suffix of ["", "-wal", "-shm"]) {
        try { fs.rmSync(this.DB_PATH + suffix, { force: true }) } catch {}
      }
      fs.renameSync(tmp, this.DB_PATH)
    }
    fs.writeFileSync(this.VERSION_JSON_PATH, JSON.stringify(remoteInfo, null, 2), "utf8")
  }

  /** 把临时库 ATTACH 到现有连接，按唯一键去重合并两张表 */
  async #mergeRemote(tmp) {
    const db = await this._db()
    await this.migrate()
    await db.run(`ATTACH DATABASE '${tmp.replace(/'/g, "''")}' AS gp_remote`)
    try {
      await db.run(`INSERT OR IGNORE INTO main (game, version, size, time) SELECT game, version, size, time FROM gp_remote.main`)
      await db.run(`INSERT OR IGNORE INTO pre (game, ver, oldver, size, time) SELECT game, ver, oldver, size, time FROM gp_remote.pre`)
    } finally {
      try { await db.run(`DETACH DATABASE gp_remote`) } catch {}
      try { fs.rmSync(tmp, { force: true }) } catch {}
    }
  }
}

const db = new YngDbDriver(null)

async function sendGroupMsg(botId, gid, msg, _pushChangeType) {
  try {
    // msg 可能是字符串，也可能是 ctx.render 产出的图片段（type:"image"），
    // 框架 sendMessage 直接接受消息段，不能字符串化
    const content = typeof msg === "string" ? msg : msg?.text ?? msg
    await _ctx
      .pickBot(botId)
      .sendMessage({ scene: "group", gid }, content)
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
  } catch {
    // 降级为拼接文本
  }
  return msgs.map((m) => (typeof m === "string" ? m : m?.text ?? String(m))).join("\n---\n")
}

/**
 * 渲染模板为图片段
 *
 * 旧约定把模板绝对路径放在 data.tplFile、模板名放第一个参数（对 yunzai-ng 无意义）；
 * 框架 ctx.render(template, data) 的 template 支持绝对路径原样通行，故取 tplFile 作模板。
 * pluResPath 等旧路径字段必须剔除：模板里 {{pluResPath}} 会被浏览器当作 URL，
 * 裸 Windows 路径加载不了；剔除后框架注入 file:///<资源根>/ 的正确值。
 */
async function render(_tplName, data) {
  try {
    if (_ctx.render) {
      if (data?.tplFile) {
        const { tplFile, pluResPath, fontsPath, htmlSavePath, ...rest } = data
        return await _ctx.render(tplFile, rest)
      }
      return await _ctx.render(_tplName, data)
    }
  } catch (err) {
    _logger.error("[GamePush-Plugin] 渲染失败", err)
  }
  // 无渲染器或渲染失败，降级返回 null（调用方发文本）
  return null
}

function normalizeEvent(e) {
  return {
    msg: e.text || "",
    isGroup: !!e.isGroup,
    groupId: String(e.group?.gid || ""),
    selfId: String(e.selfId || ""),
    userId: String(e.user?.uid || ""),
    reply: (msg, quote) => {
      const content = typeof msg === "string" ? msg : msg?.text ?? String(msg)
      return e.reply(content)
    },
    raw: e
  }
}

/**
 * 初始化 yunzai-ng 适配器
 *
 * 框架约定 ctx.dataDir = <data>/plugin/<插件名>（host.ts），数据库根
 * <data>/sql/<插件名> 由此反推，与 sql-sink 的落盘位置保持一致。
 * 数据库同步在后台启动、不阻塞 setup：慢网或挂死不会把插件加载卡住；
 * 首次 _db() 打开库前会 await 这个 promise，保证换文件先于任何连接打开。
 */
export function initAdapter(ctx) {
  _ctx = ctx
  _logger = ctx.logger ?? console
  // 共享的 model/components 文件里用的是裸 logger 全局（沿用 yunzai.js/karin.js 适配器的约定）；
  // yunzai-ng 内核无全局变量，这里补上，否则 autoCheck 等定时任务会抛 "logger is not defined"
  globalThis.logger ??= _logger
  _dataDir = ctx.dataDir ?? path.join(process.cwd(), "data", "plugin", "GamePush-Plugin")
  const sqlDir = path.join(path.resolve(_dataDir, "..", ".."), "sql", ctx.name ?? "GamePush-Plugin")
  db._ctx = ctx
  db.DB_PATH = path.join(sqlDir, "GamePush-Plugin.db")
  db.VERSION_JSON_PATH = path.join(sqlDir, "GamePush-Plugin-version.json")
  db._syncReady = db.checkDatabase(ctx.signal)
}

export default {
  BotName: "Yunzai-NG",
  get logger() { return _logger },
  kv,
  db,
  http: null,
  config: null,
  get dataDir() { return _dataDir },
  pluginRoot: "",
  sendGroupMsg,
  makeForward,
  render,
  normalizeEvent,
  plugin: null,
  segment: null,
  common: null
}
