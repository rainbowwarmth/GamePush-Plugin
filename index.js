import fs from "node:fs"
import { BotName, pluginName, PluginPackage } from "#GamePush.components"

const startTime = Date.now()
let apps = {}
if (BotName !== "karin") {
  const files = fs.readdirSync(`./plugins/${pluginName}/apps`).filter((file) => {
    const isTaskFile = file.toLowerCase() === "task.js"
    return file.endsWith(".js") && !isTaskFile
  })
  let ret = []

  files.forEach((file) => {
    ret.push(import(`./apps/${file}`))
  })

  ret = await Promise.allSettled(ret)

  for (let i in files) {
    let name = files[i].replace(".js", "")

    if (ret[i].status != "fulfilled") {
      logger.error(`载入插件错误：${logger.red(name)}`)
      logger.error(ret[i].reason)
      continue
    }
    apps[name] = ret[i].value[Object.keys(ret[i].value)[0]]
  }
}

export { apps }

logger.info("-----------------")
logger.info(`${pluginName} v${PluginPackage.version} 加载成功~ 耗时: ${Date.now() - startTime}ms`)
logger.info("-------^_^-------")
