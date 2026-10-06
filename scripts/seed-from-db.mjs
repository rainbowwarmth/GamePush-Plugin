/**
 * 种子导出：把本地版本库按 gameid 拆分成 resources/<game>/main|pre/<版本号>.json
 *
 * 用于首次部署——把已有历史一次性铺到发行版目录，之后交给 update-versions.mjs 增量补新。
 * 产物结构与采集脚本完全一致，两者可安全混用（同名文件不会被覆盖）。
 *
 * 用法：
 *   node scripts/seed-from-db.mjs                        # 自动探测数据库位置
 *   node scripts/seed-from-db.mjs --db=D:/path/to.db     # 指定数据库
 *   node scripts/seed-from-db.mjs --dry-run              # 只统计，不落盘
 *
 * 数据根解析顺序（可用 RELEASE_ROOT 环境变量强制指定）：
 *   1. <工作目录>/GamePush-Plugin  —— 资源仓库布局
 *   2. <工作目录>/resources        —— 插件自带布局
 */
import fs from "node:fs"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"

const DRY = process.argv.includes("--dry-run")

/** 默认输出根：优先资源仓库布局，其次插件自带布局 */
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
const DB_NAME = "GamePush-Plugin.db"

/** 数据库位置候选：显式 --db > 资源仓库布局 > 工作目录/data > 框架根/data（插件位于 plugins/<name>） */
function resolveDbPath() {
  const explicit = process.argv.find((a) => a.startsWith("--db="))?.slice("--db=".length)
  const candidates = [
    explicit,
    path.join(process.cwd(), "GamePush-Plugin", DB_NAME),
    path.join(process.cwd(), "data", DB_NAME),
    path.resolve(process.cwd(), "..", "..", "data", DB_NAME)
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  throw new Error(`未找到 ${DB_NAME}，请用 --db=<路径> 指定（已尝试：${candidates.join("、")}）`)
}

const buildPayload = (record) => {
  const payload = { version: record.version }
  if (record.oldver) payload.oldver = record.oldver
  payload.size = record.size
  if (record.time) payload.time = record.time
  return `${JSON.stringify(payload, null, 2)}\n`
}

function writeRecord(game, type, record) {
  const dir = path.join(ROOT, game, type)
  const file = path.join(dir, `${record.version}.json`)
  if (fs.existsSync(file)) return false
  if (!DRY) {
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(file, buildPayload(record), "utf8")
  }
  return true
}

const dbPath = resolveDbPath()
console.log(`数据库：${dbPath}`)
console.log(`输出目录：${ROOT}${DRY ? "（dry-run，不落盘）" : ""}\n`)

const db = new DatabaseSync(dbPath, { readOnly: true })
const stats = new Map()

function bump(game, type) {
  const key = `${game}/${type}`
  stats.set(key, (stats.get(key) || 0) + 1)
}

try {
  for (const row of db.prepare("SELECT game, version, size, time FROM main").iterate()) {
    if (!row.game || !row.version) continue
    if (writeRecord(row.game, "main", { version: row.version, size: row.size, time: row.time })) {
      bump(row.game, "main")
    }
  }

  for (const row of db.prepare("SELECT game, ver, oldver, size, time FROM pre").iterate()) {
    if (!row.game || !row.ver || !row.oldver) continue
    if (writeRecord(row.game, "pre", { version: row.ver, oldver: row.oldver, size: row.size, time: row.time })) {
      bump(row.game, "pre")
    }
  }
} finally {
  db.close()
}

const games = [...new Set([...stats.keys()].map((k) => k.split("/")[0]))].sort()
let total = 0
for (const game of games) {
  const main = stats.get(`${game}/main`) || 0
  const pre = stats.get(`${game}/pre`) || 0
  total += main + pre
  console.log(`${game.padEnd(5)} main ${String(main).padStart(3)} / pre ${String(pre).padStart(3)}`)
}

if (!games.length) {
  console.log("没有可导出的记录（同名文件已存在，或数据库为空）")
} else {
  console.log(`\n共导出 ${total} 条到 ${games.length} 个游戏目录`)
}
