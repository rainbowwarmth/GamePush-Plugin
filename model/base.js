import path from "path"
import request from "../components/request.js"
import { pluginName, PluginPackage } from "../lib/runtime/detect.js"
import { rt } from "../lib/runtime/index.js"
import { GAME_CONFIG } from "./util.js"
import { getGameIcon } from "./games.js"

/** 转成模板里可直接用的路径（正斜杠 + 可选结尾带 /） */
const toUrlPath = (target, trailingSlash = false) => {
  const text = String(target).replace(/\\/g, "/")
  if (!trailingSlash) return text
  return text.endsWith("/") ? text : `${text}/`
}

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
   * 取游戏图标（实现见 games.js 的对应描述符）
   * @param {string} game - 游戏ID
   * @returns {Promise<string>} 图标地址
   */
  async GameIcon(game) {
    return getGameIcon(game)
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
   * @param {string} html - html 模板名
   * @returns {Object} 截图数据
   */
  screenData(game, type = "", html = "") {
    return this.getScreenData(game, type, html)
  }

  /**
   * 获取截图数据
   * @param {string} game - 游戏ID
   * @param {string} type - 截图类型（可选）
   * @param {string} html - html 模板名
   * @returns {Promise<Object>} 截图数据
   */
  async getScreenData(game, type = "", html = "") {
    const currentDate = this.getCurrentDate()
    // 路径全部来自兼容层，不再硬编码插件目录名 —— 改名 / Karin 目录约定都能自适应
    const resPath = rt.pluginResources || path.join(rt.pluginRoot, "resources")
    const basic = {
      tplFile: toUrlPath(path.join(resPath, "html", "GamePush-Plugin", `GamePush-Plugin-${html}.html`)),
      fontsPath: toUrlPath(path.join(resPath, "fonts"), true),
      pluResPath: toUrlPath(resPath, true),
      htmlSavePath: toUrlPath(path.join(rt.dataDir || this._path, "html")),
      plugin: {
        name: pluginName,
        version: PluginPackage.version
      }
    }
    const other = {
      saveId: `push_${game}_${type}_${currentDate}`,
      cwd: this._path,
      htmlFileName: `${game}_${type}_${currentDate}.html`,
      bot: {
        name: rt.BotName
      }
    }

    return {
      ...other,
      ...basic,
      gameName: GAME_CONFIG[game]?.name || "未知游戏",
      icon: await this.embedIcon(await this.GameIcon(game))
    }
  }
}
