import fs from 'node:fs'
import YAML from 'yaml'
import path from 'node:path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const CONFIG_DIR = path.join(process.cwd(), 'data')
const CONFIG_PATH = path.join(CONFIG_DIR, 'GamePush-Plugin.yaml')

const DEFAULT_CRON = '0 0/5 * * * *'
const GAME_IDS = ['ys', 'sr', 'zzz', 'bh3', 'ww']

/**
 * 规范化群组ID列表
 * @param {Array|any} groups - 群组ID列表
 * @returns {Array<string>} 规范化后的群组ID列表
 */
function normalizeGroups (groups) {
  return Array.isArray(groups)
    ? groups.map(String).filter(Boolean)
    : []
}

class Config {
  configCache = {}
  watcher = null

  constructor () {
    this.init()
  }

  /**
   * 初始化配置管理器
   */
  init () {
    try {
      if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true })
      if (!fs.existsSync(CONFIG_PATH)) this.saveConfig(this.getDefaultConfig())
      this.loadConfig()
      this.setupWatcher()
    } catch (err) {
      logger.error('[GamePush-Plugin] 配置初始化失败', err)
      this.configCache = this.getDefaultConfig()
    }
  }

  /**
   * 获取默认配置
   * @returns {Object} 默认配置对象
   */
  getDefaultConfig () {
    return GAME_IDS.reduce((config, id) => {
      config[id] = {
        enable: true,
        cron: DEFAULT_CRON,
        pushGroups: [],
        pushChangeType: '1'
      }
      return config
    }, {})
  }

  /**
   * 加载配置
   */
  loadConfig () {
    try {
      const raw = fs.existsSync(CONFIG_PATH)
        ? YAML.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
        : {}

      this.configCache = Object.keys(raw).reduce((validated, gameId) => {
        if (GAME_IDS.includes(gameId)) {
          validated[gameId] = {
            enable: !!raw[gameId].enable,
            cron: raw[gameId].cron || DEFAULT_CRON,
            pushGroups: normalizeGroups(raw[gameId].pushGroups),
            pushChangeType: raw[gameId].pushChangeType || '1'
          }
        }
        return validated
      }, this.getDefaultConfig())
    } catch (err) {
      logger.error('[GamePush-Plugin] 配置加载失败', err)
      this.configCache = this.getDefaultConfig()
    }
  }

  /**
   * 保存配置
   * @param {Object} newConfig - 新配置对象
   */
  saveConfig (newConfig) {
    try {
      fs.writeFileSync(CONFIG_PATH, YAML.stringify(newConfig, { indent: 2 }), 'utf8')
      this.configCache = newConfig
    } catch (err) {
      logger.error('[GamePush-Plugin] 配置保存失败', err)
    }
  }

  /**
   * 设置配置文件监视器
   */
  async setupWatcher () {
    if (!this.watcher) {
      try {
        const chokidar = await import('chokidar')
        this.watcher = chokidar.watch(CONFIG_PATH).on('change', () => {
          logger.info('[GamePush-Plugin] 配置变更，重新加载')
          this.loadConfig()
        })
      } catch (err) {
        logger.error('[GamePush-Plugin] 设置配置监视器失败', err)
      }
    }
  }

  /**
   * 获取指定游戏的配置
   * @param {string} game - 游戏ID
   * @returns {Object} 游戏配置
   */
  getGameConfig (game) {
    return this.configCache[game] || this.getDefaultConfig()[game]
  }

  /**
   * 更新游戏配置
   * @param {string} game - 游戏ID
   * @param {Function} updater - 更新函数
   */
  updateGameConfig (game, updater) {
    const config = { ...this.configCache }
    config[game] = config[game] || this.getDefaultConfig()[game]
    updater(config[game])
    this.saveConfig(config)
  }

  /**
   * 获取前端配置
   * @returns {Object} 前端配置
   */
  getFrontendConfig () {
    return this.configCache
  }

  /**
   * 从前端保存配置
   * @param {Object} data - 前端配置数据
   * @param {Object} options - 选项
   * @returns {Object} 保存结果
   */
  saveFromFrontend (data, { Result }) {
    try {
      const saveData = GAME_IDS.reduce((result, gameId) => {
        const enable = data[`${gameId}.enable`] ?? this.configCache[gameId].enable
        result[gameId] = {
          enable,
          cron: data[`${gameId}.cron`] || DEFAULT_CRON,
          pushGroups: normalizeGroups(data[`${gameId}.pushGroups`]),
          pushChangeType: data[`${gameId}.pushChangeType`] || '1'
        }
        return result
      }, {})
      this.saveConfig(saveData)
      return { success: true, message: '游戏推送配置已保存！' }
    } catch (err) {
      logger.error('[GamePush-Plugin] 前端配置保存失败', err)
      return { success: false, message: `配置保存失败: ${err.message}` }
    }
  }
}

export default new Config()
