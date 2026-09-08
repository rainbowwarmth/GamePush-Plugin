import { rt, ensureInit } from "./runtime/index.js"
import { pluginName } from "#GamePush.components"

await ensureInit()

/**
 * 主动发送群消息
 * @param {string} botId - 机器人id
 * @param {string} gid - 群id
 * @param {any} msg - 消息
 * @param {string} pushChangeType - 消息类型
 * @returns {Promise<any>}
 */
export async function sendGroupMsg(botId, gid, msg, pushChangeType) {
  return rt.sendGroupMsg(botId, gid, msg, pushChangeType)
}

/**
 * 制作并发送转发消息
 * @param {any} e - 事件对象
 * @param {any} msg - 消息
 */
export async function makeForwardMsg(e, msg) {
  const normalizedEvent = rt.normalizeEvent(e)
  return rt.makeForward(normalizedEvent, msg)
}
