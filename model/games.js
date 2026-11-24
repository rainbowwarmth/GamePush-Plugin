/**
 * 各游戏接口描述符 —— model 层**唯一**知道「某游戏怎么请求、响应长什么样」的地方
 *
 * 重构前这些知识散在四处：util.js 拼 URL、api.js 解析版本检查响应（还内联了一整份鹰角
 * 请求代码）、download.js 解析下载响应（又抄了一份鹰角请求代码）、base.js 取图标。
 * 结果是同一份请求代码存在两份、同一个接口被解析两遍、同一个字段在两地各写一种取法。
 *
 * 现在按「游戏」聚合：一个游戏一处，对外只暴露四个归一化后的能力 ——
 *
 *   fetchVersion(game)         → { main, pre }   主版本号 / 预下载版本号（可能为 undefined）
 *   fetchPackages(game, type)  → { data, patch } 下载数据：data 完整包、patch 增量包
 *   fetchSize(game, type)      → { formattedTotalSize, incrementalSize, Ver }
 *   icon(game)                 → string          图标地址
 *
 * 上层（api.js / download.js / notice.js）因此退化为纯编排，不再出现 `if (game === "zmd")`。
 *
 * 三个厂商：米哈游（ys/sr/zzz/bh3）、库洛（ww）、鹰角（zmd）。
 */
import request from "../components/request.js"
import { pluginName } from "../lib/runtime/detect.js"
import { rt } from "../lib/runtime/index.js"
import { diffBuilds, getMainSnapshot, saveMainSnapshot } from "./sophon.js"
import {
  GAME_CONFIG,
  getGameName,
  getRedisKeys,
  formatSize,
  downloadBranch,
  sumPackageSize,
  versionComparator
} from "./util.js"

/* ──────────────────────────── 厂商端点 ──────────────────────────── */

/** 米哈游 hyp（launcher 体系）：版本走 branches、包体走 packages、图标走 games */
const MHY = {
  branches: "https://hyp-api.mihoyo.com/hyp/hyp-connect/api/getGameBranches",
  packages: "https://hyp-api.mihoyo.com/hyp/hyp-connect/api/getGamePackages",
  games: "https://hyp-api.mihoyo.com/hyp/hyp-connect/api/getGames",
  download: "https://api-takumi.mihoyo.com/downloader/sophon_chunk/api/",
  launcherId: "jGHBHlcOq1",
  platApp: "ddxf5qt290cg"
}

/** 库洛（鸣潮）：单一 index.json，正式版在 default、预下载在 predownload */
const WW = {
  index: "https://prod-cn-alicdn-gamestarter.kurogame.com/launcher/game/G152/10003_Y8xXrXk65DqFHEDgApn3cpK5lfczpFx5/index.json",
  fallbackCdn: "https://pcdownload-huoshan.aki-game.com"
}

/** 鹰角（终末地）：POST batch_proxy，body 里带「当前版本」以换取差分包 */
const HYPERGRYPH = {
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
  },
  body: (version) => ({
    proxy_reqs: [
      {
        kind: "get_latest_game",
        get_latest_game_req: {
          appcode: HYPERGRYPH.appcode,
          channel: "1",
          sub_channel: "1",
          version,
          launcher_appcode: HYPERGRYPH.launcherAppcode,
          launcher_sub_channel: "1",
          disk_type: 0,
          patch_encrypt: true
        }
      }
    ]
  })
}

/* ──────────────────────────── 通用工具 ──────────────────────────── */

/** 统一的请求选项（原先每个调用点各写一份 {responseType, log, gameName}） */
const reqOpts = (game, extra = {}) => ({
  responseType: "json",
  log: true,
  gameName: getGameName(game),
  ...extra
})

/** 空的下载结果（各家失败时统一返回这个形状） */
const emptyPackages = (type) => ({ data: null, patch: { game_pkgs: [], audio_pkgs: [] }, type })

