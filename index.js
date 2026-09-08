import fs from "node:fs"
import { BotName, pluginName, PluginPackage } from "#GamePush.components"

const startTime = Date.now()
const logger = globalThis.logger ?? console

let apps = {}
let plugin = null

if (BotName === "Yunzai-NG") {
  const { default: ngPlugin } = await import("#GamePush.model/plugin")
  plugin = ngPlugin
} else {
  if (BotName !== "Karin") {
    const appsDir = `./plugins/${pluginName}/apps`
    const files = fs
      .readdirSync(appsDir)
      .filter((file) => file.endsWith(".js") && file.toLowerCase() !== "task.js")
      .filter((file) => file.toLowerCase() !== "base.js")
    const loadPromises = files.map((file) => import(`./apps/${file}`))
    const results = await Promise.allSettled(loadPromises)

    results.forEach((result, index) => {
      const file = files[index]
      const name = file.replace(".js", "")
      if (result.status === "fulfilled") {
        const exports = Object.keys(result.value)
        if (exports.length > 0) {
          apps[name] = result.value[exports[0]]
        }
      } else {
        logger.error(`载入插件错误：${logger.red(name)}`)
        logger.error(result.reason)
      }
    })
  }

  logger.info("-----------------")
  logger.info(`${pluginName} v${PluginPackage.version} 加载成功~ 耗时: ${Date.now() - startTime}ms`)
  logger.info("-------^_^-------")
}

export { apps }
export default plugin
