import { cfg } from "#GamePush.components"

const gameIds = ["ys", "sr", "zzz", "bh3", "ww"]
const gameMap = {
  ys: "原神",
  sr: "星穹铁道",
  zzz: "绝区零",
  bh3: "崩坏3",
  ww: "鸣潮"
}

export function supportGuoba() {
  return {
    pluginInfo: {
      name: "GamePush-Plugin",
      title: "游戏推送",
      description: "自动监控游戏版本更新并推送通知",
      author: "@rainbowwarmth",
      link: "https://gitcode.com/rainbowwarmth/GamePush-Plugin.git",
      isV3: true,
      showInMenu: true,
      icon: "mdi:gamepad-square-outline",
      iconColor: "#FF5722"
    },
    configInfo: {
      schemas: [
        ...gameIds
          .map((gameId) => {
            const gameName = gameMap[gameId]
            return [
              {
                label: `${gameName}配置`,
                component: "Divider"
              },
              {
                field: `${gameId}.enable`,
                label: "启用推送",
                component: "Switch",
                value: true,
                componentProps: {
                  defaultChecked: true
                }
              },
              {
                field: `${gameId}.cron`,
                label: "检查频率",
                bottomHelpMessage: "版本检查的时间表达式",
                component: "EasyCron",
                value: "0 0/5 * * * *",
                componentProps: {
                  placeholder: "默认: 0 0/5 * * * * (每5分钟检查一次)"
                }
              },
              {
                field: `${gameId}.pushGroups`,
                label: "推送配置",
                bottomHelpMessage: "机器人ID和群组配置",
                component: "GSubForm",
                componentProps: {
                  multiple: true,
                  schemas: [
                    {
                      field: "botId",
                      label: "机器人ID",
                      component: "Input",
                      required: true,
                      componentProps: {
                        placeholder: "请输入机器人账号ID"
                      }
                    },
                    {
                      field: "groupId",
                      label: "群号",
                      component: "Input",
                      required: true,
                      componentProps: {
                        placeholder: "请输入群号"
                      }
                    }
                  ]
                }
              },
              {
                field: `${gameId}.pushChangeType`,
                label: "消息类型",
                bottomHelpMessage: "1. 图片类型消息推送 2. 文字类型消息推送",
                component: "RadioGroup",
                componentProps: {
                  options: [
                    { label: "图片消息", value: "1" },
                    { label: "文字消息", value: "2" }
                  ],
                  placeholder: "请选择消息推送类型"
                }
              }
            ]
          })
          .flat()
      ],
      getConfigData() {
        return cfg.getFrontendConfig()
      },
      setConfigData(data, { Result }) {
        const saveResult = cfg.saveFromFrontend(data, { Result })
        if (saveResult.success) {
          return Result.ok({}, saveResult.message)
        } else {
          return Result.error(saveResult.message)
        }
      }
    }
  }
}
