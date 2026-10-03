/**
 * 游戏元数据与通用工具
 *
 * 本模块刻意保持为**叶子模块**：不依赖兼容层、不发网络请求、不引 model 内其他文件。
 * 因为 components/config.js 会在模块求值期读这里的 gameIds，任何反向依赖都会造成循环。
 *
 * 「某个游戏怎么请求、响应长什么样」不在这里 —— 那些在 model/games.js。
 * 这里只有静态元数据和纯函数。
 */

/**
 * 全部游戏 ID（顺序即面板与任务注册顺序）
 */
export const gameIds = ["ys", "sr", "zzz", "bh3", "ww", "zmd"]

/**
 * 游戏元数据
 *
 * - `api`          接口描述符键，指向 model/games.js 的 API_ADAPTERS
 * - `id` / `biz`   仅米哈游系（ys/sr/zzz/bh3）使用；鸣潮 / 终末地走各自厂商接口，无此二者
 * - `redisPrefix`  Redis 键前缀
 * - `reg`          命令匹配用的别名正则片段（注意区分大小写，且刻意不含 sr/bh3 英文别名）
 */
export const GAME_CONFIG = {
  ys: {
    api: "mhy",
    id: "1Z8W5NHUQb",
    name: "原神",
    biz: "hk4e_cn",
    redisPrefix: "YS",
    reg: "(ys|YS|原神)"
  },
  sr: {
    api: "mhy",
    id: "64kMb5iAWu",
    name: "崩坏:星穹铁道",
    biz: "hkrpg_cn",
    redisPrefix: "SR",
    reg: "(\\*|星铁|星轨|穹轨|星穹|崩铁|星穹铁道|崩坏星穹铁道|铁道)"
  },
  zzz: {
    api: "mhy",
    id: "x6znKlJ0xK",
    name: "绝区零",
    biz: "nap_cn",
    redisPrefix: "ZZZ",
    reg: "(%|％|绝区零|zzz|ZZZ|绝区)"
  },
  bh3: {
    api: "mhy",
    id: "osvnlOc0S8",
    name: "崩坏3",
    biz: "bh3_cn",
    redisPrefix: "BH3",
    reg: "(!|！|崩坏三|崩坏3|崩三|崩3|bbb|三崩子)"
  },
  ww: {
    api: "ww",
    name: "鸣潮",
    redisPrefix: "WW",
    reg: "(~|～|鸣潮|ww|WW|mc)"
  },
  zmd: {
    api: "zmd",
    name: "终末地",
    redisPrefix: "zmd",
    reg: "(:|：|zmd|终末地)"
  }
}

/**
 * 获取游戏名称
 * @param {string} game - 游戏ID
 * @returns {string} 游戏名称
 */
export const getGameName = (game) => GAME_CONFIG[game]?.name || "未知游戏"

/**
 * 获取游戏 Redis 键
 * @param {string} game - 游戏ID
 * @returns {{main: string, pre: string}} Redis 键对象
 */
export const getRedisKeys = (game) => {
  const prefix = GAME_CONFIG[game]?.redisPrefix || "GAME"
  return {
    main: `Yz:GamePush:${prefix}:Main`,
    pre: `Yz:GamePush:${prefix}:Pre`
  }
}

/**
 * 版本比较器（数字感知：5.10 > 5.9）
 */
export const versionComparator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base"
})

/**
 * 格式化字节数
 *
 * 纯函数，故归位到工具层 —— 原先挂在 api 单例上，导致 download / notice 为了格式化
 * 一个数字都要反向依赖 api 模块。
 * @param {number|string} bytes - 字节数
 * @returns {string} 形如 "1.50 MB"
 */
export function formatSize(bytes) {
  const units = ["B", "KB", "MB", "GB", "TB"]
  let size = Number(bytes)
  if (!Number.isFinite(size)) size = 0
  let unitIndex = 0
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }
  return `${size.toFixed(2)} ${units[unitIndex]}`
}

/**
 * 下载类型 → 官方 branch 参数
 * @param {string} type - "main" | "pre"
 * @returns {string} "main" | "predownload"
 */
export const downloadBranch = (type) => (type === "pre" ? "predownload" : "main")

/**
 * 求和一批包的体积（字段名各家不一，统一按 package_size / size 取）
 * @param {Array} pkgs
 * @returns {number}
 */
export const sumPackageSize = (pkgs) =>
  (pkgs || []).reduce((sum, pkg) => sum + Number(pkg?.package_size ?? pkg?.size ?? 0), 0)
