/**
 * Miao-Yunzai / Trss-Yunzai 适配器
 */
import { pluginName, pluginRoot, BotName } from "../../components/path.js"
import { mapYunzaiButtonRows, mapYunzaiInputButtonRows } from "./buttons.js"
import { createSqliteDb } from "./sqlite-db.js"

const logger = globalThis.logger ?? console
const dataDir = `${process.cwd()}/data`.replace(/\\/g, "/")

/** Yunzai 自带的 common（downFile/makeForwardMsg 等），供 rt.common 与 #GamePush.lib 暴露 */
const common = (await import("../../../../lib/common/common.js")).default

/** 兼容旧代码中直接使用 global.logger 的场景 */
globalThis.logger ??= logger

const kv = {
  async get(key) {
    return global.redis.get(key)
  },
  async set(key, value) {
    return global.redis.set(key, value)
  },
  async del(key) {
    return global.redis.del(key)
  }
}

const db = createSqliteDb(dataDir)

// 启动即同步远端版本库（版本一致则跳过下载）。不 await：网络耗时不该拖慢插件加载
db.startupSync()

async function sendGroupMsg(botId, gid, msg, pushChangeType) {
  try {
    gid = Number(gid) || gid
    return await Bot[botId].pickGroup(gid).sendMsg(msg)
  } catch (error) {
    logger.error(`[${pluginName}] 群消息发送失败: ${gid}`, error)
    return false
  }
}

async function makeForward(e, msgs) {
  // e 是归一化事件，Yunzai 的 makeForwardMsg 需要原始事件（e.group/e.friend）
  return await common.makeForwardMsg(e.raw ?? e, msgs)
}

async function render(tplName, data) {
  const puppeteer = (await import("../../../../lib/puppeteer/puppeteer.js")).default
  return puppeteer.screenshot(tplName, data)
}

function commandButtons(rows) {
  const segment = globalThis.segment
  if (typeof segment?.button === "function") {
    return segment.button(...mapYunzaiButtonRows(rows))
  }
  if (typeof globalThis.Bot?.Button === "function") {
    return globalThis.Bot.Button(mapYunzaiInputButtonRows(rows))
  }
  return null
}

function normalizeEvent(e) {
  return {
    msg: e.msg,
    isGroup: !!e.isGroup,
    groupId: String(e.group_id || ""),
    selfId: String(e.self_id || e.selfId || ""),
    userId: String(e.user_id || ""),
    reply: (msg, quote) => e.reply(msg, quote),
    raw: e
  }
}

export default {
  BotName,
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
  commandButtons,
  plugin: global.plugin,
  segment: global.segment,
  common
}
