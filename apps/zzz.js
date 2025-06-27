import { cfg } from "#GamePush.components"
import { plugin, redis, makeForwardMsg } from "#GamePush.lib"
import { api, download, getRedisKeys } from "#GamePush.model"

const zzzReg = "(%|绝区零|zzz|ZZZ)"

export class zzzPush extends plugin {
  constructor() {
    super({
      name: "[GamePush-Plugin]绝区零功能",
      dsc: "绝区零版本更新及预下载推送",
      event: "message",
      priority: 7000,
      rule: [
        {
          reg: `^#*${zzzReg}版本监控$`,
          fnc: "zzzCheck",
          permission: "master"
        },
        {
          reg: `^#*${zzzReg}(开启|关闭)版本推送$`,
          fnc: "zzzPushSet",
          permission: "master"
        },
        {
          reg: `^#*${zzzReg}当前版本$`,
          fnc: "zzzVer"
        },
        {
          reg: `^#*${zzzReg}获取下载链接$`,
          fnc: "zzzDownloadLinks"
        },
        {
          reg: `^#*${zzzReg}获取预下载链接$`,
          fnc: "zzzPreDownloadLinks"
        }
      ]
    })

    this.task = {
      cron: cfg.getGameConfig("zzz").cron || "0 0/5 * * * *",
      name: "[GamePush-Plugin] 绝区零版本监控",
      fnc: () => api.autoCheck("zzz"),
      log: false
    }
  }

  /**
   * 手动检查绝区零版本
   */
  async zzzCheck() {
    await api.checkVersion(true, "zzz")
    return this.reply("✅ 已执行手动检查", true)
  }

  /**
   * 设置绝区零版本推送
   */
  async zzzPushSet() {
    const e = this.e
    const groupId = String(e.group_id)
    if (!e.isGroup) {
      return this.reply("❌ 该功能仅限群聊中使用", true)
    }

    const isEnable = e.msg.includes("开启")
    const botid = e.self_id || e.selfId
    const groupIdentifier = `${botid}:${groupId}`

    cfg.updateGameConfig("zzz", (config) => {
      config.pushGroups = config.pushGroups || []
      if (isEnable) {
        config.pushGroups.push(groupIdentifier)
      }

      config.enable = isEnable
      config.cron = config.cron || "0 0/5 * * * *"
      config.pushChangeType = config.pushChangeType || "1"
    })

    const action = isEnable ? `已添加本群到推送列表（ID：${groupId}）` : "已移除本群推送"
    return this.reply(`✅ 已${isEnable ? "开启" : "关闭"}绝区零版本推送，${action}`, true)
  }

  /**
   * 查询绝区零当前版本
   */
  async zzzVer() {
    const { main, pre } = getRedisKeys("zzz")
    const [mainVer, preVer] = await Promise.all([redis.get(main), redis.get(pre)])

    const msg = [
      "📌 绝区零当前版本信息",
      `正式版本：${mainVer || "未知"}`,
      `预下载版本：${preVer || "未开启"}`
    ].join("\n")

    return this.reply(msg, true)
  }

  /**
   * 获取绝区零下载链接
   */
  async zzzDownloadLinks(e) {
    try {
      const { data, patch } = await download.getDownloadData("zzz", "main")
      if (!data) return this.reply("当前没有可用的正式版本下载", true)

      const { msg, client, audio, patch_client, patch_audio } = download.formatDownloadInfo(
        "zzz",
        data,
        "main",
        patch
      )
      return this.reply(await makeForwardMsg(e, [msg, client, audio, patch_client, patch_audio]))
    } catch (err) {
      return this.reply(`❌ 获取失败：${err.message}`, true)
    }
  }

  /**
   * 获取绝区零预下载链接
   */
  async zzzPreDownloadLinks(e) {
    try {
      const { data, patch } = await download.getDownloadData("zzz", "pre")
      if (!data) return this.reply("🚫 绝区零当前未开放预下载", true)

      const { msg, client, audio, patch_client, patch_audio } = download.formatDownloadInfo(
        "zzz",
        data,
        "pre",
        patch
      )
      return this.reply(await makeForwardMsg(e, [msg, client, audio, patch_client, patch_audio]))
    } catch (err) {
      return this.reply(`❌ 预下载获取失败：${err.message}`, true)
    }
  }
}
