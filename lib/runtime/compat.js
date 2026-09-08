/**
 * 兼容层 — 将旧 lib/* 导出映射到 rt 接口
 *
 * 让现有 model/apps 代码中的 import { redis } from "#GamePush.lib" 等
 * 无需修改即可工作。新代码应直接 import { rt } from "#GamePush.runtime"。
 */
import { rt, ensureInit } from "./index.js"

export async function getRedis() {
  await ensureInit()
  return rt.kv
}

export async function getCommon() {
  await ensureInit()
  if (rt.common) return rt.common
  // Yunzai 默认 common
  return (await import("../../../lib/common/common.js")).default
}

export async function getPlugin() {
  await ensureInit()
  return rt.plugin
}

export async function getSegment() {
  await ensureInit()
  return rt.segment
}

export async function getPuppeteer() {
  await ensureInit()
  return { screenshot: rt.render }
}

export { rt, ensureInit }
