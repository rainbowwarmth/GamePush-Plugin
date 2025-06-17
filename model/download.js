import fetch from 'node-fetch'
import api from './api.js'
import { getGameAPI, getGameName, versionComparator } from './util.js'

class Download {
  cache = new Map()
  cacheTTL = 30000

  async getDownloadData (game, type = 'main') {
    const cacheKey = `${game}-${type}`
    const cached = this.cache.get(cacheKey)

    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data
    }

    const data = await this.fetchDownloadData(game, type)
    this.cache.set(cacheKey, {
      timestamp: Date.now(),
      data
    })

    return data
  }

  async fetchDownloadData (game, type) {
    const apiUrl = getGameAPI(game)

    try {
      const res = await fetch(apiUrl)
      if (!res.ok) {
        throw new Error(`API请求失败: ${res.status} ${res.statusText}`)
      }

      const data = await res.json()

      if (game === 'ww') {
        return this.handleWWData(data, type)
      }
      return this.handleMHYData(data, type)
    } catch (err) {
      logger.error(`[GamePush] 获取下载数据失败: ${err.message}`)
      return {
        data: null,
        patch: { game_pkgs: [], audio_pkgs: [] },
        type
      }
    }
  }

  handleWWData (data, type) {
    const versionType = type === 'pre' ? 'predownload' : 'default'
    const versionData = data[versionType]?.config

    if (!versionData) {
      return {
        data: null,
        patch: { game_pkgs: [] },
        type
      }
    }

    const cdn = data.cdnList?.[0]?.url?.replace(/\/+$/, '') ||
        'https://pcdownload-huoshan.aki-game.com'

    const mainUrl = `${cdn}/${versionData.indexFile.replace(/^\//, '')}`

    const mainMajor = {
      version: versionData.version,
      game_pkgs: [{
        url: mainUrl,
        md5: versionData.indexFileMd5 || '',
        size: versionData.size || 0
      }]
    }

    const patchPkgs = (versionData.patchConfig || [])
      .sort((a, b) => versionComparator.compare(b.version, a.version))
      .filter(patch => patch.indexFile)
      .map(patch => ({
        url: `${cdn}/${patch.indexFile.replace(/^\//, '')}`,
        md5: patch.indexFileMd5 || '',
        size: patch.size || 0,
        version: patch.version
      }))

    return {
      data: mainMajor,
      patch: { game_pkgs: patchPkgs },
      type
    }
  }

  handleMHYData (data, type) {
    const packageData = data?.data?.game_packages?.[0] || {}

    const safeGetPatch = (patchArray) => {
      return (patchArray?.[0] || { game_pkgs: [], audio_pkgs: [] })
    }

    if (type === 'pre') {
      return {
        data: packageData?.pre_download?.major,
        patch: safeGetPatch(packageData?.pre_download?.patches),
        type: 'pre'
      }
    }

    return {
      data: packageData?.main?.major,
      patch: safeGetPatch(packageData?.main?.patches),
      type: 'main'
    }
  }

  formatDownloadInfo (game, pkgData, type, patchData) {
    if (!pkgData) {
      return {
        msg: ['🌫️ 暂无可用下载资源'],
        client: [],
        patchesMessages: []
      }
    }

    const gameName = getGameName(game)
    const isPre = type === 'pre'

    if (game === 'ww') {
      return this.formatWWDownloadInfo(pkgData, patchData, gameName, isPre)
    }

    return this.formatOtherGamesInfo(pkgData, patchData, gameName, isPre)
  }

  formatWWDownloadInfo (pkgData, patchData, gameName, isPre) {
    const msg = []
    const client = []
    const patchesMessages = []

    msg.push(
      `🎮 ${gameName}${isPre ? '预下载' : '正式'}版本 - ${pkgData.version || '未知'}`
    )

    let clientText = '📦 完整客户端包：\n▂▂▂▂▂▂▂▂▂▂▂▂\n'

    pkgData.game_pkgs?.forEach((pkg, i) => {
      clientText += `${i + 1}. 🗃️ URL: ${pkg.url || `无链接${pkg.url}`}\n`
      clientText += `⚖️ 文件大小: ${api.formatSize(pkg.size)}\n`
      clientText += `🔍 MD5: ${pkg.md5 || '未知'}\n`
    })

    client.push(clientText)

    if (patchData?.game_pkgs?.length > 0) {
      let patchText = '🔄 各版本差分包：\n▂▂▂▂▂▂▂▂▂▂▂▂\n'
      patchData.game_pkgs.forEach((pkg, i) => {
        patchText += `${i + 1}. 🧩 版本: ${pkg.version || '未知'}\n`
        patchText += `🗃️ URL: ${pkg.url || '无链接'}\n`
        patchText += `⚖️ 文件大小: ${api.formatSize(pkg.size)}\n`
        patchText += `🔍 MD5: ${pkg.md5 || '未知'}\n\n`
      })
      patchesMessages.push(patchText)
    }

    return {
      msg,
      client,
      patchesMessages
    }
  }

  formatOtherGamesInfo (pkgData, patchData, gameName, isPre) {
    const msg = []
    const clent = []
    const audio = []
    const patch_audio = []
    const patch_clent = []

    msg.push(`🎮 ${gameName}${isPre ? '预下载' : '正式'}版本（${pkgData.version || '未知'}）`)

    let clientMsg = '📦 客户端分卷包：\n▂▂▂▂▂▂▂▂▂▂▂▂\n'

    if (pkgData.game_pkgs) {
      pkgData.game_pkgs.forEach((pkg, i) => {
        clientMsg += `${i + 1}. 🗃️ 链接：${pkg.url || '无链接'}\n`
        clientMsg += `⚖️ 大小：${api.formatSize(pkg.size)}\n`
        clientMsg += `🔍 MD5：${pkg.md5 || '未知'}\n\n`
      })
    }

    clent.push(clientMsg)

    if (pkgData.audio_pkgs?.length > 0) {
      let audioMsg = '🎧 语言资源包：\n▂▂▂▂▂▂▂▂▂▂▂▂\n'
      pkgData.audio_pkgs.forEach(audioPkg => {
        audioMsg += `🌍 语言类型：${audioPkg.language?.toUpperCase() || '未知'}\n`
        audioMsg += `🗃️ 链接：${audioPkg.url || '无链接'}\n`
        audioMsg += `⚖️ 大小：${api.formatSize(audioPkg.size)}\n`
        audioMsg += `🔍 MD5：${audioPkg.md5 || '未知'}\n\n`
      })
      audio.push(audioMsg)
    }

    if (patchData?.game_pkgs?.length > 0) {
      let patchMsg = '🔄 增量更新：\n▂▂▂▂▂▂▂▂▂▂▂▂\n'
      patchData.game_pkgs.forEach((pkg, i) => {
        patchMsg += `${i + 1}. 🧩 链接：${pkg.url || '无链接'}\n`
        patchMsg += `⚖️ 大小：${api.formatSize(pkg.size)}\n`
        patchMsg += `🔍 MD5: ${pkg.md5 || '未知'}\n\n`
      })
      patch_clent.push(patchMsg)
    }

    if (patchData?.audio_pkgs?.length > 0) {
      let audioPatchMsg = '🎶 增量语音资源：\n▂▂▂▂▂▂▂▂▂▂▂▂\n'
      patchData.audio_pkgs.forEach(audioPkg => {
        audioPatchMsg += `🌍 语言类型：${audioPkg.language?.toUpperCase() || '未知'}\n`
        audioPatchMsg += `🧩 链接：${audioPkg.url || '无链接'}\n`
        audioPatchMsg += `⚖️ 大小：${api.formatSize(audioPkg.size)}\n`
        audioPatchMsg += `🔍 MD5：${audioPkg.md5 || '未知'}\n\n`
      })
      patch_audio.push(audioPatchMsg)
    }

    return {
      msg,
      clent,
      audio,
      patch_clent,
      patch_audio
    }
  }
}

const download = new Download()
export default download
