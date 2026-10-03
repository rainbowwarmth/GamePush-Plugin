/**
 * 推送编排
 *
 * 推送渠道与文案在这里；「各游戏体积怎么算」在 model/games.js 的 fetchSize。
 * 重构前 fetchSizeInfo 内部有 4 个按游戏分叉的分支（zmd / ww / ys·sr·zzz / bh3），
 * 还自己重拼了一遍 branches 与 build 接口的 URL。
 */
import { puppeteer } from "#GamePush.lib"
import { cfg, pluginName } from "#GamePush.components"
import { rt } from "#GamePush.runtime"
import { api, base, getGameName } from "#GamePush.model"
import { getGameAdapter } from "./games.js"

class Notifier extends base {
  TemplateMap = {
    main: ({ gameName, oldVersion, newVersion, formattedTotalSize, incrementalSize }) =>
      [
        `✨${gameName}游戏版本更新通知`,
        `🚀版本变更：${oldVersion} → ${newVersion}`,
        formattedTotalSize && `📦完整大小（含中文语音）：${formattedTotalSize}`,
        incrementalSize && `🔄增量更新大小：约${incrementalSize}`,
        "📢 请及时更新客户端",
        ...(gameName !== "原神" && gameName !== "崩坏3"
          ? [`💾 发送【#${gameName}获取下载链接】获取客户端`]
          : [])
      ]
        .filter(Boolean)
        .join("\n"),

    pre: ({ gameName, newVersion, formattedTotalSize, incrementalSize }) =>
      [
        `🎁${gameName}预下载资源已开放`,
        `📦新版本：${newVersion}`,
        formattedTotalSize && `📦完整大小（含中文语音）：${formattedTotalSize}`,
        incrementalSize && `🔄增量更新大小：约${incrementalSize}`,
        "📥请提前下载游戏资源",
        ...(gameName !== "原神" && gameName !== "崩坏3"
          ? [`💾 发送【#${gameName}获取下载链接】获取客户端`]
          : [])
      ]
        .filter(Boolean)
        .join("\n"),

    "pre-remove": ({ gameName, oldVersion }) =>
      `🌙${gameName}预下载资源已关闭\n🔒正式版本${oldVersion}即将上线`
  }

  /**
   * 推送通知
   * @param {Object} payload
   * @param {string} payload.type - 推送类型（main | pre | pre-remove）
   * @param {string} payload.game - 游戏ID
   * @param {string} [payload.newVersion] - 新版本号
   * @param {string} [payload.oldVersion] - 旧版本号
   * @param {string} [payload.pushChangeType] - 消息类型（1 图片 / 2 文本）
   */
  async pushNotify({ type, game, newVersion, oldVersion, pushChangeType }) {
    const gameName = getGameName(game)
    try {
      // 首次运行（库里没有旧版本）不推送、也不记历史，否则会拿一个假版本污染数据
      if (oldVersion === "0.0.0") {
        rt.logger?.debug(`[${pluginName}] 初始版本0.0.0，不推送通知且不更新数据库`)
        return
      }

      const gameConfig = cfg.getGameConfig(game)
      const { formattedTotalSize, incrementalSize, Ver } = await this.fetchSizeInfo(game, type)

      await this.storeSizeData(game, type, { newVersion, Ver, formattedTotalSize, incrementalSize })

      if (type === "pre-remove") return

      const templateData = {
        gameName,
        oldVersion,
        newVersion,
        Ver,
        formattedTotalSize,
        incrementalSize
      }

      if (pushChangeType === "1") {
        await this.sendImageMessage(
          type,
          game,
          gameConfig,
          templateData,
          pushChangeType,
          gameConfig.html
        )
      } else {
        await this.sendTextMessage(type, game, gameConfig, templateData, pushChangeType)
      }
    } catch (err) {
      rt.logger?.error(`[${pluginName}][${gameName}通知] 推送通知失败: ${err.message}`, err)
    }
  }

  /**
   * 记录体积数据到历史库
   * @param {string} game - 游戏ID
   * @param {string} type - 推送类型
   * @param {Object} size - fetchSizeInfo 的结果
   */
  async storeSizeData(game, type, { newVersion, Ver, formattedTotalSize, incrementalSize }) {
    switch (type) {
      case "main":
        await rt.db.storeMainSizeData(game, newVersion, formattedTotalSize)
        break
      case "pre":
        if (Ver) await rt.db.storePreSizeData(game, newVersion, Ver, incrementalSize)
        break
      case "pre-remove":
        rt.logger?.debug("⛔ 预下载关闭通知，不存储大小数据")
        break
      default:
        rt.logger?.warn(`⚠️ 未知通知类型: ${type}`)
    }
  }

  /**
   * 获取体积信息（厂商差异交给 games.js 的描述符）
   * @param {string} game - 游戏ID
   * @param {string} type - 推送类型
   * @returns {Promise<{formattedTotalSize?: string, incrementalSize?: string, Ver?: string}>}
   */
  async fetchSizeInfo(game, type) {
    return getGameAdapter(game).fetchSize(game, type)
  }

  /**
   * 发送图片消息
   * @param {string} type - 推送类型
   * @param {string} game - 游戏ID
   * @param {object} gameConfig - 推送配置
   * @param {object} templateData - 游戏数据
   * @param {string} pushChangeType - 消息类型
   * @param {string} html - html 模板名
   */
  async sendImageMessage(type, game, gameConfig, templateData, pushChangeType, html) {
    const screenData = await this.screenData(game, type, html)
    const data = {
      ...screenData,
      ...templateData,
      date: new Date().toLocaleDateString(),
      type
    }
    const img = await puppeteer.screenshot("GamePush-Plugin", data)
    if (img) api.sendToGroups(img, game, gameConfig, pushChangeType)
    else rt.logger?.error(`[${pluginName}] 发送图片消息失败`)
  }

  /**
   * 发送文本消息
   * @param {string} type - 推送类型
   * @param {string} game - 游戏ID
   * @param {object} gameConfig - 推送配置
   * @param {object} templateData - 游戏数据
   * @param {string} pushChangeType - 消息类型
   */
  async sendTextMessage(type, game, gameConfig, templateData, pushChangeType) {
    try {
      const template = this.TemplateMap[type]
      if (!template) throw new Error(`未知推送类型: ${type}`)
      api.sendToGroups(template(templateData), game, gameConfig, pushChangeType)
    } catch (err) {
      rt.logger?.error(`[${pluginName}] 发送文本消息失败: ${err.message}`, err)
    }
  }
}

export default new Notifier()
