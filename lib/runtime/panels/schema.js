/**
 * 插件自有配置 schema —— 框架无关
 *
 * 这是插件「自己的配置定义」：只描述有哪些配置项、什么类型、默认值。
 * 各框架的渲染器（Guoba / Karin-Web / yunzai-ng）把它翻译成各自的面板语法，
 * 业务侧不必为每个框架各写一套面板代码。
 */
import { gameIds, getGameName } from "#GamePush.model/util"
import { PluginPackage } from "../detect.js"
import { DEFAULT_CRON } from "../define.js"

/** 默认检查频率（单一来源：lib/runtime/define.js），各面板渲染器共用 */
export { DEFAULT_CRON }

/** 字段类型 */
export const FieldType = {
  SWITCH: "switch",
  CRON: "cron",
  GROUP_LIST: "groupList",
  RADIO: "radio"
}

/** 插件元信息（各面板共用） */
export function buildPluginInfo() {
  return {
    name: PluginPackage.name,
    title: "游戏推送",
    description: PluginPackage.description || "自动监控游戏版本更新并推送通知",
    author: "rainbowwarmth",
    authorLink: "https://github.com/rainbowwarmth",
    link: "https://gitcode.com/rainbowwarmth/GamePush-Plugin.git",
    version: PluginPackage.version,
    icon: "mdi:gamepad-square-outline",
    iconColor: "#FF5722",
    karinIcon: { name: "game", size: 24, color: "#B2A8D3" }
  }
}

/** 一个游戏的字段定义 */
function buildGameFields(gameId) {
  const gameName = getGameName(gameId)
  return [
    {
      key: "enable",
      type: FieldType.SWITCH,
      label: "启用推送",
      desc: `是否启用${gameName}的游戏更新推送`,
      default: true
    },
    {
      key: "log",
      type: FieldType.SWITCH,
      label: "启用日志",
      desc: `是否输出${gameName}的详细检查日志`,
      default: false
    },
    {
      key: "cron",
      type: FieldType.CRON,
      label: "检查频率",
      desc: "版本检查的 cron 表达式",
      default: DEFAULT_CRON,
      placeholder: "例如: 0 */5 3-22 * * ? (每天 3:00–22:55 每 5 分钟)"
    },
    {
      key: "pushGroups",
      type: FieldType.GROUP_LIST,
      label: "推送配置",
      desc: "检测到更新后推送的「机器人 + 群」列表",
      default: [],
      placeholder: "格式: 机器人账号:群号",
      itemFields: [
        { key: "botId", label: "机器人ID", desc: "推送使用的机器人账号 id", required: true },
        { key: "groupId", label: "推送群", desc: "接收推送的群号" }
      ]
    },
    {
      key: "pushChangeType",
      type: FieldType.RADIO,
      label: "消息类型",
      desc: "推送消息形式：图片或文字",
      default: "1",
      options: [
        { label: "图片消息", value: "1", desc: "以图片的格式推送更新通知" },
        { label: "文字消息", value: "2", desc: "以文字的格式推送更新通知" }
      ]
    },
    {
      key: "html",
      type: FieldType.RADIO,
      label: "html模板",
      desc: "图片消息使用的渲染模板",
      default: "default",
      options: [
        { label: "默认", value: "default", desc: "以默认的 html 模板渲染推送内容" },
        { label: "简约", value: "Simple", desc: "以简约的 html 模板渲染推送内容" }
      ]
    }
  ]
}

/**
 * 构建完整配置 schema
 * @returns {{pluginInfo: object, groups: Array}}
 */
export function buildSchema() {
  return {
    pluginInfo: buildPluginInfo(),
    groups: gameIds.map((gameId) => ({
      id: gameId,
      label: `${getGameName(gameId)}推送设置`,
      fields: buildGameFields(gameId)
    }))
  }
}
