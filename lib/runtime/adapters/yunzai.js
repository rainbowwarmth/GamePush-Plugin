/**
 * Miao-Yunzai / Trss-Yunzai 适配器
 *
 * 两者 API 完全一致，共用云崽系基座；差异仅在 BotName（由 detect 给出）。
 */
import { BotName, cwd } from "../detect.js"
import { createYunzaiFamilyAdapter } from "./yunzai-base.js"

export default createYunzaiFamilyAdapter({
  adapter: "yunzai",
  BotName,
  dataDir: `${cwd}/data`
})
