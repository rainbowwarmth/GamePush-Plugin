import fs from "node:fs"
import { BotName, pluginName } from "#GamePush.components"
logger.info("GamePush-Plugin 加载中")
logger.info("Created By rainbowwarmth")
let apps = {}

if (BotName !== "karin") {
  const files = fs.readdirSync(`./plugins/${pluginName}/apps`).filter((file) => {
    // 排除 task.js 文件
    const isTaskFile = file.toLowerCase() === "task.js"
    // 只保留 JavaScript 文件且排除 task.js
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
