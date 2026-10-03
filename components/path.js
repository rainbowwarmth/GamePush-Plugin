/**
 * 路径与框架标识
 *
 * 兼容垫片：真正的探测逻辑在 `lib/runtime/detect.js`（兼容层）。
 * 这里只保留旧 import 路径，避免业务代码改动。
 */
export {
  pluginPath,
  pluginName,
  pluginRoot,
  pluginResources,
  cwd as _path,
  cwd,
  BotName,
  BotPackage,
  PluginPackage,
  adapterId,
  supported
} from "../lib/runtime/detect.js"