const mhyUrl = (endpoint, game) =>
  `${endpoint}?launcher_id=${MHY.launcherId}&game_ids[]=${GAME_CONFIG[game].id}`

/* ──────────────────────────── 米哈游系 ──────────────────────────── */

/** 拉取 manifests 时排除的语言包 */
const EXCLUDED_LANGUAGES = ["en-us", "ja-jp", "ko-kr"]

/** 各游戏"仅查版本/包体"走 branches 时，需要再查一次 build 的清单接口 */
const buildUrl = (kind, type, packageId, password) =>
  `${MHY.download}${kind}?branch=${downloadBranch(type)}&plat_app=${MHY.platApp}` +
  `&package_id=${packageId}&password=${password}`

/** 图标列表缓存：图标是静态资源，没必要每次渲染都拉一遍全量游戏列表 */
const ICON_TTL = 6 * 60 * 60 * 1000
let iconCache = null

const mhy = {
  /** 版本检查：getGameBranches → main.tag / pre_download.tag */
  async fetchVersion(game) {
    const data = await request.get(mhyUrl(MHY.branches, game), reqOpts(game))
    const branch = data?.data?.game_branches?.[0]
    if (!branch) throw new Error(`[${pluginName}] ${getGameName(game)}游戏数据解析失败`)

    return {
      main: branch.main?.tag,
      pre: branch.pre_download?.tag
    }
  },

  /** 下载：getGamePackages → main / pre_download 的 major + patches[0] */
  async fetchPackages(game, type) {
    const data = await request.get(mhyUrl(MHY.packages, game), reqOpts(game))
    const pkg = data?.data?.game_packages?.[0] || {}
    const section = type === "pre" ? pkg.pre_download : pkg.main

    return {
      data: section?.major || {},
      patch: section?.patches?.[0] || { game_pkgs: [], audio_pkgs: [] },
      type
    }
  },

  /**
   * 体积：先取 branch 拿到 package_id / password，再拉 build 与 patchBuild 的 manifests 求和。
   * ys/sr/zzz 用 deduplicated_stats.uncompressed_size，bh3 用 stats.compressed_size，
   * 且两者取增量包的方式不同 —— 这层差异属于米哈游内部，故留在本描述符里。
   */
  async fetchSize(game, type) {
    const branches = await request.get(mhyUrl(MHY.branches, game), reqOpts(game))
    const branch = branches?.data?.game_branches?.[0]
    const section = type === "pre" ? branch?.pre_download : branch?.main
    const packageId = section?.package_id
    const password = section?.password

    if (["ys", "sr", "zzz"].includes(game)) {
      const Ver = section?.diff_tags?.[0]

      const sumManifests = (manifests) =>
        (manifests || [])
          .filter((m) => !EXCLUDED_LANGUAGES.includes(m.matching_field?.toLowerCase()))
          .reduce(
            (sum, m) =>
              sum +
              parseInt(
                m?.deduplicated_stats?.uncompressed_size ||
                  m?.stats?.[Ver]?.uncompressed_size ||
                  "0",
                10
              ),
            0
          )

      // getBuild 接受 GET；getPatchBuild 只接受 POST —— 用 GET 会恒返回 405，
      // request 回退成 false，manifests 求和得 0，导致增量包体积永远是 0.00 B。
      const [build, patch] = await Promise.all([
        request.get(buildUrl("getBuild", type, packageId, password), reqOpts(game)),
        request.post(buildUrl("getPatchBuild", type, packageId, password), undefined, reqOpts(game))
      ])

      return {
        formattedTotalSize: formatSize(sumManifests(build?.data?.manifests)),
        incrementalSize: formatSize(sumManifests(patch?.data?.manifests)),
        Ver
      }
    }

    // ── bh3：没有补丁通道，只能拿两份全量清单做**每文件**分片差分 ──
    //
    // getPatchBuild 对崩坏3 恒返回 0 条 manifest（加 version / diff_tags 参数都一样），
    // predownload 分支的 diff_tags 也恒为空 —— 「增量包」这条路根本不存在。
    // 但启动器照样报得出精确的预下载量：它拉 main + pre_download 两份**全量**清单，
    // 按文件逐个比对分片。model/sophon.js 复刻的就是这一步。
    //
    // 只统计 game 分类：asb（过场动画，28.6 GiB）不计入预下载弹窗，
    // 启动器实测的 365.83MB 就只含 game。详见 model/sophon.js 顶部说明。
    //
    // 代价：两份 game 清单共约 0.25MB 流量 + 1.5 秒 CPU，**不下载任何游戏分片**；
    // 「完整大小 30.17 GB」只是 JSON 里的 deduplicated_stats 汇总，不产生流量。
    const isPre = type === "pre"
    const targetSection = isPre ? branch?.pre_download : branch?.main
    if (!targetSection?.package_id) {
      throw new Error(`[${pluginName}] ${getGameName(game)}缺少${isPre ? "预下载" : "正式版"}分支`)
    }

    // 基准版本（旧清单）从哪来：
    //   预下载 —— 当前正式版，现拉一次 getBuild("main")
    //   正式版 —— main 此时已指向新版本，只能取上次留存的快照
    const oldVer = isPre ? branch?.main?.tag : getMainSnapshot(game)?.tag

    const targetBuild = await request.get(
      buildUrl("getBuild", type, targetSection.package_id, targetSection.password),
      reqOpts(game)
    )
    const nextManifests = targetBuild?.data?.manifests || []
    if (nextManifests.length === 0) {
      throw new Error(`[${pluginName}] ${getGameName(game)}清单为空（${type}）`)
    }

    let prevManifests = null
    if (isPre) {
      if (branch?.main?.package_id) {
        const mainBuild = await request.get(
          buildUrl("getBuild", "main", branch.main.package_id, branch.main.password),
          reqOpts(game)
        )
        prevManifests = mainBuild?.data?.manifests || null
      }
    } else {
      prevManifests = getMainSnapshot(game)?.manifests || null
    }

    const diff = await diffBuilds({
      nextManifests,
      prevManifests,
      // 只有 game 参与预下载；asb 是游戏内按需下载的过场动画包
      onlyFields: ["game"],
      label: getGameName(game)
    })

    // 全量口径：唯一分片的压缩字节之和（等价于 deduplicated_stats），与增量同为「流量」
    const totalDownload = nextManifests.reduce(
      (sum, m) => sum + Number(m?.deduplicated_stats?.compressed_size || m?.stats?.compressed_size || 0),
      0
    )

    // 正式版推送后把这一版清单存下来，作为下一轮的差分基准
    if (!isPre) saveMainSnapshot(game, { tag: branch?.main?.tag, manifests: nextManifests })

    // 预下载期间顺手把当前正式版清单存成快照：两份 getBuild 都已经拉过了，
    // 这一步零成本，却让「新装插件 → 首次预下载 → 正式版更新」这条链路
    // 在正式版推送时也有基准可用，不至于少一行增量。
    if (isPre && prevManifests && getMainSnapshot(game)?.tag !== branch?.main?.tag) {
      saveMainSnapshot(game, { tag: branch?.main?.tag, manifests: prevManifests })
    }

    return {
      formattedTotalSize: formatSize(totalDownload),
      // 没有基准清单、或新旧清单完全一致时给不出增量，返回 undefined 让文案自然省略该行
      incrementalSize: prevManifests && diff.download > 0 ? formatSize(diff.download) : undefined,
      // 「所需空间」：启动器弹窗第二个数字，= 更新后 game 成品占用 + 下载缓存
      diskSize: prevManifests && diff.download > 0 ? formatSize(diff.diskSize) : undefined,
      Ver: oldVer
    }
  },

  /** 图标：getGames 列表里按 id 或 biz 命中 */
  async icon(game) {
    if (!iconCache || Date.now() - iconCache.at > ICON_TTL) {
      const data = await request.get(`${MHY.games}?launcher_id=${MHY.launcherId}&language=zh-cn`, {
        responseType: "json",
        log: true
      })
      iconCache = { at: Date.now(), games: data?.data?.games || [] }
    }
    const { id, biz } = GAME_CONFIG[game] || {}
    const hit = iconCache.games.find((g) => g.id === id || g.biz === biz)
    return hit?.display?.icon?.url || ""
  }
}

