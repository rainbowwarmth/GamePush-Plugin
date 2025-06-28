import { cfg, request, pluginName } from "#GamePush.components"
import { redis, sendGroupMsg } from "#GamePush.lib"
import {
  base,
  notice,
  getGameChuckAPI,
  getGameName,
  getRedisKeys,
  GAME_CONFIG,
  versionComparator
} from "#GamePush.model"

class ApiTools extends base {
  gameApis = new Map()

  constructor() {
    super()
    Object.keys(GAME_CONFIG).forEach((game) => {
      this.gameApis.set(game, getGameChuckAPI(game))
    })
  }

  /**
   * 自动检查游戏版本
   * @param {string} game - 游戏ID
   */
  async autoCheck(game = "") {
    try {
      const gameConfig = cfg.getGameConfig(game)
      if (gameConfig.enable) {
        await this.checkVersion(true, game)
      }
    } catch (err) {
      logger.error(`[${pluginName}][${getGameName(game)}自动检查] 失败`, err)
    }
  }

  /**
   * 检查游戏版本
   * @param {boolean} auto - 是否自动检查
   * @param {string} game - 游戏ID
   */
  async checkVersion(auto = false, game = "") {
    if (!game || !GAME_CONFIG[game]) {
      throw new Error(`[${pluginName}] 无效的游戏标识: ${game}`)
    }
    try {
      const apiUrl = this.gameApis.get(game)
      const data = await request.get(apiUrl, {
        responseType: "json",
        log: true,
        gameName: getGameName(game)
      })

      if (game === "ww") {
        await this.processWWData(data, game, auto)
      } else {
        await this.processMHYData(data, game, auto)
      }
    } catch (err) {
      logger.error(`[${pluginName}][${getGameName(game)}版本监控] 错误`, err)
      if (!auto) this.reply(`[${pluginName}] ❌ 检查失败：${err.message}`)
    }
  }

  /**
   * 处理鸣潮游戏数据
   * @param {Object} data - API返回数据
   * @param {string} game - 游戏ID
   * @param {boolean} auto - 是否自动检查
   */
  async processWWData(data, game, auto) {
    const gameCheckData = data

    await this.processMainVersion(game, gameCheckData.default?.config?.version, auto)

    await this.processPreDownload(game, gameCheckData.predownload?.config, auto)
  }

  /**
   * 处理米哈游游戏数据
   * @param {Object} data - API返回数据
   * @param {string} game - 游戏ID
   * @param {boolean} auto - 是否自动检查
   */
  async processMHYData(data, game, auto) {
    const gameCheckData = data?.data?.game_branches?.[0]
    if (!gameCheckData) throw new Error(`[${pluginName}] ${getGameName(game)}游戏数据解析失败`)

    await this.processMainVersion(game, gameCheckData.main?.tag, auto)

    await this.processPreDownload(game, gameCheckData.pre_download, auto)
  }

  /**
   * 处理主版本信息
   * @param {string} game - 游戏ID
   * @param {string} currentVersion - 当前版本
   */
  async processMainVersion(game, currentVersion) {
    if (!currentVersion) return

    const { main: redisKey } = getRedisKeys(game)
    const stored = (await redis.get(redisKey)) || "0.0.0"

    if (versionComparator.compare(currentVersion, stored) > 0) {
      await redis.set(redisKey, currentVersion)
      notice.pushNotify({
        type: "main",
        game,
        newVersion: currentVersion,
        oldVersion: stored,
        pushChangeType: cfg.getGameConfig(game).pushChangeType
      })
    }
  }

  /**
   * 处理预下载信息
   * @param {string} game - 游戏ID
   * @param {Object} preData - 预下载数据
   */
  async processPreDownload(game, preData) {
    const { pre: preKey } = getRedisKeys(game)
    const currentPre = game === "ww" ? preData?.version : preData?.tag
    const storedPre = await redis.get(preKey)

    if (currentPre) {
      if (currentPre !== storedPre) {
        await redis.set(preKey, currentPre)
        notice.pushNotify({
          type: "pre",
          game,
          newVersion: currentPre,
          oldVersion: storedPre,
          pushChangeType: cfg.getGameConfig(game).pushChangeType
        })
      }
    } else if (storedPre) {
      await redis.del(preKey)
      notice.pushNotify({
        type: "pre-remove",
        game,
        oldVersion: storedPre,
        pushChangeType: cfg.getGameConfig(game).pushChangeType
      })
    }
  }

  /**
   * 向群组发送消息
   * @param {string} msg - 消息内容
   * @param {string} game - 游戏ID
   * @param {Object} gameConfig - 游戏配置
   */
  sendToGroups(msg, game, gameConfig) {
    if (!gameConfig?.pushGroups?.length) {
      logger.debug(`[${pluginName}][${getGameName(game)}] 未配置推送群组`)
      return
    }
    for (const pushItem of gameConfig.pushGroups) {
      let botId, groupId
      if (typeof pushItem === "object") {
        botId = pushItem.botId
        groupId = pushItem.groupId
      }
      sendGroupMsg(botId, groupId, msg)
    }
  }

  /**
   * 格式化文件大小
   * @param {number} bytes - 字节数
   * @returns {string} 格式化后的大小
   */
  formatSize(bytes) {
    const units = ["B", "KB", "MB", "GB", "TB"]
    let size = Number(bytes)
    let unitIndex = 0

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex++
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`
  }
}

export default new ApiTools()
