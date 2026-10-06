import fs from "node:fs"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"
import fetch from "node-fetch"
import { PluginPackage, cwd, pluginResources } from "./detect.js"

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

/* ───────────────────────── 发行版数据（本地 resources 目录） ───────────────────────── */

/**
 * 发行版数据搜索起点（按序探测）：
 *   1. 框架根目录/resources
 *   2. 插件目录/resources
 *
 * 真正的数据根由 discoverReleaseRoots() 从这些起点向下标记出来——因为数据可能
 * 位于起点下若干层（例如框架根的 resources/ 里又 clone 了一个资源仓库，
 * 数据落在 <仓库>/GamePush-Plugin/<game>/main|pre/）。
 *
 * 目录约定：<数据根>/<game>/main/<版本号>.json、<数据根>/<game>/pre/<版本号>.json
 *   - 游戏名取自目录名，且必须是已知游戏，避免误认其他插件的资源目录
 *   - 版本号优先取 json 内的 version，缺省时回落文件名
 *   - json 可含 size / time；pre 需含 oldver（缺失则跳过该条）
 */
const RELEASE_ROOTS = [path.join(cwd, "resources"), pluginResources]

/** 发行版子目录名，与表名一一对应 */
const RELEASE_TYPES = ["main", "pre"]

/** 合法游戏目录名（只认这 6 个，防止把 http/ json/ 之类的资源目录当成游戏） */
const RELEASE_GAMES = new Set(["ys", "sr", "zzz", "bh3", "ww", "zmd"])

/** 从起点向下探测的最大层数 */
const RELEASE_MAX_DEPTH = 4

/** 探测时跳过的目录名 */
const RELEASE_SKIP = new Set([".git", "node_modules", "dist", "build"])

/** 宽松取字符串：undefined / null / 空串 一律归为 null */
function releaseText(value) {
  if (value === undefined || value === null) return null
  const text = String(value).trim()
  return text === "" ? null : text
}

/** 文件修改时间，格式与 now() 对齐；json 未带 time 时兜底 */
function fileTime(file) {
  try {
    return new Date(fs.statSync(file).mtime).toLocaleString("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    })
  } catch {
    return null
  }
}

/** 读取单个 json，解析失败一律当空对象 —— 个别文件损坏不该中断整批补齐 */
function readReleaseJson(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"))
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

/** 判断路径是否为目录 */
function isDirectory(target) {
  try {
    return fs.statSync(target).isDirectory()
  } catch {
    return false
  }
}

/** 目录下是否直接存在已知游戏的 main/ 或 pre/ 子目录 —— 即「这里就是数据根」 */
function hasReleaseLayout(dir) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return false
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || !RELEASE_GAMES.has(entry.name)) continue
    for (const type of RELEASE_TYPES) {
      if (isDirectory(path.join(dir, entry.name, type))) return true
    }
  }
  return false
}

/**
 * 从各个起点向下广度优先探测，收集所有数据根目录。
 *
 * 之所以要下探而不是直接在起点扫描：数据可能落在起点之下若干层
 * （框架根 resources/ 里再 clone 一个资源仓库，数据在其 GamePush-Plugin/ 下）。
 * 命中「含已知游戏 main|pre」的目录即视为数据根，且不再继续下探其子目录。
 *
 * @returns {string[]} 数据根绝对路径列表
 */
function discoverReleaseRoots() {
  const found = []
  const seen = new Set()
  const queue = []

  for (const base of RELEASE_ROOTS) {
    const resolved = path.resolve(base)
    if (seen.has(resolved)) continue
    seen.add(resolved)
    queue.push({ dir: resolved, depth: 0 })
  }

  while (queue.length) {
    const { dir, depth } = queue.shift()
    if (!isDirectory(dir)) continue
    if (hasReleaseLayout(dir)) {
      found.push(dir)
      continue
    }
    if (depth >= RELEASE_MAX_DEPTH) continue

    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const name = entry.name
      if (name.startsWith(".") || RELEASE_SKIP.has(name)) continue
      const child = path.resolve(dir, name)
      if (seen.has(child)) continue
      seen.add(child)
      queue.push({ dir: child, depth: depth + 1 })
    }
  }

  return found
}

