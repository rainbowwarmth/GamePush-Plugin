import { request, pluginName } from "#GamePush.components"
import { api, getGameAPI, getGameName, getRedisKeys, versionComparator } from "#GamePush.model"
import { rt } from "#GamePush.runtime"

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
      data
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
    try {
      // 鹰角游戏必须使用 POST，不经过 GET 请求
      if (game === "zmd") {
        return this.handleHypergryphData(type)
      }

      const apiUrl = getGameAPI(game)
      const data = await request.get(apiUrl, {
        responseType: "json",
        log: true,
        gameName: getGameName(game)
      })

      if (game === "ww") {
        return this.handleWWData(data, type)
      }
      return this.handleMHYData(data, type)
    } catch (err) {
      logger.error(`[${pluginName}] 获取下载数据失败: ${err.message}`)
      return {
        data: null,
        patch: { game_pkgs: [], audio_pkgs: [] },
        type
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
        type
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
          size: versionData.size || 0
        }
      ]
    }

    const patchPkgs = (versionData.patchConfig || [])
      .sort((a, b) => versionComparator.compare(b.version, a.version))
      .filter((patch) => patch.indexFile)
      .map((patch) => ({
        url: `${cdn}/${patch.indexFile.replace(/^\//, "")}`,
        md5: patch.indexFileMd5 || "",
        size: patch.size || 0,
        version: patch.version
      }))

    return {
      data: mainMajor,
      patch: { game_pkgs: patchPkgs },
      type
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

    const safeGetPatch = (patchArray) => {
      return patchArray?.[0] || { game_pkgs: [], audio_pkgs: [] }
    }

    if (type === "pre") {
      const preData = packageData?.pre_download?.major || {}
      const prePatch = safeGetPatch(packageData?.pre_download?.patches)

      return {
        data: preData,
        patch: prePatch,
        type
      }
    } else {
      const mainData = packageData?.main?.major || {}
      const mainPatch = safeGetPatch(packageData?.main?.patches)

      return {
        data: mainData,
        patch: mainPatch,
        type
      }
    }
  }

  /**
   * 处理鹰角游戏数据
   * @param {string} type - 下载类型
   * @returns {Promise<Object>} 处理后的下载数据
   */
  async handleHypergryphData(type) {
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
      gameName: getGameName("zmd"),
      retry: 3,
      retryDelay: 1000
    })

    if (!emptyRes?.proxy_rsps?.[0]?.get_latest_game_rsp) {
      return { data: null, patch: { game_pkgs: [], audio_pkgs: [] }, type }
    }

    const latestVersion = emptyRes.proxy_rsps[0].get_latest_game_rsp.version

    if (type === "pre") {
      // 预下载：用最新版本号请求获取 pre_patch 数据
      const versionRes = await request.post(url, makeBody(latestVersion), {
        headers,
        responseType: "json",
        log: true,
        gameName: getGameName("zmd"),
        retry: 3,
        retryDelay: 1000
      })

      const gameRsp = versionRes?.proxy_rsps?.[0]?.get_latest_game_rsp
      const prePatch = gameRsp?.pre_patch
      if (!prePatch?.patches?.length) {
        return { data: null, patch: { game_pkgs: [], audio_pkgs: [] }, type }
      }

      const patchPkgs = prePatch.patches.map((p) => ({
        url: p.url,
        md5: p.md5 || "",
        size: p.package_size || 0,
        version: prePatch.version
      }))
      const patchTotalSize = prePatch.patches.reduce(
        (sum, p) => sum + Number(p.package_size || 0),
        0
      )

      const pkg = gameRsp?.pkg || {}
      const packs = pkg.packs || []
      const gamePkgs = packs.map((p) => ({
        url: p.url,
        md5: p.md5 || "",
        size: p.package_size || 0
      }))
      const pkgTotalSize = packs.reduce((sum, p) => sum + Number(p.package_size || 0), 0)

      return {
        data: {
          version: prePatch.version,
          game_pkgs: gamePkgs,
          total_size: pkgTotalSize
        },
        patch: { game_pkgs: patchPkgs, audio_pkgs: [], total_size: patchTotalSize },
        type
      }
    } else {
      // 正式版：用本地旧版本请求，获取 patch 差分增量包 + pkg 完整包
      const mainKey = getRedisKeys("zmd").main
      const oldVer = (await rt.kv.get(mainKey)) || ""

      const versionRes = await request.post(url, makeBody(oldVer), {
        headers,
        responseType: "json",
        log: true,
        gameName: getGameName("zmd"),
        retry: 3,
        retryDelay: 1000
      })

      const gameRsp = versionRes?.proxy_rsps?.[0]?.get_latest_game_rsp
      if (!gameRsp) {
        return { data: null, patch: { game_pkgs: [], audio_pkgs: [] }, type }
      }

      // 完整包数据
      const pkg = gameRsp.pkg || {}
      const packs = pkg.packs || []
      const gamePkgs = packs.map((p) => ({
        url: p.url,
        md5: p.md5 || "",
        size: p.package_size || 0
      }))
      const pkgTotalSize = packs.reduce((sum, p) => sum + Number(p.package_size || 0), 0)

      // 差分增量包数据（从旧版本到最新版本）
      const patchData = gameRsp.patch || {}
      const patchPkgs = (patchData.patches || []).map((p) => ({
        url: p.url,
        md5: p.md5 || "",
        size: p.package_size || 0,
        version: latestVersion
      }))
      const patchTotalSize = (patchData.patches || []).reduce(
        (sum, p) => sum + Number(p.package_size || 0),
        0
      )

      return {
        data: {
          version: latestVersion,
          game_pkgs: gamePkgs,
          total_size: pkgTotalSize
        },
        patch: { game_pkgs: patchPkgs, audio_pkgs: [], total_size: patchTotalSize },
        type
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
    const { version } = data
    const typeText = type === "pre" ? "预下载" : "正式版"

    const msg = [
      `${gameName} ${typeText}下载信息`,
      `版本: ${version}`,
      "请选择需要的下载内容"
    ].join("\n")

    const client = this.formatPackageInfo(
      data.game_pkgs,
      `${gameName} ${typeText}${game === "bh3" ? "游戏下载" : "游戏分卷包下载"}`,
      `${game === "bh3" ? "游戏下载" : "游戏分卷包下载"}`
    )

    const audio = this.formatPackageInfo(
      data.audio_pkgs,
      `${gameName} ${typeText}音频下载`,
      "音频包"
    )

    const patch_client = this.formatPackageInfo(
      patch?.game_pkgs,
      `${gameName} ${typeText}游戏增量包下载`,
      "游戏增量包"
    )

    const patch_audio = this.formatPackageInfo(
      patch?.audio_pkgs,
      `${gameName} ${typeText}音频增量包下载`,
      "音频增量包"
    )

    return { msg, client, audio, patch_client, patch_audio }
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
