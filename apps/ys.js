import { cfg } from '#GamePush.components'
import { api, getRedisKeys } from '#GamePush.model'

const ysReg = '(ys|YS|原神)'

export class ysPush extends plugin {
  constructor () {
    super({
      name: '[GamePush-Plugin]原神功能',
      dsc: '原神版本更新及预下载推送',
      event: 'message',
      priority: 7000,
      rule: [
        {
          reg: `^#*${ysReg}?版本监控$`,
          fnc: 'ysCheck',
          permission: 'master'
        },
        {
          reg: `^#*${ysReg}?(开启|关闭)版本推送$`,
          fnc: 'ysPushSet',
          permission: 'master'
        },
        {
          reg: `^#*${ysReg}?当前版本$`,
          fnc: 'ysVer'
        }
      ]
    })

    this.task = {
      cron: cfg.getGameConfig('ys').cron || '0 0/5 * * * *',
      name: '[GamePush-Plugin] 原神版本监控',
      fnc: () => api.autoCheck('ys'),
      log: false
    }
  }

  /**
   * 手动检查原神版本
   */
  async ysCheck () {
    await api.checkVersion(true, 'ys')
    return this.reply('✅ 已执行手动检查', true)
  }

  /**
   * 设置原神版本推送
   */
  async ysPushSet () {
    const e = this.e
    const groupId = String(e.group_id)

    if (!e.isGroup) {
      return this.reply('❌ 该功能仅限群聊中使用', true)
    }

    const isEnable = e.msg.includes('开启')

    cfg.updateGameConfig('ys', (config) => {
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
    return this.reply(`✅ 已${isEnable ? '开启' : '关闭'}原神版本推送，${action}`, true)
  }

  /**
   * 查询原神当前版本
   */
  async ysVer () {
    const { main, pre } = getRedisKeys('ys')
    const [mainVer, preVer] = await Promise.all([
      redis.get(main),
      redis.get(pre)
    ])

    const msg = [
      '📌 原神当前版本信息',
      `正式版本：${mainVer || '未知'}`,
      `预下载版本：${preVer || '未开启'}`
    ].join('\n')

    return this.reply(msg, true)
  }
}
