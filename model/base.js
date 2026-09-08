import { BotName, pluginName, PluginPackage, pluginPath, request } from "#GamePush.components"
import { GAME_CONFIG, getGameIcon } from "#GamePush.model"
import path from "path"
/**
 * 基础类，提供共享功能
 */
export default class base {
  /**
   * 构造函数
   * @param {Object} e - 事件对象
   */
  constructor(e = {}) {
    this.e = e
    this.userId = Number(e?.user_id) || String(e?.user_id)
    this.selfid = Number(e?.selfId) || String(e?.selfId) || Number(e?.self_id) || String(e?.self_id)
    this.model = "GamePush-Plugin"
    this._path = process.cwd().replace(/\\/g, "/")
  }

  /**
   * 获取Redis前缀
   * @returns {string} Redis前缀
   */
  get prefix() {
    return `Yz:GamePush-Plugin:${this.model}:`
  }

  /**
   * @param {string} game - 游戏ID
   */
  async GameIcon(game) {
    if (game === "ww")
      return "https://cn.bing.com/th?id=OSK.d2e8b2efa5867fba330b354d0472f5e5&w=120&h=120&qlt=120&c=6&rs=1&cdv=1&pid=RS"
    if (game === "zmd") return "https://bbs.hycdn.cn/asset/endfield.png"
    const res = await request.get(getGameIcon(), {
      responseType: "json",
      log: true,
      gameName: GAME_CONFIG[game]?.name || "未知游戏"
    })
    const { id, biz } = GAME_CONFIG[game]
    return res.data.games.find((g) => g.id === id || g.biz === biz)?.display?.icon?.url || ""
  }

  /**
   * 把图标 URL 下载并内联为 base64 data URI
   *
   * 渲染器按 networkidle2 判定加载完成（在途连接 ≤2 即视为空闲），而页面里唯一的
   * 网络资源就是这个图标——只剩它 1 个请求在下载时 networkidle2 已判定空闲并截图，
   * 图标遂空白。改为在 Node 端预取字节内联进 <img>，渲染时不再有网络依赖。
   * 取字节失败时回落原 URL（不比现状更差）。
   * @param {string} url - 图标地址
   * @returns {Promise<string>} data URI 或原始 URL
   */
  async embedIcon(url) {
    if (!url || url.startsWith("data:")) return url
    try {
      const res = await request.get(url, { responseType: "raw", log: false })
      if (!res?.ok) return url
      const buf = Buffer.from(await res.arrayBuffer())
      const mime = (res.headers.get("content-type") || "image/png").split(";")[0].trim()
      return `data:${mime};base64,${buf.toString("base64")}`
    } catch {
      return url
    }
  }

  /**
   * @returns {string} 当前日期，格式为YYYYMMDD
   */
  getCurrentDate() {
    return new Date().toISOString().slice(0, 10).replace(/-/g, "")
  }

  /**
   * 获取截图数据（兼容旧API）
   * @param {string} game - 游戏ID
   * @param {string} type - 截图类型（可选）
   * @returns {Object} 截图数据
   */
  screenData(game, type = "", html = "") {
    return this.getScreenData(game, type, html)
  }

  /**
   * 获取截图数据
   * @param {string} game - 游戏ID
   * @param {string} type - 截图类型（可选）
   * @returns {Object} 截图数据
   */
  async getScreenData(game, type = "", html = "") {
    const currentDate = this.getCurrentDate()
    let basic
    if (BotName === "Karin") {
      basic = {
        tplFile: `${pluginPath}/resources/html/GamePush-Plugin/GamePush-Plugin-${html}.html`,
        fontsPath: `${pluginPath}/resources/fonts/`,
        pluResPath: `${pluginPath}/resources/`,
        htmlSavePath: `${this._path}/@karinjs/${pluginName}/html/`,
        plugin: {
          name: "karin-plugin-GamePush",
          version: PluginPackage.version
        }
      }
    } else {
      basic = {
        tplFile: path.join(
          this._path,
          `plugins/GamePush-Plugin/resources/html/GamePush-Plugin/GamePush-Plugin-${html}.html`
        ),
        fontsPath: path.join(this._path, "plugins/GamePush-Plugin/resources/fonts/"),
        pluResPath: path.join(this._path, "plugins/GamePush-Plugin/resources/"),
        htmlSavePath: path.join(this._path, "tmp/html/GamePush-Plugin"),
        plugin: {
          name: "GamePush-Plugin",
          version: PluginPackage.version
        }
      }
    }
    const other = {
      saveId: `push_${game}_${type}_${currentDate}`,
      cwd: this._path,
      htmlFileName: `${game}_${type}_${currentDate}.html`,
      bot: {
        name: BotName
      }
    }

    const iconUrl = await this.GameIcon(game)
    return {
      ...other,
      ...basic,
      gameName: GAME_CONFIG[game]?.name || "未知游戏",
      icon: await this.embedIcon(iconUrl)
    }
  }
}
