const API_BASE = 'https://hyp-api.mihoyo.com/hyp/hyp-connect/api/getGamePackages'
const CHECK_API = 'https://hyp-api.mihoyo.com/hyp/hyp-connect/api/getGameBranches'
const Download_API = 'https://api-takumi.mihoyo.com/downloader/sophon_chunk/api/'
const WW_API_BASE = 'https://prod-cn-alicdn-gamestarter.kurogame.com/launcher/game/G152/10003_Y8xXrXk65DqFHEDgApn3cpK5lfczpFx5/index.json'

export const GAME_CONFIG = {
  ys: {
    id: '1Z8W5NHUQb',
    name: '原神',
    redisPrefix: 'YS'
  },
  sr: {
    id: '64kMb5iAWu',
    name: '崩坏:星穹铁道',
    redisPrefix: 'SR'
  },
  zzz: {
    id: 'x6znKlJ0xK',
    name: '绝区零',
    redisPrefix: 'ZZZ'
  },
  bh3: {
    id: 'osvnlOc0S8',
    name: '崩坏3',
    redisPrefix: 'BH3'
  },
  ww: {
    name: '鸣潮',
    redisPrefix: 'WW'
  }
}

export const getGameAPI = (game) => {
  if (game === 'ww') return WW_API_BASE
  return `${API_BASE}?launcher_id=jGHBHlcOq1&game_ids[]=${GAME_CONFIG[game].id}`
}

export const getGameCheckAPI = (game) => {
  if (game === 'ww') return WW_API_BASE
  return `${CHECK_API}?launcher_id=jGHBHlcOq1&game_ids[]=${GAME_CONFIG[game].id}`
}

export const getDownloadAPI = (type, package_id, password) => {
  if (type === 'pre') return `${Download_API}getPatchBuild?branch=predownload&plat_app=ddxf5qt290cg&package_id=${package_id}&password=${password}`
  return `${Download_API}getBuild?branch=main&plat_app=ddxf5qt290cg&package_id=${package_id}&password=${password}`
}

export const getGameName = (game) =>
  GAME_CONFIG[game]?.name || '未知游戏'

export const getRedisKeys = (game) => {
  const prefix = GAME_CONFIG[game]?.redisPrefix || 'GAME'
  return {
    main: `Yz:GamePush:${prefix}:Main`,
    pre: `Yz:GamePush:${prefix}:Pre`
  }
}

export const versionComparator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base'
})
