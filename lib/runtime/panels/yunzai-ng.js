/**
 * yunzai-ng 面板渲染器
 */
import { s } from "@yunzai-ng/core"
import { buildSchema, FieldType, DEFAULT_CRON } from "./schema.js"

/** 字段类型 → NG schema 构造 */
const RENDERERS = {
  [FieldType.SWITCH]: (field) => s.boolean().default(!!field.default).title(field.label).desc(field.desc),
  [FieldType.CRON]: (field) =>
    s.cron().default(field.default || DEFAULT_CRON).title(field.label).desc(field.desc),
  [FieldType.RADIO]: (field) =>
    s
      .select(field.options.map(({ label, value }) => ({ value, label })))
      .default(field.default)
      .title(field.label)
      .desc(field.desc),
  [FieldType.GROUP_LIST]: (field) =>
    s
      .array(
        s.object(
          Object.fromEntries(
            (field.itemFields ?? []).map((item) => [
              item.key,
              s.string().default("").title(item.label).desc(item.desc)
            ])
          )
        )
      )
      .default([])
      .title(field.label)
      .desc(field.desc)
}

/**
 * 构建 yunzai-ng 的 configSchema
 * @returns {object}
 */
export function buildNgConfigSchema() {
  const schema = buildSchema()
  return s.object(
    Object.fromEntries(
      schema.groups.map((group) => [
        group.id,
        s
          .object(
            Object.fromEntries(
              group.fields.map((field) => {
                const render = RENDERERS[field.type]
                return [field.key, render ? render(field) : s.string().default("").title(field.label)]
              })
            )
          )
          .title(group.label)
      ])
    )
  )
}
