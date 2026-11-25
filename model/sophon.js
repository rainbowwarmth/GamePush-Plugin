/**
 * Sophon 分片差量计算 —— 「不下游戏也能算出真实预下载量」
 */
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import zlib from "node:zlib"
import { Buffer } from "node:buffer"
import process from "node:process"
import { setImmediate } from "node:timers"
import request from "../components/request.js"
import {
  ensureDir,
  legacyCacheRoots,
  legacySophonCacheRoot,
  legacySophonStateFile,
  legacyStateFiles,
  sophonCacheDir,
  sophonCacheRoot,
  sophonStateFile
} from "../lib/runtime/dirs.js"

/** CDN（Lego Server）对无 UA 的请求直接 403，且 Content-Length 为 0，必须带 */
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"

/** 清单缓存保留时长：存的是 CDN 上的 zstd 原文，命中即可跳过下载（省 0.25MB/次） */
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000

/** 进程内缓存：同一轮推送里 main/pre 两份清单只会解析一次 */
const memory = new Map()
const MEMORY_LIMIT = 8

/* ──────────────────────────── protobuf 最小解码 ──────────────────────────── */

/**
 * 读取 varint
 *
 * @param {Buffer} buf
 * @param {number} i 起始偏移
 * @returns {[number, number]} [值, 新偏移]
 */
function readVarint(buf, i) {
  let value = 0
  let shift = 0
  for (;;) {
    const byte = buf[i++]
    if (shift < 53) value += (byte & 0x7f) * 2 ** shift
    shift += 7
    if (!(byte & 0x80)) return [value, i]
  }
}

/**
 * 解码一层 protobuf 消息体
 * @param {Buffer} buf
 * @returns {Array<[number, number, number|Buffer]>} [字段号, wire type, 值]
 */
function decodeMessage(buf) {
  const fields = []
  let i = 0
  while (i < buf.length) {
    let key
    ;[key, i] = readVarint(buf, i)
    const field = key >>> 3
    const wire = key & 7
    let value
    if (wire === 0) {
      ;[value, i] = readVarint(buf, i)
    } else if (wire === 2) {
      let len
      ;[len, i] = readVarint(buf, i)
      value = buf.subarray(i, i + len)
      i += len
    } else if (wire === 5) {
      value = buf.subarray(i, i + 4)
      i += 4
    } else if (wire === 1) {
      value = buf.subarray(i, i + 8)
      i += 8
    } else {
      throw new Error(`manifest protobuf wire type 异常: ${wire} @${i}`)
    }
    fields.push([field, wire, value])
  }
  return fields
}

/**
 * 让出事件循环
 *
 * 解压 + 解析 asb 清单（4.3MB、2.9 万条分片）约 0.5 秒，全同步会卡住机器人收消息。
 * 每处理一批就让出一次，把阻塞切成小片。
 */
const yieldToLoop = () => new Promise((resolve) => setImmediate(resolve))

/** 让出节奏：每处理多少个资产让出一次 */
const YIELD_EVERY = 120

/* ──────────────────────────── manifest 解析 ──────────────────────────── */

/**
 * 解析解压后的 manifest
 *
 * @param {Buffer} raw
 * @returns {Promise<{chunks: Map<string, [number, number]>,
 *   files: Map<string, {size:number, md5:string, chunks:Array<[string, number, number]>}>,
 *   assetCount: number}>}
 */
