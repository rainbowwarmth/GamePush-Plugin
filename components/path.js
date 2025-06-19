import path from "path"

const _path = process.cwd().replace(/\\/g, "/")

const pluginName = path.basename(path.join(import.meta.url, "../../"))

const pluginRoot = path.join(_path, "plugins", pluginName)

const pluginResources = path.join(pluginRoot, "resources")

export { _path, pluginName, pluginRoot, pluginResources }
