/**
 * 云崽系 / Karin 通用插件基类
 *
 * 只做一件事：把「插件自有 DSL 的应用定义」（model/commands.js 产出）
 * 交给兼容层翻译成当前框架的插件选项，再把命令方法挂到实例上。
 *
 * 放在 lib/runtime/registry/ 而不是 apps/：apps/ 下的每个 .js 都会被 Karin
 * 当成插件模块加载，抽象基类不该出现在那里。
 */
import { rt, ensureInit } from "../index.js"
import { prepareApp } from "./apps.js"

await ensureInit()

const Base = rt.plugin ?? class {}

export default class GamePushBase extends Base {
  /**
   * @param {object} appSpec defineApp 入参（由 model/commands.js 的 buildGameApp / buildSetApp 产出）
   */
  constructor(appSpec) {
    const app = prepareApp(appSpec, rt)
    super(rt.buildAppOptions(app))

    // 框架按 rule.fnc 找实例方法，这里把框架无关的 handler 挂上去
    for (const cmd of app.commands) {
      this[cmd.fnc] = (e) => cmd.invoke(e)
    }
  }
}