async function parseManifest(raw) {
  const chunks = new Map()
  const files = new Map()
  let assetCount = 0

  for (const [field, wire, value] of decodeMessage(raw)) {
    if (field !== 1 || wire !== 2) continue

    let filePath = ""
    let fileSize = 0
    let fileMd5 = ""
    const fileChunks = []
    for (const [aField, aWire, aValue] of decodeMessage(value)) {
      if (aField === 1) filePath = aValue.toString("utf8")
      else if (aField === 4) fileSize = aValue
      else if (aField === 5) fileMd5 = aValue.toString("utf8")
      else if (aField === 2 && aWire === 2) {
        let chunkId = ""
        let sizeC = 0
        let sizeU = 0
        for (const [cField, , cValue] of decodeMessage(aValue)) {
          if (cField === 1) chunkId = cValue.toString("utf8")
          else if (cField === 4) sizeC = cValue
          else if (cField === 5) sizeU = cValue
        }
        if (chunkId) fileChunks.push([chunkId, sizeC, sizeU])
        // 同一 chunk 会在多文件间重复引用，Map 天然去重（这正是「唯一分片」口径）
        if (chunkId && !chunks.has(chunkId)) chunks.set(chunkId, [sizeC, sizeU])
      }
    }
    files.set(filePath, { size: fileSize, md5: fileMd5, chunks: fileChunks })
    assetCount++
    if (assetCount % YIELD_EVERY === 0) await yieldToLoop()
  }

  return { chunks, files, assetCount }
}

/* ──────────────────────────── 下载与缓存 ──────────────────────────── */

/** 清理过期缓存（尽力而为，失败不影响主流程） */
function pruneCache(dir) {
  try {
    if (!fs.existsSync(dir)) return
    const now = Date.now()
    const sweep = (full) => {
      try {
        if (now - fs.statSync(full).mtimeMs > CACHE_TTL) fs.unlinkSync(full)
      } catch {
        /* 单个文件删不掉就跳过 */
      }
    }
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name)
      const stat = fs.statSync(full)
      // 新版是 <缓存根>/<游戏id>/*.zst；旧版平铺在根目录，同样按 TTL 回收
      if (stat.isDirectory()) for (const file of fs.readdirSync(full)) sweep(path.join(full, file))
      else sweep(full)
    }
    // 旧缓存目录搬空后顺手删掉（非空时 rmdir 抛错，被外层 catch 吞掉）
    if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir)
  } catch {
    /* 缓存清理失败属于无关紧要 */
  }
}

/**
 * 清掉旧缓存目录里的空壳（文件搬去当前根后留下的空子目录与空根目录）
 *
 * 还有没搬走的文件时 rmdir 会抛错，直接放弃 —— 等下次命中继续收尾。
 */
function cleanupLegacyCache() {
  const roots = new Set([...legacyCacheRoots(), legacySophonCacheRoot])
  for (const root of roots) {
    try {
      if (!fs.existsSync(root)) continue
      for (const name of fs.readdirSync(root)) {
        const full = path.join(root, name)
        if (fs.statSync(full).isDirectory() && fs.readdirSync(full).length === 0) fs.rmdirSync(full)
      }
      fs.rmdirSync(root)
    } catch {
      /* 旧目录还有东西，留着下次再说 */
    }
  }
}

/**
 * 取一份 manifest 的压缩包：优先磁盘缓存，其次下载
 *
 * 缓存按游戏分目录（<根>/<游戏id>/<manifest id>.zst），删某个游戏的缓存不会波及其它游戏。
 *
 * @param {{url_prefix: string}} download
 * @param {string} id manifest id
 * @param {string} game 游戏 id
 * @returns {Promise<Buffer>}
 */
