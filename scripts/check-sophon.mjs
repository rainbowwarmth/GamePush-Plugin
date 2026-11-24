/**
 * Sophon 差量自检 —— 不下游戏，直接核对某游戏「预下载/正式版」的真实体积
 *
 * 崩坏3 没有补丁通道（getPatchBuild 恒返回 0 条 manifest），它的预下载量由
 * 「两份全量清单做 chunk 集合差」算出（详见 model/sophon.js）。本脚本走的就是
 * 插件推送时的那条真实代码路径，用来验证结果是逐字节可复现的。
 *
 * 用法：
 *   node scripts/check-sophon.mjs                    # 默认崩坏3 的预下载
 *   node scripts/check-sophon.mjs --game=bh3 --type=pre,main
 *   node scripts/check-sophon.mjs --clear            # 先清空清单缓存与内存缓存
 *   node scripts/check-sophon.mjs --quiet            # 只打结论，不展开分类明细
 */
import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"

const args = process.argv.slice(2)
const has = (k) => args.includes(`--${k}`)
const get = (k, d) => {
  const hit = args.find((a) => a.startsWith(`--${k}=`))
  return hit ? hit.split("=").slice(1).join("=") : d
}

const game = get("game", "bh3")
const types = get("type", "pre,main").split(",")
const quiet = has("quiet")

/* 模拟 Yunzai 全局：插件代码里 logger 是框架注入的全局对象 */
globalThis.logger = {
  debug: quiet ? () => {} : (...a) => console.log("  ·", ...a),
  info: (...a) => console.log("  i", ...a),
  warn: (...a) => console.warn("  !", ...a),
  error: (...a) => console.error("  x", ...a),
  mark: () => {}
}

const root = path.resolve(import.meta.dirname, "..")
const cacheDir = path.join(root, "data", "sophon-cache")
const stateFile = path.join(root, "data", "sophon-state.json")

if (has("clear")) {
  fs.rmSync(cacheDir, { recursive: true, force: true })
  fs.rmSync(stateFile, { force: true })
  console.log("[已清空清单缓存与正式版快照]")
}

const load = (rel) => import(pathToFileURL(path.join(root, rel)).href)
const { getGameAdapter } = await load("model/games.js")
const { getMainSnapshot } = await load("model/sophon.js")

const snapshot = getMainSnapshot(game)
console.log(`游戏 ${game} | 正式版快照 ${snapshot ? snapshot.tag : "（无，首批增量会退化）"}\n`)

const adapter = getGameAdapter(game)
for (const type of types) {
  const t0 = Date.now()
  try {
    const r = await adapter.fetchSize(game, type)
    const label = type === "pre" ? "预下载" : "正式版"
    console.log(`【${label}】`)
    console.log(`  完整大小    ${r.formattedTotalSize}`)
    console.log(`  增量(流量)  ${r.incrementalSize ?? "—（无基准或清单无变化）"}`)
    console.log(`  所需空间    ${r.diskSize ?? "—"}   ← 对应启动器弹窗「所需空间」`)
    console.log(`  基准版本    ${r.Ver ?? "—"}`)
    console.log(`  耗时        ${Date.now() - t0}ms\n`)
  } catch (e) {
    console.error(`【${type}】失败: ${e.message}\n`)
    process.exitCode = 1
  }
}