/* ──────────────────────────── 库洛（鸣潮） ──────────────────────────── */

/** 把 index.json 的 config 段归一化成下载结果 */
const wwPackages = (data, type) => {
  const config = data?.[type === "pre" ? "predownload" : "default"]?.config
  if (!config) return emptyPackages(type)

  const cdn = data.cdnList?.[0]?.url?.replace(/\/+$/, "") || WW.fallbackCdn
  const at = (file) => `${cdn}/${String(file).replace(/^\//, "")}`

  return {
    data: {
      version: config.version,
      game_pkgs: [
        {
          url: at(config.indexFile),
          md5: config.indexFileMd5 || "",
          size: config.size || 0
        }
      ]
    },
    patch: {
      game_pkgs: (config.patchConfig || [])
        .sort((a, b) => versionComparator.compare(b.version, a.version))
        .filter((patch) => patch.indexFile)
        .map((patch) => ({
          url: at(patch.indexFile),
          md5: patch.indexFileMd5 || "",
          size: patch.size || 0,
          version: patch.version
        }))
    },
    type
  }
}

const ww = {
  /** 版本检查：正式版 default.config.version、预下载 predownload.config.version */
  async fetchVersion(game) {
    const data = await request.get(WW.index, reqOpts(game))
    return {
      main: data?.default?.config?.version,
      pre: data?.predownload?.config?.version
    }
  },

  async fetchPackages(game, type) {
    const data = await request.get(WW.index, reqOpts(game))
    return wwPackages(data, type)
  },

  /** 体积：直接来自下载数据（完整包 + 增量包各取首个） */
  async fetchSize(game, type) {
    const { data, patch } = await ww.fetchPackages(game, type)
    const main = data?.game_pkgs?.[0]
    const diff = patch?.game_pkgs?.[0]

    return {
      formattedTotalSize: main ? formatSize(main.size) : undefined,
      incrementalSize: diff ? formatSize(diff.size) : undefined,
      Ver: diff?.version
    }
  },

  async icon() {
    return "https://cn.bing.com/th?id=OSK.d2e8b2efa5867fba330b354d0472f5e5&w=120&h=120&qlt=120&c=6&rs=1&cdv=1&pid=RS"
  }
}

