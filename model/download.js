/**
 * 下载数据编排
 *
 * 与 api.js 同理：厂商差异全在 model/games.js，这里只做「带缓存的取数 + 文案格式化」。
 */
import { pluginName } from "#GamePush.components"
import { rt } from "#GamePush.runtime"
import { getGameAdapter } from "./games.js"
import { getGameName, formatSize } from "./util.js"

class Download {
  /** 取数缓存：推送与「获取下载链接」常在同一时段触发，避免重复打接口 */
  cache = new Map()
  cacheTTL = 30000

  /**
   * 获取下载数据
   * @param {string} game - 游戏ID
   * @param {string} type - 下载类型（"main" | "pre"）
   * @returns {Promise<{data: Object|null, patch: Object, type: string}>} 下载数据
   */
  async getDownloadData(game, type = "main") {
    const cacheKey = `${game}-${type}`
    const cached = this.cache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) return cached.data

    const data = await this.fetchDownloadData(game, type)
    this.cache.set(cacheKey, { timestamp: Date.now(), data })
    return data
  }

  /**
   * 从对应厂商接口获取下载数据
   * @param {string} game - 游戏ID
   * @param {string} type - 下载类型
   * @returns {Promise<Object>} 下载数据
   */
  async fetchDownloadData(game, type) {
    try {
      return await getGameAdapter(game).fetchPackages(game, type)
    } catch (err) {
      rt.logger?.error(`[${pluginName}] 获取下载数据失败: ${err.message}`)
      return { data: null, patch: { game_pkgs: [], audio_pkgs: [] }, type }
    }
  }

  /**
   * 格式化下载信息
   * @param {string} game - 游戏ID
   * @param {Object} data - 完整包数据
   * @param {string} type - 下载类型
   * @param {Object} patch - 增量包数据
   * @returns {{msg: string, client: string, audio: string, patch_client: string, patch_audio: string}}
   */
  formatDownloadInfo(game, data, type, patch) {
    const gameName = getGameName(game)
    const { version } = data
    const typeText = type === "pre" ? "预下载" : "正式版"
    // 崩坏3 的包体是整包而非分卷，措辞随之不同
    const pkgLabel = game === "bh3" ? "游戏下载" : "游戏分卷包下载"

    return {
      msg: [`${gameName} ${typeText}下载信息`, `版本: ${version}`, "请选择需要的下载内容"].join("\n"),
      client: this.formatPackageInfo(data.game_pkgs, `${gameName} ${typeText}${pkgLabel}`, pkgLabel),
      audio: this.formatPackageInfo(data.audio_pkgs, `${gameName} ${typeText}音频下载`, "音频包"),
      patch_client: this.formatPackageInfo(
        patch?.game_pkgs,
        `${gameName} ${typeText}游戏增量包下载`,
        "游戏增量包"
      ),
      patch_audio: this.formatPackageInfo(
        patch?.audio_pkgs,
        `${gameName} ${typeText}音频增量包下载`,
        "音频增量包"
      )
    }
  }

  /**
   * 格式化包信息
   * @param {Array} pkgs - 包数组
   * @param {string} title - 标题
   * @param {string} type - 类型
   * @returns {string} 格式化后的包信息
   */
  formatPackageInfo(pkgs, title, type) {
    if (!pkgs?.length) return `${title}\n暂无${type}下载`

    const items = pkgs.map((pkg, index) => {
      const name = pkg.language ? `${pkg.language}${type}` : `${type}${index + 1}`
      const version = pkg.version ? ` (${pkg.version})` : ""
      return `${name}${version}: ${pkg.url}\n大小: ${formatSize(pkg.size || 0)}`
    })

    return `${title}\n${items.join("\n\n")}`
  }
}

export default new Download()
