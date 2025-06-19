import { request } from "#GamePush.components"
import { api, getGameAPI, getGameName, versionComparator } from "#GamePush.model"

class Download {
  cache = new Map()
  cacheTTL = 30000

  /**
   * 获取下载数据
   * @param {string} game - 游戏ID
   * @param {string} type - 下载类型
   * @returns {Promise<Object>} 下载数据
   */
  async getDownloadData(game, type = "main") {
    const cacheKey = `${game}-${type}`
    const cached = this.cache.get(cacheKey)

    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data
    }

    const data = await this.fetchDownloadData(game, type)
    this.cache.set(cacheKey, {
      timestamp: Date.now(),
      data,
    })

    return data
  }

  /**
   * 从API获取下载数据
   * @param {string} game - 游戏ID
   * @param {string} type - 下载类型
   * @returns {Promise<Object>} 下载数据
   */
  async fetchDownloadData(game, type) {
    const apiUrl = getGameAPI(game)

    try {
      const data = await request.get(apiUrl, {
        responseType: "json",
        log: true,
        gameName: getGameName(game),
      })

      if (game === "ww") {
        return this.handleWWData(data, type)
      }
      return this.handleMHYData(data, type)
    } catch (err) {
      logger.error(`[GamePush] 获取下载数据失败: ${err.message}`)
      return {
        data: null,
        patch: { game_pkgs: [], audio_pkgs: [] },
        type,
      }
    }
  }

  /**
   * 处理鸣潮游戏数据
   * @param {Object} data - API返回数据
   * @param {string} type - 下载类型
   * @returns {Object} 处理后的下载数据
   */
  handleWWData(data, type) {
    const versionType = type === "pre" ? "predownload" : "default"
    const versionData = data[versionType]?.config

    if (!versionData) {
      return {
        data: null,
        patch: { game_pkgs: [] },
        type,
      }
    }

    const cdn =
      data.cdnList?.[0]?.url?.replace(/\/+$/, "") || "https://pcdownload-huoshan.aki-game.com"

    const mainUrl = `${cdn}/${versionData.indexFile.replace(/^\//, "")}`

    const mainMajor = {
      version: versionData.version,
      game_pkgs: [
        {
          url: mainUrl,
          md5: versionData.indexFileMd5 || "",
          size: versionData.size || 0,
        },
      ],
    }

    const patchPkgs = (versionData.patchConfig || [])
      .sort((a, b) => versionComparator.compare(b.version, a.version))
      .filter(patch => patch.indexFile)
      .map(patch => ({
        url: `${cdn}/${patch.indexFile.replace(/^\//, "")}`,
        md5: patch.indexFileMd5 || "",
        size: patch.size || 0,
        version: patch.version,
      }))

    return {
      data: mainMajor,
      patch: { game_pkgs: patchPkgs },
      type,
    }
  }

  /**
   * 处理米哈游游戏数据
   * @param {Object} data - API返回数据
   * @param {string} type - 下载类型
   * @returns {Object} 处理后的下载数据
   */
  handleMHYData(data, type) {
    const packageData = data?.data?.game_packages?.[0] || {}

    const safeGetPatch = patchArray => {
      return patchArray?.[0] || { game_pkgs: [], audio_pkgs: [] }
    }

    if (type === "pre") {
      const preData = packageData?.pre_download?.major || {}
      const prePatch = safeGetPatch(packageData?.pre_download?.patches)

      return {
        data: preData,
        patch: prePatch,
        type,
      }
    } else {
      const mainData = packageData?.main?.major || {}
      const mainPatch = safeGetPatch(packageData?.main?.patches)

      return {
        data: mainData,
        patch: mainPatch,
        type,
      }
    }
  }

  /**
   * 格式化下载信息
   * @param {string} game - 游戏ID
   * @param {Object} data - 下载数据
   * @param {string} type - 下载类型
   * @param {Object} patch - 补丁数据
   * @returns {Object} 格式化后的下载信息
   */
  formatDownloadInfo(game, data, type, patch) {
    const gameName = getGameName(game)
    const version = data.version
    const typeText = type === "pre" ? "预下载" : "正式版"

    const msg = [
      `${gameName} ${typeText}下载信息`,
      `版本: ${version}`,
      "请选择需要的下载内容",
    ].join("\n")

    const clent = this.formatPackageInfo(
      data.game_pkgs,
      `${gameName} ${typeText}客户端下载`,
      "客户端",
    )

    const audio = this.formatPackageInfo(
      data.audio_pkgs,
      `${gameName} ${typeText}音频下载`,
      "音频包",
    )

    const patch_clent = this.formatPackageInfo(
      patch?.game_pkgs,
      `${gameName} ${typeText}客户端补丁下载`,
      "客户端补丁",
    )

    const patch_audio = this.formatPackageInfo(
      patch?.audio_pkgs,
      `${gameName} ${typeText}音频补丁下载`,
      "音频补丁",
    )

    return { msg, clent, audio, patch_clent, patch_audio }
  }

  /**
   * 格式化包信息
   * @param {Array} pkgs - 包数组
   * @param {string} title - 标题
   * @param {string} type - 类型
   * @returns {string} 格式化后的包信息
   */
  formatPackageInfo(pkgs, title, type) {
    if (!pkgs || pkgs.length === 0) {
      return `${title}\n暂无${type}下载`
    }

    const items = pkgs.map((pkg, index) => {
      const size = api.formatSize(pkg.size || 0)
      const name = pkg.language ? `${pkg.language}${type}` : `${type}${index + 1}`
      const version = pkg.version ? ` (${pkg.version})` : ""
      return `${name}${version}: ${pkg.url}\n大小: ${size}`
    })

    return `${title}\n${items.join("\n\n")}`
  }
}

export default new Download()
