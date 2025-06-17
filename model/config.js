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

function normalizeGroups (groups) {
  return Array.isArray(groups)
    ? groups.map(String).filter(Boolean)
    : []
}

class ConfigManager {
  configCache = {}
  watcher = null

  constructor () {
    this.init()
  }

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

  saveConfig (newConfig) {
    try {
      fs.writeFileSync(CONFIG_PATH, YAML.stringify(newConfig, { indent: 2 }), 'utf8')
      this.configCache = newConfig
    } catch (err) {
      logger.error('[GamePush-Plugin] 配置保存失败', err)
    }
  }

  setupWatcher () {
    if (!this.watcher) {
      const chokidar = import('chokidar')
      chokidar.then(mod => {
        this.watcher = mod.watch(CONFIG_PATH).on('change', () => {
          logger.info('[GamePush-Plugin] 配置变更，重新加载')
          this.loadConfig()
        })
      })
    }
  }

  getGameConfig (game) {
    return this.configCache[game] || this.getDefaultConfig()[game]
  }

  updateGameConfig (gameId, updater) {
    if (!this.configCache[gameId]) return

    updater(this.configCache[gameId])
    this.saveConfig({ ...this.configCache })
  }

  getFrontendConfig () {
    return { ...this.configCache }
  }

  saveFromFrontend (data) {
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
      logger.error('[GamePush-Plugin] 保存配置失败:', err)
      return { success: false, message: '保存失败: ' + err.message }
    }
  }
}

const cfg = new ConfigManager()
export default cfg
