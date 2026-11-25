/**
 * Miao-Yunzai / Trss-Yunzai 适配器
 */
import { BotName, cwd } from "../detect.js"
import { createYunzaiFamilyAdapter } from "./yunzai-base.js"

export default createYunzaiFamilyAdapter({
  adapter: "yunzai",
  BotName,
  dataDir: `${cwd}/data`
})
