/**
 * 命令描述符系统
 * 将命令处理逻辑抽象为纯函数，支持不同框架的命令注册方式
 */
import { GAME_CONFIG, getGameName, getRedisKeys } from "./util.js"
import { cfg } from "../components/index.js"
import { attachCurrentVersionButtons } from "../lib/runtime/buttons.js"

export { buildCurrentVersionButtons } from "../lib/runtime/buttons.js"

// 延迟导入以避免循环依赖
let api, notice

async function ensureModel() {
  if (!api) {
    const model = await import("./index.js")
    api = model.api
    notice = model.notice
  }
}

/**
 * 构建游戏命令描述符
 * @param {Object} meta - 游戏元数据
 * @param {string} meta.gameId - 游戏ID
 * @param {string} meta.gameName - 游戏名称
 * @param {string} meta.pattern - 匹配模式
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
      handler: (e) => handleCurrentVersion(e, meta, rt)
    },
    {
      reg: `^#*${meta.pattern}${prefix}版本数据(.*)$`,
      fnc: `${meta.gameId}VersionData`,
      handler: (e) => handleVersionData(e, meta, rt)
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
    {
      reg: buildReg("删除rediskey"),
      fnc: "delkey",
      permission: "master",
      handler: (e) => handleDelKey(e, rt)
    },
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
 * 版本检查处理
 */
async function handleVersionCheck(e, meta, rt) {
  await ensureModel()
  await api.checkVersion(true, meta.gameId)
  return e.reply("✅ 已执行手动检查", true)
}

/**
 * 推送设置处理
 */
async function handlePushSet(e, meta, rt) {
  if (!e.isGroup) {
    return e.reply("❌ 该功能仅限群聊中使用", true)
  }

  const groupId = String(e.groupId)
  const botId = String(e.selfId)
  const isEnable = e.msg.includes("开启")

  if (isEnable) {
    cfg.addPushGroup(meta.gameId, botId, groupId)
  } else {
    cfg.removePushGroup(meta.gameId, botId, groupId)
  }

  const action = isEnable
    ? `已添加本群到推送列表（ID：${groupId}）`
    : `已移除本群推送（ID：${groupId}）`
  return e.reply(`✅ 已${isEnable ? "开启" : "关闭"}${meta.gameName}版本推送，${action}`, true)
}

/**
 * 当前版本查询处理
 */
async function handleCurrentVersion(e, meta, rt) {
  const { main, pre } = getRedisKeys(meta.gameId)
  const [mainVer, preVer] = await Promise.all([rt.kv.get(main), rt.kv.get(pre)])

  const msg = [
    `📌 ${meta.gameName}当前版本信息`,
    `正式版本：${mainVer || "未知"}`,
    `预下载版本：${preVer || "未开启"}`
  ].join("\n")

  return e.reply(
    attachCurrentVersionButtons(msg, meta.gameId, rt.commandButtons)
  )
}

/**
 * 版本数据查询处理
 */
async function handleVersionData(e, meta, rt) {
  const input = e.msg.replace(new RegExp(`#*${meta.pattern}?版本数据`, "i"), "").trim()
  if (!input) return showAllVersionData(e, meta, rt)
  return showSpecificVersionData(e, meta, rt, input)
}

/**
 * 显示所有版本数据
 */
async function showAllVersionData(e, meta, rt) {
  await ensureModel()
  const mainVersions = await rt.db.getMainData(meta.gameId)
  const preVersions = await rt.db.getPreData(meta.gameId)

  if (
    (!mainVersions || mainVersions.length === 0) &&
    (!preVersions || preVersions.length === 0)
  ) {
    return e.reply(`暂无${meta.gameName}版本数据`, true)
  }

  let message = `📊 ${meta.gameName}历史版本数据：\n`

  if (mainVersions && mainVersions.length > 0) {
    message += "\n📦 正式版本：\n"
    message += mainVersions
      .map((record, index) => `${index + 1}. 版本号：${record.version}，占用大小：${record.size}`)
      .join("\n")
  }

  if (preVersions && preVersions.length > 0) {
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

/**
 * 显示指定版本数据
 */
async function showSpecificVersionData(e, meta, rt, version) {
  const mainVersion = await rt.db.getMainData(meta.gameId, version)
  const preVersion = await rt.db.getPreData(meta.gameId, version)

  if ((!mainVersion || mainVersion.length === 0) && (!preVersion || preVersion.length === 0)) {
    return e.reply(`未找到${meta.gameName}版本 ${version} 的数据`, true)
  }

  let message = `📊 ${meta.gameName}版本 ${version} 数据：\n`

  if (mainVersion && mainVersion.length > 0) {
    const record = mainVersion[0]
    message += `\n📦 正式版本：\n`
    message += `版本号：${record.version}\n`
    message += `占用大小：${record.size}\n`
  }

  if (preVersion && preVersion.length > 0) {
    const record = preVersion[0]
    message += `\n\n🎁 预下载版本：\n`
    message += `版本号：${record.ver}\n`
    message += `旧版本：${record.oldver}\n`
    message += `更新大小：${record.size}\n`
  }

  return e.reply(message, true)
}

/**
 * 删除 Redis Key 处理
 */
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

/**
 * 删除预下载 Redis Key 处理
 */
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

/**
 * 设置 Redis Key 处理
 */
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

/**
 * 设置预下载 Redis Key 处理
 */
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

/**
 * 更新游戏版本数据处理
 */
async function handleUpdateDb(e, rt) {
  await ensureModel()
  await e.reply(`正在更新版本数据，请稍候...`)
  // 各运行时适配器的 db 均实现 updateDatabase（下载远端库并按唯一键合并进本地表）
  try {
    const version = await rt.db.updateDatabase()
    return e.reply(`版本数据更新完成！, 当前数据版本：${version}`)
  } catch (err) {
    logger.error(`[#更新游戏版本数据] 失败`, err)
    return e.reply(`版本数据更新失败：${err.message}`, true)
  }
}

/**
 * 构建正则表达式：支持所有游戏别名
 */
function buildReg(action) {
  const allPatterns = Object.values(GAME_CONFIG)
    .map((config) => config.reg)
    .join("|")
  return new RegExp(`^#*(?:(?:${allPatterns})\\s*)?${action}$`)
}

/**
 * 根据消息匹配游戏
 */
function getMatchGame(msg) {
  for (const [gameId, config] of Object.entries(GAME_CONFIG)) {
    const regex = new RegExp(config.reg)
    if (regex.test(msg)) return gameId
  }
  if (/^#*(删除|设置)(预下载)?rediskey/.test(msg)) {
    return "ys"
  }
  return null
}
