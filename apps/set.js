import { getRedisKeys } from '#GamePush.model'

const Reg = '(原神|星铁|绝区零|崩三|鸣潮)'

const gameInfoMap = {
  原神: { id: 'ys', display: '原神' },
  星铁: { id: 'sr', display: '星铁' },
  绝区零: { id: 'zzz', display: '绝区零' },
  崩三: { id: 'bh3', display: '崩坏3' },
  鸣潮: { id: 'ww', display: '鸣潮' }
}

export class Set extends plugin {
  constructor () {
    super({
      name: '[GamePush-Plugin]Redis管理',
      dsc: 'Redis键值管理',
      event: 'message',
      priority: 100,
      rule: [
        {
          reg: `^#*${Reg}删除rediskey$`,
          fnc: 'delkey',
          permission: 'master'
        },
        {
          reg: `^#*${Reg}删除预下载rediskey$`,
          fnc: 'delPrekey',
          permission: 'master'
        },
        {
          reg: `^#*${Reg}设置rediskey\\s*(.+)$`,
          fnc: 'setkey',
          permission: 'master'
        },
        {
          reg: `^#*${Reg}设置预下载rediskey\\s*(.+)$`,
          fnc: 'setPrekey',
          permission: 'master'
        }
      ]
    })
  }

  async delkey () {
    try {
      const match = Object.keys(gameInfoMap).find(k => this.e.msg.includes(k))
      if (!match) return this.e.reply('未找到匹配的游戏类型')

      const { id, display } = gameInfoMap[match]
      const keys = getRedisKeys(id)

      if (!keys?.main) {
        return this.e.reply('配置中未找到主RedisKey')
      }

      await redis.del(keys.main)
      this.e.reply(`${display} RedisKey已删除`)
    } catch (error) {
      this.e.reply(`删除失败: ${error.message}`)
    }
  }

  async delPrekey () {
    try {
      const match = Object.keys(gameInfoMap).find(k => this.e.msg.includes(k))
      if (!match) return this.e.reply('未找到匹配的游戏类型')

      const { id, display } = gameInfoMap[match]
      const keys = getRedisKeys(id)

      if (!keys?.pre) {
        return this.e.reply('配置中未找到预下载RedisKey')
      }

      await redis.del(keys.pre)
      this.e.reply(`${display} 预下载RedisKey已删除`)
    } catch (error) {
      this.e.reply(`删除失败: ${error.message}`)
    }
  }

  async setkey () {
    try {
      const match = Object.keys(gameInfoMap).find(k => this.e.msg.includes(k))
      if (!match) return this.e.reply('未找到匹配的游戏类型')

      const { id, display } = gameInfoMap[match]
      const keys = getRedisKeys(id)

      if (!keys?.main) {
        return this.e.reply('配置中未找到主RedisKey')
      }

      const [, value] = this.e.msg.match(new RegExp(`${match}设置rediskey\\s*(.+)`)) || []
      if (!value) return this.e.reply('请提供要设置的值')

      await redis.set(keys.main, value.trim())
      this.e.reply(`${display} RedisKey已设置为: ${value}`)
    } catch (error) {
      this.e.reply(`设置失败: ${error.message}`)
    }
  }

  async setPrekey () {
    try {
      const match = Object.keys(gameInfoMap).find(k => this.e.msg.includes(k))
      if (!match) return this.e.reply('未找到匹配的游戏类型')

      const { id, display } = gameInfoMap[match]
      const keys = getRedisKeys(id)

      if (!keys?.pre) {
        return this.e.reply('配置中未找到预下载RedisKey')
      }

      const [, value] = this.e.msg.match(new RegExp(`${match}设置预下载rediskey\\s*(.+)`)) || []
      if (!value) return this.e.reply('请提供要设置的值')

      await redis.set(keys.pre, value.trim())
      this.e.reply(`${display} 预下载RedisKey已设置为: ${value}`)
    } catch (error) {
      this.e.reply(`设置失败: ${error.message}`)
    }
  }
}
