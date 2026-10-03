/**
 * 云崽系适配器基座
 *
 * Miao-Yunzai / Trss-Yunzai / MangoCat-Yunzai / JiuLi 四者同源：
 *   - 全局 plugin / segment / Bot / logger 齐备
 *   - 宿主 lib/common/common.js、lib/puppeteer/puppeteer.js 同路径
 *   - 插件位于 <root>/plugins/<插件名>/
 * 差异（发送 API、数据目录、按钮结构、卸载钩子）由各子适配器覆盖。
 */
import path from "node:path"
import { pluginName, pluginPath, pluginResources } from "../detect.js"
import { createSqliteDb } from "../sqlite-db.js"
import { onUnload as registerUnload } from "../lifecycle.js"
import { mapYunzaiButtonRows, mapYunzaiInputButtonRows } from "../buttons.js"

/** 宿主根目录：<root>/plugins/<name>/ → <root> */
export const hostRoot = path.resolve(pluginPath, "../..").replace(/\\/g, "/")

const logger = globalThis.logger ?? console
globalThis.logger ??= logger

/**
 * 创建云崽系适配器
 * @param {object} options
 * @param {string} options.adapter            适配器 id
 * @param {string} options.BotName            框架名
 * @param {string} options.dataDir            数据目录
 * @param {(rows:Array)=>any} [options.buttons] 按钮构造器
 * @param {(botId,gid,msg,type)=>Promise<any>} [options.send] 自定义主动发送
 */
export function createYunzaiFamilyAdapter(options) {
  const { adapter, BotName, dataDir } = options

  const kv = {
    async get(key) {
      return globalThis.redis?.get(key)
    },
    async set(key, value) {
      return globalThis.redis?.set(key, value)
    },
    async del(key) {
      return globalThis.redis?.del(key)
    }
  }

  // 库文件名固定取插件 package.json 的 name（GamePush-Plugin.db），不随目录名变化 —— 保证历史数据路径稳定
  const db = createSqliteDb(dataDir)
  // 启动即同步远端版本库（版本一致则跳过下载）。不 await：网络耗时不该拖慢插件加载
  db.startupSync()
  registerUnload(() => db.close())

  /** 默认主动发送：icqq 风格的 pickGroup().sendMsg() */
  const defaultSend = async (botId, gid, msg) => {
    gid = Number(gid) || gid
    return await globalThis.Bot[botId].pickGroup(gid).sendMsg(msg)
  }

  const sendGroupMsg = async (botId, gid, msg, pushChangeType) => {
    try {
      return await (options.send ?? defaultSend)(botId, gid, msg, pushChangeType)
    } catch (error) {
      logger.error(`[${pluginName}] 群消息发送失败: ${gid}`, error)
      return false
    }
  }

  const makeForward = async (e, msgs) => {
    // e 是归一化事件，云崽的 makeForwardMsg 需要原始事件（e.group/e.friend）
    const common = options.common ?? (await import(path.join(hostRoot, "lib/common/common.js"))).default
    return await common.makeForwardMsg(e.raw ?? e, msgs)
  }

  const render = async (tplName, data) => {
    const puppeteer = (await import(path.join(hostRoot, "lib/puppeteer/puppeteer.js"))).default
    return puppeteer.screenshot(tplName, data)
  }

  const commandButtons = (rows) => {
    if (options.buttons) return options.buttons(rows)
    const segment = globalThis.segment
    if (typeof segment?.button === "function") return segment.button(...mapYunzaiButtonRows(rows))
    if (typeof globalThis.Bot?.Button === "function") {
      return globalThis.Bot.Button(mapYunzaiInputButtonRows(rows))
    }
    return null
  }

  const normalizeEvent = (e) => ({
    msg: e.msg ?? "",
    isGroup: !!e.isGroup,
    groupId: String(e.group_id || ""),
    selfId: String(e.self_id || e.selfId || ""),
    userId: String(e.user_id || ""),
    reply: (msg, quote) => e.reply(msg, quote),
    raw: e
  })

  return {
    adapter,
    BotName,
    logger,
    kv,
    db,
    dataDir,
    pluginRoot: pluginPath,
    pluginResources,
    segment: globalThis.segment,
    plugin: globalThis.plugin,
    common: null,
    config: null,
    capabilities: {
      buttons: typeof globalThis.segment?.button === "function" || typeof globalThis.Bot?.Button === "function",
      forward: true,
      render: true,
      kv: !!globalThis.redis,
      sqlite: true,
      panels: adapter === "jiuli" ? ["guoba"] : ["guoba"]
    },
    sendGroupMsg,
    makeForward,
    render,
    normalizeEvent,
    commandButtons,
    buildAppOptions(app) {
      return {
        name: app.name,
        dsc: app.dsc,
        event: app.event,
        priority: app.priority,
        rule: app.commands.map((cmd) => ({
          reg: cmd.reg,
          fnc: cmd.fnc,
          permission: cmd.permission,
          log: cmd.log
        })),
        task: app.tasks.map((task) => ({
          name: task.name,
          cron: task.cron,
          fnc: task.fnc,
          log: task.log
        }))
      }
    },
    onUnload: registerUnload,
    dispose: async () => {
      await db.close().catch(() => {})
    }
  }
}
