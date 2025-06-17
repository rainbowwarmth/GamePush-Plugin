import fetch from 'node-fetch'
import cfg from './config.js'
import base from './base.js'
import notice from './notice.js'
import { getGameCheckAPI, getGameName, getRedisKeys, GAME_CONFIG, versionComparator } from './util.js'

class ApiTools extends base {
  gameApis = new Map()
  constructor () {
    super()
    Object.keys(GAME_CONFIG).forEach(game => {
      this.gameApis.set(game, getGameCheckAPI(game))
    })
  }

  async autoCheck (game = '') {
    try {
      const gameConfig = cfg.getGameConfig(game)
      if (gameConfig.enable) {
        await this.checkVersion(true, game)
      }
    } catch (err) {
      logger.error(`[GamePush-Plugin][${getGameName(game)}自动检查] 失败`, err)
    }
  }

  async checkVersion (auto = false, game = '') {
    if (!game || !GAME_CONFIG[game]) {
      throw new Error(`[GamePush-Plugin] 无效的游戏标识: ${game}`)
    }
    try {
      const apiUrl = this.gameApis.get(game)
      logger.debug(`[GamePush-Plugin][${getGameName(game)}] 请求API: ${apiUrl}`)

      const res = await fetch(apiUrl)
      if (!res.ok) {
        const body = await res.text()
        throw new Error(`[GamePush-Plugin] API请求失败：HTTP ${res.status} - ${body.slice(0, 100)}`)
      }

      const data = await res.json()

      if (game === 'ww') {
        await this.processWWData(data, game, auto)
      } else {
        await this.processMHYData(data, game, auto)
      }
    } catch (err) {
      logger.error(`[GamePush-Plugin][${getGameName(game)}版本监控] 错误`, err)
      if (!auto) this.reply(`[GamePush-Plugin] ❌ 检查失败：${err.message}`)
    }
  }

  async processWWData (data, game, auto) {
    const gameCheckData = data

    await this.processMainVersion(
      game,
      gameCheckData.default?.config?.version,
      auto
    )

    await this.processPreDownload(
      game,
      gameCheckData.predownload?.config,
      auto
    )
  }

  async processMHYData (data, game, auto) {
    const gameCheckData = data?.data?.game_branches?.[0]
    if (!gameCheckData) throw new Error(`${getGameName(game)}游戏数据解析失败`)

    await this.processMainVersion(
      game,
      gameCheckData.main?.tag,
      auto
    )

    await this.processPreDownload(
      game,
      gameCheckData.pre_download,
      auto
    )
  }

  async processMainVersion (game, currentVersion) {
    if (!currentVersion) return

    const { main: redisKey } = getRedisKeys(game)
    const stored = await redis.get(redisKey) || '0.0.0'

    if (versionComparator.compare(currentVersion, stored) > 0) {
      await redis.set(redisKey, currentVersion)
      notice.pushNotify({
        type: 'main',
        game,
        newVersion: currentVersion,
        oldVersion: stored,
        pushChangeType: cfg.getGameConfig(game).pushChangeType
      })
    }
  }

  async processPreDownload (game, preData) {
    const { pre: preKey } = getRedisKeys(game)
    const currentPre = game === 'ww' ? preData?.version : preData?.tag
    const storedPre = await redis.get(preKey)

    if (currentPre) {
      if (currentPre !== storedPre) {
        await redis.set(preKey, currentPre)
        notice.pushNotify({
          type: 'pre',
          game,
          newVersion: currentPre,
          oldVersion: storedPre,
          pushChangeType: cfg.getGameConfig(game).pushChangeType
        })
      }
    } else if (storedPre) {
      await redis.del(preKey)
      notice.pushNotify({
        type: 'pre-remove',
        game,
        oldVersion: storedPre,
        pushChangeType: cfg.getGameConfig(game).pushChangeType
      })
    }
  }

  sendToGroups (msg, game, gameConfig) {
    if (!gameConfig?.pushGroups?.length) {
      logger.debug(`[GamePush-Plugin][${getGameName(game)}] 未配置推送群组`)
      return
    }

    for (const groupId of gameConfig.pushGroups) {
      Bot.pickGroup(groupId).sendMsg(msg)
    }
  }

  formatSize (bytes) {
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    let size = Number(bytes)
    let unitIndex = 0

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex++
    }
    return `${size.toFixed(2)} ${units[unitIndex]}`
  }
}

const api = new ApiTools()
export default api
