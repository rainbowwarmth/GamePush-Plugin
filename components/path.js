import fs from "fs"
import path, { join, dirname } from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)

const __dirname = dirname(__filename)

const pluginPath = join(__dirname, "..").replace(/\\/g, "/")

const _path = process.cwd().replace(/\\/g, "/")

const BotPackage = JSON.parse(fs.readFileSync(path.join(_path, "package.json"), "utf8"))

const pluginName = path.basename(path.join(import.meta.url, "../../"))

const BotName = (() => {
  if (pluginName.includes("karin")) {
    return "Karin"
  } else if (BotPackage.name == "miao-yunzai") {
    return "Miao-Yunzai"
  } else if (BotPackage.name === "trss-yunzai") {
    return "Trss-Yunzai"
  } else if (BotPackage.name === "yunzai") {
    throw new Error("还有人玩Yunzai-Bot??")
  }
})()

const pluginRoot = path.join(_path, "plugins", pluginName)

const pluginResources = path.join(pluginRoot, "resources")

const PluginPackage = JSON.parse(fs.readFileSync(path.join(pluginRoot, "package.json"), "utf8"))

export { pluginName, pluginPath, PluginPackage, pluginRoot, BotName, pluginResources, BotPackage }
