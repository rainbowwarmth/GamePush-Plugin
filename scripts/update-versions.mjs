/**
 * 采集各游戏最新版本，补齐 <数据根>/<game>/main|pre/<版本号>.json
 *
 * 产物即插件「发行版」命令读取的数据源。文件为**只增不改**：
 * 已存在的版本号直接跳过，因此重复执行是幂等的，不会覆盖历史。
 *
 * 用法：
 *   node scripts/update-versions.mjs                 # 全量采集 6 个游戏
 *   node scripts/update-versions.mjs --game=ys,sr    # 只采集指定游戏
 *   node scripts/update-versions.mjs --dry-run       # 只打印，不落盘
 *
 * 数据根解析顺序（可用 RELEASE_ROOT 环境变量强制指定）：
 *   1. <工作目录>/GamePush-Plugin  —— 资源仓库布局（与 GamePush-Plugin.db 同目录）
 *   2. <工作目录>/resources        —— 插件自带布局
 */
import fs from "node:fs"
import path from "node:path"
import { GAME_IDS, fetchGame } from "./lib/game-apis.mjs"

const TYPES = ["main", "pre"]

/** 默认数据根：优先资源仓库布局，其次插件自带布局 */
function defaultRoot() {
  const repoLayout = path.join(process.cwd(), "GamePush-Plugin")
  try {
    if (fs.statSync(repoLayout).isDirectory()) return repoLayout
  } catch {
    // 不存在则回落
  }
  return path.join(process.cwd(), "resources")
}

const ROOT = path.resolve(process.env.RELEASE_ROOT || defaultRoot())
const DRY = process.argv.includes("--dry-run")
const ONLY = (process.argv.find((a) => a.startsWith("--game="))?.slice("--game=".length) || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)

/** 与插件 sqlite-db.js 的 now() 保持同一格式（东八区） */
const nowText = () =>
  new Date().toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  })

/**
 * 写入单条记录；已存在同名文件则跳过（只增不改）
 * @returns {"created"|"exists"}
 */
function writeRecord(game, type, record) {
  const dir = path.join(ROOT, game, type)
  const file = path.join(dir, `${record.version}.json`)
  if (fs.existsSync(file)) return "exists"

  const payload = { version: record.version }
  if (type === "pre") payload.oldver = record.oldver
  payload.size = record.size
  payload.time = nowText()

  if (!DRY) {
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, "utf8")
  }
  return "created"
}

async function runGame(game, type) {
  const record = await fetchGame(game, type)
  if (!record) return { game, type, status: "skip" }
  const status = writeRecord(game, type, record)
  return { game, type, status, record }
}

async function main() {
  const games = ONLY.length ? ONLY : GAME_IDS
  const unknown = games.filter((g) => !GAME_IDS.includes(g))
  if (unknown.length) {
    console.error(`未知游戏：${unknown.join("、")}（可用：${GAME_IDS.join("、")}）`)
    process.exit(1)
  }

  console.log(`发行版数据目录：${ROOT}`)
  console.log(`采集范围：${games.join("、")}${DRY ? "（dry-run，不落盘）" : ""}\n`)

  // 单个游戏失败不影响其余游戏：多游戏可能同一时段集中更新，不能互相拖垮。
  // 按游戏并发（每路内部 main/pre 串行），把 CI 单次运行时长压到最短：
  // 核时 = 核数 × 时长，跑得快 = 烧得少。对单家接口的并发压力仍为 1，不触发限流。
  const results = (
    await Promise.all(
      games.map(async (game) => {
        const rows = []
        for (const type of TYPES) {
          try {
            rows.push(await runGame(game, type))
          } catch (error) {
            rows.push({ game, type, status: "error", error: error.message })
          }
        }
        return rows
      })
    )
  ).flat()

  let created = 0
  let exists = 0
  let skipped = 0
  let failed = 0

  for (const item of results) {
    const label = `${item.game}/${item.type}`
    switch (item.status) {
      case "created":
        created++
        console.log(`✅ ${label} 新增 ${item.record.version}${item.record.oldver ? ` (from ${item.record.oldver})` : ""} ${item.record.size}`)
        break
      case "exists":
        exists++
        console.log(`⏭  ${label} ${item.record.version} 已存在`)
        break
      case "skip":
        skipped++
        console.log(`➖ ${label} 当前无此阶段数据`)
        break
      case "error":
        failed++
        console.error(`❌ ${label} 采集失败：${item.error}`)
        break
    }
  }

  console.log(`\n新增 ${created} / 已存在 ${exists} / 无数据 ${skipped} / 失败 ${failed}`)

  // 全部目标都失败才算整体失败（单点故障不该中断提交）
  process.exit(failed === results.length ? 1 : 0)
}

main()
