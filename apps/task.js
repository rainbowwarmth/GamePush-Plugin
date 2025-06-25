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
  const name = `[GamePush-Plugin] ${nameMap[gameId]}版本监控`
  const cron = cfg.getGameConfig(gameId)?.cron || "0 0/5 * * * *"

  logger.info(`创建任务: ${name} (cron: ${cron})`)

  return karin.task(name, cron, async () => {
    logger.info(`[${new Date().toISOString()}] 开始检查 ${nameMap[gameId]} 更新`)
    try {
      api.autoCheck(gameId)
    } catch (e) {
      console.error(`${name} 任务执行错误:`, e)
    }
  })
})

export const Task = tasks
