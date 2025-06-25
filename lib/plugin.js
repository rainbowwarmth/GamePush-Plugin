import { BotName } from "#GamePush.components"
const plugin = await (async () => {
  switch (BotName) {
    case "Karin":
      return (await import("node-karin")).Plugin
    default:
      return global.plugin
  }
})()

export default plugin
