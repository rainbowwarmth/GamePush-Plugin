/**
 * 版本历史存储层
 */
import fs from "node:fs"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"
import fetch from "node-fetch"

/** 远程数据源基址 */
const REMOTE_BASE = "https://cnb.cool/rainbowwarmth/resources/-/git/raw/main/GamePush-Plugin"

/** 远程版本信息 */
export const REMOTE_VERSION_URL = `${REMOTE_BASE}/GamePush-Plugin-version.json`

/** 远程数据库 */
export const DB_DOWNLOAD_URL = `${REMOTE_BASE}/GamePush-Plugin.db`

/** SQLite 文件头，用来挡住 HTML 错误页 / 空响应 */
const SQLITE_MAGIC = "SQLite format 3\0"

/** 表结构：初版字段，与历史库保持一致 */
export const TABLES = {
  main: {
    columns: { game: "TEXT NOT NULL", version: "TEXT NOT NULL", size: "TEXT", time: "TEXT" },
    key: ["game", "version"]
  },
  pre: {
    columns: { game: "TEXT NOT NULL", ver: "TEXT NOT NULL", oldver: "TEXT NOT NULL", size: "TEXT", time: "TEXT" },
    key: ["game", "ver", "oldver"]
  }
}

/** 当前全部业务字段（读写都用它，新增字段追加到末尾） */
export const FIELDS = {
  main: ["game", "version", "size", "time", "synced_at"],
  pre: ["game", "ver", "oldver", "size", "time", "synced_at"]
}

/** 初版之后新增的列，由迁移补齐 */
export const EXTRA_COLUMNS = {
  main: { synced_at: "INTEGER" },
  pre: { synced_at: "INTEGER" }
}

/**
 * 取日志器
 * @returns {object} 日志器
 */
function getLogger() {
  return globalThis.logger ?? console
}

/**
 * SQLite 标识符加引号
 * @param {string} value 标识符
 * @returns {string} 加引号后的标识符
 */
export function quote(value) {
  return `"${String(value).replaceAll('"', '""')}"`
}

/**
 * 生成建表语句（初版结构，含唯一约束）
 * @param {string} table 表名
 * @returns {string} DDL
 */
export function tableDDL(table) {
  const { columns, key } = TABLES[table]
  const columnSql = Object.entries(columns)
    .map(([column, definition]) => `${quote(column)} ${definition}`)
    .join(", ")
  return (
    `CREATE TABLE IF NOT EXISTS ${quote(table)} (` +
    `id INTEGER PRIMARY KEY AUTOINCREMENT, ${columnSql}, ` +
    `UNIQUE (${key.map(quote).join(", ")}))`
  )
}

/**
 * 当前时间文本（沿用历史库的格式，便于与旧记录对齐）
 * @returns {string} 形如 2026/09/23 20:40:00
 */
export function nowText() {
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

/**
 * 带超时的 fetch
 * @param {Function} fetchImpl fetch 实现
 * @param {string} url 地址
 * @param {number} timeout 超时毫秒
 * @param {AbortSignal} [signal] 外部中断信号
 * @returns {Promise<Response>} 响应
 */
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

/**
 * 判断 SQLite 库里是否存在某张表
 * @param {DatabaseSync} db 只读连接
 * @param {string} table 表名
 * @returns {boolean} 是否存在
 */
function hasTable(db, table) {
  return !!db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)
}

/**
 * 读取一个 .db 文件里的版本记录
 *
 * 远程库与其它框架的历史库列可能不全（远程没有 synced_at、旧自管库没有唯一索引），
 * 因此按列名取交集，缺列由写入侧补默认值 —— 不做 `SELECT *`。
 * @param {string} file 数据库文件
 * @returns {{main: object[], pre: object[]}} 记录
 */
export function readRows(file) {
  const source = new DatabaseSync(file, { readOnly: true })
  try {
    const rows = { main: [], pre: [] }
    for (const table of Object.keys(FIELDS)) {
      if (!hasTable(source, table)) continue
      const known = new Set(
        source
          .prepare(`PRAGMA table_info(${quote(table)})`)
          .all()
          .map(row => row.name)
      )
      const columns = FIELDS[table].filter(column => known.has(column))
      if (columns.length === 0) continue
      rows[table] = source
        .prepare(`SELECT ${columns.map(quote).join(", ")} FROM ${quote(table)}`)
        .all()
    }
    return rows
  } finally {
    source.close()
  }
}

