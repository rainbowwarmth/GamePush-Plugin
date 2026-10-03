/**
 * Karin 适配器
 *
 * Karin 无全局对象，全部从 `node-karin` 导入；插件目录名必须含 `karin`。
 * 任务不走 Plugin 实例，而是独立导出 `karin.task(...)`（见 apps/task.js 薄壳）。
 */
import karin, { Plugin, redis, common, segment } from "node-karin"
import { pluginName, pluginPath, pluginResources, cwd } from "../detect.js"
import { createSqliteDb } from "../sqlite-db.js"
import { onUnload as registerUnload } from "../lifecycle.js"
import { mapKarinButtonRows } from "../buttons.js"

const logger = globalThis.logger ?? console
globalThis.logger ??= logger

/** Karin 插件私有目录约定：<root>/@karinjs/<插件目录名>/ */
export const karinDataRoot = `${cwd}/@karinjs/${pluginName}`
const dataDir = `${karinDataRoot}/data`

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

// 库文件名固定取插件 package.json 的 name（GamePush-Plugin.db），不随目录名变化 —— 保证历史数据路径稳定
const db = createSqliteDb(dataDir)
// 启动即同步远端版本库（版本一致则跳过下载）。不 await：网络耗时不该拖慢插件加载
db.startupSync()
registerUnload(() => db.close())

async function sendGroupMsg(botId, gid, msg, pushChangeType) {
  try {
    const Bot = karin.default
    const bot = Bot.getBot(botId)
    if (!bot) return false
    if (pushChangeType === "1") {
      return await Bot.sendMsg(botId, { scene: "group", peer: gid }, msg)
    }
    if (pushChangeType === "2") {
      return await Bot.sendMsg(botId, { scene: "group", peer: gid }, segment.text(msg))
    }
    return false
  } catch (error) {
    logger.error(`[${pluginName}] 群消息发送失败: ${gid}`, error)
    return false
  }
}

async function makeForward(e, msgs) {
  const forward = common.makeForward(msgs, e.selfId, e.bot?.account?.name)
  return await e.bot.sendForwardMsg(e.contact, forward)
}

async function render(tplName, data) {
  const { render: karinRender } = await import("node-karin")
  const img = await karinRender({
    name: tplName,
    file: data.tplFile,
    type: data.imgType || "jpeg",
    data: { ...data },
    pageGotoParams: { waitUntil: "networkidle2" }
  })
  return segment.image(`base64://${img}`)
}

function commandButtons(rows) {
  return segment.keyboard(mapKarinButtonRows(rows))
}

function normalizeEvent(e) {
  return {
    msg: e.msg ?? "",
    isGroup: !!e.isGroup,
    groupId: String(e.group_id || e.groupId || ""),
    selfId: String(e.self_id || e.selfId || ""),
    userId: String(e.user_id || e.userId || ""),
    reply: (msg, quote) => e.reply(msg, quote),
    bot: e.bot,
    contact: e.contact,
    raw: e
  }
}

export default {
  adapter: "karin",
  BotName: "Karin",
  logger,
  kv,
  db,
  dataDir,
  pluginRoot: pluginPath,
  pluginResources,
  segment,
  plugin: Plugin,
  common,
  config: null,
  capabilities: {
    buttons: true,
    forward: true,
    render: true,
    kv: true,
    sqlite: true,
    panels: ["karin-web"]
  },
  sendGroupMsg,
  makeForward,
  render,
  normalizeEvent,
  commandButtons,
  /** Karin 的 PluginOptions 用 desc 而非 dsc，且不支持 task 字段 */
  buildAppOptions(app) {
    return {
      name: app.name,
      desc: app.dsc,
      event: app.event,
      priority: app.priority,
      rule: app.commands.map((cmd) => ({
        reg: cmd.reg,
        fnc: cmd.fnc,
        permission: cmd.permission,
        log: cmd.log
      }))
    }
  },
  /** Karin 独立定时任务：apps/task.js 薄壳调用 */
  buildTaskExports(tasks) {
    return tasks.map((task) =>
      karin.task(task.name, task.cron, async () => task.handler(), { log: task.log })
    )
  },
  onUnload: registerUnload,
  dispose: async () => {
    await db.close().catch(() => {})
  }
}
