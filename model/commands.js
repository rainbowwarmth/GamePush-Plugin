/**
 * 命令描述符系统
 *
 * 命令逻辑写成框架无关的纯函数（handler），各框架的注册语法由兼容层翻译。
 * 业务侧只在这里声明「有哪些命令」，不关心 rule / ctx.command / karin.command 的差异。
 */
import { GAME_CONFIG, getGameName, getRedisKeys } from "./util.js"
import { cfg } from "../components/index.js"
import { attachCurrentVersionButtons } from "../lib/runtime/buttons.js"
import { buildGameTaskDefs } from "./tasks.js"

export { buildCurrentVersionButtons } from "../lib/runtime/buttons.js"

/** 提供下载链接命令的游戏（原神/崩坏3 无下载命令） */
export const DOWNLOAD_GAMES = new Set(["sr", "zzz", "ww", "zmd"])

// 延迟导入以避免循环依赖
let api, notice, download

async function ensureModel() {
  if (!api) {
    const model = await import("./index.js")
    api = model.api
    notice = model.notice
    download = model.download
  }
}

/**
 * 构建游戏命令描述符
 * @param {Object} meta - 游戏元数据
 * @param {string} meta.gameId
 * @param {string} meta.gameName
 * @param {string} meta.pattern
 * @param {Object} rt - 运行时实例
 * @returns {Array} 命令描述符数组
 */
export function buildGameCommands(meta, rt) {
  const prefix = meta.gameId === "ys" ? "?" : ""
  return [
    {
      reg: `^#*${meta.pattern}${prefix}版本监控$`,
      fnc: `${meta.gameId}Check`,
      permission: "master",
      handler: (e) => handleVersionCheck(e, meta, rt)
    },
    {
      reg: `^#*${meta.pattern}${prefix}(开启|关闭)版本推送$`,
      fnc: `${meta.gameId}PushSet`,
      permission: "master",
      handler: (e) => handlePushSet(e, meta, rt)
    },
    {
      reg: `^#*${meta.pattern}${prefix}当前版本$`,
      fnc: `${meta.gameId}Ver`,
      permission: "all",
      handler: (e) => handleCurrentVersion(e, meta, rt)
    },
    {
      reg: `^#*${meta.pattern}${prefix}版本数据(.*)$`,
      fnc: `${meta.gameId}VersionData`,
      permission: "all",
      handler: (e) => handleVersionData(e, meta, rt)
    }
  ]
}

/**
 * 构建下载链接命令描述符（仅 sr / zzz / ww / zmd）
 */
export function buildDownloadCommands(meta, rt) {
  return [
    {
      reg: `^#*${meta.pattern}获取下载链接$`,
      fnc: `${meta.gameId}DownloadLinks`,
      permission: "all",
      handler: (e) => handleDownload(e, meta, rt, "main")
    },
    {
      reg: `^#*${meta.pattern}获取预下载链接$`,
      fnc: `${meta.gameId}PreDownloadLinks`,
      permission: "all",
      handler: (e) => handleDownload(e, meta, rt, "pre")
    }
  ]
}

/**
 * 构建管理命令描述符
 * @param {Object} rt - 运行时实例
 * @returns {Array} 命令描述符数组
 */
export function buildSetCommands(rt) {
  return [
    { reg: buildReg("删除rediskey"), fnc: "delkey", permission: "master", handler: (e) => handleDelKey(e, rt) },
    {
      reg: buildReg("删除预下载rediskey"),
      fnc: "delPrekey",
      permission: "master",
      handler: (e) => handleDelPreKey(e, rt)
    },
    {
      reg: buildReg("设置rediskey\\s*(.+)"),
      fnc: "setkey",
      permission: "master",
      handler: (e) => handleSetKey(e, rt)
    },
    {
      reg: buildReg("设置预下载rediskey\\s*(.+)"),
      fnc: "setPrekey",
      permission: "master",
      handler: (e) => handleSetPreKey(e, rt)
    },
    {
      reg: "#更新游戏版本数据",
      fnc: "updatedb",
      permission: "master",
      handler: (e) => handleUpdateDb(e, rt)
    }
  ]
}

/**
 * 构建单个游戏的完整应用定义（命令 + 定时任务）
 * @param {string} gameId
 * @param {Object} rt
 * @returns {Object} defineApp 入参
 */
