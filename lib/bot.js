import { BotName } from "#GamePush.components"

const Bot = await (async () => {
  switch (BotName) {
    case "Karin":
      return (await import("node-karin")).default
    default:
      return global.Bot
  }
})()

export default Bot
