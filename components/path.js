import fs from "fs"
import path, { join, dirname } from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)

const __dirname = dirname(__filename)

const pluginPath = join(__dirname, "..").replace(/\\/g, "/")

const _path = process.cwd().replace(/\\/g, "/")

const BotPackage = JSON.parse(fs.readFileSync(path.join(_path, "package.json"), "utf8"))

const pluginName = path.basename(path.join(import.meta.url, "../../"))

const logger = globalThis.logger ?? console

const BotName = (() => {
  if (pluginName.includes("karin")) {
    return "Karin"
  } else if (BotPackage.name === "yunzai-ng") {
    return "Yunzai-NG"
  } else if (BotPackage.name === "miao-yunzai") {
    return "Miao-Yunzai"
  } else if (BotPackage.name === "trss-yunzai") {
    return "Trss-Yunzai"
  } else if (BotPackage.name === "MangoCat-Yunzai") {
    return "MangoCat-Yunzai"
  } else if (BotPackage.name === "yunzai") {
    logger.error("[GamePush-Plugin] 未适配的框架, 请使用Miao-Yunzai、Trss-Yunzai或yunzai-ng")
    return "Unknown"
  } else {
    logger.error("[GamePush-Plugin] 未适配的框架, 请使用Miao-Yunzai、Trss-Yunzai或yunzai-ng")
    return "Unknown"
  }
})()

const pluginRoot = path.join(_path, "plugins", pluginName)

const pluginResources = path.join(pluginRoot, "resources")

const PluginPackage = JSON.parse(fs.readFileSync(path.join(pluginRoot, "package.json"), "utf8"))

export { pluginName, pluginPath, PluginPackage, pluginRoot, BotName, pluginResources, BotPackage }
