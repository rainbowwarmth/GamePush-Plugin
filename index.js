/**
 * 插件入口
 *
 * 六框架的统一入口：
 *   - yunzai-ng            → 走 definePlugin 注册器（lib/runtime/registry/ng.js）
 *   - 云崽系（Miao/TRSS/MangoCat/JiuLi） → 扫描 apps/ 导出插件类集合（框架的 loader 展开 apps 字段）
 *   - Karin                → 不在此处导出，由 Karin 读 package.json 的 karin.apps 自行加载 apps/
 */
import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import {
  adapterId,
  BotName,
  supported,
  describeDetection,
  pluginPath,
  PluginPackage
} from "./lib/runtime/detect.js"
import { rt } from "./lib/runtime/index.js"

const startTime = Date.now()
const logger = globalThis.logger ?? console
const pluginName = PluginPackage.name

/** 由框架 loader 展开的插件类集合（Karin / yunzai-ng 为空） */
let apps = {}
/** yunzai-ng 的插件定义 */
let plugin = null

function assertNgModuleGraph({ defineGamePushNgPlugin, buildGameApp, buildSetApp, gameIds }) {
  const missing = []
  if (typeof defineGamePushNgPlugin !== "function") missing.push("lib/runtime/registry/ng.js#defineGamePushNgPlugin")
  if (typeof buildGameApp !== "function") missing.push("model/commands.js#buildGameApp")
  if (typeof buildSetApp !== "function") missing.push("model/commands.js#buildSetApp")
  if (!Array.isArray(gameIds)) missing.push("model/util.js#gameIds")
  if (missing.length === 0) return

  throw new Error(
    `[${pluginName}] 热重载后的模块图不完整，缺少：${missing.join("、")}。\n` +
      `原因：yunzai-ng 的热重载只对入口文件加缓存戳，嵌套模块仍复用更新前的实例；` +
      `插件更新一旦改动内部模块结构（新增导出 / 删除文件），就会出现新旧混合。\n` +
      `→ 请重启 yunzai-ng（不要依赖自动重载）。`
  )
}

if (!supported) {
  logger.error(`[${pluginName}] ${describeDetection()}`)
  logger.error(`[${pluginName}] 插件未加载。请确认目录名（Karin 需含 "karin"）与宿主框架版本。`)
} else if (adapterId === "yunzai-ng") {
  const [{ defineGamePushNgPlugin }, commandsMod, utilMod] = await Promise.all([
    import("./lib/runtime/registry/ng.js"),
    import("./model/commands.js"),
    import("./model/util.js")
  ])
  const { buildGameApp, buildSetApp } = commandsMod
  const { gameIds } = utilMod
  assertNgModuleGraph({ defineGamePushNgPlugin, buildGameApp, buildSetApp, gameIds })
  // app 定义在此刻构建，但 handler 内的 rt 属性在 setup(ctx) → initRuntime 之后才会被读到
  plugin = defineGamePushNgPlugin({
    apps: [...gameIds.map((gameId) => buildGameApp(gameId, rt)), buildSetApp(rt)]
  })
} else {
  if (adapterId !== "karin") {
    const appsDir = path.join(pluginPath, "apps")
    const files = fs
      .readdirSync(appsDir)
      .filter((file) => file.endsWith(".js"))
      .filter((file) => !["base.js", "task.js"].includes(file.toLowerCase()))

    const results = await Promise.allSettled(
      files.map((file) => import(pathToFileURL(path.join(appsDir, file)).href))
    )

    results.forEach((result, index) => {
      const file = files[index]
      const name = file.replace(/\.js$/, "")
      if (result.status !== "fulfilled") {
        logger.error(`载入插件错误：${logger.red ? logger.red(name) : name}`)
        logger.error(result.reason)
        return
      }
      // 一个文件可导出多个插件类（Karin 的加载器同样遍历全部导出，只跳过 default）。
      // key 用「文件名.类名」避免同一文件里的多个类互相覆盖。
      for (const key of Object.keys(result.value)) {
        if (key === "default") continue
        const exported = result.value[key]
        if (typeof exported !== "function") continue
        apps[`${name}.${key}`] = exported
      }
    })
  }

  logger.info("-----------------")
  logger.info(`${pluginName} v${PluginPackage.version} 加载成功~ [${BotName}] 耗时: ${Date.now() - startTime}ms`)
  logger.info("-------^_^-------")
}

export { apps }
export default plugin
