import fs from "node:fs"
import { BotName, pluginName } from "#GamePush.components"
logger.info(`${pluginName} 加载中`)
logger.info("Created By rainbowwarmth")

let apps = {}
const startTime = Date.now()
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
logger.info(`加载完成用时：${Date.now() - startTime}ms`)
export { apps }
