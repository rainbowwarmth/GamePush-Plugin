/**
 * 框架探测（兼容层入口）
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

/** yunzai-ng 的 CLI 包名：装到宿主工程里就说明这是 npm 形态的 yunzai-ng */
const NG_CLI = "@yunzai-ng/cli"

/** 依赖声明里是否含某个包（生产/开发/可选/对等，一律算） */
function declares(pkg, name) {
  return ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"].some(
    (field) => !!pkg?.[field]?.[name]
  )
}

/** 运行目录的 node_modules 里能否真的解析到 CLI（兼容 --no-save / 依赖被提升的情况） */
function installed(name) {
  return fs.existsSync(path.join(cwd, "node_modules", ...name.split("/"), "package.json"))
}

/**
 * yunzai-ng 的状态判断
 */
function detectNgEnv() {
  if (declares(BotPackage, NG_CLI) || installed(NG_CLI)) return "npm"
  if (/^yunzai-ng$/i.test(BotPackage.name || "")) return "source"
  return null
}

export const ngEnv = detectNgEnv()

const RULES = [
  {
    adapter: "karin",
    name: "Karin",
    match: () => pluginName.toLowerCase().includes("karin")
  },
  {
    adapter: "yunzai-ng",
    name: "Yunzai-NG",
    match: () => ngEnv !== null
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
    if (rule.match()) return { adapter: rule.adapter, BotName: rule.name, known: true, env: ngEnv }
  }
  // 未知云崽分支（自建 fork / 改名）：按 yunzai 适配器尝试，并给出明确告警
  if (looksLikeYunzai()) {
    return { adapter: "yunzai", BotName: BotPackage.name || "Unknown-Yunzai", known: false, env: null }
  }
  return { adapter: null, BotName: "Unknown", known: false, env: null }
}

export const detected = detect()

/** 框架名（保留旧字段名，业务层继续用 rt.BotName / BotName） */
export const BotName = detected.BotName

/** 适配器 id */
export const adapterId = detected.adapter

/** yunzai-ng 形态："npm"（装了 @yunzai-ng/cli）/ "source"（源码环境）；非 NG 为 null */
export const runtimeEnv = detected.env

/** 是否已识别（false 时插件应拒绝启动业务） */
export const supported = !!adapterId

/** 插件资源目录 */
export const pluginResources = path.join(pluginPath, "resources")

/** 插件静态资源目录（兼容旧字段） */
export const pluginRoot = pluginPath

export function describeDetection() {
  if (supported) {
    const env = runtimeEnv === "npm" ? "，npm 环境" : runtimeEnv === "source" ? "，源码环境" : ""
    return `已识别框架：${BotName}（适配器 ${adapterId}${env}）`
  }
  return (
    `未识别的框架（运行目录 ${cwd}：package.json name = ${BotPackage.name || "空"}，` +
    `依赖 ${NG_CLI} = ${declares(BotPackage, NG_CLI) || installed(NG_CLI) ? "有" : "无"}）。` +
    `受支持：${SUPPORTED.join(" / ")}`
  )
}