export function buildGameApp(gameId, rt) {
  const config = GAME_CONFIG[gameId]
  const meta = { gameId, gameName: config.name, pattern: config.reg }
  const commands = buildGameCommands(meta, rt)
  if (DOWNLOAD_GAMES.has(gameId)) commands.push(...buildDownloadCommands(meta, rt))

  return {
    id: gameId,
    name: `[GamePush-Plugin]${config.name}功能`,
    dsc: `${config.name}版本更新及预下载推送`,
    priority: 100,
    commands,
    tasks: buildGameTaskDefs(gameId)
  }
}

/**
 * 构建主人管理应用定义
 * @param {Object} rt
 * @returns {Object} defineApp 入参
 */
export function buildSetApp(rt) {
  return {
    id: "set",
    name: "[GamePush-Plugin]主人功能",
    dsc: "[GamePush-Plugin]主人功能",
    priority: 100,
    commands: buildSetCommands(rt),
    tasks: []
  }
}

/* ------------------------------------------------------------------ */
/* 处理函数                                                            */
/* ------------------------------------------------------------------ */

async function handleVersionCheck(e, meta, rt) {
  await ensureModel()
  try {
    await api.checkVersion(meta.gameId)
    return e.reply("✅ 已执行手动检查", true)
  } catch (err) {
    rt.logger?.error(`[GamePush-Plugin] ${meta.gameName}版本检查失败`, err)
    return e.reply(`❌ ${meta.gameName}检查失败：${err.message}`, true)
  }
}

async function handlePushSet(e, meta, rt) {
  if (!e.isGroup) return e.reply("❌ 该功能仅限群聊中使用", true)

  const groupId = String(e.groupId)
  const botId = String(e.selfId)
  const isEnable = e.msg.includes("开启")

  if (isEnable) cfg.addPushGroup(meta.gameId, botId, groupId)
  else cfg.removePushGroup(meta.gameId, botId, groupId)

  const action = isEnable
    ? `已添加本群到推送列表（ID：${groupId}）`
    : `已移除本群推送（ID：${groupId}）`
  return e.reply(`✅ 已${isEnable ? "开启" : "关闭"}${meta.gameName}版本推送，${action}`, true)
}

async function handleCurrentVersion(e, meta, rt) {
  const { main, pre } = getRedisKeys(meta.gameId)
  const [mainVer, preVer] = await Promise.all([rt.kv.get(main), rt.kv.get(pre)])

  const msg = [
    `📌 ${meta.gameName}当前版本信息`,
    `正式版本：${mainVer || "未知"}`,
    `预下载版本：${preVer || "未开启"}`
  ].join("\n")

  return e.reply(attachCurrentVersionButtons(msg, meta.gameId, rt.commandButtons))
}

async function handleVersionData(e, meta, rt) {
  const input = e.msg.replace(new RegExp(`#*${meta.pattern}?版本数据`, "i"), "").trim()
  if (!input) return showAllVersionData(e, meta, rt)
  return showSpecificVersionData(e, meta, rt, input)
}

async function showAllVersionData(e, meta, rt) {
  await ensureModel()
  const mainVersions = await rt.db.getMainData(meta.gameId)
  const preVersions = await rt.db.getPreData(meta.gameId)

  if ((!mainVersions || mainVersions.length === 0) && (!preVersions || preVersions.length === 0)) {
    return e.reply(`暂无${meta.gameName}版本数据`, true)
  }

  let message = `📊 ${meta.gameName}历史版本数据：\n`

  if (mainVersions?.length) {
    message += "\n📦 正式版本：\n"
    message += mainVersions
      .map((record, index) => `${index + 1}. 版本号：${record.version}，占用大小：${record.size}`)
      .join("\n")
  }

  if (preVersions?.length) {
    message += "\n\n🎁 预下载版本：\n"
    message += preVersions
      .map(
        (record, index) =>
          `${index + 1}. 版本号：${record.ver}，旧版本：${record.oldver}，更新大小：${record.size}`
      )
      .join("\n")
  }

  message += "\n\n📝 提示：发送 #版本数据 [版本号] 查看详细数据"
  return e.reply(await rt.makeForward(e, [message]))
}

async function showSpecificVersionData(e, meta, rt, version) {
  const mainVersion = await rt.db.getMainData(meta.gameId, version)
  const preVersion = await rt.db.getPreData(meta.gameId, version)

  if ((!mainVersion || mainVersion.length === 0) && (!preVersion || preVersion.length === 0)) {
    return e.reply(`未找到${meta.gameName}版本 ${version} 的数据`, true)
  }

  let message = `📊 ${meta.gameName}版本 ${version} 数据：\n`

  if (mainVersion?.length) {
    const record = mainVersion[0]
    message += `\n📦 正式版本：\n版本号：${record.version}\n占用大小：${record.size}\n`
  }

  if (preVersion?.length) {
    const record = preVersion[0]
    message += `\n\n🎁 预下载版本：\n版本号：${record.ver}\n旧版本：${record.oldver}\n更新大小：${record.size}\n`
  }

  return e.reply(message, true)
}

