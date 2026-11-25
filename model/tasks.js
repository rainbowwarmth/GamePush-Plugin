/**
 * 定时任务定义（框架无关）
 */
import { getGameName } from "./util.js"
import { cfg } from "../components/index.js"
import { defineTask } from "../lib/runtime/define.js"

/**
 * 构建单个游戏的定时任务定义
 * @param {string} gameId
 * @returns {Array} 任务定义数组
 */
export function buildGameTaskDefs(gameId) {
  const config = cfg.getGameConfig(gameId)
  return [
    defineTask({
      name: `[GamePush-Plugin] ${getGameName(gameId)}版本监控`,
      cron: config.cron,
      log: config.log,
      handler: async () => {
        const { api } = await import("./index.js")
        return api.autoCheck(gameId)
      }
    })
  ]
}

/**
 * 构建全部游戏的定时任务定义
 * @param {Array<string>} gameIds
 * @returns {Array} 任务定义数组
 */
export function buildAllTaskDefs(gameIds) {
  return gameIds.flatMap((gameId) => buildGameTaskDefs(gameId))
}
