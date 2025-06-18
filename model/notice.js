import { cfg, request } from '#GamePush.components'
import { api, base, download, getGameChuckAPI, getDownloadAPI } from '#GamePush.model'
import puppeteer from '../../../lib/puppeteer/puppeteer.js'

class Notifier extends base {
  templateMap = {
    main: ({ gameName, oldVersion, newVersion, formattedTotalSize, incrementalSize }) => [
      `<span class="emoji-text">✨</span> ${gameName}游戏版本更新通知`,
      `<span class="emoji-text">🚀</span> 版本变更：${oldVersion} → ${newVersion}`,
      formattedTotalSize && `<span class="emoji-text">📦</span> 完整大小（含中文语音）：${formattedTotalSize}`,
      ...((gameName !== '原神' && gameName !== '崩坏3') ? [incrementalSize && `<span class="emoji-text">🔄</span> 增量更新大小：约${incrementalSize}`] : []),
      '<span class="emoji-text">📢</span> 请及时更新客户端',
      ...(gameName !== '原神' ? [`<span class="emoji-text">💾</span> 发送【#${gameName}获取下载链接】获取客户端`] : [])
    ],

    pre: ({ gameName, newVersion, formattedTotalSize, incrementalSize }) => [
      `<span class="emoji-text">🎁</span> ${gameName}预下载资源已开放`,
      `<span class="emoji-text">📦</span> 新版本：${newVersion}`,
      ...(gameName !== '原神' ? [formattedTotalSize && `<span class="emoji-text">📦</span> 完整大小（含中文语音）：${formattedTotalSize}`] : []),
      ...((gameName !== '崩坏3') ? [incrementalSize && `<span class="emoji-text">🔄</span> 增量更新大小：约${incrementalSize}`] : []),
      '<span class="emoji-text">📥</span> 请提前下载游戏资源',
      ...(gameName !== '原神' ? [`<span class="emoji-text">🚪</span> 发送【#${gameName}获取预下载链接】获取链接`] : [])
    ],

    'pre-remove': ({ gameName, oldVersion }) => [
      `<span class="emoji-text">🌙</span> ${gameName}预下载资源已关闭`,
      `<span class="emoji-text">🔒</span> 正式版本${oldVersion}即将上线`
    ]
  }

  textTemplateMap = {
    main: ({ gameName, oldVersion, newVersion, formattedTotalSize, incrementalSize }) => {
      const parts = [
        `✨${gameName}游戏版本更新通知`,
        `🚀版本变更：${oldVersion} → ${newVersion}`,
        formattedTotalSize && `📦完整大小（含中文语音）：${formattedTotalSize}`,
        ...((gameName !== '原神' && gameName !== '崩坏3') ? [incrementalSize && `🔄 增量更新大小：约${incrementalSize}`] : []),
        '📢 请及时更新客户端',
        ...(gameName !== '原神' ? [`💾 发送【#${gameName}获取下载链接】获取客户端`] : [])
      ]
      return parts.filter(Boolean).join('\n')
    },

    pre: ({ gameName, newVersion, formattedTotalSize, incrementalSize }) => {
      const parts = [
        `🎁${gameName}预下载资源已开放`,
        `📦新版本：${newVersion}`,
        ...(gameName !== '原神' ? [formattedTotalSize && `📦 完整大小（含中文语音）：${formattedTotalSize}`] : []),
        ...((gameName !== '崩坏3') ? [incrementalSize && `🔄 增量更新大小：约${incrementalSize}`] : []),
        '📥请提前下载游戏资源',
        ...(gameName !== '原神' ? [`💾 发送【#${gameName}获取预下载链接】获取客户端`] : [])
      ]
      return parts.filter(Boolean).join('\n')
    },

    'pre-remove': ({ gameName, oldVersion }) => [
      `🌙${gameName}预下载资源已关闭`,
      `🔒正式版本${oldVersion}即将上线`
    ].join('\n')
  }

