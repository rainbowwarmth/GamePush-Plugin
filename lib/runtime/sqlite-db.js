import fs from "node:fs"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"
import fetch from "node-fetch"
import { PluginPackage } from "./detect.js"

/** 数据库基名：取插件 package.json 的 name，保证历史数据路径稳定 */
const DB_BASENAME = PluginPackage.name || "GamePush-Plugin"
const REMOTE_VERSION_URL =
  "https://cnb.cool/rainbowwarmth/resources/-/git/raw/main/GamePush-Plugin/GamePush-Plugin-version.json"
const DB_DOWNLOAD_URL =
  "https://cnb.cool/rainbowwarmth/resources/-/git/raw/main/GamePush-Plugin/GamePush-Plugin.db"
function getLogger() {
  return globalThis.logger ?? console
}

const tables = {
  main: {
    columns: { game: "TEXT NOT NULL", version: "TEXT NOT NULL", size: "TEXT", time: "TEXT" },
    key: ["game", "version"]
  },
  pre: {
    columns: { game: "TEXT NOT NULL", ver: "TEXT NOT NULL", oldver: "TEXT NOT NULL", size: "TEXT", time: "TEXT" },
    key: ["game", "ver", "oldver"]
  }
}

function quote(value) {
  return `"${String(value).replaceAll('"', '""')}"`
}

function now() {
  return new Date().toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  })
}

async function fetchWithTimeout(fetchImpl, url, timeout, signal) {
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal?.addEventListener("abort", abort, { once: true })
  if (signal?.aborted) controller.abort()
  const timer = setTimeout(() => controller.abort(), timeout)
  timer.unref?.()
  try {
    return await fetchImpl(url, { signal: controller.signal })
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener("abort", abort)
  }
}

function addMissingColumns(db, name, columns) {
  const known = new Set(db.prepare(`PRAGMA table_info(${quote(name)})`).all().map((row) => row.name))
  for (const [column, definition] of Object.entries(columns)) {
    if (!known.has(column)) db.exec(`ALTER TABLE ${quote(name)} ADD COLUMN ${quote(column)} ${definition}`)
  }
}

