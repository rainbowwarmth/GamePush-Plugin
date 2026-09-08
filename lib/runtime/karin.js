/**
 * Karin 适配器
 */
import { pluginRoot } from "../../components/path.js"
import { createSqliteDb } from "./sqlite-db.js"
import karin, { Plugin, redis, common, segment, render as karinRender } from "node-karin"

const logger = globalThis.logger ?? console
globalThis.logger ??= logger

const kv = {
  async get(key) {
    return redis.get(key)
  },
  async set(key, value) {
    return redis.set(key, value)
  },
  async del(key) {
    return redis.del(key)
  }
}

const dataDir = `${process.cwd()}/@karinjs/karin-plugin-gamepush/data`.replace(/\\/g, "/")

const db = createSqliteDb(dataDir)

async function sendGroupMsg(botId, gid, msg, pushChangeType) {
  try {
    const Bot = karin.default
    const bot = Bot.getBot(botId)
    if (!bot) return false
    if (pushChangeType === "1") {
      return await Bot.sendMsg(botId, { scene: "group", peer: gid }, msg)
    } else if (pushChangeType === "2") {
      const message = segment.text(msg)
      return await Bot.sendMsg(botId, { scene: "group", peer: gid }, message)
    }
  } catch (error) {
    logger.error(`[karin-plugin-gamepush] 群消息发送失败: ${gid}`, error)
    return false
  }
}

async function makeForward(e, msgs) {
  const forward = common.makeForward(msgs, e.selfId, e.bot.account.name)
  return await e.bot.sendForwardMsg(e.contact, forward)
}

async function render(tplName, data) {
  const renderOptions = {
    name: tplName,
    file: data.tplFile,
    type: data.imgType || "jpeg",
    data: { ...data },
    pageGotoParams: { waitUntil: "networkidle2" }
  }
  const { render } = (await import("node-karin")).render
  const { segment } = await import("node-karin")
  const img = await render(renderOptions)
  const image = `base64://${img}`
  return segment.image(image)
}

function normalizeEvent(e) {
  return {
    msg: e.msg,
    isGroup: !!e.isGroup,
    groupId: String(e.group_id || ""),
    selfId: String(e.self_id || e.selfId || ""),
    userId: String(e.user_id || ""),
    reply: (msg, quote) => e.reply(msg, quote),
    bot: e.bot,
    contact: e.contact,
    raw: e
  }
}

export default {
  BotName: "Karin",
  logger,
  kv,
  db,
  http: null,
  config: null,
  dataDir,
  pluginRoot,
  sendGroupMsg,
  makeForward,
  render,
  normalizeEvent,
  plugin: Plugin,
  segment,
  common
}
