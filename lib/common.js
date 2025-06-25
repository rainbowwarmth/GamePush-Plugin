import { BotName } from "#GamePush.components"
const common = await (async () => {
  switch (BotName) {
    case "Karin":
      return (await import("node-karin")).common
    default:
      return (await import("../../../lib/common/common.js")).default
  }
})()

export default common
