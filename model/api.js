import { cfg, request, pluginName } from "#GamePush.components"
import { sendGroupMsg } from "#GamePush.lib"
import { rt } from "#GamePush.runtime"
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
      if (game === "zmd") {
        await this.processHypergryphData(game, auto)
      } else {
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
   * 处理鹰角游戏数据
   * @param {string} game - 游戏ID
   * @param {boolean} auto - 是否自动检查
   */
  async processHypergryphData(game, auto) {
    const url = "https://launcher.hypergryph.com/api/proxy/batch_proxy"
    const headers = {
      Host: "launcher.hypergryph.com",
      "Content-Type": "application/json",
      Accept: "application/json",
      "x-hg-launcher-device-id": "83a5d5ca-7f0e-4277-ba71-c9e66dafd7e4",
      "x-hg-user-token": "",
      Connection: "Keep-Alive",
      "Accept-Language": "zh-CN,en,*",
      "User-Agent": "Mozilla/5.0",
      "Accept-Encoding": "gzip, deflate"
    }

    const makeBody = (version) => ({
      proxy_reqs: [
        {
          kind: "get_latest_game",
          get_latest_game_req: {
            appcode: "6LL0KJuqHBVz33WK",
            channel: "1",
            sub_channel: "1",
            version: version,
            launcher_appcode: "abYeZZ16BPluCFyT",
            launcher_sub_channel: "1",
            disk_type: 0,
            patch_encrypt: true
          }
        }
      ]
    })

    // 第一步：空版本请求获取最新版本号
    const emptyRes = await request.post(url, makeBody(""), {
      headers,
      responseType: "json",
      log: true,
      gameName: getGameName(game),
      retry: 3,
      retryDelay: 1000
    })

    if (!emptyRes?.proxy_rsps?.[0]?.get_latest_game_rsp) {
      throw new Error(`[${pluginName}] ${getGameName(game)}版本数据获取失败`)
    }

    const latestVersion = emptyRes.proxy_rsps[0].get_latest_game_rsp.version
    if (!latestVersion) throw new Error(`[${pluginName}] ${getGameName(game)}未获取到版本号`)

    // 第二步：用本地旧版本请求，获取 patch 差分增量包 + pkg 完整包
    const { main: redisKey } = getRedisKeys(game)
    const oldVer = (await rt.kv.get(redisKey)) || ""

    const versionRes = await request.post(url, makeBody(oldVer), {
      headers,
      responseType: "json",
      log: true,
      gameName: getGameName(game),
      retry: 3,
      retryDelay: 1000
    })

    const gameRsp = versionRes?.proxy_rsps?.[0]?.get_latest_game_rsp
    if (!gameRsp) throw new Error(`[${pluginName}] ${getGameName(game)}版本数据解析失败`)

    // 处理主版本
    await this.processMainVersion(game, latestVersion, auto)

    // 处理预下载数据（pre_patch）
    await this.processHypergryphPreDownload(game, gameRsp.pre_patch, latestVersion, auto)
  }

  /**
   * 处理鹰角预下载信息
   * @param {string} game - 游戏ID
   * @param {Object} prePatch - 预下载补丁数据
   * @param {string} currentVersion - 当前版本
   */
  async processHypergryphPreDownload(game, prePatch, currentVersion, auto) {
    const { pre: preKey } = getRedisKeys(game)
    const storedPre = await rt.kv.get(preKey)

    if (prePatch?.version) {
      const preVersion = prePatch.version
      if (preVersion !== storedPre) {
        await rt.kv.set(preKey, preVersion)
        notice.pushNotify({
          type: "pre",
          game,
          newVersion: preVersion,
          oldVersion: storedPre,
          pushChangeType: cfg.getGameConfig(game).pushChangeType
        })
      }
    } else if (storedPre) {
      await rt.kv.del(preKey)
      notice.pushNotify({
        type: "pre-remove",
        game,
        oldVersion: storedPre,
        pushChangeType: cfg.getGameConfig(game).pushChangeType
      })
    }
  }

  /**
   * 处理主版本信息
   * @param {string} game - 游戏ID
   * @param {string} currentVersion - 当前版本
   */
  async processMainVersion(game, currentVersion) {
    if (!currentVersion) return

    const { main: redisKey } = getRedisKeys(game)
    const stored = (await rt.kv.get(redisKey)) || "0.0.0"

    if (versionComparator.compare(currentVersion, stored) > 0) {
      await notice.pushNotify({
        type: "main",
        game,
        newVersion: currentVersion,
        oldVersion: stored,
        pushChangeType: cfg.getGameConfig(game).pushChangeType
      })
      await rt.kv.set(redisKey, currentVersion)
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
    const storedPre = await rt.kv.get(preKey)

    if (currentPre) {
      if (currentPre !== storedPre) {
        await rt.kv.set(preKey, currentPre)
        notice.pushNotify({
          type: "pre",
          game,
          newVersion: currentPre,
          oldVersion: storedPre,
          pushChangeType: cfg.getGameConfig(game).pushChangeType
        })
      }
    } else if (storedPre) {
      await rt.kv.del(preKey)
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
   * @param {string} pushChangeType - 消息类型
   */
  sendToGroups(msg, game, gameConfig, pushChangeType, html) {
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
      sendGroupMsg(botId, groupId, msg, pushChangeType)
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
