# 🎮 GamePush Plugin

<div align="center">

![GamePush](https://img.shields.io/badge/GamePush-Plugin-blue?style=for-the-badge&logo=gamepad)
![Karin](https://img.shields.io/badge/Karin-Bot-green?style=for-the-badge&logo=robot)
![Miao-Yunzai](https://img.shields.io/badge/Miao-Yunzai-green?style=for-the-badge&logo=robot)
![TRSS-Yunzai](https://img.shields.io/badge/TRSS-Yunzai-green?style=for-the-badge&logo=robot)
<<<<<<< HEAD
![Yunzai-NG](https://img.shields.io/badge/Yunzai-NG-green?style=for-the-badge&logo=robot)
=======
![Yunzai-NG](https://img.shields.io/badge/Yunzai--NG-green?style=for-the-badge&logo=robot)
>>>>>>> 85070d6 (feat: 添加按钮，sqlite更换为node:sqlite)
![License](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)
![Node.js](https://img.shields.io/badge/Node.js-22.13+-brightgreen?style=for-the-badge&logo=node.js)

**🚀 游戏版本监控推送插件**

_实时监控游戏版本更新 | 自动推送预下载通知 | 支持多游戏平台_

</div>

---

## ✨ 功能特色

### 🎯 支持游戏

- 🌟 **原神** (Genshin Impact)
- ⭐ **崩坏：星穹铁道** (Honkai: Star Rail)
- 🔥 **绝区零** (Zenless Zone Zero)
- ⚡ **崩坏 3** (Honkai Impact 3rd)
- 🌊 **鸣潮** (Wuthering Waves)
<<<<<<< HEAD
- 🧪 **明日方舟：终末地** (Arknights: Endfield) —— 实验性支持
=======
- 🏜️ **明日方舟：终末地** (Arknights: Endfield) —— 实验性支持
>>>>>>> 85070d6 (feat: 添加按钮，sqlite更换为node:sqlite)

### 🛠️ 核心功能

- 📱 **版本监控** - 实时检测游戏版本更新
- 🔔 **自动推送** - 版本更新及预下载通知
- 🖼️ **图文推送** - 支持图片（可选模板）与纯文字两种推送形式
- 📥 **下载链接** - 获取正式版 / 预下载的客户端、资源包直链
- 📊 **历史数据** - 记录各版本包体与更新包大小，可随时查询
- ⚙️ **灵活配置** - 每个游戏独立配置推送开关、频率与推送群
- 🕐 **定时任务** - 自动定时检查更新
<<<<<<< HEAD
- 🧩 **多框架适配** - 运行时抽象层统一 Yunzai / Karin / Yunzai-NG 差异
- 🎛️ **Guoba、Karin-Web、Yunzai-NG 面板支持** - 可视化配置界面
=======
- 💾 **混合存储** - Redis 保存当前版本状态，内置 SQLite 保存历史版本数据
- 🎛️ **多端可视化配置** - Guoba、Karin-Web、Yunzai-NG 配置界面
- 🔘 **快捷按钮** - `当前版本` 回复自动附带命令按钮
>>>>>>> 85070d6 (feat: 添加按钮，sqlite更换为node:sqlite)

---

## 📦 安装指南

### 前置要求

<<<<<<< HEAD
- ✅ [Miao-Yunzai](https://github.com/yoimiya-kokomi/Miao-Yunzai) , [TRSS-Yunzai](https://gitee.com/TimeRainStarSky/Yunzai), [Karin](https://github.com/KarinJS/Karin), [Yunzai-NG](https://github.com/Yunzai-NG/yunzai-ng)
- ✅ [nodejs 22+](https://nodejs.org/zh-cn/download)
- ✅ [Redis 数据库](https://redis.io/)（Miao-Yunzai / TRSS-Yunzai / Karin 需要；Yunzai-NG 使用框架内置 KV，无需额外部署）
=======
- ✅ 任选其一：[Miao-Yunzai](https://github.com/yoimiya-kokomi/Miao-Yunzai)、[TRSS-Yunzai](https://gitee.com/TimeRainStarSky/Yunzai)、[Karin](https://github.com/KarinJS/Karin)、[Yunzai-NG](https://github.com/Yunzai-NG/yunzai-ng)
- ✅ [nodejs 22.13+](https://nodejs.org/zh-cn/download)（依赖内置 `node:sqlite`）
- ✅ [Redis 数据库](https://redis.io/)（Yunzai-NG 下由内核提供 KV，无需单独部署）
>>>>>>> 85070d6 (feat: 添加按钮，sqlite更换为node:sqlite)

### 安装步骤

1. **克隆插件**

```bash
# 使用 Miao-Yunzai、TRSS-Yunzai 和 Yunzai-NG
## 使用GitCode
git clone https://gitcode.com/rainbowwarmth/GamePush-Plugin.git ./plugins/GamePush-Plugin
## 使用Gitee
git clone https://gitee.com/rainbowwarmth/GamePush-Plugin.git ./plugins/GamePush-Plugin
## 使用CNB
git clone https://cnb.cool/rainbowwarmth/GamePush-Plugin.git ./plugins/GamePush-Plugin
## 使用GitHub
git clone https://github.com/rainbowwarmth/GamePush-Plugin.git ./plugins/GamePush-Plugin

# 使用 Karin
## 使用GitCode
git clone https://gitcode.com/rainbowwarmth/GamePush-Plugin.git ./plugins/karin-plugin-gamepush
## 使用Gitee
git clone https://gitee.com/rainbowwarmth/GamePush-Plugin.git ./plugins/karin-plugin-gamepush
## 使用CNB
git clone https://cnb.cool/rainbowwarmth/GamePush-Plugin.git ./plugins/karin-plugin-gamepush
## 使用GitHub
git clone https://github.com/rainbowwarmth/GamePush-Plugin.git ./plugins/karin-plugin-gamepush

```

<<<<<<< HEAD
> ⚠️ 插件通过目录名判断运行环境：Karin 必须使用 `karin-plugin-gamepush` 目录名，其余框架请保持 `GamePush-Plugin`。
=======
> ⚠️ 插件依靠**目录名**识别 Karin：目录名包含 `karin` 时按 Karin 加载，否则按宿主 `package.json` 的 `name` 区分 Miao-Yunzai / TRSS-Yunzai / Yunzai-NG。请勿随意改名。
>>>>>>> 85070d6 (feat: 添加按钮，sqlite更换为node:sqlite)

2. **安装依赖**

```bash
pnpm install -P
```

> 💡 Yunzai-NG 依赖 `@yunzai-ng/core`（已声明为 optionalDependencies，正常安装即会引入）。

3. **启动机器人**

```bash
<<<<<<< HEAD
# 重启 Miao-Yunzai 或 TRSS-Yunzai 或 Karin 或 Yunzai-NG 即可自动加载插件
=======
# 重启 Miao-Yunzai / TRSS-Yunzai / Karin / Yunzai-NG 即可自动加载插件
>>>>>>> 85070d6 (feat: 添加按钮，sqlite更换为node:sqlite)
```

首次加载时插件会自动从远端拉取游戏版本数据库（`GamePush-Plugin.db`），并在后续启动时按版本号增量更新。

---

## 🎮 使用指南

### 基础命令

<<<<<<< HEAD
以原神为例（其他游戏替换对应前缀即可）：

| 命令                  | 功能                       | 权限     | 特别说明                        |
| --------------------- | -------------------------- | -------- | ------------------------------- |
| `#原神版本监控`       | 立即执行一次版本检查       | Master   |                                 |
| `#原神开启版本推送`   | 在当前群开启版本推送       | Master   | 仅限群聊                        |
| `#原神关闭版本推送`   | 在当前群关闭版本推送       | Master   | 仅限群聊                        |
| `#原神当前版本`       | 查看正式版与预下载版本号   | 所有用户 |                                 |
| `#原神版本数据`       | 查看历史版本大小列表       | 所有用户 | 以合并转发发送                  |
| `#原神版本数据 5.0`   | 查看指定版本的详细数据     | 所有用户 |                                 |
| `#星铁获取下载链接`   | 获取当前正式版本下载链接   | 所有用户 | 仅星铁、绝区零、鸣潮、终末地    |
| `#星铁获取预下载链接` | 获取当前预下载版本下载链接 | 所有用户 | 仅星铁、绝区零、鸣潮、终末地    |

> 📝 原神的游戏前缀可省略，即 `#版本监控`、`#当前版本` 等命令默认作用于原神。

### 支持的游戏命令前缀

- 🌟 原神: `#原神` / `#ys` / `#YS`（可省略）
- ⭐ 星铁: `*` / `#星铁` / `#崩铁` / `#星穹` / `#星轨` / `#穹轨` / `#铁道` / `#星穹铁道` / `#崩坏星穹铁道`
- 🔥 绝区零: `%` / `％` / `#绝区零` / `#绝区` / `#zzz` / `#ZZZ`
- ⚡ 崩坏 3: `!` / `！` / `#崩三` / `#崩3` / `#崩坏3` / `#崩坏三` / `#三崩子` / `#bbb`
- 🌊 鸣潮: `~` / `～` / `#鸣潮` / `#ww` / `#WW` / `#mc`
- 🧪 终末地: `:` / `：` / `#终末地` / `#zmd`

### 管理命令

| 命令                        | 功能                       | 权限   |
| --------------------------- | -------------------------- | ------ |
| `#[游戏]删除rediskey`       | 删除游戏版本键值           | Master |
| `#[游戏]删除预下载rediskey` | 删除预下载版本键值         | Master |
| `#[游戏]设置rediskey 5.0`   | 设置游戏版本键值           | Master |
| `#[游戏]设置预下载rediskey 5.1` | 设置游戏预下载版本键值 | Master |
| `#更新游戏版本数据`         | 强制拉取并合并远端版本数据 | Master |

> 🔧 版本键值用于对比新旧版本，删除后下次检查会重新推送；省略游戏前缀时默认作用于原神。
=======
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

数据库文件名固定为 `GamePush-Plugin.db`，存放目录随框架而变：

| 框架                     | 数据库路径                                            |
| ------------------------ | ----------------------------------------------------- |
| Miao-Yunzai / TRSS-Yunzai | `data/GamePush-Plugin.db`                             |
| Karin                    | `@karinjs/karin-plugin-gamepush/data/GamePush-Plugin.db` |
| Yunzai-NG                | `data/plugin/GamePush-Plugin/sql/GamePush-Plugin.db`  |

- 首次启动时会从远程拉取版本历史数据作为初始数据，失败仅告警并回退到本地库。
- `#更新游戏版本数据` 采用 **`INSERT OR IGNORE` 合并**而非覆盖，本地记录不会丢失。
- 使用 Yunzai-NG 时，插件在自己的 `data/plugin/GamePush-Plugin/sql/` 下维护数据库，并在首次启动时**只读导入**原内核目录 `data/sql/GamePush-Plugin/` 中的历史数据；原数据库不会被删除或修改。
>>>>>>> 85070d6 (feat: 添加按钮，sqlite更换为node:sqlite)

---

## ⚙️ 配置说明

### 配置文件位置

| 框架                        | 配置文件                                                    |
| --------------------------- | ----------------------------------------------------------- |
| Miao-Yunzai / TRSS-Yunzai   | `data/GamePush-Plugin.yaml`                                 |
| Karin                       | `@karinjs/karin-plugin-gamepush/config/GamePush-Plugin.yaml` |
| Yunzai-NG                   | `config/GamePush-Plugin.yaml`（由内核托管，面板可视化编辑） |

### 配置项

<<<<<<< HEAD
每个游戏（`ys` / `sr` / `zzz` / `bh3` / `ww` / `zmd`）都有一份独立配置：

| 配置项           | 说明                                        | 默认值            |
| ---------------- | ------------------------------------------- | ----------------- |
| `enable`         | 是否监控该游戏版本更新                      | `true`            |
| `log`            | 是否输出定时任务详细日志                    | `false`           |
| `cron`           | 版本检查的 cron 表达式                      | `0 0/5 * * * *`   |
| `pushGroups`     | 推送列表，元素为 `{ botId, groupId }`       | `[]`              |
| `pushChangeType` | 推送形式：`1` 图片消息 / `2` 文字消息       | `1`               |
| `html`           | 图片模板：`default` 默认 / `Simple` 简约    | `default`         |

配置文件支持热更新，保存后自动重新加载，无需重启。

### 可视化配置

插件同时支持三套可视化配置界面，可修改推送开关、检查频率、推送群、消息类型与模板：

- 🎛️ [Guoba-Plugin](https://github.com/guoba-yunzai/guoba-plugin)（Miao-Yunzai / TRSS-Yunzai）
- 🎛️ Karin-Web（Karin）
- 🎛️ Yunzai-NG WebUI 面板（Yunzai-NG）

---

## 💾 数据存储

- **版本键值**（KV）：Yunzai / Karin 使用 Redis，Yunzai-NG 使用框架内置 KV
- **历史版本数据**（SQLite）：`main` 表记录正式版本包体大小，`pre` 表记录预下载版本更新大小
  - Miao-Yunzai / TRSS-Yunzai：`data/GamePush-Plugin.db`
  - Karin：`@karinjs/karin-plugin-gamepush/data/GamePush-Plugin.db`
  - Yunzai-NG：`data/sql/GamePush-Plugin/GamePush-Plugin.db`
=======
### 可视化配置

插件支持三套可视化配置界面，可按框架选用：

| 框架                      | 配置方式                        |
| ------------------------- | ------------------------------- |
| Miao-Yunzai / TRSS-Yunzai | [Guoba-Plugin](https://github.com/guoba-yunzai/guoba-plugin) |
| Karin                     | Karin-Web（`web.config.js`）    |
| Yunzai-NG                 | 内核配置界面（`model/plugin.js` 中的 schema） |

可配置项：

- 🎛️ 推送开关 / 日志开关
- ⏰ 定时任务 cron 表达式
- 👥 推送的「机器人 + 群」列表
- 🖼️ 消息类型（图片 / 文字）与 html 模板（默认 / 简约）
>>>>>>> 85070d6 (feat: 添加按钮，sqlite更换为node:sqlite)

---

## 🏗️ 项目结构

```
GamePush-Plugin/
<<<<<<< HEAD
├── 📁 apps/              # 功能模块（Yunzai / Karin 加载）
│   ├── 🧩 base.js        # 游戏功能基类
│   ├── 🎮 ys.js          # 原神功能
│   ├── ⭐ sr.js          # 星铁功能
│   ├── 🔥 zzz.js         # 绝区零功能
│   ├── ⚡ bh3.js         # 崩坏3功能
│   ├── 🌊 ww.js          # 鸣潮功能
│   ├── 🧪 zmd.js         # 终末地功能
│   ├── ⚙️ set.js         # 主人功能
│   └── 📋 task.js        # 定时任务
├── 📁 components/        # 基础组件（路径、配置、请求）
├── 📁 lib/               # 工具库
│   └── 📁 runtime/       # 运行时抽象层（Yunzai / Karin / Yunzai-NG 适配器）
├── 📁 model/             # 业务模型
│   ├── 🧭 commands.js    # 命令描述符（跨框架共用）
│   ├── 🔍 api.js         # 版本检查
│   ├── 🔔 notice.js      # 推送通知
│   ├── 📥 download.js    # 下载链接
│   ├── 💾 db.js          # SQLite 版本数据
│   ├── 🎛️ guoba.js       # Guoba 配置面板
│   ├── 🎛️ webconfig.js   # Karin-Web 配置面板
│   └── 🧱 plugin.js      # Yunzai-NG 插件定义
├── 📁 resources/         # 资源文件（HTML 模板、字体）
├── 🔧 index.js           # 入口文件
├── 🎛️ guoba.support.js   # Guoba 支持
├── 🎛️ web.config.js      # Karin-Web 支持
└── 📦 package.json       # 项目配置
=======
├── 📁 apps/               # 功能模块（Yunzai / Karin）
│   ├── 🎮 ys.js           # 原神功能
│   ├── ⭐ sr.js           # 星铁功能
│   ├── 🔥 zzz.js          # 绝区零功能
│   ├── ⚡ bh3.js          # 崩坏3功能
│   ├── 🌊 ww.js           # 鸣潮功能
│   ├── 🏜️ zmd.js          # 终末地功能
│   ├── ⚙️ set.js          # 设置管理
│   └── 📋 task.js         # 定时任务
├── 📁 components/         # 组件模块（路径、配置、请求）
├── 📁 lib/                # 工具库
│   └── 📁 runtime/        # 框架兼容层
│       ├── index.js       # 运行时选择与统一接口
│       ├── yunzai.js      # Miao/TRSS-Yunzai 适配
│       ├── karin.js       # Karin 适配
│       ├── yunzai-ng.js   # Yunzai-NG 适配
│       ├── sqlite-db.js   # node:sqlite 历史数据存储
│       ├── buttons.js     # 命令按钮构建
│       └── compat.js      # 旧版导入兼容垫片
├── 📁 model/              # 数据模型与命令实现
│   ├── commands.js        # 命令定义
│   └── plugin.js          # Yunzai-NG 插件定义
├── 📁 resources/          # 资源文件
├── 🔧 index.js            # 入口文件
├── 🎛️ guoba.support.js    # Guoba支持
├── 🎛️ web.config.js       # Karin-Web 支持
└── 📦 package.json        # 项目配置
>>>>>>> 85070d6 (feat: 添加按钮，sqlite更换为node:sqlite)
```

---

## 🔧 开发说明

### 技术栈

- **框架**: [Miao-Yunzai](https://github.com/yoimiya-kokomi/Miao-Yunzai) 、 [TRSS-Yunzai](https://gitee.com/TimeRainStarSky/Yunzai) 、[Karin](https://github.com/KarinJS/Karin) 、[Yunzai-NG](https://github.com/Yunzai-NG/yunzai-ng)
- **语言**: JavaScript (ES6+)
<<<<<<< HEAD
- **存储**: [Redis](https://redis.io/) / 框架内置 KV + SQLite（[Sequelize](https://sequelize.org/)）
- **任务调度**: Cron
- **配置管理**: Guoba 、Karin-Web 、Yunzai-NG 面板
=======
- **数据库**: [Redis](https://redis.io/)（版本状态）+ Node 内置 `node:sqlite`（版本历史，无需安装 `better-sqlite3`）
- **任务调度**: Cron
- **配置管理**: Guoba 、Karin-Web 、Yunzai-NG schema

### 兼容层设计

所有框架差异收敛在 `lib/runtime/`，业务代码只依赖统一的 `rt` 对象：

- 通过插件目录名与宿主 `package.json` 的 `name` 识别框架，加载对应适配器
- 适配器统一提供 `logger`、`kv`、`db`、`http`、`config`、`render`、`sendGroupMsg`、`makeForward`、`normalizeEvent`、`segment`、`commandButtons` 等接口
- 新增框架只需补一个适配器文件，无需改动 `apps/` 与 `model/` 业务逻辑
>>>>>>> 85070d6 (feat: 添加按钮，sqlite更换为node:sqlite)

### 核心特性

- 🧩 **运行时抽象层** - 业务代码只依赖 `rt` 接口，框架差异由适配器消化
- 🧭 **命令描述符** - 命令逻辑写成纯函数，各框架按自己的方式注册
- 🔄 **模块化设计** - 每个游戏独立模块
- 📡 **API 监控** - 实时获取官方版本信息
<<<<<<< HEAD
- 💾 **数据持久化** - KV 存版本、SQLite 存历史数据
=======
- 💾 **数据持久化** - Redis 保存当前版本状态，Node 内置 SQLite 保存历史版本数据
>>>>>>> 85070d6 (feat: 添加按钮，sqlite更换为node:sqlite)
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
- [Karin](https://github.com/KarinJS/Karin) - 强大的机器人框架
<<<<<<< HEAD
- [Yunzai-NG](https://github.com/Yunzai-NG/yunzai-ng) - 强大的机器人框架
=======
- [Yunzai-NG](https://github.com/Yunzai-NG/yunzai-ng) - 可插拔运行时内核
>>>>>>> 85070d6 (feat: 添加按钮，sqlite更换为node:sqlite)
- [Guoba-Plugin](https://github.com/guoba-yunzai/guoba-plugin) - 可视化配置支持

---

<div align="center">

**⭐ 如果这个项目对你有帮助，请给个 Star 支持一下！**

![Star History](https://img.shields.io/github/stars/rainbowwarmth/GamePush-Plugin?style=social)

</div>