function ensureUniqueIndex(db, name, key) {
  const index = `gamepush_${name}_${key.join("_")}_unique`
  const group = key.map(quote).join(", ")
  db.exec(
    `DELETE FROM ${quote(name)} WHERE id NOT IN (` +
    `SELECT MIN(id) FROM ${quote(name)} GROUP BY ${group})`
  )
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS ${quote(index)} ON ${quote(name)} (${group})`)
}

function hasCompatibleTable(db, name, columns) {
  const table = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name)
  if (!table) return false
  const known = new Set(db.prepare(`PRAGMA table_info(${quote(name)})`).all().map((row) => row.name))
  return columns.every((column) => known.has(column))
}

/**
 * 创建基于 Node 内置 node:sqlite 的版本历史数据库。
 * 所有公开方法均保持异步，以兼容既有 rt.db 调用方。
 * @param {string} dataDir 数据库目录
 * @param {{signal?: AbortSignal, fetch?: typeof fetch, name?: string}} [options] 运行时选项
 */
export function createSqliteDb(dataDir, { signal, fetch: fetchImpl = fetch, name = DB_BASENAME } = {}) {
  const DB_PATH = path.join(dataDir, `${name}.db`)
  const VERSION_JSON_PATH = path.join(dataDir, `${name}-version.json`)
  let db = null
  let ready = null
  let chain = Promise.resolve()
  let pending = 0
  let closing = null
  let closed = false

  function enqueue(fn) {
    pending += 1
    const result = chain.then(fn)
    chain = result.then(() => {}, () => {}).finally(() => {
      pending -= 1
    })
    return result
  }

  function enqueueOperation(fn) {
    assertOpen()
    return enqueue(fn)
  }

  function assertOpen() {
    if (closed) throw new Error(`${name} 数据库已关闭`)
  }

  function getDb() {
    if (db) return db
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })
    db = new DatabaseSync(DB_PATH)
    db.exec("PRAGMA foreign_keys = ON")
    db.exec("PRAGMA busy_timeout = 5000")
    return db
  }

  function migrate() {
    const local = getDb()
    for (const [name, { columns, key }] of Object.entries(tables)) {
      local.exec(
        `CREATE TABLE IF NOT EXISTS ${quote(name)} (id INTEGER PRIMARY KEY AUTOINCREMENT, ${Object.entries(columns).map(([column, definition]) => `${quote(column)} ${definition}`).join(", ")}, UNIQUE (${key.map(quote).join(", ")}))`
      )
      addMissingColumns(local, name, columns)
      ensureUniqueIndex(local, name, key)
    }
  }

  function ensureReady() {
    assertOpen()
    ready ??= enqueueOperation(() => migrate()).catch((error) => {
      ready = null
      throw error
    })
    return ready
  }

  async function importDatabase(sourcePath) {
    if (!fs.existsSync(sourcePath) || path.resolve(sourcePath) === path.resolve(DB_PATH)) return false
    await ensureReady()
    return enqueueOperation(() => {
      const local = getDb()
      const remote = new DatabaseSync(sourcePath, { readOnly: true })
      try {
        local.exec("BEGIN IMMEDIATE")
        for (const [name, { key }] of Object.entries(tables)) {
          const columns = ["game", ...key.filter((column) => column !== "game"), "size", "time"]
          if (!hasCompatibleTable(remote, name, columns)) continue
          const insert = local.prepare(`INSERT OR IGNORE INTO ${quote(name)} (${columns.map(quote).join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`)
          for (const row of remote.prepare(`SELECT ${columns.map(quote).join(", ")} FROM ${quote(name)}`).iterate()) {
            insert.run(...columns.map((column) => row[column]))
          }
        }
        local.exec("COMMIT")
        return true
      } catch (error) {
        try { local.exec("ROLLBACK") } catch {}
        throw error
      } finally {
        remote.close()
      }
    })
  }

  function readLocalVersion() {
    try {
      return JSON.parse(fs.readFileSync(VERSION_JSON_PATH, "utf8"))?.version ?? null
    } catch {
      return null
    }
  }

  async function fetchRemoteInfo() {
    const versionResponse = await fetchWithTimeout(fetchImpl, REMOTE_VERSION_URL, 10_000, signal)
    if (!versionResponse.ok) throw new Error(`获取远程版本信息失败（HTTP ${versionResponse.status}）`)
    return versionResponse.json()
  }

  async function downloadAndMerge(remoteInfo) {
    const databaseResponse = await fetchWithTimeout(fetchImpl, DB_DOWNLOAD_URL, 60_000, signal)
    if (!databaseResponse.ok) throw new Error(`下载数据库失败（HTTP ${databaseResponse.status}）`)
    const buffer = Buffer.from(await databaseResponse.arrayBuffer())
    if (buffer.length < 16 || buffer.subarray(0, 16).toString("latin1") !== "SQLite format 3\0") {
      throw new Error("下载数据不是有效的 SQLite 文件")
    }

    const temporaryPath = `${DB_PATH}.download`
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })
    fs.writeFileSync(temporaryPath, buffer)
    try {
      await importDatabase(temporaryPath)
      fs.writeFileSync(VERSION_JSON_PATH, JSON.stringify(remoteInfo, null, 2), "utf8")
      return remoteInfo.version || "未知"
    } finally {
      try { fs.rmSync(temporaryPath, { force: true }) } catch {}
    }
  }

  /** 强制拉取远端库并合并（#更新游戏版本数据 命令用），返回远端数据版本号 */
  async function updateDatabase() {
    return downloadAndMerge(await fetchRemoteInfo())
  }

  /**
   * 增量同步：本地缺库、或本地版本落后于远端时才下载合并。
   * @returns {Promise<{updated: boolean, version: string|null, from: string|null}>}
   */
  async function syncRemote() {
    const from = readLocalVersion()
    const remoteInfo = await fetchRemoteInfo()
    if (fs.existsSync(DB_PATH) && from && from === remoteInfo?.version) {
      return { updated: false, version: from, from }
    }
    return { updated: true, version: await downloadAndMerge(remoteInfo), from }
  }

  /**
   * 启动时同步远端版本数据。失败只记日志不抛出——网络不通时回落本地库，
   * 不能因此阻断插件加载。调用方无需 await。
   */
  async function startupSync() {
    try {
      const { updated, version, from } = await syncRemote()
      if (!updated) {
        getLogger().info(`[${name}] 版本数据已是最新: ${version}`)
      } else {
        getLogger().info(`[${name}] 已同步远程版本数据: ${from ? `${from} → ${version}` : version}`)
      }
    } catch (error) {
      getLogger().warn(`[${name}] 同步远程版本数据失败，暂用本地数据: ${error.message}`)
    }
  }

  async function storeMainSizeData(game, version, size) {
    await ensureReady()
    return enqueueOperation(() => {
      const result = getDb().prepare("INSERT OR IGNORE INTO main (game, version, size, time) VALUES (?, ?, ?, ?)").run(game, version, size, now())
      if (result.changes) getLogger().debug(`[${name}] main 表新增: ${game}-${version} | ${size}`)
      return result.changes > 0
    })
  }

  async function storePreSizeData(game, ver, oldver, size) {
    await ensureReady()
    return enqueueOperation(() => {
      const result = getDb().prepare("INSERT OR IGNORE INTO pre (game, ver, oldver, size, time) VALUES (?, ?, ?, ?, ?)").run(game, ver, oldver, size, now())
      if (result.changes) getLogger().debug(`[${name}] pre 表新增: ${game}-${ver} | old: ${oldver} | ${size}`)
      return result.changes > 0
    })
  }

  async function getMainData(game, version = null) {
    await ensureReady()
    return enqueueOperation(() => version
      ? getDb().prepare("SELECT * FROM main WHERE game = ? AND version = ?").all(game, version)
      : getDb().prepare("SELECT * FROM main WHERE game = ?").all(game))
  }

  async function getPreData(game, ver = null) {
    await ensureReady()
    return enqueueOperation(() => ver
      ? getDb().prepare("SELECT * FROM pre WHERE game = ? AND ver = ?").all(game, ver)
      : getDb().prepare("SELECT * FROM pre WHERE game = ?").all(game))
  }

  function close() {
    if (closing) return closing
    closing = (async () => {
      await Promise.resolve()
      while (pending > 0) await chain
      closed = true
      if (db) {
        db.close()
        db = null
        ready = null
      }
    })()
    return closing
  }

  return {
    DB_DOWNLOAD_URL,
    DB_PATH,
    VERSION_JSON_PATH,
    updateDatabase,
    syncRemote,
    startupSync,
    importDatabase,
    close,
    storeMainSizeData,
    storePreSizeData,
    getMainData,
    getPreData
  }
}
