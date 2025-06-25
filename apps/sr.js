import { cfg } from "#GamePush.components"
import { plugin, redis, makeForwardMsg } from "#GamePush.lib"
import { api, download, getRedisKeys } from "#GamePush.model"

const srReg = "(sr|SR|星铁|星穹铁道|铁道|崩坏星穹铁道)"

export class srPush extends plugin {
  constructor() {
    super({
      name: "[GamePush-Plugin]星铁功能",
      dsc: "星铁版本更新及预下载推送",
      event: "message",
      priority: 7000,
      rule: [
        {
          reg: `^#*${srReg}版本监控$`,
          fnc: "srCheck",
          permission: "master"
        },
        {
          reg: `^#*${srReg}(开启|关闭)版本推送$`,
          fnc: "srPushSet",
          permission: "master"
        },
        {
          reg: `^#*${srReg}当前版本$`,
          fnc: "srVer"
        },
        {
          reg: `^#*${srReg}获取下载链接$`,
          fnc: "srDownloadLinks"
        },
        {
          reg: `^#*${srReg}获取预下载链接$`,
          fnc: "srPreDownloadLinks"
        }
      ]
    })

    this.task = {
      cron: cfg.getGameConfig("sr").cron || "0 0/5 * * * *",
      name: "[GamePush-Plugin] 星铁版本监控",
      fnc: () => api.autoCheck("sr"),
      log: false
    }
  }

  /**
   * 手动检查星铁版本
   */
  async srCheck() {
    await api.checkVersion(true, "sr")
    return this.reply("✅ 已执行手动检查", true)
  }

  /**
   * 设置星铁版本推送
   */
  async srPushSet() {
    const e = this.e
    const groupId = String(e.group_id)

    if (!e.isGroup) {
      return this.reply("❌ 该功能仅限群聊中使用", true)
    }

    const isEnable = e.msg.includes("开启")

    cfg.updateGameConfig("sr", (config) => {
      config.pushGroups = config.pushGroups || []

      if (isEnable) {
        if (!config.pushGroups.includes(groupId)) {
          config.pushGroups.push(groupId)
        }
      } else {
        config.pushGroups = config.pushGroups.filter((id) => id !== groupId)
      }

      config.enable = isEnable
      config.cron = config.cron || "0 0/5 * * * *"
      config.pushChangeType = config.pushChangeType || "1"
    })

    const action = isEnable ? `已添加本群到推送列表（ID：${groupId}）` : "已移除本群推送"
    return this.reply(`✅ 已${isEnable ? "开启" : "关闭"}星铁版本推送，${action}`, true)
  }

  /**
   * 查询星铁当前版本
   */
  async srVer() {
    const { main, pre } = getRedisKeys("sr")
    const [mainVer, preVer] = await Promise.all([redis.get(main), redis.get(pre)])

    const msg = [
      "📌 星铁当前版本信息",
      `正式版本：${mainVer || "未知"}`,
      `预下载版本：${preVer || "未开启"}`
    ].join("\n")

    return this.reply(msg, true)
  }

  /**
   * 获取星铁下载链接
   */
  async srDownloadLinks(e) {
    try {
      const { data, patch } = await download.getDownloadData("sr", "main")
      if (!data) return this.reply("当前没有可用的正式版本下载", true)

      const { msg, clent, audio, patch_clent, patch_audio } = download.formatDownloadInfo(
        "sr",
        data,
        "main",
        patch
      )
      return this.reply(await makeForwardMsg(e, [msg, clent, audio, patch_clent, patch_audio]))
    } catch (err) {
      logger.error("[GamePush-Plugin] 获取星铁下载链接失败", err)
      return this.reply(`❌ 获取下载链接失败: ${err.message}`, true)
    }
  }

  /**
   * 获取星铁预下载链接
   */
  async srPreDownloadLinks(e) {
    try {
      const { data, patch } = await download.getDownloadData("sr", "pre")
      if (!data) return this.reply("当前没有可用的预下载版本", true)

      const { msg, clent, audio, patch_clent, patch_audio } = download.formatDownloadInfo(
        "sr",
        data,
        "pre",
        patch
      )
      return this.reply(await makeForwardMsg(e, [msg, clent, audio, patch_clent, patch_audio]))
    } catch (err) {
      logger.error("[GamePush-Plugin] 获取星铁预下载链接失败", err)
      return this.reply(`❌ 获取预下载链接失败: ${err.message}`, true)
    }
  }
}
