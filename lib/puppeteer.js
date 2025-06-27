import { BotName } from "#GamePush.components"
const puppeteer = await (async () => {
  switch (BotName) {
    case "Karin": {
      return {
        screenshot: async (path, options) => {
          const renderOptions = {
            name: path,
            file: options.tplFile,
            type: options.imgType || "jpeg",
            data: {
              ...options
            },
            pageGotoParams: {
              waitUntil: "networkidle2"
            }
          }
          const { render } = (await import("node-karin")).render
          const { segment } = await import("node-karin")
          const img = await render(renderOptions)
          const image = `base64://${img}`
          return segment.image(image)
        }
      }
    }
    default:
      return (await import("../../../lib/puppeteer/puppeteer.js")).default
  }
})()

export default puppeteer
