import { puppeteer } from "#GamePush.lib"
import { cfg, request, pluginName } from "#GamePush.components"
import { rt } from "#GamePush.runtime"
import {
  api,
  base,
  download,
  getGameChuckAPI,
  getPatchBuildAPI,
  getBuildAPI,
  getGameName,
  getRedisKeys
} from "#GamePush.model"

class Notifier extends base {
  TemplateMap = {
    main: ({ gameName, oldVersion, newVersion, formattedTotalSize, incrementalSize }) =>
      [
        `✨${gameName}游戏版本更新通知`,
        `🚀版本变更：${oldVersion} → ${newVersion}`,
        formattedTotalSize && `📦完整大小（含中文语音）：${formattedTotalSize}`,
        incrementalSize && `🔄 增量更新大小：约${incrementalSize}`,
        "📢 请及时更新客户端",
        ...(gameName !== "原神" && gameName !== "崩坏3" ? [`💾 发送【#${gameName}获取下载链接】获取客户端`] : [])
      ]
        .filter(Boolean)
        .join("\n"),

    pre: ({ gameName, newVersion, formattedTotalSize, incrementalSize }) =>
      [
        `🎁${gameName}预下载资源已开放`,
        `📦新版本：${newVersion}`,
        formattedTotalSize && `📦完整大小（含中文语音）：${formattedTotalSize}`,
        incrementalSize && `🔄 增量更新大小：约${incrementalSize}`,
        "📥请提前下载游戏资源",
        ...(gameName !== "原神" && gameName !== "崩坏3" ? [`💾 发送【#${gameName}获取下载链接】获取客户端`] : [])
      ]
        .filter(Boolean)
        .join("\n"),

    "pre-remove": ({ gameName, oldVersion }) =>
      `🌙${gameName}预下载资源已关闭\n🔒正式版本${oldVersion}即将上线`
  }

  /**
   * 推送通知
   * @param {string} type - 推送类型
   * @param {string} game - 游戏ID
   * @param {string} newVersion - 新版本号
   * @param {string} oldVersion - 旧版本号
   * @param {string} pushChangeType - 消息类型
   */
  async pushNotify({ type, game, newVersion, oldVersion, pushChangeType, html }) {
    try {
      if (oldVersion === "0.0.0") {
        logger.debug(`[${pluginName}] 初始版本0.0.0，不推送通知且不更新数据库`)
        return
      }

      const gameConfig = cfg.getGameConfig(game)
      const gameName = getGameName(game)
      const { formattedTotalSize, incrementalSize, Ver } = await this.fetchSizeInfo(
        game,
        type,
        gameName
      )
      switch (type) {
        case "main":
          await rt.db.storeMainSizeData(game, newVersion, formattedTotalSize)
          break
        case "pre":
          if (Ver) {
            await rt.db.storePreSizeData(game, newVersion, Ver, incrementalSize)
          }
          break
        case "pre-remove":
          logger.debug(`⛔ 预下载关闭通知，不存储大小数据`)
          break
        default:
          logger.warn(`⚠️ 未知通知类型: ${type}`)
      }

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
      logger.error(`[${pluginName}][${getGameName(game)}通知] 推送通知失败: ${err.message}`, err)
    }
  }

