/**
 * Guoba 面板渲染器（云崽系：Miao / TRSS / MangoCat / JiuLi）
 *
 * 把插件自有 schema 翻译成 Guoba 的 `schemas` 数组语法。
 * 插件根目录的 guoba.support.js 只是薄暴露，实现全在这里。
 */
import { cfg } from "#GamePush.components"
import { buildSchema, FieldType } from "./schema.js"

/** 字段类型 → Guoba 组件 */
const RENDERERS = {
  [FieldType.SWITCH]: (field) => ({
    component: "Switch",
    value: !!field.default,
    componentProps: { defaultChecked: !!field.default }
  }),
  [FieldType.CRON]: (field) => ({
    component: "EasyCron",
    value: field.default,
    componentProps: { placeholder: field.placeholder }
  }),
  [FieldType.RADIO]: (field) => ({
    component: "RadioGroup",
    value: field.default,
    componentProps: {
      options: field.options.map(({ label, value }) => ({ label, value })),
      placeholder: `请选择${field.label}`
    }
  }),
  [FieldType.GROUP_LIST]: (field) => ({
    component: "GSubForm",
    componentProps: {
      multiple: true,
      schemas: field.itemFields.map((item) => ({
        field: item.key,
        label: item.label,
        component: item.key === "groupId" ? "GSelectGroup" : "Input",
        required: !!item.required,
        helpMessage: item.desc,
        componentProps: { placeholder: item.key === "groupId" ? "点击选择要推送的群" : item.desc }
      }))
    }
  })
}

/** 单条字段 → Guoba schema 项 */
function toGuobaField(gameId, field) {
  const render = RENDERERS[field.type]
  return {
    field: `${gameId}.${field.key}`,
    label: field.label,
    bottomHelpMessage: field.desc,
    ...(render ? render(field) : { component: "Input" })
  }
}

/** 单个游戏 → 一组 Guoba schema 项 */
function toGuobaGroup(group) {
  return [
    { label: group.label, component: "SOFT_GROUP_BEGIN" },
    { label: `${group.label}`, component: "Divider" },
    ...group.fields.map((field) => toGuobaField(group.id, field))
  ]
}

/**
 * 生成 Guoba 的 supportGuoba() 返回值
 * @returns {object}
 */
export function supportGuoba() {
  const schema = buildSchema()

  return {
    pluginInfo: {
      name: schema.pluginInfo.name,
      title: schema.pluginInfo.title,
      description: schema.pluginInfo.description,
      author: `@${schema.pluginInfo.author}`,
      link: schema.pluginInfo.link,
      isV3: true,
      showInMenu: true,
      icon: schema.pluginInfo.icon,
      iconColor: schema.pluginInfo.iconColor
    },
    configInfo: {
      schemas: schema.groups.flatMap(toGuobaGroup),
      getConfigData() {
        return cfg.getFrontendConfig()
      },
      setConfigData(data, { Result }) {
        const result = cfg.saveFromFrontend(data, { Result })
        return result.success ? Result.ok({}, result.message) : Result.error(result.message)
      }
    }
  }
}
