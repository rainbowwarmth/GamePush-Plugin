/**
 * Yunzai / Karin 共用的 SQLite 版本库驱动
 *
 * main 表存正式包各版本大小，pre 表存预下载包各版本大小。
 * 表结构以本地模型为准（远程库作为种子数据，缺表/缺列时按需补齐）。
 *
 * 注意：不要用 sync({ alter: true })。SQLite 方言的 alter 会对每一列执行
 * "建备份表-拷贝-删原表-重建" 的完整重建，既慢，又会在多个游戏通知并发
 * 触发时互相删表（曾导致 SQLITE_ERROR: no such table: main 并丢失表数据）。
 * 这里改为：进程内 memoize 一次 sync()（缺表则建）+ addColumn（缺列则补，
 * 走 SQLite 原生 ALTER TABLE ADD COLUMN，无表重建）。
 */
import fs from "node:fs"
import path from "node:path"
import fetch from "node-fetch"
import { Sequelize, DataTypes } from "sequelize"
import { pluginName } from "../../components/path.js"

const logger = globalThis.logger ?? console

const REMOTE_VERSION_URL =
  "https://cnb.cool/rainbowwarmth/resources/-/git/raw/main/GamePush-Plugin/GamePush-Plugin-version.json"
const DB_DOWNLOAD_URL =
  "https://cnb.cool/rainbowwarmth/resources/-/git/raw/main/GamePush-Plugin/GamePush-Plugin.db"

const MainDef = {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  game: { type: DataTypes.STRING, allowNull: false },
  version: { type: DataTypes.STRING, allowNull: false },
  size: { type: DataTypes.STRING, allowNull: true },
  time: { type: DataTypes.TEXT, allowNull: true }
}
const PreDef = {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  game: { type: DataTypes.STRING, allowNull: false },
  ver: { type: DataTypes.STRING, allowNull: false },
  oldver: { type: DataTypes.STRING, allowNull: false },
  size: { type: DataTypes.STRING, allowNull: true },
  time: { type: DataTypes.TEXT, allowNull: true }
}
const tableDefs = { main: MainDef, pre: PreDef }

