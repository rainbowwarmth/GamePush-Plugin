import { rt, ensureInit } from "./runtime/index.js"

await ensureInit()
export default { screenshot: rt.render }
