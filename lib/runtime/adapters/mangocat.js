/**
 * MangoCat-Yunzai 适配器
 *
 * 与 Miao-Yunzai 同源，差异：
 *   1. 内置 OneBotv11 适配器，Bot[botId] 未必是 icqq Client —— 主动发送改走框架统一出口
 *      `Bot.sendGroupMsg(botId, gid, msg)`（源码 lib/bot.js:647，自带黑白名单校验）。
 *   2. `Bot.uin.includes(bot_id)` 对类型敏感，botId 必须传 Number，否则会走「等待 Bot 上线」分支超时。
 *   3. 独有安全三件套（pluginScan / fsGuard / cmdGuard）——本插件不触碰危险路径，无需改动。
 *   4. 渲染走自带独立模板（pluResPath），不依赖 liulian-plugin 的布局资源。
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
