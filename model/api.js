/**
 * 版本检查编排
 *
 * 本模块**不含任何厂商差异** —— 「某游戏请求哪个接口、响应怎么解析」全部在 model/games.js。
 * 这里只负责：拿到归一化的 { main, pre } → 与 Redis 里的旧值比对 → 触发推送 → 回写 Redis。
 */
import { cfg, pluginName } from "#GamePush.components"
import { rt } from "#GamePush.runtime"
import { sendGroupMsg } from "#GamePush.lib"
import { base, notice } from "#GamePush.model"
import { GAME_CONFIG, getGameName, getRedisKeys, versionComparator, formatSize } from "./util.js"
import { getGameAdapter } from "./games.js"

class ApiTools extends base {
  /**
   * 自动检查（定时任务入口）—— 失败只记日志，不向外抛
   * @param {string} game - 游戏ID
   */
  async autoCheck(game = "") {
    try {
      if (!cfg.getGameConfig(game).enable) return
      await this.checkVersion(game)
    } catch (err) {
      rt.logger?.error(`[${pluginName}][${getGameName(game)}自动检查] 失败`, err)
    }
  }

  /**
   * 检查游戏版本（失败时抛错，由调用方决定怎么呈现）
   * @param {string} game - 游戏ID
   */
  async checkVersion(game = "") {
    if (!game || !GAME_CONFIG[game]) {
      throw new Error(`[${pluginName}] 无效的游戏标识: ${game}`)
    }

    const { main, pre } = await getGameAdapter(game).fetchVersion(game)

    await this.processMainVersion(game, main)
    await this.processPreDownload(game, pre)
  }

  /**
   * 处理主版本：仅当新版本更大时推送并回写
   * @param {string} game - 游戏ID
   * @param {string|undefined} currentVersion - 接口返回的当前版本
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
   * 处理预下载：有则更新、无则撤销（撤销即「预下载已关闭」通知）
   *
   * 三个厂商的预下载版本号字段各不相同，但已在 games.js 归一化成同一个字符串，
   * 故这里不再需要 `game === "ww"` 之类的分支。
   * @param {string} game - 游戏ID
   * @param {string|undefined} currentPre - 接口返回的预下载版本
   */
  async processPreDownload(game, currentPre) {
    const { pre: preKey } = getRedisKeys(game)
    const storedPre = await rt.kv.get(preKey)

    if (currentPre) {
      if (currentPre === storedPre) return
      await rt.kv.set(preKey, currentPre)
      await notice.pushNotify({
        type: "pre",
        game,
        newVersion: currentPre,
        oldVersion: storedPre,
        pushChangeType: cfg.getGameConfig(game).pushChangeType
      })
      return
    }

    if (!storedPre) return
    await rt.kv.del(preKey)
    await notice.pushNotify({
      type: "pre-remove",
      game,
      oldVersion: storedPre,
      pushChangeType: cfg.getGameConfig(game).pushChangeType
    })
  }

  /**
   * 向群组发送消息
   * @param {any} msg - 消息内容
   * @param {string} game - 游戏ID
   * @param {Object} gameConfig - 游戏配置
   * @param {string} pushChangeType - 消息类型
   */
  sendToGroups(msg, game, gameConfig, pushChangeType) {
    if (!gameConfig?.pushGroups?.length) {
      rt.logger?.debug(`[${pluginName}][${getGameName(game)}] 未配置推送群组`)
      return
    }
    for (const pushItem of gameConfig.pushGroups) {
      if (typeof pushItem !== "object" || !pushItem) continue
      sendGroupMsg(pushItem.botId, pushItem.groupId, msg, pushChangeType)
    }
  }

  /**
   * 格式化文件大小（保留在实例上以兼容既有 `api.formatSize(...)` 调用）
   * @param {number|string} bytes - 字节数
   * @returns {string} 格式化后的大小
   */
  formatSize(bytes) {
    return formatSize(bytes)
  }
}

export default new ApiTools()
