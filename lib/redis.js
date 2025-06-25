import { BotName } from "#GamePush.components"
const redis = await (async () => {
  switch (BotName) {
    case "Karin":
      return (await import("node-karin")).redis
    default:
      return global.redis
  }
})()

export default redis