/**
 * 创建存储门面
 *
 * driver 契约（全部异步，异常直接抛出）：
 *   - `ready()`：确保库与表就绪
 *   - `all(sql, params)` / `run(sql, params)`
 *   - `transaction(async tx => …)`，tx 提供同样的 all / run
 *   - `exists()`：库文件是否已存在
 *   - `close()`
 *   - `stateDir` / `location` / `name`
 *
 * @param {object} driver 存储驱动
 * @param {{fetch?: Function, signal?: AbortSignal}} [options] 运行时选项
 * @returns {object} 与原 rt.db 兼容的门面
 */
export function createStore(driver, { fetch: fetchImpl = fetch, signal } = {}) {
  const dbPath = driver.location
  const versionPath = path.join(driver.stateDir, `${driver.name}-version.json`)
  /** 进行中的同步；同进程内复用，避免并发下载与并发合并 */
  let inFlight = null

  /**
   * 读取本地记录的远端数据版本
   * @returns {object|null} 版本信息
   */
  function readLocalVersion() {
    try {
      return JSON.parse(fs.readFileSync(versionPath, "utf8")) ?? null
    } catch {
      return null
    }
  }

  /**
   * 写入远端数据版本
   *
   * 先写临时文件再 rename：进程在写一半时被杀，也不会留下无法解析的 JSON。
   * 解析失败会让下次启动误判为「本地无版本」而重下一遍，代价不大，但没有更好。
   * @param {object} info 版本信息
   */
  function writeLocalVersion(info) {
    fs.mkdirSync(driver.stateDir, { recursive: true })
    const temporaryPath = `${versionPath}.tmp`
    fs.writeFileSync(temporaryPath, JSON.stringify(info, null, 2), "utf8")
    fs.renameSync(temporaryPath, versionPath)
  }

  /**
   * 拉取远程版本信息
   * @returns {Promise<object>} 版本信息
   */
  async function fetchRemoteInfo() {
    const response = await fetchWithTimeout(fetchImpl, REMOTE_VERSION_URL, 10_000, signal)
    if (!response.ok) throw new Error(`获取远程版本信息失败（HTTP ${response.status}）`)
    return response.json()
  }

  /**
   * 下载远程数据库到临时文件
   * @returns {Promise<string>} 临时文件路径
   */
  async function download() {
    const response = await fetchWithTimeout(fetchImpl, DB_DOWNLOAD_URL, 60_000, signal)
    if (!response.ok) throw new Error(`下载数据库失败（HTTP ${response.status}）`)
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.length < 16 || buffer.subarray(0, 16).toString("latin1") !== SQLITE_MAGIC) {
      throw new Error("下载数据不是有效的 SQLite 文件")
    }
    const temporaryPath = `${dbPath}.download`
    fs.mkdirSync(path.dirname(temporaryPath), { recursive: true })
    fs.writeFileSync(temporaryPath, buffer)
    return temporaryPath
  }

  /**
   * 批量合并记录（只增不改，靠唯一约束去重）
   * @param {{main?: object[], pre?: object[]}} rows 记录
   * @returns {Promise<number>} 提交的记录数
   */
  async function mergeRows(rows) {
    const total = (rows.main?.length ?? 0) + (rows.pre?.length ?? 0)
    if (total === 0) return 0

    await driver.ready()
    const syncedAt = Date.now()
    await driver.transaction(async tx => {
      for (const table of Object.keys(FIELDS)) {
        const list = rows[table] ?? []
        if (list.length === 0) continue
        const fields = FIELDS[table]
        const sql =
          `INSERT OR IGNORE INTO ${quote(table)} (${fields.map(quote).join(", ")}) ` +
          `VALUES (${fields.map(() => "?").join(", ")})`
        for (const row of list) {
          await tx.run(
            sql,
            fields.map(field =>
              field === "synced_at" ? (row.synced_at ?? syncedAt) : (row[field] ?? null)
            )
          )
        }
      }
    })
    return total
  }

  /**
   * 同步远程数据
   *
   * 单飞：启动同步、手动命令、降级重试可能同时触发，重复下载不只是浪费流量 ——
   * 两个合并事务会把同一批行再试一遍（幂等但白占写锁），版本文件也会互相覆盖。
   * 因此同一时刻只跑一次；期间到达的强制请求，等当前这轮结束后再补一次。
   * @param {{force?: boolean}} [options] force 为真时忽略版本号强制下载
   * @returns {Promise<{updated: boolean, version: string|null, from: string|null}>} 同步结果
   */
  function sync(options = {}) {
    if (!inFlight) {
      inFlight = runSync(options).finally(() => {
        inFlight = null
      })
      return inFlight
    }
    return inFlight.then(result => {
      // 已经在同步了：非强制请求直接复用结果，强制请求在它结束后补跑
      if (options.force && !result.updated) return sync({ force: true })
      return result
    })
  }

  /**
   * 执行一次同步
   * @param {{force?: boolean}} [options] 同步选项
   * @returns {Promise<{updated: boolean, version: string|null, from: string|null}>} 同步结果
   */
  async function runSync({ force = false } = {}) {
    const from = readLocalVersion()
    const remoteInfo = await fetchRemoteInfo()
    const sameVersion = from && String(from.version) === String(remoteInfo?.version)
    if (!force && sameVersion && (await driver.exists())) {
      return { updated: false, version: from.version ?? null, from: from.version ?? null }
    }

    const temporaryPath = await download()
    try {
      await mergeRows(readRows(temporaryPath))
      writeLocalVersion(remoteInfo)
      return {
        updated: true,
        version: remoteInfo?.version ?? null,
        from: from?.version ?? null
      }
    } finally {
      // 只读打开 WAL 库会在旁边留下 -shm / -wal，三个都要清，否则每同步一次多两份垃圾
      for (const suffix of ["", "-shm", "-wal"]) {
        try {
          fs.rmSync(`${temporaryPath}${suffix}`, { force: true })
        } catch {
          /* 临时文件清理失败不影响结果 */
        }
      }
    }
  }

  /**
   * 强制拉取远端库并合并（命令用）
   * @returns {Promise<string>} 远端数据版本号
   */
  async function updateDatabase() {
    const { version } = await sync({ force: true })
    return version ?? "未知"
  }

  /**
   * 增量同步：本地缺库、或本地版本落后于远端时才下载合并
   * @returns {Promise<{updated: boolean, version: string|null, from: string|null}>} 同步结果
   */
  async function syncRemote() {
    return sync()
  }

  /**
   * 启动时同步。失败只记日志不抛出 —— 网络不通时回落本地库，不能阻断插件加载
   * @returns {Promise<void>}
   */
  async function startupSync() {
    try {
      const { updated, version, from } = await sync()
      if (!updated) {
        getLogger().info(`[${driver.name}] 版本数据已是最新: ${version}`)
      } else {
        getLogger().info(`[${driver.name}] 已同步远程版本数据: ${from ? `${from} → ${version}` : version}`)
      }
    } catch (error) {
      getLogger().warn(`[${driver.name}] 同步远程版本数据失败，暂用本地数据: ${error.message}`)
    }
  }

  /**
   * 从另一个 .db 只读导入记录（换框架、换存储位置时的一次性补齐）
   * @param {string} sourcePath 源库路径
   * @param {string} [markerPath] 完成标记文件，存在则跳过
   * @returns {Promise<boolean>} 本次是否导入了记录
   */
  async function importDatabase(sourcePath, markerPath) {
    if (!sourcePath || !fs.existsSync(sourcePath)) return false
    if (path.resolve(sourcePath) === path.resolve(dbPath)) return false
    if (markerPath && fs.existsSync(markerPath)) return false

    const imported = await mergeRows(readRows(sourcePath))
    if (markerPath && imported > 0) {
      fs.mkdirSync(path.dirname(markerPath), { recursive: true })
      fs.writeFileSync(markerPath, new Date().toISOString(), "utf8")
    }
    return imported > 0
  }

  /**
   * 写入一条记录
   * @param {string} table 表名
   * @param {object} record 记录
   * @returns {Promise<boolean>} 是否新增
   */
  async function insertRecord(table, record) {
    await driver.ready()
    const fields = FIELDS[table]
    const sql =
      `INSERT OR IGNORE INTO ${quote(table)} (${fields.map(quote).join(", ")}) ` +
      `VALUES (${fields.map(() => "?").join(", ")})`
    const result = await driver.run(
      sql,
      fields.map(field => record[field] ?? null)
    )
    return Number(result?.changes ?? 0) > 0
  }

  /**
   * 查询记录
   * @param {string} table 表名
   * @param {string} game 游戏 ID
   * @param {string|null} [version] 版本号
   * @returns {Promise<object[]>} 记录
   */
  async function selectRecords(table, game, version = null) {
    await driver.ready()
    const fields = FIELDS[table].map(quote).join(", ")
    const conditions = [`${quote("game")} = ?`]
    const params = [game]
    if (version !== null && version !== undefined) {
      conditions.push(`${quote(table === "main" ? "version" : "ver")} = ?`)
      params.push(version)
    }
    return driver.all(
      `SELECT ${fields} FROM ${quote(table)} WHERE ${conditions.join(" AND ")} ORDER BY ${quote("id")} ASC`,
      params
    )
  }

  /**
   * 记录正式版体积
   * @param {string} game 游戏 ID
   * @param {string} version 版本号
   * @param {string} size 体积
   * @returns {Promise<boolean>} 是否新增
   */
  async function storeMainSizeData(game, version, size) {
    return insertRecord("main", {
      game,
      version,
      size,
      time: nowText(),
      synced_at: Date.now()
    })
  }

  /**
   * 记录预下载体积
   * @param {string} game 游戏 ID
   * @param {string} ver 新版本号
   * @param {string} oldver 旧版本号
   * @param {string} size 增量体积
   * @returns {Promise<boolean>} 是否新增
   */
  async function storePreSizeData(game, ver, oldver, size) {
    return insertRecord("pre", {
      game,
      ver,
      oldver,
      size,
      time: nowText(),
      synced_at: Date.now()
    })
  }

  return {
    DB_DOWNLOAD_URL,
    DB_PATH: dbPath,
    VERSION_JSON_PATH: versionPath,
    updateDatabase,
    syncRemote,
    startupSync,
    importDatabase,
    close: () => driver.close(),
    storeMainSizeData,
    storePreSizeData,
    getMainData: (game, version = null) => selectRecords("main", game, version),
    getPreData: (game, ver = null) => selectRecords("pre", game, ver)
  }
}