async function fetchManifestRaw(download, id, game) {
  const dir = sophonCacheDir(game)
  const name = id.replace(/[^\w.-]/g, "_") + ".zst"
  const cacheFile = path.join(dir, name)

  // 历史缓存搬进当前根：manifest id 由内容决定，同名文件直接复用，不必重新下载。
  // 每个旧根都要试「根目录平铺」与「按游戏分目录」两代布局。
  if (!fs.existsSync(cacheFile)) {
    const gameDir = path.basename(dir)
    const candidates = legacyCacheRoots().flatMap((root) => [
      path.join(root, name),
      path.join(root, gameDir, name)
    ])
    for (const from of candidates) {
      if (from === cacheFile || !fs.existsSync(from) || !ensureDir(dir)) continue
      try {
        fs.renameSync(from, cacheFile)
      } catch {
        // 跨盘 rename 会抛 EXDEV，退回复制
        try {
          fs.copyFileSync(from, cacheFile)
          fs.unlinkSync(from)
        } catch {
          /* 搬不动就走下载 */
        }
      }
      cleanupLegacyCache()
      break
    }
  }

  if (fs.existsSync(cacheFile)) {
    const cached = fs.readFileSync(cacheFile)
    if (cached.length > 0) return cached
  }

  const url = `${download.url_prefix.replace(/\/$/, "")}/${id}`
  const buf = await request.get(url, {
    responseType: "buffer",
    headers: { "User-Agent": USER_AGENT }
  })
  if (!buf || !Buffer.isBuffer(buf) || buf.length === 0) {
    throw new Error(`manifest 下载失败: ${id}`)
  }

  try {
    if (ensureDir(dir)) {
      fs.writeFileSync(cacheFile, buf)
      pruneCache(sophonCacheRoot())
      for (const root of new Set([...legacyCacheRoots(), legacySophonCacheRoot])) pruneCache(root)
    }
  } catch {
    /* 写缓存失败不该影响计算 */
  }
  return buf
}

/**
 * 拉取并解析单条 manifest
 * @param {Object} entry - getBuild 返回的 manifests 元素
 * @param {string} game 游戏 id（决定缓存落点）
 * @returns {Promise<{chunks: Map<string, [number, number]>, files: Map<string, {size:number, md5:string}>, assetCount: number}>}
 */
async function loadManifest(entry, game) {
  const id = entry?.manifest?.id
  if (!id) throw new Error("manifest 缺少 id")
  if (entry?.manifest_download?.encryption) {
    throw new Error(`manifest 已加密（encryption=${entry.manifest_download.encryption}），暂不支持`)
  }

  const hit = memory.get(id)
  if (hit) return hit

  const compressed = await fetchManifestRaw(entry.manifest_download || {}, id, game)

  // checksum 是 md5(解压后内容)，命中才说明这份账本没被截断或篡改
  const raw = zlib.zstdDecompressSync(compressed)
  const digest = crypto.createHash("md5").update(raw).digest("hex")
  if (entry.manifest.checksum && digest !== entry.manifest.checksum) {
    throw new Error(`manifest 校验失败 ${id}: ${digest} != ${entry.manifest.checksum}`)
  }

  const parsed = { ...(await parseManifest(raw)), id, bytes: { compressed: compressed.length, raw: raw.length } }
  if (memory.size >= MEMORY_LIMIT) memory.delete(memory.keys().next().value)
  memory.set(id, parsed)
  return parsed
}

/* ──────────────────────────── 差量计算 ──────────────────────────── */

/**
 * 按 matching_field 把两份清单配对
 * @param {Array} list
 * @returns {Map<string, Array>}
 */
function groupByField(list) {
  const map = new Map()
  for (const item of list || []) {
    const key = item?.matching_field || `#${item?.category_id || "unknown"}`
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(item)
  }
  return map
}

/**
 * 计算两份 build 的分片差量（**每文件局部差分**）
 *
 * @param {Object} params
 * @param {Array} params.nextManifests - 新版本 getBuild 的 manifests
 * @param {Array} [params.prevManifests] - 旧版本 getBuild 的 manifests；缺省视为全新安装
 * @param {string[]} [params.onlyFields] - 只统计这些 matching_field（如 ["game"]）
 * @param {string} [params.game] - 游戏 id，决定清单缓存落到哪个游戏目录
 * @param {string} [params.label] - 日志前缀
 * @returns {Promise<{download:number, disk:number, diskSize:number, chunks:number, files:number,
 *   byCategory:Object<string,{download:number,disk:number,diskSize:number,chunks:number,files:number,
 *   prevChunks:number,nextChunks:number,prevFiles:number,nextFiles:number,fullC:number,fullU:number}>}>}
 */
