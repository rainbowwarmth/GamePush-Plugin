# 🎮 GamePush Plugin

<div align="center">

![GamePush](https://img.shields.io/badge/GamePush-Plugin-blue?style=for-the-badge&logo=gamepad)
![Yunzai](https://img.shields.io/badge/Yunzai-green?style=for-the-badge&logo=robot)
![JiuLi](https://img.shields.io/badge/JiuLi-green?style=for-the-badge&logo=robot)
![Karin](https://img.shields.io/badge/Karin-Bot-green?style=for-the-badge&logo=robot)
![Yunzai-NG](https://img.shields.io/badge/Yunzai--NG-green?style=for-the-badge&logo=robot)
![License](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)
![Node.js](https://img.shields.io/badge/Node.js-22.15+-brightgreen?style=for-the-badge&logo=node.js)

**🚀 游戏版本监控推送插件**

_实时监控游戏版本更新 | 自动推送预下载通知 | 支持多游戏平台 | 一套代码适配六框架_

</div>

---

## ✨ 功能特色

### 🎯 支持游戏

- 🌟 **原神** (Genshin Impact)
- ⭐ **崩坏：星穹铁道** (Honkai: Star Rail)
- 🔥 **绝区零** (Zenless Zone Zero)
- ⚡ **崩坏 3** (Honkai Impact 3rd)
- 🌊 **鸣潮** (Wuthering Waves)
- 🧪 **明日方舟：终末地** (Arknights: Endfield) —— 实验性支持

### 🛠️ 核心功能

- 📱 **版本监控** - 实时检测游戏版本更新
- 🔔 **自动推送** - 版本更新及预下载通知
- 🖼️ **图文推送** - 支持图片（可选模板）与纯文字两种推送形式
- 📥 **下载链接** - 获取正式版 / 预下载的客户端、资源包直链
- 📊 **历史数据** - 记录各版本包体与更新包大小，可随时查询
- ⚙️ **灵活配置** - 每个游戏独立配置推送开关、频率与推送群
- 🕐 **定时任务** - 自动定时检查更新
- 💾 **混合存储** - Redis 保存当前版本状态，内置 SQLite 保存历史版本数据
- 🎛️ **多端可视化配置** - Guoba、Karin-Web、Yunzai-NG 三套配置界面
- 🔘 **快捷按钮** - `当前版本` 回复自动附带命令按钮
- 🧩 **六框架同源** - Miao-Yunzai / TRSS-Yunzai / MangoCat-Yunzai / JiuLi / Karin / Yunzai-NG 共用一套业务代码，框架差异全部收敛在 `lib/runtime/`

---

## 📦 安装指南

### 前置要求

- ✅ 任选其一：[Miao-Yunzai](https://github.com/yoimiya-kokomi/Miao-Yunzai)、[TRSS-Yunzai](https://gitee.com/TimeRainStarSky/Yunzai)、[MangoCat-Yunzai](https://github.com/MangoCat-Yunzai/MangoCat-Yunzai)、[JiuLi（玖璃）](https://github.com/jiuli-framework/jiuli)、[Karin](https://github.com/KarinJS/Karin)、[Yunzai-NG](https://github.com/Yunzai-NG/yunzai-ng)
- ✅ [Node.js 22.15+](https://nodejs.org/zh-cn/download)（依赖内置 `node:sqlite`，无需编译 `better-sqlite3`）
- ✅ [Redis 数据库](https://redis.io/)（Yunzai-NG 下由内核提供 KV，无需单独部署）

### 安装步骤

1. **克隆插件**

```bash
# Miao-Yunzai / TRSS-Yunzai / MangoCat-Yunzai / JiuLi / Yunzai-NG —— 目录名保持 GamePush-Plugin
## GitCode
git clone https://gitcode.com/rainbowwarmth/GamePush-Plugin.git ./plugins/GamePush-Plugin
## Gitee
git clone https://gitee.com/rainbowwarmth/GamePush-Plugin.git ./plugins/GamePush-Plugin
## CNB
git clone https://cnb.cool/rainbowwarmth/GamePush-Plugin.git ./plugins/GamePush-Plugin
## GitHub
git clone https://github.com/rainbowwarmth/GamePush-Plugin.git ./plugins/GamePush-Plugin

# Karin —— 目录名必须包含 karin
## GitCode
git clone https://gitcode.com/rainbowwarmth/GamePush-Plugin.git ./plugins/karin-plugin-gamepush
## Gitee
git clone https://gitee.com/rainbowwarmth/GamePush-Plugin.git ./plugins/karin-plugin-gamepush
## CNB
git clone https://cnb.cool/rainbowwarmth/GamePush-Plugin.git ./plugins/karin-plugin-gamepush
## GitHub
git clone https://github.com/rainbowwarmth/GamePush-Plugin.git ./plugins/karin-plugin-gamepush
```

> ⚠️ **目录名决定框架判定**：目录名包含 `karin` → 按 Karin 加载；否则按宿主 `package.json` 的 `name` 区分 `miao-yunzai` / `trss-yunzai` / `MangoCat-Yunzai` / `jiuli` / `yunzai-ng`。请勿随意改名。

2. **安装依赖**

```bash
pnpm install -P
```

> 💡 `@yunzai-ng/core` **不需要**在插件里安装 —— 它由 Yunzai-NG 内核提供，插件从宿主 `node_modules` 解析。仅在 NG 下才会被导入，其余框架不会触碰该依赖。

3. **启动机器人**

```bash
# 重启对应的机器人框架即可自动加载插件
```

首次加载时插件会自动从远端拉取游戏版本数据库（`GamePush-Plugin.db`），并在后续启动时按版本号增量更新。

---

## 🎮 使用指南

### 基础命令

| 命令                       | 功能                       | 权限     | 特别说明                |
| -------------------------- | -------------------------- | -------- | ----------------------- |
| `#[游戏]版本监控`          | 手动触发一次版本检查       | Master   |                         |
| `#[游戏]开启版本推送`      | 将当前群加入推送列表       | Master   | 仅限群聊                |
| `#[游戏]关闭版本推送`      | 将当前群移出推送列表       | Master   | 仅限群聊                |
| `#[游戏]当前版本`          | 查看正式版本与预下载版本   | 所有用户 | 回复附带快捷按钮        |
| `#[游戏]版本数据`          | 查看历史版本更新包大小列表 | 所有用户 |                         |
| `#[游戏]版本数据 [版本号]` | 查看指定版本的详细数据     | 所有用户 |                         |
| `#[游戏]获取下载链接`      | 获取当前正式版本下载链接   | 所有用户 | 原神、崩坏 3 不支持获取 |
| `#[游戏]获取预下载链接`    | 获取当前预下载版本链接     | 所有用户 | 原神、崩坏 3 不支持获取 |

> 命令前的 `#` 可省略或重复（`#原神当前版本`、`原神当前版本` 均可）。

### 支持的游戏命令前缀

- 🌟 原神: `#原神` / `#ys` / `#YS`
- ⭐ 崩坏：星穹铁道: `*` / `#星铁` / `#崩铁` / `#星穹` / `#星轨` / `#穹轨` / `#铁道` / `#星穹铁道` / `#崩坏星穹铁道`
- 🔥 绝区零: `%` / `％` / `#绝区零` / `#绝区` / `#zzz` / `#ZZZ`
- ⚡ 崩坏 3: `!` / `！` / `#崩坏3` / `#崩坏三` / `#崩三` / `#崩3` / `#三崩子` / `#bbb`
- 🌊 鸣潮: `~` / `～` / `#鸣潮` / `#ww` / `#WW` / `#mc`
- 🏜️ 终末地: `:` / `：` / `#终末地` / `#zmd`

> 📌 **原神的前缀可以省略**：`#当前版本`、`#版本数据`、`#版本监控` 等不带游戏名的命令默认作用于原神。
>
> ⚠️ 别名区分大小写（`#Zzz`、`#Ww` 不匹配）；星铁与崩坏 3 **没有** `sr` / `SR` / `bh3` / `BH3` 英文别名。

### 管理命令

| 命令                        | 功能                                     | 权限   |
| --------------------------- | ---------------------------------------- | ------ |
| `#[游戏]删除rediskey`       | 删除游戏 Redis 键值                      | Master |
| `#[游戏]删除预下载rediskey` | 删除预下载 Redis 键值                    | Master |
| `#[游戏]设置rediskey 版本`  | 设置游戏 Redis 键值                      | Master |
| `#[游戏]设置预下载rediskey 版本` | 设置游戏预下载 Redis 键值           | Master |
| `#更新游戏版本数据`         | 合并远程游戏版本历史数据（保留本地记录） | Master |

> 管理命令的游戏前缀同样可省略，省略时默认作用于**原神**。

---

## 💾 数据存储

插件采用混合存储：**当前版本状态**存放在 Redis / 内核 KV，**历史版本包体数据**存放在内置 SQLite（`node:sqlite`，无需安装 `better-sqlite3`）。

数据库文件名**恒为** `GamePush-Plugin.db`（取插件 `package.json` 的 `name`，不随目录名变化），存放目录随框架而变：

| 框架                       | 数据库路径                                               |
| -------------------------- | -------------------------------------------------------- |
| Miao-Yunzai / TRSS-Yunzai / MangoCat-Yunzai | `data/GamePush-Plugin.db`                |
| JiuLi                      | `data/plugins/GamePush-Plugin/GamePush-Plugin.db`         |
| Karin                      | `@karinjs/karin-plugin-gamepush/data/GamePush-Plugin.db` |
| Yunzai-NG                  | `data/plugin/GamePush-Plugin/sql/GamePush-Plugin.db`     |

- 首次启动时会从远程拉取版本历史数据作为初始数据，失败仅告警并回退到本地库。
- `#更新游戏版本数据` 采用 **`INSERT OR IGNORE` 合并**而非覆盖，本地记录不会丢失。
- 使用 Yunzai-NG 时，插件在自己的 `data/plugin/GamePush-Plugin/sql/` 下维护数据库，并在首次启动时**只读导入**原内核目录 `data/sql/GamePush-Plugin/` 中的历史数据；原数据库不会被删除或修改。

---

## ⚙️ 配置说明

### 配置文件位置

| 框架                                          | 配置文件                                                     |
| --------------------------------------------- | ------------------------------------------------------------ |
| Miao-Yunzai / TRSS-Yunzai / MangoCat-Yunzai   | `data/GamePush-Plugin.yaml`                                   |
| JiuLi                                         | `data/plugins/GamePush-Plugin/GamePush-Plugin.yaml`           |
| Karin                                         | `@karinjs/karin-plugin-gamepush/config/GamePush-Plugin.yaml`  |
| Yunzai-NG                                     | `config/GamePush-Plugin.yaml`（由内核托管，面板可视化编辑）   |

### 可视化配置

插件支持三套可视化配置界面，按框架自动选用：

| 框架                                          | 配置方式                                                       |
| --------------------------------------------- | -------------------------------------------------------------- |
| Miao-Yunzai / TRSS-Yunzai / MangoCat-Yunzai / JiuLi | [Guoba-Plugin](https://github.com/guoba-yunzai/guoba-plugin)（`guoba.support.js`） |
| Karin                                         | Karin-Web（`web.config.js`）                                   |
| Yunzai-NG                                     | 内核配置界面（schema 由 `lib/runtime/panels/yunzai-ng.js` 生成） |

> 📌 三个根文件（`guoba.support.js` / `web.config.js` / NG 的 `configSchema`）都只是**薄暴露**，真正的 schema 与面板实现统一下放在兼容层 `lib/runtime/panels/`。

可配置项：

- 🎛️ 推送开关 / 日志开关
- ⏰ 定时任务 cron 表达式（默认 `0 */5 3-22 * * ?` —— 每天 3:00–22:55 每 5 分钟一次）
- 👥 推送的「机器人 + 群」列表
- 🖼️ 消息类型（图片 / 文字）与 html 模板（默认 / 简约）

---

## 🏗️ 项目结构

```
GamePush-Plugin/
├── 📁 apps/                    # 插件类集合（云崽系 loader 展开 apps 字段；Karin 递归加载本目录）
│   ├── 🎮 games.js             # 6 个游戏插件类（ys/sr/zzz/bh3/ww/zmd，逐个具名导出）
│   ├── ⚙️ set.js               # 设置管理
│   └── 📋 task.js              # 独立定时任务（Karin 用薄壳）
├── 📁 components/              # 组件模块（路径、配置、请求）
├── 📁 lib/                     # 工具库
│   ├── api.js / common.js / plugin.js / puppeteer.js / redis.js / segment.js
│   │                           # 兼容垫片：转发到 rt，业务侧仍按旧路径导入
│   └── 📁 runtime/             # ★ 框架兼容层（六框架差异全部收敛在此）
│       ├── index.js            # 运行时单例 rt + 适配器装配
│       ├── detect.js           # 框架探测（目录名 / 宿主 package.json）
│       ├── contract.js         # 适配器契约校验
│       ├── define.js           # 插件自有 DSL：defineCommand / defineTask / defineApp
│       ├── lifecycle.js        # 卸载钩子与资源交接（JiuLi 热重载）
│       ├── sqlite-db.js        # node:sqlite 历史数据存储
│       ├── buttons.js          # 各框架按钮结构互转
│       ├── 📁 adapters/        # 六个适配器
│       │   ├── yunzai-base.js  # 云崽系基座（Miao/TRSS/MangoCat/JiuLi 复用）
│       │   ├── yunzai.js       # Miao-Yunzai / TRSS-Yunzai
│       │   ├── mangocat.js     # MangoCat-Yunzai
│       │   ├── jiuli.js        # JiuLi（玖璃）
│       │   ├── karin.js        # Karin
│       │   └── yunzai-ng.js    # Yunzai-NG
│       ├── 📁 panels/          # 前端配置面板（schema 与渲染器）
│       │   ├── schema.js       # 框架无关的统一 schema
│       │   ├── guoba.js        # Guoba 渲染
│       │   ├── karin-web.js    # Karin-Web 渲染
│       │   └── yunzai-ng.js    # Yunzai-NG 渲染
│       └── 📁 registry/        # 注册层：把 app 定义翻译成各框架的注册语法
│           ├── app-base.js     # 插件基类（继承宿主 Base + 绑定命令 handler）
│           ├── apps.js         # prepareApp（云崽系 / Karin）
│           ├── ng.js           # definePlugin（Yunzai-NG）
│           └── tasks.js        # 独立任务导出（Karin）
├── 📁 model/                   # 数据模型与命令实现（框架无关）
│   ├── games.js                # ★ 各游戏接口描述符：端点 / 请求方式 / 响应归一化
│   ├── util.js                 # 游戏元数据与纯工具（无网络、无兼容层依赖）
│   ├── api.js                  # 版本检查编排（比对 Redis → 触发推送）
│   ├── notice.js               # 推送编排（文案模板 / 图片 / 文本）
│   ├── download.js             # 下载数据编排（带缓存）+ 文案格式化
│   ├── base.js                 # 截图数据组装、图标内联
│   ├── commands.js             # 命令定义
│   ├── tasks.js                # 定时任务定义
│   └── index.js                # 模型层出口
├── 📁 resources/               # 资源文件
├── 🔧 index.js                 # 入口：按框架分发到注册层
├── 🎛️ guoba.support.js         # Guoba 暴露点（薄壳，转发兼容层）
├── 🎛️ web.config.js            # Karin-Web 暴露点（薄壳，转发兼容层）
└── 📦 package.json             # 项目配置（含 #GamePush.* 子路径导入映射）
```

---

## 🔧 开发说明

### 技术栈

- **框架**: [Miao-Yunzai](https://github.com/yoimiya-kokomi/Miao-Yunzai)、[TRSS-Yunzai](https://gitee.com/TimeRainStarSky/Yunzai)、[MangoCat-Yunzai](https://github.com/MangoCat-Yunzai/MangoCat-Yunzai)、[JiuLi（玖璃）](https://github.com/jiuli-framework/jiuli)、[Karin](https://github.com/KarinJS/Karin)、[Yunzai-NG](https://github.com/Yunzai-NG/yunzai-ng)
- **语言**: JavaScript (ES6+ / ESM)
- **数据库**: [Redis](https://redis.io/)（版本状态）+ Node 内置 `node:sqlite`（版本历史，无需安装 `better-sqlite3`）
- **任务调度**: Cron
- **配置管理**: Guoba / Karin-Web / Yunzai-NG schema（统一 schema，多渲染器）

### 兼容层设计

所有框架差异收敛在 `lib/runtime/`，业务代码只依赖统一的 `rt` 对象：

- **框架探测**（`detect.js`）——按有序规则表识别：目录名含 `karin` → Karin；否则按宿主 `package.json` 的 `name` 匹配 `yunzai-ng` / `MangoCat-Yunzai` / `jiuli` / `miao-yunzai` / `trss-yunzai`；全部落空但存在云崽全局时按未知云崽分支告警处理。
- **适配器契约**（`contract.js`）——适配器必须提供 `kv`、`db`、`dataDir`、`pluginRoot`、`segment`、`sendGroupMsg`、`makeForward`、`render`、`normalizeEvent`、`commandButtons`、`capabilities` 等接口，缺一即启动报错。
- **插件自有 DSL**（`define.js`）——业务侧用 `defineCommand` / `defineTask` / `defineApp` 声明「有哪些命令、什么频率」，不写 `rule:` / `ctx.command` / `karin.task`。
- **注册层**（`registry/`）——把 app 定义翻译成各框架的注册语法：云崽系 / Karin 走 `prepareApp` 生成插件类选项，Yunzai-NG 走 `definePlugin` + `ctx.command` / `ctx.cron`。
- **面板兼容层**（`panels/`）——一份框架无关的 `schema.js`，加 Guoba / Karin-Web / Yunzai-NG 三个渲染器；根目录的 `guoba.support.js`、`web.config.js` 只是框架要求的固定暴露路径，内容转发到兼容层。
- **生命周期**（`lifecycle.js`）——统一登记模块级资源（SQLite 句柄、chokidar watcher），并在 JiuLi 热重载时通过 `globalThis` 交接旧模块图的资源，避免句柄泄漏。

> ➕ **新增框架**：在 `lib/runtime/adapters/` 补一个适配器文件 + 在 `detect.js` 规则表加一条匹配规则即可，`apps/` 与 `model/` 业务逻辑零改动。

### 模型层分层

业务侧按「游戏」而不是「接口」来组织 —— 厂商差异全部收敛在 `model/games.js`：

- **`games.js`（接口描述符）** —— 一个游戏一处，对外只暴露四个归一化能力：
  `fetchVersion(game)` → `{ main, pre }`、`fetchPackages(game, type)` → `{ data, patch }`、
  `fetchSize(game, type)` → `{ formattedTotalSize, incrementalSize, Ver }`、`icon(game)`。
  三个厂商（米哈游 `mhy` / 库洛 `ww` / 鹰角 `zmd`）各一个描述符，由 `GAME_CONFIG[game].api` 路由。
- **`api.js` / `download.js` / `notice.js`（编排层）** —— 只做「取归一化数据 → 比对 → 推送 → 回写」，
  不再出现 `if (game === "zmd")` 这类分支。
- **`util.js`（叶子层）** —— 只有静态元数据与纯函数（`formatSize`、`versionComparator` 等），
  不依赖兼容层、不发请求，避免与 `components/config.js` 形成循环。

> ➕ **新增游戏**：在 `GAME_CONFIG` 加一条元数据、在 `games.js` 加一个描述符（若属已有厂商则直接复用），
> 编排层无需改动。

### 核心特性

- 🧩 **运行时抽象层** - 业务代码只依赖 `rt` 接口，框架差异由适配器消化
- 🧭 **命令描述符** - 命令逻辑写成纯函数，各框架按自己的方式注册
- 🔄 **模块化设计** - 每个游戏独立模块
- 📡 **API 监控** - 实时获取官方版本信息
- 💾 **数据持久化** - Redis 保存当前版本状态，Node 内置 SQLite 保存历史版本数据
- 🎯 **精准推送** - 避免重复通知
- ⚡ **高性能** - 异步处理，低资源占用

---

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

---

## 📄 许可证

本项目基于 [MIT License](LICENSE) 开源协议。

---

## 👨‍💻 作者

**rainbowwarmth**

- 🐙 GitHub: [@rainbowwarmth](https://github.com/rainbowwarmth)

---

## 🙏 致谢

感谢以下项目和开发者：

- [Miao-Yunzai](https://github.com/yoimiya-kokomi/Miao-Yunzai) - 强大的机器人框架
- [TRSS-Yunzai](https://gitee.com/TimeRainStarSky/Yunzai) - 强大的机器人框架
- [MangoCat-Yunzai](https://github.com/MangoCat-Yunzai/MangoCat-Yunzai) - 内置 OneBotv11 适配器的云崽分支
- [JiuLi（玖璃）](https://gitee.com/fox-glaze/jiuli) - 兼容 TRSS 生态的 TS 内核框架
- [Karin](https://github.com/KarinJS/Karin) - 强大的机器人框架
- [Yunzai-NG](https://github.com/Yunzai-NG/yunzai-ng) - 可插拔运行时内核
- [Guoba-Plugin](https://github.com/guoba-yunzai/guoba-plugin) - 可视化配置支持

---

<div align="center">

**⭐ 如果这个项目对你有帮助，请给个 Star 支持一下！**

![Star History](https://img.shields.io/github/stars/rainbowwarmth/GamePush-Plugin?style=social)

</div>
