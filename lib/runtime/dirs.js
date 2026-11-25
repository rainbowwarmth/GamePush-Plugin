/**
 * 运行期落盘目录（sophon 相关）
 *
 * 三种宿主的可写根不一样，这里统一收敛：
 *
 *   yunzai-ng  —— 目录一律由内核给出，**不拼 process.cwd()**（装成服务 / pm2 时 cwd 不是实例目录）
 *     缓存 → <ctx.app.paths.temp>/plugins/<ctx.name>/sophon/<游戏id>/  （与 ctx.temp 同一个目录）
 *     快照 → <ctx.dataDir>/sophon/<游戏id>.json
 *
 *   Karin —— 插件私有根 @karinjs
 *     缓存 → <cwd>/@karinjs/temp/<插件目录名>/sophon/<游戏id>/
 *     快照 → <cwd>/@karinjs/<插件目录名>/sophon/<游戏id>.json
 *
 *   其余云崽系
 *     缓存 → <cwd>/temp/<插件目录名>/sophon/<游戏id>/
 *     快照 → <cwd>/data/<插件目录名>/sophon/<游戏id>.json
 *
 * ng 的路径要等 initRuntime(ctx) 才拿得到，所以这里全部是函数：模块顶层的常量会在
 * ctx 注入之前求值成 cwd 兜底值，之后再也不会更新。
 */
import fs from "node:fs"
import path from "node:path"
import { adapterId, cwd, pluginName, pluginPath } from "./detect.js"

/** 目录名消毒：游戏 id 目前都是 [a-z0-9]+，留着防御未来出现路径字符 */
const safe = (name) => String(name || "unknown").replace(/[^\w.-]/g, "_")

const isNg = adapterId === "yunzai-ng"
const isKarin = adapterId === "karin"

/** Karin 插件私有目录：<运行目录>/@karinjs/<插件目录名>（与适配器的 dataDir 同源） */
export const karinDataRoot = path.join(cwd, "@karinjs", pluginName)

/**
 * yunzai-ng 内核在 initRuntime 时注入的上下文
 * @type {{name: string, dataDir: string, temp: string, data: string} | null}
 */
let ngCtx = null

/**
 * 登记 yunzai-ng 的运行期路径
 *
 * 没有 ctx 时（脚本直跑、单测）退回 cwd 推算，行为与旧版一致。
 * @param {object} ctx 插件上下文
 */
export function setNgContext(ctx) {
  if (!isNg || !ctx) return
  ngCtx = {
    name: ctx.name || pluginName,
    dataDir: ctx.dataDir || "",
    temp: ctx.app?.paths?.temp || "",
    data: ctx.app?.paths?.data || ""
  }
}

/** ng 的 temp 根（<临时目录>/plugins/<插件名> 与 ctx.temp 同一目录） */
function ngTempRoot() {
  const base = ngCtx?.temp || path.join(cwd, "temp")
  return path.join(base, "plugins", ngCtx?.name || pluginName)
}

/** ng 的数据根（<数据目录>/plugin/<插件名>，与 ctx.dataDir 同源） */
function ngDataRoot() {
  if (ngCtx?.dataDir) return ngCtx.dataDir
  return path.join(ngCtx?.data || path.join(cwd, "data"), "plugin", ngCtx?.name || pluginName)
}

/**
 * 清单缓存根目录
 * @returns {string} 绝对路径
 */
export function sophonCacheRoot() {
  if (isNg) return path.join(ngTempRoot(), "sophon")
  if (isKarin) return path.join(cwd, "@karinjs", "temp", pluginName, "sophon")
  return path.join(cwd, "temp", pluginName, "sophon")
}

/**
 * 正式版快照根目录
 * @returns {string} 绝对路径
 */
export function sophonStateRoot() {
  if (isNg) return path.join(ngDataRoot(), "sophon")
  if (isKarin) return path.join(karinDataRoot, "sophon")
  return path.join(cwd, "data", pluginName, "sophon")
}

/**
 * 某游戏的清单缓存目录（manifest zst 原文就放在这里）
 * @param {string} game 游戏 id
 * @returns {string} 绝对路径
 */
export const sophonCacheDir = (game) => path.join(sophonCacheRoot(), safe(game))

/**
 * 某游戏的正式版快照文件
 * @param {string} game 游戏 id
 * @returns {string} 绝对路径
 */
export const sophonStateFile = (game) => path.join(sophonStateRoot(), `${safe(game)}.json`)

/**
 * 历史缓存目录候选（按优先级，已剔除当前根）
 * @returns {string[]} 目录列表
 */
export function legacyCacheRoots() {
  const current = sophonCacheRoot()
  return [
    // 旧版：插件目录 data 下（曾用名 sophon-cache，也曾在根目录平铺）
    path.join(pluginPath, "data", "sophon-cache"),
    path.join(pluginPath, "data", "sophon"),
    // 旧版：运行目录 temp，未走 ctx.temp 体系
    path.join(cwd, "temp", pluginName, "sophon")
  ].filter((dir) => dir !== current)
}

/**
 * 历史快照文件候选（已剔除当前路径）
 * @param {string} game 游戏 id
 * @returns {string[]} 文件列表
 */
export function legacyStateFiles(game) {
  const name = `${safe(game)}.json`
  const current = sophonStateFile(game)
  return [
    path.join(cwd, "data", "plugin", pluginName, "sophon", name),
    path.join(cwd, "data", pluginName, "sophon", name),
    path.join(pluginPath, "data", "sophon", name)
  ].filter((file) => file !== current)
}

/** 旧版缓存根（data/sophon-cache：曾用名，也曾在根目录平铺），仅用于收尾清理 */
export const legacySophonCacheRoot = path.join(pluginPath, "data", "sophon-cache")

/** 旧版集中式快照（所有游戏挤一个文件），仅用于首次迁移 */
export const legacySophonStateFile = path.join(pluginPath, "data", "sophon-state.json")

/**
 * 确保目录存在
 * @param {string} dir 目录
 * @returns {boolean} 是否可用
 */
export function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true })
    return true
  } catch {
    return false
  }
}