export async function diffBuilds({ nextManifests, prevManifests, onlyFields, game, label = "sophon" } = {}) {
  const nextGroups = groupByField(nextManifests)
  const prevGroups = groupByField(prevManifests)
  const wanted = Array.isArray(onlyFields) && onlyFields.length > 0 ? new Set(onlyFields) : null
  const byCategory = {}
  let download = 0
  let disk = 0
  let diskSize = 0
  let chunks = 0
  let files = 0

  for (const [field, nextList] of nextGroups) {
    // 不在统计范围内的分类（如 bh3 的 asb）连清单都不用下 —— 省 2.3MB 流量和 0.5 秒解析
    if (wanted && !wanted.has(field)) continue

    const prevList = prevGroups.get(field) || []
    const stat = {
      download: 0,
      disk: 0,
      diskSize: 0,
      chunks: 0,
      files: 0,
      prevChunks: 0,
      nextChunks: 0,
      prevFiles: 0,
      nextFiles: 0,
      fullU: 0
    }

    for (let i = 0; i < nextList.length; i++) {
      const next = await loadManifest(nextList[i], game)
      const prevEntry = prevList[i]
      // 旧版本没有这个分类（如新增分类/首次安装）→ 整个分类都算新下载
      const prev = prevEntry ? await loadManifest(prevEntry, game) : null

      stat.nextChunks += next.chunks.size
      stat.nextFiles += next.files.size
      if (prev) {
        stat.prevChunks += prev.chunks.size
        stat.prevFiles += prev.files.size
      }

      for (const info of next.files.values()) stat.fullU += info.size

      for (const [filePath, info] of next.files) {
        const old = prev?.files.get(filePath)
        if (!old) {
          // 新增文件：整包下载
          for (const [, sizeC, sizeU] of info.chunks) {
            stat.download += sizeC
            stat.disk += sizeU
            stat.chunks++
          }
          stat.files++
          continue
        }
        if (old.md5 === info.md5) continue

        // 变更文件：只补旧版本该文件里没有的分片
        const oldIds = new Set(old.chunks.map((c) => c[0]))
        for (const [chunkId, sizeC, sizeU] of info.chunks) {
          if (oldIds.has(chunkId)) continue
          stat.download += sizeC
          stat.disk += sizeU
          stat.chunks++
        }
        stat.files++
      }
    }

    // 「所需空间」= 更新后该分类的成品占用 + 下载缓存（压缩体与解压体在一段时间内共存）
    stat.diskSize = stat.fullU + stat.download

    byCategory[field] = stat
    download += stat.download
    disk += stat.disk
    diskSize += stat.diskSize
    chunks += stat.chunks
    files += stat.files
  }

  // logger 由 yunzai 内核注入到全局；用 globalThis 取可避开 no-undef，也便于脚本里 mock
  const log = globalThis.logger
  if (log?.debug) {
    const detail = Object.entries(byCategory)
      .map(([k, v]) => `${k}:${(v.download / 1048576).toFixed(2)}MiB/${v.chunks}片`)
      .join(" ")
    log.debug(
      `[${label}] 差量计算完成 下载=${(download / 1048576).toFixed(2)}MiB 落盘=${(
        disk / 1048576
      ).toFixed(2)}MiB 新增分片=${chunks} 变动文件=${files} | ${detail}`
    )
  }

  return { download, disk, diskSize, chunks, files, byCategory }
}

/**
 * 清空进程内缓存
 *
 * 主要给「强制重算」与调试用；正常情况下按 manifest.id 缓存是安全的，
 * 因为 id 本身由内容决定。
 */
export function clearMemoryCache() {
  memory.clear()
}

/* ──────────────────────────── 正式版清单快照 ──────────────────────────── */

