/**
 * 自管 SQLite 存储（云崽系 / Karin / JiuLi）
 */
import fs from "node:fs"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"
import fetch from "node-fetch"
import { PluginPackage } from "./detect.js"
import { createStore, TABLES, EXTRA_COLUMNS, quote, tableDDL } from "./store.js"

/** 数据库基名：取插件 package.json 的 name，保证历史数据路径稳定 */
const DB_BASENAME = PluginPackage.name || "GamePush-Plugin"

/**
 * 建表 + 补列 + 唯一索引兜底
 *
 * 旧版本自管库可能没有唯一索引；`INSERT OR IGNORE` 只认约束，不补索引就会插重复。
 * @param {DatabaseSync} db 连接
 * @param {string} table 表名
 */
function migrate(db, table) {
  db.exec(tableDDL(table))

  const known = new Set(
    db
      .prepare(`PRAGMA table_info(${quote(table)})`)
      .all()
      .map(row => row.name)
  )
  for (const [column, definition] of Object.entries(EXTRA_COLUMNS[table])) {
    if (!known.has(column)) db.exec(`ALTER TABLE ${quote(table)} ADD COLUMN ${quote(column)} ${definition}`)
  }

  const { key } = TABLES[table]
  const index = `gamepush_${table}_${key.join("_")}_unique`
  const group = key.map(quote).join(", ")
  db.exec(
    `DELETE FROM ${quote(table)} WHERE id NOT IN (SELECT MIN(id) FROM ${quote(table)} GROUP BY ${group})`
  )
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS ${quote(index)} ON ${quote(table)} (${group})`)
}

/**
 * 创建 node:sqlite driver
 *
 * node:sqlite 是同步 API，但对外统一返回 Promise；所有写操作经一条串行链排队，
 * 避免两个异步流程交错到同一个事务里。
 * @param {{dataDir: string, name: string}} options 参数
 * @returns {object} driver
 */
function createNodeSqliteDriver({ dataDir, name }) {
  const location = path.join(dataDir, `${name}.db`)
  let db = null
  let ready = null
  let chain = Promise.resolve()
  let pending = 0
  let closed = false

  /**
   * 确认连接未关闭
   */
  function assertOpen() {
    if (closed) throw new Error(`${name} 数据库已关闭`)
  }

  /**
   * 把操作排进串行链
   * @param {Function} fn 操作
   * @returns {Promise<any>} 结果
   */
  function enqueue(fn) {
    pending += 1
    const result = chain.then(fn)
    chain = result
      .then(
        () => {},
        () => {}
      )
      .finally(() => {
        pending -= 1
      })
    return result
  }

  /**
   * 取连接（首次调用时打开并按需建表）
   * @returns {DatabaseSync} 连接
   */
  function getDb() {
    if (db) return db
    fs.mkdirSync(path.dirname(location), { recursive: true })
    db = new DatabaseSync(location)
    db.exec("PRAGMA foreign_keys = ON")
    db.exec("PRAGMA busy_timeout = 5000")
    return db
  }

  return {
    name,
    stateDir: dataDir,
    location,

    async ready() {
      assertOpen()
      ready ??= enqueue(() => {
        const local = getDb()
        for (const table of Object.keys(TABLES)) migrate(local, table)
      }).catch(error => {
        ready = null
        throw error
      })
      return ready
    },

    async all(sql, params = []) {
      assertOpen()
      return enqueue(() => getDb().prepare(sql).all(...params))
    },

    async run(sql, params = []) {
      assertOpen()
      return enqueue(() => getDb().prepare(sql).run(...params))
    },

    async transaction(fn) {
      assertOpen()
      return enqueue(async () => {
        const local = getDb()
        local.exec("BEGIN IMMEDIATE")
        try {
          const result = await fn({
            all: async (sql, params = []) => local.prepare(sql).all(...params),
            run: async (sql, params = []) => local.prepare(sql).run(...params)
          })
          local.exec("COMMIT")
          return result
        } catch (error) {
          try {
            local.exec("ROLLBACK")
          } catch {
            /* 回滚失败时保留原始错误 */
          }
          throw error
        }
      })
    },

    async exists() {
      return fs.existsSync(location)
    },

    async close() {
      await Promise.resolve()
      while (pending > 0) await chain
      closed = true
      if (db) {
        db.close()
        db = null
        ready = null
      }
    }
  }
}

/**
 * 创建自管数据库门面
 * @param {string} dataDir 数据库目录
 * @param {{signal?: AbortSignal, fetch?: Function, name?: string}} [options] 运行时选项
 * @returns {object} rt.db 兼容接口
 */
export function createSqliteDb(dataDir, { signal, fetch: fetchImpl = fetch, name = DB_BASENAME } = {}) {
  const driver = createNodeSqliteDriver({ dataDir, name })
  return createStore(driver, { fetch: fetchImpl, signal })
}
