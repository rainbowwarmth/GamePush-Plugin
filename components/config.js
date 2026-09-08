import fs from "node:fs"
import path from "node:path"
import YAML from "yaml"
import { gameIds, getGameName } from "#GamePush.model"
import { BotName, pluginName } from "#GamePush.components"

// yunzai-ng 的数据目录约定是 data/plugin/<插件名>（即框架的 ctx.dataDir）
const CONFIG_DIR = BotName === "Karin"
  ? path.join(process.cwd(), "@karinjs/karin-plugin-gamepush/config")
  : BotName === "Yunzai-NG"
    ? path.join(process.cwd(), "data", "plugin", pluginName)
    : path.join(process.cwd(), "data")
const CONFIG_PATH = path.join(CONFIG_DIR, "GamePush-Plugin.yaml")
const DEFAULT_CRON = "0 0/5 * * * *"

// 本模块单例随 import 构造，早于 yunzai-ng 适配器补上 globalThis.logger。
// 用惰性代理：取值时才解析全局 logger —— import 期(全局未就绪)回落 console 不报错，
// 运行期(全局已就绪)仍走框架 logger。方法要 bind 回原对象，否则 this 变成代理
const logger = new Proxy(
  {},
  {
    get: (_t, k) => {
      const l = globalThis.logger ?? console
      const v = l[k]
      return typeof v === "function" ? v.bind(l) : v
    }
  }
)

class Config {
  configCache = {}
  watcher = null
  // yunzai-ng 内核配置句柄（ctx.config）。非空即表示配置读写走内核而非本地 fs。
  yngConfig = null

  constructor() {
    // yunzai-ng 下配置交由内核 ctx.config 托管（WebUI 面板可视化编辑，落盘 config/<插件名>.yaml），
    // 不在此建 data/plugin 文件、也不起 fs 监听 —— 等插件 setup 里调用 bindYng 注入句柄。
    // 先用默认值占位，避免 setup 之前被读到 undefined。
    if (BotName === "Yunzai-NG") {
      this.configCache = this.getDefaultConfig()
      return
    }
    this.init()
  }

  /**
   * yunzai-ng：绑定内核配置句柄
   * 绑定后配置读写全部改走 ctx.config —— 面板保存、YAML 手改、插件内改动共用同一份，
   * 不再各写各的文件。首次接入时把旧 data/plugin 配置迁移进内核，避免丢已配置的推送群。
   */
  bindYng(handle) {
    this.yngConfig = handle
    const kernelValue = handle.get()

    if (!Config.hasAnyPushGroup(kernelValue)) {
      const legacy = this.readLegacyYng()
      if (legacy) {
        this.configCache = legacy
        handle
          .replace(structuredClone(legacy))
          .then(() => logger.info(`[${pluginName}] 已迁移旧配置到内核: config/${pluginName}.yaml`))
          .catch((err) => logger.error(`[${pluginName}] 迁移旧配置失败`, err))
      } else {
        this.configCache = this.fromYngValue(kernelValue)
      }
    } else {
      this.configCache = this.fromYngValue(kernelValue)
    }

    handle.onChange((change) => {
      this.configCache = this.fromYngValue(change.next)
    })
  }

  /** 把内核配置快照归一化成内部缓存形状（补默认、pushGroups 统一为对象数组） */
  fromYngValue(value = {}) {
    const base = this.getDefaultConfig()
    for (const gameId of gameIds) {
      const g = value?.[gameId]
      if (!g) continue
      base[gameId] = {
        enable: !!g.enable,
        log: !!g.log,
        cron: g.cron || DEFAULT_CRON,
        pushGroups: Config.formatPushGroups(g.pushGroups),
        pushChangeType: g.pushChangeType || "1",
        html: g.html || "default"
      }
    }
    return base
  }

  /** 是否有任意游戏配了推送群（判断内核里是否已有实际配置） */
  static hasAnyPushGroup(value = {}) {
    return Object.values(value || {}).some(
      (g) => Array.isArray(g?.pushGroups) && g.pushGroups.length > 0
    )
  }

  /**
   * 读取旧版 YAML（yunzai-ng 迁移到内核前写在 data/plugin 的文件）
   * 旧文件 pushGroups 为 "botId:groupId" 字符串数组，formatPushGroups 会归一化为对象数组。
   * @returns 含推送群的旧配置；无文件或无推送群时返回 null
   */
  readLegacyYng() {
    try {
      if (!fs.existsSync(CONFIG_PATH)) return null
      const raw = YAML.parse(fs.readFileSync(CONFIG_PATH, "utf8")) || {}
      const out = this.getDefaultConfig()
      let hasData = false
      for (const gameId of gameIds) {
        const g = raw[gameId]
        if (!g) continue
        const pushGroups = Config.formatPushGroups(g.pushGroups)
        if (pushGroups.length) hasData = true
        out[gameId] = {
          enable: !!g.enable,
          log: !!g.log,
          cron: g.cron || DEFAULT_CRON,
          pushGroups,
          pushChangeType: g.pushChangeType || "1",
          html: g.html || "default"
        }
      }
      return hasData ? out : null
    } catch (err) {
      logger.error(`[${pluginName}] 读取旧配置失败`, err)
      return null
    }
  }

