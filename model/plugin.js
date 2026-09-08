/**
 * yunzai-ng 插件定义
 * 具体的命令注册、定时任务等实现均在此处，根目录 index.js 仅负责加载导出
 */
import { definePlugin, s } from "@yunzai-ng/core"
import { rt, initRuntime } from "../lib/runtime/index.js"
import { gameIds, getGameName, api, download } from "./index.js"
import { buildGameCommands, buildSetCommands } from "./commands.js"
import { GAME_CONFIG } from "./util.js"
import { cfg, PluginPackage } from "../components/index.js"

const DEFAULT_CRON = "0 0/5 * * * *"

const gameConfigSchema = (gameName) =>
  s
    .object({
      enable: s.boolean().default(true).title("启用推送").desc(`是否监控${gameName}版本更新`),
      log: s.boolean().default(false).title("启用日志").desc("是否输出详细检查日志"),
      cron: s.cron().default(DEFAULT_CRON).title("检查频率").desc("版本检查的 cron 表达式，默认每 5 分钟一次"),
      pushGroups: s
        .array(
          s.object({
            botId: s.string().default("").title("机器人ID").desc("推送使用的机器人账号 id"),
            groupId: s.string().default("").title("推送群").desc("接收推送的群号")
          })
        )
        .default([])
        .title("推送配置")
        .desc("检测到更新后推送的「机器人 + 群」列表"),
      pushChangeType: s
        .select([
          { value: "1", label: "图片消息" },
          { value: "2", label: "文字消息" }
        ])
        .default("1")
        .title("消息类型")
        .desc("推送消息形式：图片或文字"),
      html: s
        .select([
          { value: "default", label: "默认" },
          { value: "Simple", label: "简约" }
        ])
        .default("default")
        .title("html模板")
        .desc("图片消息使用的渲染模板")
    })
    .title(gameName)

const configSchema = s.object(
  Object.fromEntries(gameIds.map((id) => [id, gameConfigSchema(getGameName(id))]))
)

/** 命令模式归一化：正则源字符串转 RegExp，已是 RegExp 则原样返回 */
const toPattern = (reg) => (reg instanceof RegExp ? reg : new RegExp(reg))

/** 提供下载链接命令的游戏（原神/崩坏3 无下载命令） */
const DOWNLOAD_GAMES = new Set(["sr", "zzz", "ww", "zmd"])

// 处理"获取(预)下载链接"命令：拉取下载数据 → 格式化 → 转发消息
// sr/zzz 含音频包段，ww/zmd 不含（与 apps/*.js 的原实现一致）
const handleDownload = async (ctx, gameId, type, rawEvent) => {
  const e = rt.normalizeEvent(rawEvent)
  const gameName = getGameName(gameId)
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
    ctx.logger.error(`[GamePush-Plugin] 获取${gameName}${typeText}下载链接失败`, err)
    return e.reply(`❌ 获取${typeText}下载链接失败: ${err.message}`, true)
  }
}

export default definePlugin({
  name: "GamePush-Plugin",
  version: PluginPackage.version,
  description: "自动监控游戏版本更新并推送通知",
  configSchema,

  async setup(ctx) {
    // 初始化运行时
    await initRuntime(ctx)

    // 把内核托管的配置（WebUI 面板可视化编辑，落盘 config/GamePush-Plugin.yaml）接入 cfg 单例，
    // 命令与定时任务读到的即面板里的配置，形成单一数据源。必须在下方读取 cfg.getGameConfig 之前。
    cfg.bindYng(ctx.config)

    // 注册游戏命令
    for (const gameId of gameIds) {
      const gameConfig = GAME_CONFIG[gameId]
      const meta = {
        gameId,
        gameName: getGameName(gameId),
        pattern: gameConfig.reg
      }

      const commands = buildGameCommands(meta, rt)
      commands.forEach(cmd => {
        // cmd.reg 是正则源字符串（含 ^…$ 锚点）：ctx.command 把字符串当字面前缀，
        // 必须转成 RegExp 才会按正则匹配
        ctx.command(toPattern(cmd.reg), { master: cmd.permission === "master" })
          .action(async (e) => {
            const normalizedEvent = rt.normalizeEvent(e)
            return cmd.handler(normalizedEvent)
          })
      })

      // 注册下载链接命令（原传统模式下由 apps/*.js 提供，yunzai-ng 不加载 apps 目录，
      // 故在此直接注册；仅 sr/zzz/ww/zmd 有下载命令）
      if (DOWNLOAD_GAMES.has(gameId)) {
        for (const type of ["main", "pre"]) {
          const label = type === "pre" ? "获取预下载链接" : "获取下载链接"
          ctx.command(new RegExp(`^#*${meta.pattern}${label}$`))
            .action((e) => handleDownload(ctx, gameId, type, e))
        }
      }

      // 注册定时任务
      const userConfig = cfg.getGameConfig(gameId)
      const cronExpr = userConfig.cron || "0 0/5 * * * *"
      const taskName = `${meta.gameName}版本监控`
      ctx.cron(cronExpr, async () => {
        await api.autoCheck(gameId)
      }, { name: taskName })
    }

    // 注册管理命令
    const setCommands = buildSetCommands(rt)
    setCommands.forEach(cmd => {
      ctx.command(toPattern(cmd.reg), { master: (cmd.permission ?? "master") === "master" })
        .action(async (e) => {
          const normalizedEvent = rt.normalizeEvent(e)
          return cmd.handler(normalizedEvent)
        })
    })

    ctx.logger.info(`插件 GamePush-Plugin@${PluginPackage.version} 已加载（${gameIds.length} 个游戏、${setCommands.length} 条主人命令）`)
  }
})
