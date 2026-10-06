/**
 * 版本采集：三家厂商接口的最小实现（CI / 无状态版）
 *
 * 与插件内 model/games.js 的 API_ADAPTERS 同源，但刻意**不依赖运行时**：
 * CI 环境没有 redis、也没有 rt.kv，因此每个增量包的「升级前版本」必须由接口
 * 自身给出，而不是像插件那样读 kv 里玩家当前的版本号：
 *
 *   - 米哈游 ys/sr/zzz/bh3 → section.diff_tags[0]
 *   - 库洛   ww            → predownload.config.patchConfig 里版本最高的那个
 *   - 鹰角   zmd           → 当前正式版（pre_patch 是相对正式版的差分包）
 *
 * 对外只暴露 fetchGame(game, type)
 *   → { version, size, oldver? } | null      size 为已格式化字符串，null 表示无此阶段
 */

const TIMEOUT = 20_000

/** 统一的 JSON GET，带超时 */
async function getJson(url) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT),
    headers: { "User-Agent": "Mozilla/5.0" }
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
  return res.json()
}

/**
 * 统一的 JSON POST（无 body），带超时
 * 米哈游的 getPatchBuild 只接受 POST —— 用 GET 一律 405 Method Not Allowed
 */
async function postJson(url) {
  const res = await fetch(url, {
    method: "POST",
    signal: AbortSignal.timeout(TIMEOUT),
    headers: { "User-Agent": "Mozilla/5.0" }
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
  return res.json()
}

/** 字节 → 人类可读，与插件 util.formatSize 保持一致（二进制进位、两位小数） */
export function formatSize(bytes) {
  const units = ["B", "KB", "MB", "GB", "TB"]
  let size = Number(bytes)
  if (!Number.isFinite(size)) size = 0
  let index = 0
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024
    index++
  }
  return `${size.toFixed(2)} ${units[index]}`
}

const releaseText = (value) => {
  if (value === undefined || value === null) return null
  const text = String(value).trim()
  return text === "" ? null : text
}

/* ──────────────────────────── 米哈游（ys / sr / zzz / bh3） ──────────────────────────── */

const MHY = {
  launcherId: "jGHBHlcOq1",
  platApp: "ddxf5qt290cg",
  branches: "https://hyp-api.mihoyo.com/hyp/hyp-connect/api/getGameBranches",
  download: "https://api-takumi.mihoyo.com/downloader/sophon_chunk/api/",
  games: { ys: "1Z8W5NHUQb", sr: "64kMb5iAWu", zzz: "x6znKlJ0xK", bh3: "osvnlOc0S8" }
}

/** 统计整包体积时要排除的语言包 manifelt */
const EXCLUDED_LANGUAGES = ["en-us", "ja-jp", "ko-kr"]

const downloadBranch = (type) => (type === "pre" ? "predownload" : "main")

async function mhyBranch(game) {
  const url = `${MHY.branches}?launcher_id=${MHY.launcherId}&game_ids[]=${MHY.games[game]}`
  const data = await getJson(url)
  const branch = data?.data?.game_branches?.[0]
  if (!branch) throw new Error(`${game} 未取到 game_branches`)
  return branch
}

const mhyBuildUrl = (kind, type, packageId, password) =>
  `${MHY.download}${kind}?branch=${downloadBranch(type)}&plat_app=${MHY.platApp}` +
  `&package_id=${packageId}&password=${password}`

/** 体积合计：ys/sr/zzz 用 uncompressed_size 去语言包；bh3 用 compressed_size 且区分 game/asb */
async function mhySizes(game, type, section) {
  if (game === "bh3") {
    const data = await getJson(mhyBuildUrl("getBuild", type, section.package_id, section.password))
    const manifests = data?.data?.manifests || []
    const gameManifest = manifests.find((m) => m.matching_field === "game")
    const asbManifest = manifests.find((m) => m.matching_field === "asb")
    return {
      total: Number(asbManifest?.stats?.compressed_size || 0),
      diff: Number(gameManifest?.stats?.compressed_size || 0)
    }
  }

  const sumManifests = (manifests) =>
    (manifests || [])
      .filter((m) => !EXCLUDED_LANGUAGES.includes(m.matching_field?.toLowerCase()))
      .reduce((acc, m) => acc + Number(m?.deduplicated_stats?.uncompressed_size || 0), 0)

  const [build, patch] = await Promise.all([
    getJson(mhyBuildUrl("getBuild", type, section.package_id, section.password)),
    postJson(mhyBuildUrl("getPatchBuild", type, section.package_id, section.password))
  ])

  return {
    total: sumManifests(build?.data?.manifests),
    diff: sumManifests(patch?.data?.manifests)
  }
}

async function mhyFetch(game, type) {
  const branch = await mhyBranch(game)
  const section = type === "pre" ? branch?.pre_download : branch?.main
  const version = releaseText(section?.tag)
  if (!version) return null

  // 预下载必须能确定「从哪个版本升上来」，否则 pre 表无法入库（oldver NOT NULL）
  const oldver = releaseText(section?.diff_tags?.[0])
  if (type === "pre" && !oldver) return null

  const { total, diff } = await mhySizes(game, type, section)
  return { version, oldver: type === "pre" ? oldver : undefined, size: formatSize(type === "pre" ? diff : total) }
}

/* ──────────────────────────── 库洛（ww） ──────────────────────────── */

const WW_INDEX =
  "https://prod-cn-alicdn-gamestarter.kurogame.com/launcher/game/G152/" +
  "10003_Y8xXrXk65DqFHEDgApn3cpK5lfczpFx5/index.json"

async function wwFetch(type) {
  const data = await getJson(WW_INDEX)
  const section = type === "pre" ? data?.predownload?.config : data?.default?.config
  const version = releaseText(section?.version)
  if (!version) return null

  if (type !== "pre") {
    return { version, size: formatSize(section?.size) }
  }

  // 增量包在 patchConfig 里，按版本号取最高的那条作为「升级前版本」
  const patch = [...(section?.patchConfig || [])]
    .filter((item) => releaseText(item?.version))
    .sort((a, b) => String(b.version).localeCompare(String(a.version), undefined, { numeric: true }))[0]
  if (!patch) return null

  return { version, oldver: patch.version, size: formatSize(patch.size) }
}

/* ──────────────────────────── 鹰角（zmd） ──────────────────────────── */

const HG = {
  url: "https://launcher.hypergryph.com/api/proxy/batch_proxy",
  appcode: "6LL0KJuqHBVz33WK",
  launcherAppcode: "abYeZZ16BPluCFyT",
  headers: {
    Host: "launcher.hypergryph.com",
    "Content-Type": "application/json",
    Accept: "application/json",
    "x-hg-launcher-device-id": "83a5d5ca-7f0e-4277-ba71-c9e66dafd7e4",
    "x-hg-user-token": "",
    Connection: "Keep-Alive",
    "Accept-Language": "zh-CN,en,*",
    "User-Agent": "Mozilla/5.0",
    "Accept-Encoding": "gzip, deflate"
  }
}

/** 单次 batch_proxy 调用，返回 get_latest_game_rsp */
async function hgCall(version) {
  const res = await fetch(HG.url, {
    method: "POST",
    headers: HG.headers,
    signal: AbortSignal.timeout(TIMEOUT),
    body: JSON.stringify({
      proxy_reqs: [
        {
          kind: "get_latest_game",
          get_latest_game_req: {
            appcode: HG.appcode,
            channel: "1",
            sub_channel: "1",
            version,
            launcher_appcode: HG.launcherAppcode,
            launcher_sub_channel: "1",
            disk_type: 0,
            patch_encrypt: true
          }
        }
      ]
    })
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${HG.url}`)
  const json = await res.json()
  return json?.proxy_rsps?.[0]?.get_latest_game_rsp
}

const hgPacksSize = (packs) =>
  (packs || []).reduce((acc, pack) => acc + Number(pack?.package_size || 0), 0)

async function zmdFetch(type) {
  // 正式版：空版本请求即可拿到最新版本号与完整包
  if (type !== "pre") {
    const rsp = await hgCall("")
    const version = releaseText(rsp?.version)
    if (!version) return null
    return { version, size: formatSize(hgPacksSize(rsp?.pkg?.packs)) }
  }

  // 预下载：先问最新正式版，再以它为基准问 pre_patch（差分包由服务端按当前版本算）
  const latest = releaseText((await hgCall(""))?.version)
  if (!latest) return null

  const rsp = await hgCall(latest)
  const pre = rsp?.pre_patch
  const version = releaseText(pre?.version)
  if (!version || !pre?.patches?.length) return null

  return { version, oldver: latest, size: formatSize(hgPacksSize(pre.patches)) }
}

/* ──────────────────────────── 出口 ──────────────────────────── */

/** 全部游戏 ID（顺序即采集顺序） */
export const GAME_IDS = ["ys", "sr", "zzz", "bh3", "ww", "zmd"]

const PROVIDERS = {
  ys: (type) => mhyFetch("ys", type),
  sr: (type) => mhyFetch("sr", type),
  zzz: (type) => mhyFetch("zzz", type),
  bh3: (type) => mhyFetch("bh3", type),
  ww: wwFetch,
  zmd: zmdFetch
}

/**
 * 采集某游戏某阶段的版本记录
 * @param {string} game 游戏 ID
 * @param {"main"|"pre"} type 正式版 / 预下载
 * @returns {Promise<{version: string, oldver?: string, size: string}|null>}
 */
export function fetchGame(game, type) {
  const provider = PROVIDERS[game]
  if (!provider) throw new Error(`未配置采集器的游戏：${game}`)
  return provider(type)
}
