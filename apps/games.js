/**
 * 游戏插件类集合（云崽系 / Karin 共用）
 *
 * 一个文件导出 6 个插件类：
 *   - Karin：pkgCache 遍历模块全部导出，逐个把 class 注册成插件（跳过 default）
 *   - 云崽系：由 index.js 扫描 apps/ 后展开为 apps 字段，框架 loader 再实例化
 *
 * ⚠️ 必须逐个具名导出，不能写成 `export const apps = [...]`：
 *    Karin 的 cacheHandler 只接受带 pkg/file 的对象，数组里的 class 会被静默丢弃
 *    （表现为「插件加载成功但零命令」）。
 */
import GamePushBase from "#GamePush.registry/app-base"
import { rt } from "#GamePush.runtime"
import { buildGameApp } from "#GamePush.model/commands"

/** 生成一个游戏插件类：构造时把 app 定义交给基类翻译成当前框架的插件选项 */
const gameApp = (gameId) =>
  class extends GamePushBase {
    constructor() {
      super(buildGameApp(gameId, rt))
    }
  }

export const ysPush = gameApp("ys")
export const srPush = gameApp("sr")
export const zzzPush = gameApp("zzz")
export const bh3Push = gameApp("bh3")
export const wwPush = gameApp("ww")
export const zmdPush = gameApp("zmd")
