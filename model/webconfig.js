/**
 * karin web 端配置
 * 具体实现在此处，根目录 web.config.js 仅负责暴露
 */
import { defineConfig, components } from "node-karin"
import { gameIds, getGameName } from "./index.js"
import { cfg, PluginPackage } from "../components/index.js"

export default defineConfig({
  info: {
    id: "karin-plugin-gamepush",
    name: "游戏更新推送插件",
    author: {
      name: "RainBow",
      home: "https://github.com/rainbowwarmth/",
      avatar: "https://github.com/rainbowwarmth.png"
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
      const gameName = getGameName(gameId)
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
                defaultSelected: gameConfig.enable !== undefined ? gameConfig.enable : true,
                description: `是否启用${gameName}的游戏更新推送`
              }),
              components.switch.create(`log`, {
                label: "启用日志",
                defaultSelected: gameConfig.log !== undefined ? gameConfig.log : true,
                description: `是否启用${gameName}的游戏日志显示`
              }),
              components.input.string(`cron`, {
                label: "定时推送表达式",
                placeholder: "例如: 0 0/5 * * * * (每5分钟)",
                defaultValue: gameConfig.cron || "0 0/5 * * * *",
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
                defaultValue: gameConfig.pushChangeType || "1",
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
                description: "选择推送的变更类型"
              }),
              components.radio.group(`html`, {
                label: "html模板",
                orientation: "horizontal",
                defaultValue: gameConfig.html || "Simple",
                radio: [
                  components.radio.create("type-1", {
                    label: "默认模板",
                    description: "以默认的html模板渲染推送内容",
                    value: "default"
                  }),
                  components.radio.create("type-2", {
                    label: "简约模板",
                    description: "以简约的html模板渲染推送内容",
                    value: "Simple"
                  })
                ],
                description: "请选择渲染的html模板"
              })
            ]
          })
        ]
      })
    })
  },
  save: async (config) => {
    console.log("收到配置保存请求:", config)
    const saveData = {}

    gameIds.forEach((gameId) => {
      const gameSettings = config[gameId] || []
      const gameConfig = gameSettings.length > 0 ? gameSettings[0] : {}
      const enable = gameConfig.enable !== undefined ? gameConfig.enable : true
      const log = gameConfig.log !== undefined ? gameConfig.log : true
      const cron = gameConfig.cron || "0 0/5 * * * *"
      const pushChangeType = gameConfig.pushChangeType || "1"
      const pushGroups = gameConfig.pushGroups || []
      const html = gameConfig.html || "default"
      saveData[gameId] = [
        {
          enable,
          cron,
          log,
          pushGroups,
          pushChangeType,
          html
        }
      ]
    })

    console.log("整理后的保存数据:", saveData)
    const result = await cfg.saveFromFrontend(saveData)
    console.log("配置保存结果:", result)

    return {
      success: result.success,
      message: result.message || "配置保存成功"
    }
  }
})
