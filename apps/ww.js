import { cfg, api, download, getRedisKeys } from '#GamePush'

let wwReg = '(~|鸣潮|ww|WW|mc)'

export class wwPush extends plugin {
  constructor () {
    super({
      name: '[GamePush-Plugin]鸣潮功能',
      dsc: '鸣潮版本更新及预下载推送',
      event: 'message',
      priority: 7000,
      rule: [
        {
          reg: `^#*${wwReg}版本监控$`,
          fnc: 'wwCheck',
          permission: 'master'
        },
        {
          reg: `^#*${wwReg}(开启|关闭)版本推送$`,
          fnc: 'wwPushSet',
          permission: 'master'
        },
        {
          reg: `^#*${wwReg}当前版本$`,
          fnc: 'wwVer'
        },
        {
          reg: `^#*${wwReg}获取下载链接$`,
          fnc: 'wwDownloadLinks'
        },
        {
          reg: `^#*${wwReg}获取预下载链接$`,
          fnc: 'wwPreDownloadLinks'
        }
      ]
    })

    this.task = {
      cron: cfg.getGameConfig('ww').cron || '0 0/5 * * * *',
      name: '[GamePush-Plugin] 鸣潮版本监控',
      fnc: () => api.autoCheck('ww'),
      log: false
    }
  }

  async wwCheck () {
    await api.checkVersion(true, 'ww')
    return this.reply('✅ 已执行手动检查', true)
  }

  async wwPushSet () {
    const e = this.e
    const groupId = String(e.group_id)
    if (!e.isGroup) {
      return this.reply('❌ 该功能仅限群聊中使用', true)
    }

    const isEnable = e.msg.includes('开启')

    cfg.updateGameConfig('ww', (config) => {
      config.pushGroups = config.pushGroups || []
      if (isEnable) {
        if (!config.pushGroups.includes(groupId)) {
          config.pushGroups.push(groupId)
        }
      } else {
        config.pushGroups = config.pushGroups.filter(id => id !== groupId)
      }
      config.enable = isEnable
      config.cron = config.cron || '0 0/5 * * * *'
      config.pushChangeType = config.pushChangeType || '1'
    })

    const action = isEnable ? `已添加本群到推送列表（ID：${groupId}）` : '已移除本群推送'
    return this.reply(`✅ 已${isEnable ? '开启' : '关闭'}鸣潮版本推送，${action}`, true)
  }

  async wwVer () {
    const { main, pre } = getRedisKeys('ww')
    const [mainVer, preVer] = await Promise.all([
      redis.get(main),
      redis.get(pre)
    ])

    const msg = [
      '📌 鸣潮当前版本信息',
      `正式版本：${mainVer || '未知'}`,
      `预下载版本：${preVer || '未开启'}`
    ].join('\n')

    return this.reply(msg, true)
  }

  async wwDownloadLinks () {
    try {
      const { data, patch } = await download.getDownloadData('ww', 'main')
      console.log(data)
      if (!data) return this.reply('当前没有可用的正式版本下载', true)

      const { msg, client, patchesMessages } = download.formatDownloadInfo('ww', data, 'main', patch)
      return this.reply(await Bot.makeForwardArray([msg, client, patchesMessages]))
    } catch (err) {
      return this.reply(`❌ 获取失败：${err.message}`, true)
    }
  }

  async wwPreDownloadLinks () {
    try {
      const { data, patch } = await download.getDownloadData('ww', 'pre')
      if (!data) return this.reply('🚫 鸣潮当前未开放预下载', true)

      const { msg, client, patchesMessages } = download.formatDownloadInfo('ww', data, 'pre', patch)
      return this.reply(await Bot.makeForwardArray([msg, client, patchesMessages]))
    } catch (err) {
      return this.reply(`❌ 预下载获取失败：${err.message}`, true)
    }
  }
}
