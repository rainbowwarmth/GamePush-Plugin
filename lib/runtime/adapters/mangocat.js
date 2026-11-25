/**
 * MangoCat-Yunzai 适配器
 */
import { BotName, cwd, pluginName } from "../detect.js"
import { createYunzaiFamilyAdapter } from "./yunzai-base.js"

const logger = globalThis.logger ?? console

export default createYunzaiFamilyAdapter({
  adapter: "mangocat",
  BotName,
  dataDir: `${cwd}/data`,
  send: async (botId, gid, msg) => {
    const Bot = globalThis.Bot
    const id = Number(botId) || botId
    const group = Number(gid) || gid

    if (typeof Bot?.sendGroupMsg === "function" && id) {
      const result = await Bot.sendGroupMsg(id, group, msg)
      // 黑白名单拦截时框架返回 false —— 必须显式告警，否则表现为「推送静默丢失」
      if (result === false) {
        logger.warn(`[${pluginName}] MangoCat 拒绝发送（群 ${group} 不在白名单或已在黑名单）`)
      }
      return result
    }
    return await Bot[id].pickGroup(group).sendMsg(msg)
  }
})
