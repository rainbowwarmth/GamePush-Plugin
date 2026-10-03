/**
 * JiuLi（玖璃）适配器
 *
 * JiuLi 是兼容 TRSS 云崽生态的 TS 内核框架，全局 plugin/segment/Bot/logger/redis 齐备，
 * 且宿主 lib/common/common.js、lib/puppeteer/puppeteer.js 与云崽同路径，故复用云崽系基座。
 *
 * 差异：
 *   1. 数据目录约定为 `data/plugins/<插件目录名>/`（插件私有数据），不是云崽的 `data/`。
 *   2. **热重载整张插件模块图重新求值** —— 模块级资源（SQLite 句柄、chokidar watcher）必须
 *      经 `globalThis.__GamePushHandoff` 交接，否则每热重载一次就泄漏一份句柄。
 *      故此处先 adoptPrevious() 收走上一份模块图的资源，再建立自己的。
 *   3. 按钮是 `segment.button(...data)` → `{ type:'button', data }`，与 icqq 的 rows 结构不同，
 *      且不同协议端支持度不一 —— 失败即降级为纯文本。
 *   4. `Bot.sendGroupMsg(bot_id, ...)` 的 `uin.includes(bot_id)` 对类型敏感，botId 必须传 Number。
 */
import { BotName, cwd, pluginName } from "../detect.js"
import { adoptPrevious } from "../lifecycle.js"
import { mapJiuliButtonRows } from "../buttons.js"
import { createYunzaiFamilyAdapter } from "./yunzai-base.js"

const logger = globalThis.logger ?? console

// 收走上一份模块图的资源（JiuLi 热重载）
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
