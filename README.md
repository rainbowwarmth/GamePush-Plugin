# 🎮 GamePush Plugin

<div align="center">

![GamePush](https://img.shields.io/badge/GamePush-Plugin-blue?style=for-the-badge&logo=gamepad)
![Karin](https://img.shields.io/badge/Karin-Bot-green?style=for-the-badge&logo=robot)
![Miao-Yunzai](https://img.shields.io/badge/Miao-Yunzai-green?style=for-the-badge&logo=robot)
![TRSS-Yunzai](https://img.shields.io/badge/TRSS-Yunzai-green?style=for-the-badge&logo=robot)
![License](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)
![Node.js](https://img.shields.io/badge/Node.js-22+-brightgreen?style=for-the-badge&logo=node.js)

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

### 🛠️ 核心功能

- 📱 **版本监控** - 实时检测游戏版本更新
- 🔔 **自动推送** - 版本更新及预下载通知
- ⚙️ **灵活配置** - 支持开启/关闭推送功能
- 🕐 **定时任务** - 自动定时检查更新
- 💾 **Redis 存储** - 高效的数据管理
- 🎛️ **Guoba、Karin-Web 支持** - 可视化配置界面

---

## 📦 安装指南

### 前置要求

- ✅ [Miao-Yunzai](https://github.com/yoimiya-kokomi/Miao-Yunzai) , [TRSS-Yunzai](https://gitee.com/TimeRainStarSky/Yunzai), [Karin](https://github.com/KarinJS/Karin)
- ✅ [nodejs 22+](https://nodejs.org/zh-cn/download)
- ✅ [Redis 数据库](https://redis.io/)

### 安装步骤

1. **克隆插件**

```bash
# 使用 Miao-Yunzai 和 TRSS-Yunzai
## 使用GitCode
git clone https://gitcode.com/rainbowwarmth/GamePush-Plugin.git ./plugins/GamePush-Plugin
## 使用GitHub
git clone https://github.com/rainbowwarmth/GamePush-Plugin.git ./plugins/GamePush-Plugin

# 使用 Karin
## 使用GitCode
git clone https://gitcode.com/rainbowwarmth/GamePush-Plugin.git ./plugins/karin-plugin-gamepush
## 使用GitHub
git clone https://github.com/rainbowwarmth/GamePush-Plugin.git ./plugins/karin-plugin-gamepush

```

2. **安装依赖**

```bash
pnpm install -P
```

3. **启动机器人**

```bash
# 重启Miao-Yunzai 或 TRSS-Yunzai 或 Karin 即可自动加载插件
```

---

## 🎮 使用指南

### 基础命令

| 命令                | 功能             | 权限     |
| ------------------- | ---------------- | -------- |
| `#原神版本监控`     | 检查原神版本状态 | Master   |
| `#原神开启版本推送` | 开启原神版本推送 | Master   |
| `#原神关闭版本推送` | 关闭原神版本推送 | Master   |
| `#原神当前版本`     | 查看原神当前版本 | 所有用户 |

### 支持的游戏命令前缀

- 🌟 原神: `#原神` / `#ys` / `#YS`
- ⭐ 星铁: `#星铁` / `#sr` / `#SR`
- 🔥 绝区零: `#绝区零` / `#zzz` / `#ZZZ`
- ⚡ 崩坏 3: `#崩三` / `#bh3` / `#BH3`
- 🌊 鸣潮: `#鸣潮` / `#ww` / `#WW`

### 管理命令

| 命令                        | 功能                  | 权限   |
| --------------------------- | --------------------- | ------ |
| `#[游戏]删除rediskey`       | 删除游戏 Redis 键值   | Master |
| `#[游戏]删除预下载rediskey` | 删除预下载 Redis 键值 | Master |
| `#[游戏]设置rediskey`       | 设置游戏 Redis 键值   | Master |

---

## ⚙️ 配置说明

### 定时任务配置

插件支持自定义定时任务，默认每 5 分钟检查一次：

```javascript
// 默认配置
cron: "0 0/5 * * * *" // 每5分钟执行一次
```

### Guoba 、Karin-web 可视化配置

插件支持 Guoba 插件和 Karin-Web 的可视化配置界面，可以通过 Web 界面进行：

- 🎛️ 推送开关设置
- ⏰ 定时任务配置

---

## 🏗️ 项目结构

```
GamePush-Plugin/
├── 📁 apps/           # 功能模块
│   ├── 🎮 ys.js       # 原神功能
│   ├── ⭐ sr.js       # 星铁功能
│   ├── 🔥 zzz.js      # 绝区零功能
│   ├── ⚡ bh3.js      # 崩坏3功能
│   ├── 🌊 ww.js       # 鸣潮功能
│   ├── ⚙️ set.js      # 设置管理
│   └── 📋 task.js     # 定时任务
├── 📁 components/     # 组件模块
├── 📁 lib/           # 工具库
├── 📁 model/         # 数据模型
├── 📁 resources/     # 资源文件
├── 🔧 index.js       # 入口文件
├── 🎛️ guoba.support.js # Guoba支持
├── 🎛️ web.config.js # Karin-Web 支持
└── 📦 package.json   # 项目配置
```

---

## 🔧 开发说明

### 技术栈

- **框架**: [Miao-Yunzai](https://github.com/yoimiya-kokomi/Miao-Yunzai) 、 [TRSS-Yunzai](https://gitee.com/TimeRainStarSky/Yunzai) 、[Karin](https://github.com/KarinJS/Karin)
- **语言**: JavaScript (ES6+)
- **数据库**: [Redis](https://redis.io/)
- **任务调度**: Cron
- **配置管理**: Guoba 、Karin-Web

### 核心特性

- 🔄 **模块化设计** - 每个游戏独立模块
- 📡 **API 监控** - 实时获取官方版本信息
- 💾 **数据持久化** - Redis 存储历史版本数据
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
- [Guoba-Plugin](https://github.com/guoba-yunzai/guoba-plugin) - 可视化配置支持

---

<div align="center">

**⭐ 如果这个项目对你有帮助，请给个 Star 支持一下！**

![Star History](https://img.shields.io/github/stars/rainbowwarmth/GamePush-Plugin?style=social)

</div>
