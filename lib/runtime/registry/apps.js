/**
 * 注册层：把插件自有 DSL 的应用定义落地到具体框架
 *
 * - prepareApp()  规范化 app 定义 + 生成可调用的 handler 闭包
 * - 类式框架（云崽系 / Karin）由 lib/runtime/registry/app-base.js 用 prepareApp 的结果构造插件类
 * - yunzai-ng 由 ./ng.js 生成 definePlugin 定义
 */
import { defineApp } from "../define.js"

/**
 * 规范化 app 定义，并给每条命令 / 任务挂上框架无关的调用入口
 * @param {object} spec        defineApp 的入参
 * @param {object} rt          运行时实例
 * @returns {object} 规范化后的 app
 */
export function prepareApp(spec, rt) {
  const app = defineApp(spec)

  app.commands.forEach((cmd, index) => {
    cmd.fnc ||= `cmd_${app.id}_${index}`
    // 框架回调只给原始事件，这里统一归一化后再进业务
    cmd.invoke = async (rawEvent) => cmd.handler(rt.normalizeEvent(rawEvent))
  })

  for (const task of app.tasks) {
    const handler = task.handler
    // 云崽系 loader 直接调用 task.fnc()，必须是函数而不是方法名
    task.fnc = async () => handler()
  }

  return app
}
