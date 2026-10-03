/**
 * 框架探测（兼容层入口）
 *
 * 六框架统一在这里识别，业务代码只认 rt.adapter / rt.BotName，不再自己判宿主。
 * 识别顺序有讲究：
 *   1. Karin 靠「插件目录名含 karin」判定（宿主 package.json 的 name 是用户自定的工程名）
 *   2. 其余按宿主 package.json 的 name 判定
 *   3. 全部落空但存在云崽全局（plugin/segment/Bot）时，按未知云崽分支处理并告警
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** 插件根目录（lib/runtime/ → ../..） */
export const pluginPath = path.resolve(__dirname, "../..").replace(/\\/g, "/")

/** 插件目录名（框架靠它定位插件，Karin 也靠它判定） */
export const pluginName = path.basename(pluginPath)

/** 宿主工程根目录 */
export const cwd = process.cwd().replace(/\\/g, "/")

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"))
  } catch {
    return {}
  }
}

/** 宿主 package.json */
export const BotPackage = readJson(path.join(cwd, "package.json"))

/** 插件 package.json */
export const PluginPackage = readJson(path.join(pluginPath, "package.json"))

/** 受支持的框架清单（用于错误提示与文档） */
export const SUPPORTED = [
  "Miao-Yunzai",
  "Trss-Yunzai",
  "MangoCat-Yunzai",
  "JiuLi",
  "Karin",
  "Yunzai-NG"
]

/** 探测规则：命中即返回。adapter 对应 lib/runtime/adapters/<adapter>.js */
const RULES = [
  {
    adapter: "karin",
    name: "Karin",
    match: () => pluginName.toLowerCase().includes("karin")
  },
  {
    adapter: "yunzai-ng",
    name: "Yunzai-NG",
    match: () => /^yunzai-ng$/i.test(BotPackage.name || "")
  },
  {
    adapter: "mangocat",
    name: "MangoCat-Yunzai",
    match: () => /mangocat/i.test(BotPackage.name || "")
  },
  {
    adapter: "jiuli",
    name: "JiuLi",
    match: () => /^jiuli$/i.test(BotPackage.name || "")
  },
  {
    adapter: "yunzai",
    name: "Miao-Yunzai",
    match: () => /miao/i.test(BotPackage.name || "")
  },
  {
    adapter: "yunzai",
    name: "Trss-Yunzai",
    match: () => /trss/i.test(BotPackage.name || "")
  }
]

/** 云崽系分支的共同特征：三个全局齐备 */
function looksLikeYunzai() {
  return !!(globalThis.plugin && globalThis.segment && globalThis.Bot)
}

function detect() {
  for (const rule of RULES) {
    if (rule.match()) return { adapter: rule.adapter, BotName: rule.name, known: true }
  }
  // 未知云崽分支（自建 fork / 改名）：按 yunzai 适配器尝试，并给出明确告警
  if (looksLikeYunzai()) {
    return { adapter: "yunzai", BotName: BotPackage.name || "Unknown-Yunzai", known: false }
  }
  return { adapter: null, BotName: "Unknown", known: false }
}

export const detected = detect()

/** 框架名（保留旧字段名，业务层继续用 rt.BotName / BotName） */
export const BotName = detected.BotName

/** 适配器 id */
export const adapterId = detected.adapter

/** 是否已识别（false 时插件应拒绝启动业务） */
export const supported = !!adapterId

/** 插件资源目录 */
export const pluginResources = path.join(pluginPath, "resources")

/** 插件静态资源目录（兼容旧字段） */
export const pluginRoot = pluginPath

export function describeDetection() {
  return supported
    ? `已识别框架：${BotName}（适配器 ${adapterId}）`
    : `未识别的框架（宿主 package.json name = ${BotPackage.name || "空"}）。受支持：${SUPPORTED.join(" / ")}`
}
