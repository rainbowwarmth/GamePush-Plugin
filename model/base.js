import { BotName, pluginName, PluginPackage, pluginPath } from "#GamePush.components"
import _ from "lodash"
import karin from "node-karin"
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
   * 获取游戏名称
   * @param {string} game - 游戏ID
   * @returns {string} 游戏名称
   */
  getGameName(game) {
    const gameNames = {
      sr: "星穹铁道",
      ys: "原神",
      zzz: "绝区零",
      bh3: "崩坏3",
      ww: "鸣潮"
    }
    return gameNames[game] || "未知游戏"
  }

  /**
   * @returns {string} 当前日期，格式为YYYYMMDD
   */
  getCurrentDate() {
    const now = new Date()
    const year = now.getFullYear()
    const month = (now.getMonth() + 1).toString().padStart(2, "0")
    const day = now.getDate().toString().padStart(2, "0")
    return `${year}${month}${day}`
  }

  /**
   * 获取截图数据（兼容旧API）
   * @param {string} game - 游戏ID
   * @param {string} type - 截图类型（可选）
   * @returns {Object} 截图数据
   */
  screenData(game, type = "") {
    return this.getScreenData(game, type)
  }

  /**
   * 获取截图数据
   * @param {string} game - 游戏ID
   * @param {string} type - 截图类型（可选）
   * @returns {Object} 截图数据
   */
  getScreenData(game, type = "") {
    const currentDate = this.getCurrentDate()
    let basic
    if (BotName === "Karin") {
      basic = {
        tplFile: `${pluginPath}/resources/html/GamePush-Plugin/GamePush-Plugin.html`,
        fontsPath: `${pluginPath}/resources/fonts/`,
        pluResPath: `${pluginPath}/resources/`,
        htmlSavePath: `${this._path}/@karinjs/${pluginName}/html/`
      }
    } else {
      basic = {
        tplFile: path.join(
          this._path,
          "plugins/GamePush-Plugin/resources/html/GamePush-Plugin/GamePush-Plugin.html"
        ),
        fontsPath: path.join(this._path, "plugins/GamePush-Plugin/resources/fonts/"),
        pluResPath: path.join(this._path, "plugins/GamePush-Plugin/resources/"),
        htmlSavePath: path.join(this._path, "tmp/html/GamePush-Plugin")
      }
    }
    const other = {
      saveId: `push_${game}_${type}_${currentDate}`,
      cwd: this._path,
      htmlFileName: `${game}_${type}_${currentDate}.html`,
      bot: {
        name: BotName
      },
      plugin: {
        name: pluginName,
        version: PluginPackage.version
      }
    }

    const icons = {
      zzz: "https://www.miyoushe.com/_static/img/game-zzz.3ca2bac.png",
      sr: "https://c-ssl.duitang.com/uploads/blog/202110/11/20211011094243_6ff48.jpeg",
      ys: "https://bbs-static.miyoushe.com/avatar/avatar10011.png",
      bh3: "https://www.miyoushe.com/_static/img/game-bh3.abe5ead.jpg",
      ww: "https://cn.bing.com/th?id=OSK.d2e8b2efa5867fba330b354d0472f5e5&w=120&h=120&qlt=120&c=6&rs=1&cdv=1&pid=RS"
    }

    return {
      ...other,
      ...basic,
      gameName: this.getGameName(game),
      icon: icons[game]
    }
  }
}
