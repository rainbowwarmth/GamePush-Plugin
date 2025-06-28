import karin from "node-karin"
import { api } from "#GamePush.model"
import { cfg } from "#GamePush.components"

const gameIds = ["ys", "sr", "zzz", "bh3", "ww"]
const nameMap = {
  ys: "原神",
  sr: "星穹铁道",
  zzz: "绝区零",
  bh3: "崩坏3",
  ww: "鸣潮"
}

const tasks = gameIds.map((gameId) => {
  const name = `${nameMap[gameId]}版本监控`
  const cron = cfg.getGameConfig(gameId)?.cron || "0 0/5 * * * *"

  logger.info(`[karin-plugin-gamepush] 创建定时任务: ${name} (cron: ${cron})`)

  return karin.task(name, cron, async () => {
    try {
      api.autoCheck(gameId)
    } catch (e) {
      logger.error(`[karin-plugin-gamepush] ${name}定时任务执行错误:`, e)
    }
  })
})

export const Task = tasks
