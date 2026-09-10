export function mapYunzaiButtonRows(rows) {
  return rows.map((row) =>
    row.map(({ text, command }) => ({
      text,
      callback: command
    }))
  )
}

export function mapYunzaiInputButtonRows(rows) {
  return rows.map((row) =>
    row.map(({ text, command }) => ({
      text,
      data: command,
      enter: true
    }))
  )
}

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

export function buildCurrentVersionButtons(gameId) {
  const gameName = GAME_COMMAND_NAMES[gameId]
  if (!gameName) return []

  const buttons = [{ text: "版本数据", command: `#${gameName}版本数据` }]
  if (DOWNLOAD_GAMES.has(gameId)) {
    buttons.push({ text: "获取下载链接", command: `#${gameName}获取下载链接` })
  }
  return buttons
}

export function attachCurrentVersionButtons(message, gameId, commandButtons) {
  if (typeof commandButtons !== "function") return message
  const buttons = buildCurrentVersionButtons(gameId)
  if (!buttons.length) return message
  const keyboard = commandButtons([buttons])
  return keyboard ? [keyboard, message] : message
}