/**
 * 生成 yunzai-ng 的迁移列表
 *
 * v1 重建历史表：旧库由 sequelize 建表，没有唯一约束，直接 `INSERT OR IGNORE` 不会去重，
 * 必须先重命名、按新结构重建、回灌（顺带去重）再删除旧表。
 * v2 追加 synced_at —— 新增字段只加列，不重建。
 * @returns {Array<{version: number, name: string, up: Function}>} 迁移列表
 */
export function buildMigrations() {
  return [
    {
      version: 1,
      name: "create-history-tables",
      async up(tx) {
        for (const table of Object.keys(TABLES)) {
          const legacy = `${table}__legacy_v1`
          const exists = await tx.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", [
            table
          ])
          if (!exists) {
            await tx.run(tableDDL(table))
            continue
          }

          await tx.run(`ALTER TABLE ${quote(table)} RENAME TO ${quote(legacy)}`)
          await tx.run(tableDDL(table))
          const known = new Set(
            (await tx.all(`PRAGMA table_info(${quote(legacy)})`)).map(row => row.name)
          )
          const columns = ["id", ...FIELDS[table]].filter(column => known.has(column))
          await tx.run(
            `INSERT OR IGNORE INTO ${quote(table)} (${columns.map(quote).join(", ")}) ` +
              `SELECT ${columns.map(quote).join(", ")} FROM ${quote(legacy)}`
          )
          await tx.run(`DROP TABLE ${quote(legacy)}`)
        }
      }
    },
    {
      version: 2,
      name: "add-synced-at",
      async up(tx) {
        for (const table of Object.keys(TABLES)) {
          const known = new Set((await tx.all(`PRAGMA table_info(${quote(table)})`)).map(row => row.name))
          for (const [column, definition] of Object.entries(EXTRA_COLUMNS[table])) {
            if (!known.has(column)) {
              await tx.run(`ALTER TABLE ${quote(table)} ADD COLUMN ${quote(column)} ${definition}`)
            }
          }
        }
        await tx.run(
          `CREATE INDEX IF NOT EXISTS gamepush_main_synced ON ${quote("main")} (${quote("synced_at")})`
        )
      }
    }
  ]
}