/**
 * 快照文件：<快照根>/<游戏id>.json（一个游戏一个文件）
 *
 * 内容是 `{ main: { tag, manifests, savedAt } }`；某一份写坏只影响该游戏的增量基准，
 * 不会像旧版集中式文件那样一损全损。落点见 lib/runtime/dirs.js。
 */

/**
 * 迁移旧版集中式快照（<插件目录>/data/sophon-state.json）
 *
 * 只在目标文件不存在时调用；该游戏段落落成独立文件后返回它，
 * 所有段落都迁移完成时顺手删掉旧文件。
 * @param {string} game 游戏 id
 * @returns {object|null} 该游戏的旧快照段
 */
function migrateLegacyState(game) {
  try {
    if (!fs.existsSync(legacySophonStateFile)) return null
    const all = JSON.parse(fs.readFileSync(legacySophonStateFile, "utf8")) || {}
    const slice = all[game]
    if (slice) {
      const target = sophonStateFile(game)
      if (ensureDir(path.dirname(target))) fs.writeFileSync(target, JSON.stringify(slice))
    }
    const moved = Object.keys(all).every((id) => fs.existsSync(sophonStateFile(id)))
    if (moved) fs.unlinkSync(legacySophonStateFile)
    return slice || null
  } catch {
    return null
  }
}

/**
 * 读 JSON 文件
 * @param {string} file 路径
 * @returns {object|null} 对象；不存在或损坏时为 null
 */
function readJson(file) {
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"))
    return raw && typeof raw === "object" ? raw : null
  } catch {
    return null
  }
}

/**
 * 读某游戏的快照
 *
 * 新位置没有时，先看换根前的旧位置（Karin 从 <运行目录>/data/<插件名> 换到 @karinjs），
 * 读到就复制到新位置；最后才尝试旧版集中式文件。
 * @param {string} game 游戏 id
 * @returns {Object} 快照对象（无文件时为空对象）
 */
function readState(game) {
  const current = readJson(sophonStateFile(game))
  if (current) return current

  for (const legacy of legacyStateFiles(game)) {
    const value = readJson(legacy)
    if (!value) continue
    // 迁移成功才删旧文件：留着会让「新位置被清理」时回退到过期基准，增量就算小了
    if (writeState(game, value)) dropLegacyFile(legacy)
    return value
  }

  return migrateLegacyState(game) || {}
}

/**
 * 删掉迁移完的旧文件，并顺手收掉空出来的父目录
 * @param {string} file 旧文件
 */
function dropLegacyFile(file) {
  try {
    fs.unlinkSync(file)
    for (let dir = path.dirname(file), i = 0; i < 2; i++, dir = path.dirname(dir)) fs.rmdirSync(dir)
  } catch {
    /* 目录里还有别的东西就留着 */
  }
}

/**
 * 写某游戏的快照
 *
 * 先写临时文件再 rename：中途崩溃最多留下 .tmp，不会把已有快照截断成半截 JSON。
 * @param {string} game 游戏 id
 * @param {object} state 快照
 * @returns {boolean} 是否写成功
 */
function writeState(game, state) {
  const file = sophonStateFile(game)
  try {
    if (!ensureDir(path.dirname(file))) return false
    const tmp = `${file}.${process.pid}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(state))
    fs.renameSync(tmp, file)
    return true
  } catch {
    /* 快照写失败只会退化成「全量口径」，不该中断推送 */
    return false
  }
}

/**
 * 取某游戏上一次正式版的清单快照
 * @param {string} game
 * @returns {{tag: string, manifests: Array, savedAt: number}|null}
 */
export function getMainSnapshot(game) {
  return readState(game).main || null
}

/**
 * 记录某游戏当前正式版的清单快照
 * @param {string} game
 * @param {{tag: string, manifests: Array}} snapshot
 */
export function saveMainSnapshot(game, { tag, manifests }) {
  if (!tag || !Array.isArray(manifests) || manifests.length === 0) return
  const state = readState(game)
  state.main = { tag, manifests, savedAt: Date.now() }
  writeState(game, state)
}