async function fetchWithTimeout(url, timeout = 15_000) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeout)
  timer.unref?.()
  try {
    return await fetch(url, { signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
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

/**
 * 创建一个基于本地 SQLite 文件的 db 接口
 * @param {string} dataDir - 数据目录
 * @returns {object} rt.db 兼容接口（含 updateDatabase）
 */
export function createSqliteDb(dataDir) {
  const DB_PATH = path.join(dataDir, "GamePush-Plugin.db")
  const VERSION_JSON_PATH = path.join(dataDir, "GamePush-Plugin-version.json")

  let _sequelize = null
  let _ready = null
  let _chain = Promise.resolve()

  /**
   * 串行队列：node-sqlite3 在同一连接上并发执行语句会 SQLITE_BUSY
   * （busy_timeout 对同连接锁不生效），所有库操作排队执行
   */
  function enqueue(fn) {
    const result = _chain.then(fn)
    _chain = result.then(
      () => {},
      () => {}
    )
    return result
  }

  async function getSequelize() {
    if (_sequelize) return _sequelize
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })
    _sequelize = new Sequelize({
      dialect: "sqlite",
      storage: DB_PATH,
      logging: false,
      define: { freezeTableName: true, timestamps: false },
      dialectOptions: { foreign_keys: "ON" },
      // 单连接：避免多连接并发写撞锁（另一个进程内实例换文件时也占文件句柄）
      pool: { max: 1, min: 0, idle: 10_000 }
    })
    await _sequelize.authenticate()
    return _sequelize
  }

  /** 建表/补列，进程内只跑一次；失败时清缓存让下次重试 */
  function ensureTables() {
    _ready ??= enqueue(async () => {
      const seq = await getSequelize()
      // 跨实例（如启动期下载器）持锁时重试等待，而非立刻 SQLITE_BUSY
      await seq.query("PRAGMA busy_timeout = 5000")
      const models = {}
      for (const [name, def] of Object.entries(tableDefs)) {
        models[name] = seq.define(name, def, {
          tableName: name,
          freezeTableName: true,
          timestamps: false
        })
      }
      await seq.sync()
      for (const [name, def] of Object.entries(tableDefs)) {
        const columns = await seq.getQueryInterface().describeTable(name)
        for (const field of Object.keys(def)) {
          if (field === "id") continue
          if (!columns[field]) {
            await seq.getQueryInterface().addColumn(name, field, def[field])
          }
        }
      }
      return models
    }).catch((err) => {
      _ready = null
      throw err
    })
    return _ready
  }

  async function getModel(name) {
    const models = await ensureTables()
    return models[name]
  }

  /**
   * #更新游戏版本数据：拉取远程库并按唯一键合并进本地表。
   * 合并而非整文件替换——本地连接持有文件句柄时替换在 Windows 上会失败，
   * 且替换会丢掉本地已积累的版本大小记录。
   * @returns {Promise<string>} 新的数据版本号
   */
  async function updateDatabase() {
    // 网络 IO 在队列外，避免下载期间阻塞通知写库
    const versionRes = await fetchWithTimeout(REMOTE_VERSION_URL, 10_000)
    if (!versionRes.ok) throw new Error(`获取远程版本信息失败（HTTP ${versionRes.status}）`)
    const remoteInfo = await versionRes.json()

    const dbRes = await fetchWithTimeout(DB_DOWNLOAD_URL, 60_000)
    if (!dbRes.ok) throw new Error(`下载数据库失败（HTTP ${dbRes.status}）`)
    const buf = Buffer.from(await dbRes.arrayBuffer())
    if (buf.length < 16 || buf.slice(0, 16).toString("latin1") !== "SQLite format 3\0") {
      throw new Error("下载数据不是有效的 SQLite 文件")
    }

    const tmp = `${DB_PATH}.download`
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })
    fs.writeFileSync(tmp, buf)

    try {
      const models = await ensureTables()
      await enqueue(async () => {
        const tmpSeq = new Sequelize({ dialect: "sqlite", storage: tmp, logging: false })
        try {
          const tables = await tmpSeq.query(
            "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('main', 'pre')"
          )
          if (tables[0].length) {
            const mains = await tmpSeq.query(
              "SELECT game, version, size, time FROM main"
            )
            for (const row of mains[0]) {
              await models.main.findOrCreate({
                where: { game: row.game, version: row.version },
                defaults: { size: row.size, time: row.time }
              })
            }
            const pres = await tmpSeq.query(
              "SELECT game, ver, oldver, size, time FROM pre"
            )
            for (const row of pres[0]) {
              await models.pre.findOrCreate({
                where: { game: row.game, ver: row.ver, oldver: row.oldver },
                defaults: { size: row.size, time: row.time }
              })
            }
          }
        } finally {
          await tmpSeq.close()
        }
      })
    } finally {
      try {
        fs.rmSync(tmp, { force: true })
      } catch {}
    }

    fs.writeFileSync(VERSION_JSON_PATH, JSON.stringify(remoteInfo, null, 2))
    return remoteInfo.version || "未知"
  }

  return {
    DB_DOWNLOAD_URL,
    DB_PATH,
    VERSION_JSON_PATH,
    updateDatabase,

    async storeMainSizeData(game, version, size) {
      const Main = await getModel("main")
      return enqueue(() =>
        Main.findOrCreate({
          where: { game, version },
          defaults: { size, time: now() }
        }).then(([, created]) => {
          if (created)
            logger.debug(`[${pluginName}] main 表新增: ${game}-${version} | ${size}`)
          return created
        })
      )
    },

    async storePreSizeData(game, ver, oldver, size) {
      const Pre = await getModel("pre")
      return enqueue(() =>
        Pre.findOrCreate({
          where: { game, ver, oldver },
          defaults: { size, time: now() }
        }).then(([, created]) => {
          if (created)
            logger.debug(`[${pluginName}] pre 表新增: ${game}-${ver} | old: ${oldver} | ${size}`)
          return created
        })
      )
    },

    async getMainData(game, version = null) {
      const Main = await getModel("main")
      return enqueue(() => Main.findAll({ where: { game, ...(version && { version }) } }))
    },

    async getPreData(game, ver = null) {
      const Pre = await getModel("pre")
      return enqueue(() => Pre.findAll({ where: { game, ...(ver && { ver }) } }))
    }
  }
}