  /**
   * 推送通知
   * @param {Object} options - 推送选项
   */
  async pushNotify ({ type, game, newVersion, oldVersion, pushChangeType }) {
    try {
      const gameConfig = cfg.getGameConfig(game)
      const gameName = this.getGameName(game)
      let formattedTotalSize, incrementalSize

      if (game === 'ys') {
        let BranchesUrl = getGameChuckAPI(game)
        let BranchesData = await request.get(BranchesUrl, { responseType: 'json', log: true, gameName })
        let chucksizeApi; let data; let mainSize = 0; let PreSize = 0
        const Version = BranchesData?.data?.game_branches?.[0]?.pre_download?.diff_tags[0]
        if (type === 'pre') {
          chucksizeApi = getDownloadAPI(type, BranchesData?.data?.game_branches?.[0]?.pre_download?.package_id, BranchesData?.data?.game_branches?.[0]?.pre_download?.password)
          data = await request.post(chucksizeApi, { responseType: 'json', log: true, gameName })
          PreSize += parseInt(data?.data?.manifests?.[0]?.stats[Version]?.uncompressed_size, 10)
          PreSize += parseInt(data?.data?.manifests?.[1]?.stats[Version]?.uncompressed_size, 10)
          incrementalSize = api.formatSize(PreSize)
        } else {
          chucksizeApi = getDownloadAPI(type, BranchesData?.data?.game_branches?.[0]?.main?.package_id, BranchesData?.data?.game_branches?.[0]?.main?.password)
          data = await request.get(chucksizeApi, { responseType: 'json', log: true, gameName })
          mainSize += parseInt(data?.data?.manifests[0]?.deduplicated_stats?.uncompressed_size, 10)
          mainSize += parseInt(data?.data?.manifests[1]?.deduplicated_stats?.uncompressed_size, 10)
          formattedTotalSize = api.formatSize(mainSize)
        }
      } else {
        const downloadData = await download.getDownloadData(game, type)
        let totalSize = downloadData.data.game_pkgs[0].size
        formattedTotalSize = api.formatSize(totalSize)
        let patchTotalSize = downloadData?.patch.game_pkgs[0]?.size
        incrementalSize = api.formatSize(patchTotalSize)
      }

      const templateData = {
        gameName,
        oldVersion,
        newVersion,
        formattedTotalSize,
        incrementalSize
      }

      if (pushChangeType === '1') {
        await this.sendImageMessage(type, game, gameConfig, templateData)
      } else {
        await this.sendTextMessage(type, game, gameConfig, templateData)
      }
    } catch (err) {
      logger.error(`[GamePush-Plugin] 推送通知失败: ${err.message}`, err)
    }
  }

  /**
   * 发送图片消息
   * @param {string} type - 推送类型
   * @param {string} game - 游戏ID
   * @param {Object} gameConfig - 游戏配置
   * @param {Object} templateData - 模板数据
   */
  async sendImageMessage (type, game, gameConfig, templateData) {
    try {
      const img = await puppeteer.screenshot('GamePush-Plugin', {
        ...this.screenData(game),
        messages: this.templateMap[type](templateData),
        date: new Date().toLocaleDateString(),
        type
      })

      api.sendToGroups(img, game, gameConfig)
    } catch (err) {
      logger.error(`[GamePush-Plugin] 发送图片消息失败: ${err.message}`, err)
    }
  }

  /**
   * 发送文本消息
   * @param {string} type - 推送类型
   * @param {string} game - 游戏ID
   * @param {Object} gameConfig - 游戏配置
   * @param {Object} templateData - 模板数据
   */
  async sendTextMessage (type, game, gameConfig, templateData) {
    try {
      const template = this.textTemplateMap[type]
      if (!template) throw new Error(`未知的推送类型: ${type}`)

      const content = template(templateData)

      api.sendToGroups(content, game, gameConfig)
    } catch (err) {
      logger.error(`[GamePush-Plugin] 发送文本消息失败: ${err.message}`, err)
    }
  }
}

export default new Notifier()
