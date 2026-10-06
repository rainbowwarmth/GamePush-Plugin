export const DEFAULT_CRON = "0 */5 3-23 * * ?"

/**
 * 定义一条命令
 * @param {object} spec
 * @param {string|RegExp} spec.reg      匹配正则（字符串会被各框架自行编译）
 * @param {string} spec.fnc             处理函数名（在 app 实例上）
 * @param {Function} spec.handler       框架无关的处理函数 (normalizedEvent) => any
 * @param {"master"|"owner"|"admin"|"all"} [spec.permission="all"]
 * @param {boolean} [spec.log]
 */
export function defineCommand(spec) {
  if (!spec?.reg || !spec?.fnc || typeof spec.handler !== "function") {
    throw new Error("[GamePush-Plugin] defineCommand 需要 reg / fnc / handler")
  }
  return {
    reg: spec.reg,
    fnc: spec.fnc,
    handler: spec.handler,
    permission: spec.permission ?? "all",
    log: spec.log
  }
}

/**
 * 定义一条定时任务
 * @param {object} spec
 * @param {string} spec.name
 * @param {string} spec.cron
 * @param {Function} spec.handler       框架无关的处理函数 () => any
 * @param {boolean} [spec.log]
 */
export function defineTask(spec) {
  if (!spec?.name || typeof spec.handler !== "function") {
    throw new Error("[GamePush-Plugin] defineTask 需要 name / handler")
  }
  return {
    name: spec.name,
    cron: spec.cron || DEFAULT_CRON,
    handler: spec.handler,
    log: !!spec.log
  }
}

/**
 * 定义一个应用（一个云崽插件类 / 一组 Karin 命令 / 一个 NG 插件）
 * @param {object} spec
 * @param {string} spec.id
 * @param {string} spec.name
 * @param {string} [spec.dsc]
 * @param {string} [spec.event="message"]
 * @param {number} [spec.priority=100]
 * @param {Array} [spec.commands]  defineCommand 的结果
 * @param {Array} [spec.tasks]     defineTask 的结果
 */
export function defineApp(spec) {
  const app = {
    id: spec.id,
    name: spec.name,
    dsc: spec.dsc ?? "",
    event: spec.event ?? "message",
    priority: spec.priority ?? 100,
    commands: [],
    tasks: []
  }

  for (const cmd of spec.commands ?? []) {
    if (!cmd) continue
    app.commands.push({
      reg: cmd.reg,
      fnc: cmd.fnc,
      handler: cmd.handler,
      permission: cmd.permission ?? "all",
      log: cmd.log
    })
  }

  for (const task of spec.tasks ?? []) {
    if (!task) continue
    app.tasks.push({
      name: task.name,
      cron: task.cron || DEFAULT_CRON,
      handler: task.handler,
      log: !!task.log
    })
  }

  return app
}
