/**
 * 主人功能插件类（云崽系 / Karin 共用）
 */
import GamePushBase from "#GamePush.registry/app-base"
import { rt } from "#GamePush.runtime"
import { buildSetApp } from "#GamePush.model/commands"

export class Set extends GamePushBase {
  constructor() {
    super(buildSetApp(rt))
  }
}
