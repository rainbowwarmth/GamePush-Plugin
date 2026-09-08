import path from "path"
import fs from "fs"
import { common } from "#GamePush.lib"
import { Sequelize, DataTypes } from "sequelize"
import { pluginName, BotName, request } from "#GamePush.components"

class GamePushDB {
  REMOTE_VERSION_URL =
    "https://cnb.cool/rainbowwarmth/resources/-/git/raw/main/GamePush-Plugin/GamePush-Plugin-version.json"

  DB_DOWNLOAD_URL =
    "https://cnb.cool/rainbowwarmth/resources/-/git/raw/main/GamePush-Plugin/GamePush-Plugin.db"

  constructor() {
    this.DB_DIR = path.join(
      process.cwd(),
      BotName === "Karin" ? "@karinjs/karin-plugin-gamepush/data" : "data"
    )
    this.DB_PATH = path.join(this.DB_DIR, "GamePush-Plugin.db")
    this.VERSION_JSON_PATH = path.join(this.DB_DIR, "GamePush-Plugin-version.json")

    this.initPromise = null
  }

  async ensureInitialized() {
    // 失败时清空缓存，让下一次调用可以重试（否则一次网络失败会永久缓存 reject）
    this.initPromise ??= this.initialize().then(
      () => true,
      (err) => {
        this.initPromise = null
        throw err
      }
    )
    return this.initPromise
  }

  ensureDirExists() {
    if (!fs.existsSync(this.DB_DIR)) {
      fs.mkdirSync(this.DB_DIR, { recursive: true })
      logger.debug(`[${pluginName}] 📂 创建数据库目录: ${this.DB_DIR}`)
    }
  }

  async fetchRemoteVersionInfo() {
    try {
      logger.debug(`[${pluginName}] 🌐 获取远程版本信息...`)
      const res = await request.get(this.REMOTE_VERSION_URL, {
        responseType: "json",
        log: true
      })
      if (!res) throw new Error("请求返回空")
      logger.debug(`[${pluginName}] ✅ 远程版本: ${res.version}`)
      return res
    } catch (err) {
      logger.error(`[${pluginName}] ❌ 获取远程版本失败`, err)
      throw err
    }
  }

  async downloadDatabase() {
    this.ensureDirExists()
    logger.debug(`[${pluginName}] ⬇️ 下载数据库文件...`)
    await common.downFile(this.DB_DOWNLOAD_URL, this.DB_PATH)
  }

  saveLocalVersionInfo(info) {
    try {
      fs.writeFileSync(this.VERSION_JSON_PATH, JSON.stringify(info, null, 2))
      logger.debug(`[${pluginName}] 💾 本地版本已更新: ${info.version}`)
    } catch (err) {
      logger.error(`[${pluginName}] ❌ 保存本地版本失败`, err)
    }
  }

  async checkDatabase() {
    this.ensureDirExists()
    const dbExists = fs.existsSync(this.DB_PATH)
    const versionFileExists = fs.existsSync(this.VERSION_JSON_PATH)

    let remoteInfo = null
    try {
      remoteInfo = await this.fetchRemoteVersionInfo()
    } catch {
      if (dbExists) return true
    }

    let localInfo = versionFileExists
      ? JSON.parse(fs.readFileSync(this.VERSION_JSON_PATH, "utf8") || "{}")
      : {}

    const needDownload = !dbExists || (remoteInfo && localInfo.version !== remoteInfo.version)

    if (needDownload) {
      await this.downloadDatabase()
      this.saveLocalVersionInfo(
        remoteInfo || {
          ...localInfo,
          version: localInfo.version + "_local" || `v${new Date().toISOString().slice(0, 10)}`
        }
      )
    }

    return true
  }

  defineModel(name, fields) {
    return this.sequelize.define(name, fields, {
      tableName: name,
      timestamps: false,
      freezeTableName: true
    })
  }

