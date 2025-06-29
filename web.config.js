import { defineConfig, components } from "node-karin"
import { cfg, PluginPackage } from "#GamePush.components"
const gameIds = ["ys", "sr", "zzz", "bh3", "ww"]
const gameMap = {
  ys: "原神",
  sr: "星穹铁道",
  zzz: "绝区零",
  bh3: "崩坏3",
  ww: "鸣潮"
}

export default defineConfig({
  info: {
    id: "karin-plugin-gamepush",
    name: "游戏更新推送插件",
    author: {
      name: "RainBow",
      home: "https://github.com/rainbowwarmth/",
      avatar: "https://gitee.com/rainbowwarmth.png"
    },
    icon: {
      name: "game",
      size: 24,
      color: "#B2A8D3"
    },
    version: PluginPackage.version,
    description: PluginPackage.description
  },
  components: async () => {
    const currentConfig = cfg.getFrontendConfig() || {}

    return gameIds.map((gameId) => {
      const gameConfigArray = currentConfig[gameId] || []
      const gameConfig = gameConfigArray.length > 0 ? gameConfigArray[0] : {}
      const gameName = gameMap[gameId]
      const pushGroupsAsString = (gameConfig.pushGroups || []).map((item) => {
        return typeof item === "string" ? item : `${item.botId}:${item.groupId}`
      })
      return components.accordion.create(`${gameId}`, {
        label: `${gameName}推送设置`,
        title: `${gameName}推送设置`,
        children: [
          components.accordion.createItem(`${gameId}`, {
            title: `${gameName}推送相关`,
            className: "ml-4 mr-4",
            subtitle: `此处用于管理${gameName}的推送设置`,
            children: [
              components.switch.create(`enable`, {
                label: "启用推送",
                defaultSelected: gameConfig[0]?.enable !== undefined ? gameConfig[0]?.enable : true,
                description: `是否启用${gameName}的游戏更新推送`
              }),
              components.input.string(`cron`, {
                label: "定时推送表达式",
                placeholder: "例如: 0 0/5 * * * * (每5分钟)",
                defaultValue: gameConfig[0]?.cron || "0 0/5 * * * *",
                description: "使用Cron表达式设置推送时间间隔"
              }),
              components.input.group(`pushGroups`, {
                label: "推送群组",
                maxRows: 10,
                data: pushGroupsAsString || [],
                template: components.input.string("group-item", {
                  placeholder: "格式: 机器人账号:群号",
                  label: "群组设置"
                }),
                description: "每个群组格式为: '机器人账号:群号'"
              }),
              components.radio.group(`pushChangeType`, {
                label: "推送变更类型",
                orientation: "horizontal",
                defaultValue: gameConfig[0]?.pushChangeType || "1",
                radio: [
                  components.radio.create("type-1", {
                    label: "图片消息",
                    description: "以图片的格式推送更新通知",
                    value: "1"
                  }),
                  components.radio.create("type-2", {
                    label: "文字消息",
                    description: "以文字的格式推送更新通知",
                    value: "2"
                  })
                ],
                description: "选择推送的通知类型"
              })
            ]
          })
        ]
      })
    })
  },
  save: async (config) => {
    const saveData = {}

    gameIds.forEach((gameId) => {
      const gameSettings = config[gameId] || []
      const enable = gameSettings[0]?.enable !== undefined ? gameSettings[0]?.enable : true
      const cron = gameSettings[0]?.cron || "0 0/5 * * * *"
      const pushChangeType = gameSettings[0]?.pushChangeType || "1"
      const pushGroups = []
      const rawPushGroups = gameSettings[0]?.pushGroups || []

      for (const item of rawPushGroups) {
        if (typeof item === "string") {
          pushGroups.push(item)
        } else if (item && typeof item === "object") {
          pushGroups.push(`${item.botId}:${item.groupId}`)
        }
      }

      saveData[gameId] = [
        {
          enable,
          cron,
          pushGroups,
          pushChangeType
        }
      ]
    })

    const result = await cfg.saveFromFrontend(saveData)

    return {
      success: result.success,
      message: result.message || "配置保存成功"
    }
  }
})
