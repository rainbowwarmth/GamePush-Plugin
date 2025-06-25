import { BotName } from "#GamePush.components"

const segment = await (async () => {
  switch (BotName) {
    case "Karin":
      return (await import("node-karin")).segment
    default:
      return global.segment
  }
})()

export default segment
