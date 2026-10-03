/**
 * Karin 定时任务暴露点
 *
 * Karin 的 Plugin 不支持 task 字段，必须独立导出 `karin.task(...)`。
 * 本文件只是薄壳：任务定义来自 model/tasks.js，翻译成 Karin 语法由兼容层完成。
 */
import { ensureInit } from "#GamePush.runtime"
import { buildTaskExports } from "#GamePush.registry"
import { buildAllTaskDefs } from "#GamePush.model/tasks"
import { gameIds } from "#GamePush.model/util"

await ensureInit()

export const Task = buildTaskExports(buildAllTaskDefs(gameIds))
