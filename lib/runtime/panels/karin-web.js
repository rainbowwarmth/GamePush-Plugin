/**
 * Karin-Web 面板渲染器
 *
 * 把插件自有 schema 翻译成 Karin `defineConfig` 的 `components.*` 语法。
 * 插件根目录的 web.config.js 只是薄暴露（re-export），实现全在这里。
 */
import { defineConfig, components } from "node-karin"
import { cfg } from "#GamePush.components"
import { buildSchema, FieldType, DEFAULT_CRON } from "./schema.js"

/** 字段类型 → Karin 组件 */
const RENDERERS = {
  [FieldType.SWITCH]: (field) =>
    components.switch.create(field.key, {
      label: field.label,
      defaultSelected: !!field.default,
      description: field.desc
    }),
  [FieldType.CRON]: (field) =>
    components.input.string(field.key, {
      label: field.label,
      placeholder: field.placeholder,
      defaultValue: field.default || DEFAULT_CRON,
      description: field.desc
    }),
  [FieldType.RADIO]: (field) =>
    components.radio.group(field.key, {
      label: field.label,
      orientation: "horizontal",
      defaultValue: field.default,
      radio: field.options.map((option, index) =>
        components.radio.create(`type-${index + 1}`, {
          label: option.label,
          description: option.desc,
          value: option.value
        })
      ),
      description: field.desc
    }),
  [FieldType.GROUP_LIST]: (field) =>
    components.input.group(field.key, {
      label: field.label,
      maxRows: 10,
      description: field.desc,
      data: [],
      template: components.input.string("group-item", {
        label: field.itemFields?.map((item) => item.label).join(" + ") || "群组设置",
        placeholder: field.placeholder
      })
    })
}

/** 单个游戏 → 一个 accordion（pushGroups 用当前配置回填） */
function toAccordion(group, current = {}) {
  return components.accordion.create(group.id, {
    label: group.label,
    title: group.label,
    children: [
      components.accordion.createItem(group.id, {
        title: `${group.label}相关`,
        className: "ml-4 mr-4",
        subtitle: `此处用于管理${group.label}`,
        children: group.fields.map((field) => {
          const render = RENDERERS[field.type]
          const node = render ? render(field) : null
          if (field.type === FieldType.GROUP_LIST && node) {
            node.data = (current.pushGroups || []).map((item) =>
              typeof item === "string" ? item : `${item.botId}:${item.groupId}`
            )
          }
          return node
        })
      })
    ]
  })
}

/** 把 Karin 前端回传的数据整理成内部配置 */
function normalizeFromFrontend(config) {
  const saveData = {}
  for (const group of buildSchema().groups) {
    const items = config[group.id] || []
    const current = items.length > 0 ? items[0] : {}
    saveData[group.id] = [
      {
        enable: current.enable !== undefined ? current.enable : true,
        cron: current.cron || DEFAULT_CRON,
        log: current.log !== undefined ? current.log : false,
        pushGroups: current.pushGroups || [],
        pushChangeType: current.pushChangeType || "1",
        html: current.html || "default"
      }
    ]
  }
  return saveData
}

const schema = buildSchema()

export default defineConfig({
  info: {
    id: schema.pluginInfo.name.toLowerCase(),
    name: schema.pluginInfo.title,
    author: { name: schema.pluginInfo.author, home: schema.pluginInfo.authorLink },
    avatar: `${schema.pluginInfo.authorLink}.png`,
    icon: schema.pluginInfo.karinIcon,
    version: schema.pluginInfo.version,
    description: schema.pluginInfo.description
  },
  components: async () => {
    const frontend = cfg.getFrontendConfig() || {}
    return schema.groups.map((group) => toAccordion(group, (frontend[group.id] || [])[0] || {}))
  },
  save: async (config) => {
    const result = await cfg.saveFromFrontend(normalizeFromFrontend(config))
    return { success: result.success, message: result.message || "配置保存成功" }
  }
})
