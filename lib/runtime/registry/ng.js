/**
 * yunzai-ng 注册器
 *
 * yunzai-ng 的插件形态是 `definePlugin({ setup(ctx) })`，命令/任务经 ctx.command / ctx.cron 注册。
 * 这里把插件自有的 app 定义翻译成 NG 的注册调用，业务侧无感知。
 */
import { definePlugin } from "@yunzai-ng/core"
import { initRuntime, rt } from "../index.js"
import { prepareApp } from "./apps.js"
import { buildNgConfigSchema } from "../panels/yunzai-ng.js"
import { pluginName, PluginPackage } from "../detect.js"

/** 命令模式归一化：正则源字符串转 RegExp，已是 RegExp 则原样返回 */
const toPattern = (reg) => (reg instanceof RegExp ? reg : new RegExp(reg))

/**
 * 生成 yunzai-ng 插件定义
 * @param {object} options
 * @param {Array} options.apps    app 定义数组（defineApp 入参）
 * @param {Function} [options.onReady] setup 完成回调 (ctx, stats) => void
 * @returns {object} definePlugin 结果
 */
export function defineGamePushNgPlugin({ apps, onReady } = {}) {
  return definePlugin({
    name: pluginName,
    version: PluginPackage.version,
    description: PluginPackage.description || "自动监控游戏版本更新并推送通知",
    configSchema: buildNgConfigSchema(),

    async setup(ctx) {
      await initRuntime(ctx)

      // 把内核托管配置接入 cfg 单例，命令与定时任务读到即面板里的配置
      const { cfg } = await import("#GamePush.components")
      cfg.bindYng(ctx.config)

      let commandCount = 0
      let taskCount = 0

      for (const spec of apps ?? []) {
        const app = prepareApp(spec, rt)

        for (const cmd of app.commands) {
          ctx
            .command(toPattern(cmd.reg), { master: cmd.permission === "master" })
            .action((e) => cmd.handler(rt.normalizeEvent(e)))
          commandCount++
        }

        for (const task of app.tasks) {
          try {
            ctx.cron(task.cron, () => task.handler(), { name: task.name })
            taskCount++
          } catch (err) {
            // croner 对非法 cron 直接抛错。若让它冒泡，整个 setup 失败 ——
            // 连命令都注册不上。这里隔离到单个任务，并说清是哪条表达式。
            ctx.logger.error(
              `[${pluginName}] 定时任务「${task.name}」注册失败（cron: ${task.cron}）：${err?.message ?? err}`
            )
          }
        }
      }

      ctx.logger.info(
        `${pluginName}@${PluginPackage.version} 已加载（${commandCount} 条命令、${taskCount} 个定时任务）`
      )
      onReady?.(ctx, { commands: commandCount, tasks: taskCount })
    }
  })
}
