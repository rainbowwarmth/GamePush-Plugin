import { Bot, common } from "#GamePush.lib"
import { BotName, pluginName } from "#GamePush.components"

/**
 * @param {string} botId - 机器人id
 * @returns
 */
export function getBot(botId) {
  switch (BotName) {
    case "Karin":
      return Bot.getBot(botId)
    default:
      return Bot[botId]
  }
}

/**
 * 主动发送群消息
 * @param {string} botId - 机器人id
 * @param {string} gid - 群id
 * @param {any} msg - 消息
 * @returns {Promise<any>}
 */
export async function sendGroupMsg(botId, gid, msg) {
  try {
    const bot = getBot(botId)
    if (!bot) {
      return false
    }

    if (BotName === "Karin") {
      return await Bot.sendMsg(botId, { scene: "group", peer: gid }, msg)
    } else {
      gid = Number(gid) || gid
      return await bot.pickGroup(gid).sendMsg(msg)
    }
  } catch (error) {
    logger.error(`[${pluginName}] 群消息发送失败: ${gid}`, error)
    return false
  }
}

/**
 * 制作并发送转发消息
 * @param {any} e - 事件对象
 * @param {any} msg - 消息
 */
export async function makeForwardMsg(e, msg) {
  if (BotName === "Karin") {
    msg = common.makeForward(msg, e.selfId, e.bot.account.name)
    return await e.bot.sendForwardMsg(e.contact, msg)
  } else if (Array.isArray(msg)) {
    return await Bot.makeForwardArray(msg)
  } else {
    return await Bot.makeForwardMsg(e, msg)
  }
}