  /** 初始化配置管理器 */
  init() {
    try {
      if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true })
      // 旧位置 data/GamePush-Plugin.yaml → 新位置：搬过去，避免丢已配置的推送群
      const legacyPath = path.join(process.cwd(), "data", "GamePush-Plugin.yaml")
      if (BotName === "Yunzai-NG" && !fs.existsSync(CONFIG_PATH) && fs.existsSync(legacyPath)) {
        fs.copyFileSync(legacyPath, CONFIG_PATH)
      }
      if (!fs.existsSync(CONFIG_PATH)) this.saveConfig(this.getDefaultConfig())
      this.loadConfig()
      this.setupWatcher()
    } catch (err) {
      logger.error(`[${pluginName}] 配置初始化失败`, err)
      this.configCache = this.getDefaultConfig()
    }
  }

  /** 默认配置 */
  getDefaultConfig() {
    return Object.fromEntries(
      gameIds.map((id) => [
        id,
        {
          enable: true,
          log: false,
          cron: DEFAULT_CRON,
          pushGroups: [],
          pushChangeType: "1",
          html: "default"
        }
      ])
    )
  }

  /** 格式化 pushGroups */
  static formatPushGroups(list = []) {
    return list
      .map((item) => {
        if (typeof item === "string") {
          const colonIndex = item.indexOf(":")
          if (colonIndex > 0) {
            const botId = item.slice(0, colonIndex)
            const groupId = item.slice(colonIndex + 1)
            return botId && groupId ? { botId, groupId } : null
          }
          return null
        }
        return item && typeof item === "object" ? item : null
      })
      .filter(Boolean)
  }

  /** 序列化 pushGroups（保存时用） */
  static serializePushGroups(list = []) {
    return list.map((item) => `${item.botId}:${item.groupId}`)
  }

  /** 加载配置 */
  loadConfig() {
    try {
      const raw = fs.existsSync(CONFIG_PATH) ? YAML.parse(fs.readFileSync(CONFIG_PATH, "utf8")) : {}
      this.configCache = this.getDefaultConfig()

      for (const gameId of gameIds) {
        if (raw[gameId]) {
          const cfg = raw[gameId]
          this.configCache[gameId] = {
            enable: !!cfg.enable,
            log: !!cfg.log,
            cron: cfg.cron || DEFAULT_CRON,
            pushGroups: Config.formatPushGroups(cfg.pushGroups),
            pushChangeType: cfg.pushChangeType || "1",
            html: cfg.html || "default"
          }
        }
      }
    } catch (err) {
      logger.error(`[${pluginName}] 配置加载失败`, err)
      this.configCache = this.getDefaultConfig()
    }
  }

  /** 保存配置 */
  saveConfig(newConfig) {
    // yunzai-ng：写内核（原子落盘 config/<插件名>.yaml + 热更新 + 面板同步）。
    // pushGroups 以对象数组存内核（schema 即对象），不做字符串序列化。
    if (this.yngConfig) {
      this.configCache = newConfig
      this.yngConfig
        .replace(structuredClone(newConfig))
        .catch((err) => logger.error(`[${pluginName}] 配置保存失败`, err))
      return true
    }
    try {
      const saveData = Object.fromEntries(
        Object.entries(newConfig).map(([gameId, cfg]) => [
          gameId,
          {
            enable: cfg.enable,
            log: cfg.log,
            cron: cfg.cron,
            pushGroups: Config.serializePushGroups(cfg.pushGroups),
            pushChangeType: cfg.pushChangeType,
            html: cfg.html
          }
        ])
      )
      fs.writeFileSync(CONFIG_PATH, YAML.stringify(saveData, { indent: 2 }), "utf8")
      this.configCache = newConfig
      return true
    } catch (err) {
      logger.error(`[${pluginName}] 配置保存失败`, err)
      return false
    }
  }

  /** 文件监视器 */
  async setupWatcher() {
    if (this.watcher) return
    try {
      const chokidar = await import("chokidar")
      this.watcher = chokidar.watch(CONFIG_PATH).on("change", () => {
        logger.info(`[${pluginName}] 配置变更，重新加载`)
        this.loadConfig()
      })
    } catch (err) {
      logger.error(`[${pluginName}] 设置配置监视器失败`, err)
    }
  }

  /** 获取单个游戏配置 */
  getGameConfig(game) {
    return this.configCache[game] || this.getDefaultConfig()[game]
  }

  /** 更新单个游戏配置 */
  updateGameConfig(game, updater) {
    const config = structuredClone(this.configCache)
    config[game] ||= this.getDefaultConfig()[game]
    updater(config[game])
    this.saveConfig(config)
  }

  /** 添加推送群（避免重复） */
  addPushGroup(gameId, botId, groupId) {
    this.updateGameConfig(gameId, (cfg) => {
      const exists = cfg.pushGroups.some((g) => g.botId === botId && g.groupId === groupId)
      if (!exists) {
        cfg.pushGroups.push({ botId, groupId })
        logger.debug(
          `[${pluginName}] 游戏${getGameName(gameId)} 添加机器人: ${botId} 群聊：${groupId} 推送配置`
        )
      } else {
        logger.debug(
          `[${pluginName}] 游戏${getGameName(gameId)} 存在机器人: ${botId} 群聊：${groupId} 推送配置，跳过重复写入`
        )
      }
    })
  }

  /** 移除推送群 */
  removePushGroup(gameId, botId, groupId) {
    this.updateGameConfig(gameId, (cfg) => {
      const before = cfg.pushGroups.length
      cfg.pushGroups = cfg.pushGroups.filter((g) => !(g.botId === botId && g.groupId === groupId))
      if (cfg.pushGroups.length < before) {
        logger.debug(
          `[${pluginName}] 游戏${getGameName(gameId)} 移除机器人: ${botId} 群聊：${groupId} 推送配置`
        )
      } else {
        logger.debug(
          `[${pluginName}] 游戏${getGameName(gameId)} 不存在机器人: ${botId} 群聊：${groupId} 推送配置，无需移除`
        )
      }
    })
  }

  /** 获取前端配置 */
  getFrontendConfig() {
    if (BotName !== "Karin") return this.configCache

    logger.debug("当前配置缓存:", JSON.stringify(this.configCache, null, 2))
    const frontendConfig = {}

    for (const gameId of gameIds) {
      const cfg = this.getGameConfig(gameId)
      frontendConfig[gameId] = [
        {
          enable: cfg.enable,
          log: false,
          cron: cfg.cron || DEFAULT_CRON,
          pushGroups: Config.formatPushGroups(cfg.pushGroups),
          pushChangeType: cfg.pushChangeType || "1",
          html: cfg.html || "default"
        }
      ]
    }

    logger.debug(`[${pluginName}] 生成的前端配置:`, JSON.stringify(frontendConfig, null, 2))
    return frontendConfig
  }

  /** 处理前端传入配置（兼容 Yunzai / Karin） */
  parseFrontendConfig(data) {
    let isYunzai = gameIds.some((id) => data[`${id}.enable`] !== undefined)
    const saveData = {}
    for (const gameId of gameIds) {
      if (isYunzai) {
        saveData[gameId] = {
          enable: Boolean(data[`${gameId}.enable`] ?? true),
          log: Boolean(data[`${gameId}.log`] ?? false),
          cron: data[`${gameId}.cron`] || DEFAULT_CRON,
          pushGroups: Config.formatPushGroups(data[`${gameId}.pushGroups`] || []),
          pushChangeType: data[`${gameId}.pushChangeType`] || "1",
          html: data[`${gameId}.html`] || "default"
        }
      } else {
        const cfg = (data[gameId] || [])[0] || {}
        saveData[gameId] = {
          enable: Boolean(cfg.enable ?? true),
          log: Boolean(cfg.log ?? true),
          cron: cfg.cron || DEFAULT_CRON,
          pushGroups: Config.formatPushGroups(cfg.pushGroups || []),
          pushChangeType: cfg.pushChangeType || "1",
          html: cfg.html || "default"
        }
      }
    }
    return saveData
  }

  /** 从前端保存配置 */
  saveFromFrontend(data) {
    try {
      logger.debug(`[${pluginName}] 接收到的原始数据:`, JSON.stringify(data, null, 2))
      let saveData = this.parseFrontendConfig(data)

      for (const gameId of gameIds) {
        saveData[gameId].pushGroups = [
          ...new Map(
            saveData[gameId].pushGroups.map((g) => [`${g.botId}:${g.groupId}`, g])
          ).values()
        ]
      }

      logger.debug(`[${pluginName}] 处理后的配置数据:`, JSON.stringify(saveData, null, 2))

      if (this.saveConfig(saveData)) {
        logger.info(`[${pluginName}] 配置保存成功`)
        return { success: true, message: "游戏推送配置已保存！" }
      }
      return { success: false, message: "保存配置文件时出错" }
    } catch (err) {
      logger.error(`[${pluginName}] 前端配置保存失败`, err)
      return { success: false, message: `配置保存失败: ${err.message}` }
    }
  }
}

export default new Config()
