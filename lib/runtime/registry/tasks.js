/**
 * 定时任务注册器
 *
 * 云崽系（Miao / TRSS / MangoCat / JiuLi）：任务作为插件实例的 `task` 字段，随 buildAppOptions 一并注册。
 * Karin：Plugin 无 task 字段，需独立导出 `karin.task(...)`（apps/task.js 薄壳调用本模块）。
 * yunzai-ng：由 ./ng.js 用 ctx.cron 注册。
 */
import { rt } from "../index.js"

/**
 * 生成框架原生定时任务导出
 * @param {Array} taskDefs 任务定义（prepareApp 结果里的 tasks）
 * @returns {Array} 框架任务对象数组（不支持独立任务导出的框架返回空数组）
 */
export function buildTaskExports(taskDefs = []) {
  if (typeof rt.buildTaskExports !== "function") return []
  return rt.buildTaskExports(taskDefs)
}