/**
 * 扫描单个数据根，把识别到的记录并入 acc。
 * 游戏名取目录名；版本号优先取 json 的 version，缺省时回落文件名。
 */
function scanReleaseRoot(root, acc) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !RELEASE_GAMES.has(entry.name)) continue
    const game = entry.name
    let hit = false

    for (const type of RELEASE_TYPES) {
      const dir = path.join(root, game, type)
      if (!isDirectory(dir)) continue

      for (const file of fs.readdirSync(dir)) {
        if (!file.toLowerCase().endsWith(".json")) continue
        const full = path.join(dir, file)
        const payload = readReleaseJson(full)
        const version =
          releaseText(payload.version ?? payload.ver) ?? path.basename(file, path.extname(file))
        if (!version) continue

        const size = releaseText(payload.size)
        const time = releaseText(payload.time) ?? fileTime(full)

        if (type === "main") {
          acc.main.push({ game, version, size, time })
        } else {
          const oldver = releaseText(payload.oldver ?? payload.oldVer)
          if (!oldver) continue
          acc.pre.push({ game, ver: version, oldver, size, time })
        }
        hit = true
      }
    }

    if (hit) acc.games.add(game)
  }
}

/**
 * 汇总**所有**数据根里的发行版数据。
 * @returns {{roots: string[], main: Array, pre: Array, games: string[]}}
 */
function collectReleaseRows() {
  const acc = { main: [], pre: [], games: new Set() }
  const roots = discoverReleaseRoots()
  for (const root of roots) scanReleaseRoot(root, acc)

  return { roots, main: acc.main, pre: acc.pre, games: [...acc.games].sort() }
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

  /** 强制拉取远端稳定库并合并（#更新游戏版本数据 / #更新游戏版本数据稳定版 用），返回远端数据版本号 */
  async function updateDatabase() {
    return downloadAndMerge(await fetchRemoteInfo())
  }

  /**
   * 发行版补齐：扫描本地 resources 目录（<game>/main|pre/<版本号>.json），
   * 与本地库比对后**只补缺失行**（INSERT OR IGNORE），已存在的记录不动。
   * 与稳定版的区别：不联网、不覆盖，纯离线补齐；数据来源是随插件分发的本地快照。
   * @returns {Promise<{roots: string[], games: string[], scannedMain: number, scannedPre: number, addedMain: number, addedPre: number}>}
   */
  async function syncRelease() {
    const { roots, main, pre, games } = collectReleaseRows()
    if (!roots.length) throw new Error(`未找到发行版数据目录（已尝试：${RELEASE_ROOTS.join("、")}）`)
    if (!main.length && !pre.length) throw new Error(`发行版数据目录无有效记录：${roots.join("、")}`)

    await ensureReady()
    const { addedMain, addedPre } = await enqueueOperation(() => {
      const local = getDb()
      let addedMain = 0
      let addedPre = 0
      local.exec("BEGIN IMMEDIATE")
      try {
        const insertMain = local.prepare(
          "INSERT OR IGNORE INTO main (game, version, size, time) VALUES (?, ?, ?, ?)"
        )
        for (const row of main) addedMain += insertMain.run(row.game, row.version, row.size, row.time).changes

        const insertPre = local.prepare(
          "INSERT OR IGNORE INTO pre (game, ver, oldver, size, time) VALUES (?, ?, ?, ?, ?)"
        )
        for (const row of pre) addedPre += insertPre.run(row.game, row.ver, row.oldver, row.size, row.time).changes

        local.exec("COMMIT")
      } catch (error) {
        try { local.exec("ROLLBACK") } catch {}
        throw error
      }
      return { addedMain, addedPre }
    })

    if (addedMain || addedPre) {
      getLogger().debug(
        `[${name}] 发行版补齐：main +${addedMain} / pre +${addedPre}（扫描 ${main.length}/${pre.length}）`
      )
    }
    return { roots, games, scannedMain: main.length, scannedPre: pre.length, addedMain, addedPre }
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
    syncRelease,
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