/** 获取(预)下载链接 */
async function handleDownload(e, meta, rt, type) {
  await ensureModel()
  const { gameId, gameName } = meta
  const typeText = type === "pre" ? "预下载" : "正式版本"
  try {
    const { data, patch } = await download.getDownloadData(gameId, type)
    if (!data) return e.reply(`当前没有可用的${typeText}下载`, true)

    const info = download.formatDownloadInfo(gameId, data, type, patch)
    const withAudio = gameId === "sr" || gameId === "zzz"
    const msgs = withAudio
      ? [info.msg, info.client, info.audio, info.patch_client, info.patch_audio]
      : [info.msg, info.client, info.patch_client]
    return e.reply(await rt.makeForward(e, msgs))
  } catch (err) {
    rt.logger?.error(`[GamePush-Plugin] 获取${gameName}${typeText}下载链接失败`, err)
    return e.reply(`❌ 获取${typeText}下载链接失败: ${err.message}`, true)
  }
}

async function handleDelKey(e, rt) {
  try {
    const gameId = getMatchGame(e.msg)
    if (!gameId) return e.reply("未找到匹配的游戏类型")
    const keys = getRedisKeys(gameId)
    if (!keys?.main) return e.reply("配置中未找到主RedisKey")
    await rt.kv.del(keys.main)
    return e.reply(`${getGameName(gameId)} RedisKey已删除`)
  } catch (error) {
    return e.reply(`删除失败: ${error.message}`)
  }
}

async function handleDelPreKey(e, rt) {
  try {
    const gameId = getMatchGame(e.msg)
    if (!gameId) return e.reply("未找到匹配的游戏类型")
    const keys = getRedisKeys(gameId)
    if (!keys?.pre) return e.reply("配置中未找到预下载RedisKey")
    await rt.kv.del(keys.pre)
    return e.reply(`${getGameName(gameId)} 预下载RedisKey已删除`)
  } catch (error) {
    return e.reply(`删除失败: ${error.message}`)
  }
}

async function handleSetKey(e, rt) {
  try {
    const gameId = getMatchGame(e.msg)
    if (!gameId) return e.reply("未找到匹配的游戏类型")
    const keys = getRedisKeys(gameId)
    if (!keys?.main) return e.reply("配置中未找到主RedisKey")
    const [, value] = e.msg.match(/设置rediskey\s*(.+)/i) || []
    if (!value) return e.reply("请提供要设置的值")
    await rt.kv.set(keys.main, value.trim())
    return e.reply(`${getGameName(gameId)} RedisKey已设置为: ${value}`)
  } catch (error) {
    return e.reply(`设置失败: ${error.message}`)
  }
}

async function handleSetPreKey(e, rt) {
  try {
    const gameId = getMatchGame(e.msg)
    if (!gameId) return e.reply("未找到匹配的游戏类型")
    const keys = getRedisKeys(gameId)
    if (!keys?.pre) return e.reply("配置中未找到预下载RedisKey")
    const [, value] = e.msg.match(/设置预下载rediskey\s*(.+)/i) || []
    if (!value) return e.reply("请提供要设置的值")
    await rt.kv.set(keys.pre, value.trim())
    return e.reply(`${getGameName(gameId)} 预下载RedisKey已设置为: ${value}`)
  } catch (error) {
    return e.reply(`设置失败: ${error.message}`)
  }
}

async function handleUpdateDb(e, rt) {
  await ensureModel()
  await e.reply("正在更新版本数据，请稍候...")
  try {
    const version = await rt.db.updateDatabase()
    return e.reply(`版本数据更新完成！, 当前数据版本：${version}`)
  } catch (err) {
    rt.logger?.error("[#更新游戏版本数据] 失败", err)
    return e.reply(`版本数据更新失败：${err.message}`, true)
  }
}

/** 构建正则表达式：支持所有游戏别名 */
function buildReg(action) {
  const allPatterns = Object.values(GAME_CONFIG)
    .map((config) => config.reg)
    .join("|")
  return new RegExp(`^#*(?:(?:${allPatterns})\\s*)?${action}$`)
}

/** 根据消息匹配游戏 */
function getMatchGame(msg) {
  for (const [gameId, config] of Object.entries(GAME_CONFIG)) {
    if (new RegExp(config.reg).test(msg)) return gameId
  }
  if (/^#*(删除|设置)(预下载)?rediskey/.test(msg)) return "ys"
  return null
}