/* ──────────────────────────── 鹰角（终末地） ──────────────────────────── */

/**
 * 单次 batch_proxy 调用
 * @param {string} version 请求时声明的本地版本（空串=只问最新版）
 * @returns {Promise<Object|undefined>} get_latest_game_rsp
 */
const hypergryphCall = async (version) => {
  const res = await request.post(HYPERGRYPH.url, HYPERGRYPH.body(version), {
    ...reqOpts("zmd"),
    headers: HYPERGRYPH.headers,
    retry: 3,
    retryDelay: 1000
  })
  return res?.proxy_rsps?.[0]?.get_latest_game_rsp
}

/** pkg.packs → 归一化包数组 + 总体积 */
const hypergryphPacks = (pkg = {}) => {
  const packs = pkg.packs || []
  return {
    game_pkgs: packs.map((p) => ({
      url: p.url,
      md5: p.md5 || "",
      size: p.package_size || 0
    })),
    total_size: sumPackageSize(packs)
  }
}

const zmd = {
  /**
   * 版本检查：两次调用。
   *   ① 空版本 → 拿最新版本号
   *   ② 带本地旧版本 → 拿 pre_patch（预下载信息）
   * 分两步是因为差分包要由服务端按「你当前版本」算。
   */
  async fetchVersion(game) {
    const latest = (await hypergryphCall(""))?.version
    if (!latest) throw new Error(`[${pluginName}] ${getGameName(game)}未获取到版本号`)

    const oldVer = (await rt.kv.get(getRedisKeys(game).main)) || ""
    const rsp = await hypergryphCall(oldVer)
    if (!rsp) throw new Error(`[${pluginName}] ${getGameName(game)}版本数据解析失败`)

    return { main: latest, pre: rsp.pre_patch?.version }
  },

  async fetchPackages(game, type) {
    const latest = (await hypergryphCall(""))?.version
    if (!latest) return emptyPackages(type)

    if (type === "pre") {
      // 预下载：以最新版本为基准问 pre_patch
      const rsp = await hypergryphCall(latest)
      const prePatch = rsp?.pre_patch
      if (!prePatch?.patches?.length) return emptyPackages(type)

      return {
        data: { version: prePatch.version, ...hypergryphPacks(rsp?.pkg) },
        patch: {
          game_pkgs: prePatch.patches.map((p) => ({
            url: p.url,
            md5: p.md5 || "",
            size: p.package_size || 0,
            version: prePatch.version
          })),
          audio_pkgs: [],
          total_size: sumPackageSize(prePatch.patches)
        },
        type
      }
    }

    // 正式版：以本地旧版本为基准，同时拿到完整包 pkg 与差分包 patch
    const oldVer = (await rt.kv.get(getRedisKeys(game).main)) || ""
    const rsp = await hypergryphCall(oldVer)
    if (!rsp) return emptyPackages(type)

    return {
      data: { version: latest, ...hypergryphPacks(rsp.pkg) },
      patch: {
        game_pkgs: (rsp.patch?.patches || []).map((p) => ({
          url: p.url,
          md5: p.md5 || "",
          size: p.package_size || 0,
          version: latest
        })),
        audio_pkgs: [],
        total_size: sumPackageSize(rsp.patch?.patches)
      },
      type
    }
  },

  /**
   * 体积：来自下载数据。
   * 走 download 单例而非本描述符的 fetchPackages，是为了复用它的 30s 缓存 ——
   * 推送通知与「获取下载链接」命令常在同一时段触发，没必要重复打接口。
   */
  async fetchSize(game, type) {
    const { default: download } = await import("./download.js")
    const { data, patch } = await download.getDownloadData(game, type)

    const total = data?.total_size
      ? Number(data.total_size)
      : sumPackageSize(data?.game_pkgs)
    const diff = patch?.total_size
      ? Number(patch.total_size)
      : sumPackageSize(patch?.game_pkgs)

    return {
      formattedTotalSize: total ? formatSize(total) : undefined,
      incrementalSize: diff ? formatSize(diff) : undefined,
      Ver: (await rt.kv.get(getRedisKeys(game).main)) || ""
    }
  },

  async icon() {
    return "https://bbs.hycdn.cn/asset/endfield.png"
  }
}

/* ──────────────────────────── 描述符注册表 ──────────────────────────── */

/** 厂商 → 描述符 */
export const API_ADAPTERS = { mhy, ww, zmd }

/**
 * 取某游戏对应的接口描述符
 * @param {string} game - 游戏ID
 * @returns {typeof mhy} 描述符
 */
export function getGameAdapter(game) {
  const key = GAME_CONFIG[game]?.api
  const adapter = API_ADAPTERS[key]
  if (!adapter) throw new Error(`[${pluginName}] 未配置接口描述符的游戏: ${game}`)
  return adapter
}

/**
 * 取游戏图标（原 base.GameIcon 的实现归位到这里）
 * @param {string} game - 游戏ID
 * @returns {Promise<string>} 图标地址
 */
export const getGameIcon = (game) => getGameAdapter(game).icon(game)
