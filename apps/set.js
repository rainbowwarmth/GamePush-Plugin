import { plugin } from "#GamePush.lib"
import { buildSetCommands } from "#GamePush.model/commands"
import { rt, ensureInit } from "#GamePush.runtime"

/**
 * 主人功能类
 * 使用命令描述符系统，支持多框架
 */
export class Set extends plugin {
  constructor() {
    // 构建命令描述符
    const commands = buildSetCommands(rt)

    super({
      name: "[GamePush-Plugin]主人功能",
      dsc: "[GamePush-Plugin]主人功能",
      event: "message",
      priority: 100,
      rule: commands.map(cmd => ({
        reg: cmd.reg,
        fnc: cmd.fnc,
        permission: cmd.permission
      }))
    })

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