  /**
   * 获取大小信息
   * @param {string} game - 游戏ID
   * @param {string} type - 推送类型
   * @param {string} gameName - 游戏名称
   */
  async fetchSizeInfo(game, type, gameName) {
    const excludedLanguages = ["en-us", "ja-jp", "ko-kr"]
    let formattedTotalSize, incrementalSize, Ver
    let buildSize = 0
    let patchSize = 0

    // 鹰角游戏必须使用 POST 请求
    if (game === "zmd") {
      const { data, patch } = await download.getDownloadData(game, type)
      if (data?.total_size) {
        formattedTotalSize = api.formatSize(Number(data.total_size))
      } else if (data?.game_pkgs?.length) {
        const totalSize = data.game_pkgs.reduce((sum, pkg) => sum + Number(pkg.size || 0), 0)
        formattedTotalSize = api.formatSize(totalSize)
      } else {
        logger.debug(`[${pluginName}][${gameName}] 未获取到完整包大小`)
      }

      if (patch?.total_size) {
        incrementalSize = api.formatSize(Number(patch.total_size))
      } else if (patch?.game_pkgs?.length) {
        const patchTotal = patch.game_pkgs.reduce((sum, pkg) => sum + Number(pkg.size || 0), 0)
        incrementalSize = api.formatSize(patchTotal)
      } else {
        logger.debug(`[${pluginName}][${gameName}] 未获取到增量包大小`)
      }

      const mainKey = getRedisKeys(game).main
      Ver = (await rt.kv.get(mainKey)) || ""
      return { formattedTotalSize, incrementalSize, Ver }
    }

    const BranchesData = await request.get(getGameChuckAPI(game), {
      responseType: "json",
      log: true,
      gameName
    })

    const parseManifests = (manifests, version) =>
      manifests
        .filter((m) => !excludedLanguages.includes(m.matching_field?.toLowerCase()))
        .reduce(
          (sum, m) =>
            sum +
            parseInt(
              m?.deduplicated_stats?.uncompressed_size ||
                m?.stats?.[version]?.uncompressed_size ||
                "0",
              10
            ),
          0
        )

    if (game === "ww") {
      const d = await download.getDownloadData(game, type)
      formattedTotalSize = api.formatSize(d.data.game_pkgs[0].size)
      incrementalSize = api.formatSize(d.patch.game_pkgs[0].size)
      Ver = d.patch.game_pkgs[0].version
    } else if (["ys", "sr", "zzz"].includes(game)) {
      const branch = BranchesData?.data?.game_branches?.[0]
      const section = type === "pre" ? branch?.pre_download : branch?.main
      Ver = section?.diff_tags?.[0]

      const buildData = await request.get(
        getBuildAPI(type, section?.package_id, section?.password),
        { responseType: "json", log: true, gameName }
      )
      const patchData = await request.post(
        getPatchBuildAPI(type, section?.package_id, section?.password),
        { responseType: "json", log: true, gameName }
      )

      buildSize = parseManifests(buildData?.data?.manifests || [], Ver)
      patchSize = parseManifests(patchData?.data?.manifests || [], Ver)

      formattedTotalSize = api.formatSize(buildSize)
      incrementalSize = api.formatSize(patchSize)
    } else {
      const branch = BranchesData?.data?.game_branches?.[0]
      Ver = branch?.main?.tag
      const section = type === "pre" ? branch?.pre_download : branch?.main

      const data = await request.get(getBuildAPI(type, section?.package_id, section?.password), {
        responseType: "json",
        log: true,
        gameName
      })
      const manifests = data?.data?.manifests || []
      const gameManifest = manifests.find((m) => m.matching_field === "game")
      const asbManifest = manifests.find((m) => m.matching_field === "asb")

      patchSize = gameManifest?.stats?.compressed_size || 0
      buildSize = asbManifest?.stats?.compressed_size || 0

      formattedTotalSize = api.formatSize(buildSize)
      incrementalSize = api.formatSize(patchSize)
    }

    return { formattedTotalSize, incrementalSize, Ver }
  }

  /** 发送图片消息
   * @param {string} type - 推送类型
   * @param {string} game - 游戏ID
   * @param {object} gameConfig - 推送配置
   * @param {object} templateData - 游戏数据
   * @param {string} pushChangeType - 消息类型
   */
  async sendImageMessage(type, game, gameConfig, templateData, pushChangeType, html) {
    const screenData = await this.screenData(game, type, html)
    const data = {
      ...screenData,
      ...templateData,
      date: new Date().toLocaleDateString(),
      type
    }
    const img = await puppeteer.screenshot(`GamePush-Plugin`, data)
    img
      ? api.sendToGroups(img, game, gameConfig, pushChangeType)
      : logger.error(`[${pluginName}] 发送图片消息失败`)
  }

  /** 发送文本消息
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
      logger.error(`[${pluginName}] 发送文本消息失败: ${err.message}`, err)
    }
  }
}

export default new Notifier()
