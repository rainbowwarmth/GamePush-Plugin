import { cfg } from "#GamePush.components"
import { plugin } from "#GamePush.lib"
import { api } from "#GamePush.model"
import { buildGameCommands } from "#GamePush.model/commands"
import { rt, ensureInit } from "#GamePush.runtime"

/**
 * 通用游戏应用基类
 * 使用命令描述符系统，支持多框架
 */
export class GamePushBase extends plugin {
  /**
   * 构造函数
   * @param {Object} options - 插件配置
   * @param {string} options.gameId - 游戏ID（如ys、sr、zzz等）
   * @param {string} options.gameName - 游戏名称（如原神、星铁等）
   * @param {string} options.regPattern - 正则表达式匹配模式
   * @param {Array} options.extraRules - 额外的规则配置
   */
  constructor(options) {
    if (!options) return
    const { gameId, gameName, regPattern, extraRules = [], priority = 100 } = options

    // 构建命令描述符
    const meta = {
      gameId,
      gameName,
      pattern: regPattern
    }

    const commands = buildGameCommands(meta, rt)

    super({
      name: `[GamePush-Plugin]${gameName}功能`,
      dsc: `${gameName}版本更新及预下载推送`,
      event: "message",
      priority: priority,
      rule: [
        ...commands.map(cmd => ({
          reg: cmd.reg,
          fnc: cmd.fnc,
          permission: cmd.permission
        })),
        ...extraRules
      ]
    })

    this.gameId = gameId
    this.gameName = gameName
    this.regPattern = regPattern

    this.task = {
      cron: cfg.getGameConfig(gameId).cron || "0 0/5 * * * *",
      name: `[GamePush-Plugin] ${gameName}版本监控`,
      fnc: () => api.autoCheck(gameId),
      log: cfg.getGameConfig(gameId).log
    }

    // 绑定命令处理器
    commands.forEach(cmd => {
      this[cmd.fnc] = async (e) => {
        await ensureInit()
        const normalizedEvent = rt.normalizeEvent(e)
        return cmd.handler(normalizedEvent)
      }
    })
  }
}
