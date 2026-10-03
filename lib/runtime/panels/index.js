/**
 * 前端配置面板兼容层 —— 分发入口
 *
 * 插件只定义一份 schema（./schema.js），各框架的渲染器负责翻译：
 *   - 云崽系（Miao / TRSS / MangoCat / JiuLi）→ guoba.js   （插件根 guoba.support.js 薄暴露）
 *   - Karin                                    → karin-web.js（插件根 web.config.js 薄暴露）
 *   - yunzai-ng                                → yunzai-ng.js （内核 WebUI 托管）
 *
 * 三个渲染器都按需动态 import，避免把 node-karin / @yunzai-ng/core 拖进不相关的框架。
 */
import { adapterId } from "../detect.js"
import { buildSchema, buildPluginInfo, FieldType, DEFAULT_CRON } from "./schema.js"

export { buildSchema, buildPluginInfo, FieldType, DEFAULT_CRON }

/** 各适配器支持的面板 */
export const PANEL_BY_ADAPTER = {
  yunzai: ["guoba"],
  mangocat: ["guoba"],
  jiuli: ["guoba"],
  karin: ["karin-web"],
  "yunzai-ng": ["yunzai-ng"]
}

/**
 * 当前框架可用的面板列表
 * @param {string} [adapter]
 * @returns {string[]}
 */
export function availablePanels(adapter = adapterId) {
  return PANEL_BY_ADAPTER[adapter] ?? []
}

/** Guoba 面板（云崽系） */
export async function loadGuobaPanel() {
  return (await import("./guoba.js")).supportGuoba()
}

/** Karin-Web 面板 */
export async function loadKarinWebPanel() {
  return (await import("./karin-web.js")).default
}

/** yunzai-ng 配置 schema */
export async function loadNgPanel() {
  return (await import("./yunzai-ng.js")).buildNgConfigSchema()
}