  initializeModels() {
    this.MainModel = this.defineModel("main", {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      game: { type: DataTypes.STRING, allowNull: false },
      version: { type: DataTypes.STRING, allowNull: false },
      size: { type: DataTypes.STRING, allowNull: true },
      time: { type: DataTypes.TEXT, allowNull: true }
    })

    this.PreModel = this.defineModel("pre", {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      game: { type: DataTypes.STRING, allowNull: false },
      ver: { type: DataTypes.STRING, allowNull: false },
      oldver: { type: DataTypes.STRING, allowNull: false },
      size: { type: DataTypes.STRING, allowNull: true },
      time: { type: DataTypes.TEXT, allowNull: true }
    })
  }

  async initialize() {
    await this.checkDatabase()

    this.sequelize = new Sequelize({
      dialect: "sqlite",
      storage: this.DB_PATH,
      logging: false,
      define: { freezeTableName: true, timestamps: false },
      dialectOptions: { foreign_keys: "ON" },
      pool: { max: 1, min: 0, idle: 10_000 }
    })

    await this.sequelize.authenticate()
    // 与运行时适配器共用同一库文件，撞锁时等待重试而不是立刻 SQLITE_BUSY
    await this.sequelize.query("PRAGMA busy_timeout = 5000")
    logger.debug(`[${pluginName}] 📊 数据库连接成功: ${this.DB_PATH}`)

    this.initializeModels()
    // 不用 sync({alter: true})：SQLite 的 alter 会重建表，与运行时适配器
    // 的建表并发时会互相踩（no such table）；缺表用 sync() 建即可
    await this.sequelize.sync()
    logger.debug(`[${pluginName}] ✅ 数据库模型同步完成`)
  }

  async storeMainSizeData(game, version, size) {
    await this.ensureInitialized()
    const Time = new Date().toLocaleString("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    })
    const [record, created] = await this.MainModel.findOrCreate({
      where: { game, version },
      defaults: { size, time: Time }
    })
    if (created) logger.debug(`[${pluginName}] 💾 main 表新增: ${game}-${version} | ${size}`)
    return created
  }

  async storePreSizeData(game, ver, oldver, size) {
    await this.ensureInitialized()
    const Time = new Date().toLocaleString("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    })
    const [record, created] = await this.PreModel.findOrCreate({
      where: { game, ver, oldver },
      defaults: { size, time: Time }
    })
    if (created)
      logger.debug(`[${pluginName}] 💾 pre 表新增: ${game}-${ver} | old: ${oldver} | ${size}`)
    return created
  }

  /**
   * 获取main表数据
   * @param {string} game - 游戏ID
   * @param {string} [version] - 可选，指定版本号
   * @returns {Promise<Array>} 返回匹配的数据记录
   */
  async getMainData(game, version = null) {
    await this.ensureInitialized()
    return this.MainModel.findAll({ where: { game, ...(version && { version }) } })
  }

  /**
   * 获取pre表数据
   * @param {string} game - 游戏ID
   * @param {string} [ver] - 可选，指定预下载版本号
   * @returns {Promise<Array>} 返回匹配的数据记录
   */
  async getPreData(game, ver = null) {
    await this.ensureInitialized()
    return this.PreModel.findAll({ where: { game, ...(ver && { ver }) } })
  }

  async close() {
    if (this.sequelize) {
      await this.sequelize.close()
      logger.info(`[${pluginName}] 🔌 数据库连接已关闭`)
    }
  }
}

const dbInstance = new GamePushDB()
const dbPromise = BotName === "Yunzai-NG"
  ? Promise.resolve(dbInstance)
  : dbInstance.ensureInitialized().then(() => dbInstance)

// dbPromise 无直接消费方，标记 rejection 已处理避免 unhandledRejection 噪音
dbPromise.catch((err) => {
  logger.error(`[${pluginName}] ❌ 数据库初始化失败: ${err.message}`)
})

export default dbPromise
