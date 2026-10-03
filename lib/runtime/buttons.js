/**
 * 按钮映射（兼容层）
 *
 * 各框架的按钮/键盘结构互不相同，统一在这里做行映射：
 *   - 云崽系（Miao / TRSS / MangoCat）：icqq `segment.button(...rows)`，回退 `Bot.Button(rows)`
 *   - JiuLi：`segment.button(...data)` → `{ type:'button', data }`，结构不同且协议端支持不一
 *   - Karin：`segment.keyboard(rows)`
 *   - yunzai-ng：`seg.keyboard(rows)` → `{ type:'keyboard', rows }`
 */

/** 云崽 / icqq 的 callback 按钮 */
export function mapYunzaiButtonRows(rows) {
  return rows.map((row) => row.map(({ text, command }) => ({ text, callback: command })))
}

/** 云崽 Bot.Button 的输入按钮 */
export function mapYunzaiInputButtonRows(rows) {
  return rows.map((row) => row.map(({ text, command }) => ({ text, data: command, enter: true })))
}

/** JiuLi 的输入按钮 */
export function mapJiuliButtonRows(rows) {
  return rows.map((row) => row.map(({ text, command }) => ({ text, data: command, enter: true })))
}

/** Karin 的键盘按钮 */
export function mapKarinButtonRows(rows) {
  return rows.map((row) =>
    row.map(({ text, command }) => ({
      text,
      data: command,
      enter: true,
      reply: true,
      tips: `请发送 ${command}`
    }))
  )
}

/** yunzai-ng 的键盘按钮 */
export function mapYunzaiNgButtonRows(rows) {
  return rows.map((row) =>
    row.map(({ text, command }) => ({
      label: text,
      action: "input",
      data: command,
      enter: true
    }))
  )
}

const GAME_COMMAND_NAMES = {
  ys: "原神",
  sr: "星铁",
  zzz: "绝区零",
  bh3: "崩坏3",
  ww: "鸣潮",
  zmd: "终末地"
}

const DOWNLOAD_GAMES = new Set(["sr", "zzz", "ww", "zmd"])

/**
 * 当前版本命令附带的快捷按钮
 * @param {string} gameId
 * @returns {Array<{text:string,command:string}>}
 */
export function buildCurrentVersionButtons(gameId) {
  const gameName = GAME_COMMAND_NAMES[gameId]
  if (!gameName) return []
  const buttons = [{ text: "版本数据", command: `#${gameName}版本数据` }]
  if (DOWNLOAD_GAMES.has(gameId)) {
    buttons.push({ text: "获取下载链接", command: `#${gameName}获取下载链接` })
  }
  return buttons
}

/**
 * 把快捷按钮挂到消息上（无按钮能力时原样返回文本）
 * @param {string} message
 * @param {string} gameId
 * @param {(rows:Array)=>any} commandButtons
 */
export function attachCurrentVersionButtons(message, gameId, commandButtons) {
  if (typeof commandButtons !== "function") return message
  const buttons = buildCurrentVersionButtons(gameId)
  if (!buttons.length) return message
  try {
    const keyboard = commandButtons([buttons])
    return keyboard ? [keyboard, message] : message
  } catch {
    return message
  }
}
