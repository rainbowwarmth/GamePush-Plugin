/**
 * JiuLi（玖璃）适配器
 */
import { BotName, cwd, pluginName } from "../detect.js"
import { adoptPrevious } from "../lifecycle.js"
import { mapJiuliButtonRows } from "../buttons.js"
import { createYunzaiFamilyAdapter } from "./yunzai-base.js"

const logger = globalThis.logger ?? console
await adoptPrevious(logger)

export default createYunzaiFamilyAdapter({
  adapter: "jiuli",
  BotName,
  dataDir: `${cwd}/data/plugins/${pluginName}`,
  buttons: (rows) => {
    try {
      const segment = globalThis.segment
      if (typeof segment?.button !== "function") return null
      return segment.button(...mapJiuliButtonRows(rows))
    } catch (error) {
      logger.debug(`[${pluginName}] JiuLi 按钮构造失败，降级为纯文本: ${error?.message}`)
      return null
    }
  },
  send: async (botId, gid, msg) => {
    const Bot = globalThis.Bot
    const id = Number(botId) || botId
    const group = Number(gid) || gid
    if (typeof Bot?.sendGroupMsg === "function" && id) {
      return await Bot.sendGroupMsg(id, group, msg)
    }
    return await Bot[id].pickGroup(group).sendMsg(msg)
  }
})
