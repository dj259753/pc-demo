# 🐧 QQ宠物 Skills 版

> 一只住在你桌面上的像素企鹅，有自己的性格、记忆和情绪。
> 基于 [OpenClaw](https://github.com/openclaw/openclaw) 多 Agent 架构的桌面宠物应用。

![Electron](https://img.shields.io/badge/Electron-41-47848F?logo=electron)
![OpenClaw](https://img.shields.io/badge/OpenClaw-2026.4.5-FF6B35)
![Platform](https://img.shields.io/badge/Platform-macOS-lightgrey?logo=apple)
![License](https://img.shields.io/badge/License-MIT-green)

---

## 目录

- [功能特色](#功能特色)
- [系统要求](#系统要求)
- [快速开始](#快速开始)
- [项目结构](#项目结构)
- [架构说明](#架构说明)
- [开发调试](#开发调试)
- [构建发布](#构建发布)
- [配置说明](#配置说明)
- [常见问题](#常见问题)

---

## 功能特色

- 🎭 **16 种性格**：基于 MBTI 的性格系统，每只企鹅都不一样
- 🧠 **独立记忆**：记住你的习惯、偏好，每天都在了解你
- 📊 **数值系统**：饥饿、清洁、精力三大数值，需要你照料
- 💬 **AI 对话**：通过 OpenClaw Gateway 进行自然语言聊天
- 🎮 **丰富互动**：喂食、洗澡、玩耍、番茄钟等
- 🔄 **降级策略**：Gateway 离线时自动切换到本地规则引擎 + 预设台词

---

## 系统要求

| 依赖 | 最低版本 | 说明 |
|------|---------|------|
| **Node.js** | v22.16+ | 推荐 v22.x LTS 或 v24+（项目内嵌有 arm64 版本） |
| **npm** | v9+ | 随 Node.js 一起安装 |
| **macOS** | 12+ | 当前仅提供 macOS（arm64 / x64）支持 |
| **Git LFS** | 最新 | 用于拉取内嵌的 `runtime/node` 二进制（可选，见下方说明） |

---

## 快速开始

### 1. 克隆仓库

```bash
git clone https://github.com/your-org/pet-pc-demo.git
cd pet-pc-demo
```

如果仓库使用了 Git LFS 管理 `runtime/node`，需要拉取大文件：

```bash
git lfs install
git lfs pull
```

### 2. 安装项目依赖

```bash
npm install
```

### 3. 安装 Gateway 依赖（关键步骤）

Gateway 是 AI 对话的核心引擎，需要单独安装 [OpenClaw](https://github.com/openclaw/openclaw) 包：

```bash
cd resources/targets/darwin-arm64/gateway
npm install
cd ../../../..
```

> 💡 此步骤会从 npm 安装 `openclaw@latest` 及其约 480+ 依赖包，首次安装约需 1-2 分钟。

### 4. 确认内嵌 Node.js 运行时

Gateway 使用项目内嵌的 Node.js 来运行。检查运行时是否存在：

```bash
./resources/targets/darwin-arm64/runtime/node --version
# 应输出 v22.x 或更高
```

如果文件不存在或大小不正确（< 35MB），可通过以下方式获取：

- **方式一**：Git LFS 拉取（`git lfs pull`）
- **方式二**：运行下载脚本：`node scripts/ensure-runtime-node.js`
- **方式三**：应用启动时会自动从 CDN 下载

### 5. 启动应用

```bash
# 普通启动
npm start

# 开发模式（自动打开 DevTools）
npx electron . --dev
```

### 6. 首次配置

首次启动时会进入 **Setup Wizard**（设置向导），引导你配置 AI 模型提供商：

- 可选择 OpenAI、Anthropic 或其他 OpenAI 兼容接口
- 配置完成后自动保存到 `~/.qq-pet/openclaw.json`
- Gateway 将自动启动并进入 `running` 状态

配置完成后，企鹅会出现在你的桌面上 🐧

---

## 项目结构

```
pet-pc-demo/
├── electron/                      # Electron 主进程
│   ├── main.js                    # 主进程入口（窗口管理、IPC、菜单等）
│   ├── preload.js                 # 主窗口 preload
│   ├── preload-quickchat.js       # 快捷对话窗口 preload
│   ├── preload-setup.js           # 设置向导 preload
│   ├── preload-skills.js          # 技能管理 preload
│   ├── setup-wizard.html          # 设置向导页面
│   └── backend/                   # 后端模块
│       ├── index.js               # 后端统一入口（初始化 + IPC 注册）
│       ├── constants.js           # 路径常量与解析函数
│       ├── gateway-process.js     # Gateway 子进程管理（启停/健康检查/崩溃恢复）
│       ├── gateway-rpc.js         # WebSocket RPC 客户端
│       ├── gateway-auth.js        # Gateway 鉴权 token 管理
│       ├── provider-config.js     # AI 模型配置读写
│       ├── config-backup.js       # 配置自动备份
│       ├── workspace-init.js      # 用户 workspace 初始化
│       ├── agent-profile.js       # Agent 人设解析
│       ├── runtime-node-download.js  # Node.js 运行时 CDN 下载
│       └── macos-gateway-native.js   # macOS 签名/xattr 处理
├── renderer/                      # 渲染进程（前端 UI）
│   ├── js/                        # JavaScript 逻辑
│   │   └── ai-brain.js            # AI 对话核心（RPC / HTTP 双通道）
│   ├── css/                       # 样式文件
│   ├── swf/                       # Flash 宠物动画资源
│   └── images/                    # 图片资源
├── resources/                     # 运行时资源
│   └── targets/
│       └── darwin-arm64/          # macOS ARM64 平台资源
│           ├── gateway/           # OpenClaw Gateway
│           │   ├── package.json   # Gateway 依赖声明
│           │   ├── gateway-entry.mjs  # Gateway 入口（回退）
│           │   └── node_modules/  # Gateway 依赖（需 npm install）
│           ├── runtime/           # 内嵌 Node.js 运行时
│           │   └── node           # Node.js 二进制（Git LFS）
│           ├── workspace-defaults/  # 默认 workspace 模板
│           └── skillhub-cli/      # SkillHub CLI
├── agents/                        # Agent 人设配置
│   └── qq-pet/
│       ├── AGENTS.yml             # Agent 声明
│       ├── SOUL.md                # 灵魂人设
│       └── IDENTITY.md            # 身份定义
├── openclaw-pet-skill/            # OpenClaw Skill 定义
│   ├── SKILL.md                   # Skill 元数据
│   ├── AGENTS.yml                 # Agent 配置
│   └── install.sh                 # Skill 安装脚本
├── installer/                     # 应用内安装器
├── assets/                        # 应用图标等资源
│   ├── icon.icns                  # macOS 应用图标
│   └── dmg-bg.png                 # DMG 安装器背景
├── scripts/                       # 构建与工具脚本
│   ├── ensure-runtime-node.js     # 确保 runtime/node 存在
│   ├── prepare-gateway-resources.js  # 从 QQClaw 同步资源（已弃用）
│   ├── build-and-sign.sh          # 构建 + 签名
│   ├── sign-and-notarize.sh       # 签名 + 公证
│   ├── full-package.sh            # 全平台打包
│   ├── upload-release.sh          # 上传发布
│   ├── release-note-helper.js     # 发布说明生成
│   └── download-model.js          # 模型下载
├── release/                       # 发布元数据
├── package.json                   # 项目配置
├── CHANGELOG.md                   # 更新日志
└── README.md                      # 本文件
```

---

## 架构说明

```
┌──────────────────────────────────────────────┐
│                  你的电脑桌面                    │
│                                               │
│  ┌────────────────┐   ┌────────────────┐      │
│  │  🐧 宠物窗口    │   │  💬 快捷对话    │      │
│  │  Flash 动画     │   │  AI 聊天面板    │      │
│  │  数值 / 互动    │   │  7层 prompt    │      │
│  └───────┬────────┘   └───────┬────────┘      │
│          │                    │               │
│  ┌───────┴────────────────────┴────────┐      │
│  │         Electron 主进程              │      │
│  │  main.js  |  backend/index.js       │      │
│  │  IPC 路由  |  状态管理  |  配置管理    │      │
│  └───────────────────┬─────────────────┘      │
│                      │                        │
│  ┌───────────────────┴─────────────────┐      │
│  │         OpenClaw Gateway            │      │
│  │  独立 Node.js 子进程 (port 19790)    │      │
│  │  WebSocket RPC + HTTP API           │      │
│  │  LLM 推理 | Agent 管理 | Skills     │      │
│  └─────────────────────────────────────┘      │
└───────────────────────────────────────────────┘
```

**核心流程**：

1. Electron 主进程启动 → 初始化后端 → 启动 Gateway 子进程
2. Gateway 加载 `openclaw.json` 配置 → 连接 LLM 提供商
3. 主进程通过 WebSocket RPC（端口 19790）与 Gateway 通信
4. 渲染进程通过 IPC → 主进程 → Gateway RPC 完成 AI 对话
5. Gateway 不可用时，降级为直接 HTTP 调用 OpenAI 兼容 API

---

## 开发调试

### 开发模式启动

```bash
npx electron . --dev
```

自动开启 DevTools，可直接在浏览器控制台调试渲染进程。

### 主进程调试

```bash
npx electron . --dev --inspect=5858
```

然后在 Chrome 打开 `chrome://inspect`，连接到 `localhost:5858` 即可断点调试主进程。

### 查看 Gateway 日志

```bash
# Gateway 诊断日志（启停、健康检查）
cat ~/.qq-pet/gateway.log

# OpenClaw 详细运行日志
cat /tmp/openclaw/openclaw-$(date +%Y-%m-%d).log
```

### 常用路径

| 路径 | 说明 |
|------|------|
| `~/.qq-pet/` | 用户状态目录 |
| `~/.qq-pet/openclaw.json` | AI 模型配置 |
| `~/.qq-pet/workspace/` | Agent workspace |
| `~/.qq-pet/gateway.log` | Gateway 诊断日志 |
| `~/.qq-pet/logs/` | 应用日志 |
| `~/.qq-pet/config-backups/` | 配置备份 |

---

## 构建发布

### 构建 DMG 安装包

```bash
# 构建 macOS DMG（arm64 + x64）
npm run build:dmg

# 构建 macOS ZIP
npm run build:zip

# 构建所有格式
npm run build
```

构建产物输出到 `dist/` 目录。

### 发布说明生成

```bash
npm run release:summary
```

---

## 配置说明

### AI 模型配置（`~/.qq-pet/openclaw.json`）

首次启动通过 Setup Wizard 配置，也可手动编辑：

```json
{
  "models": {
    "providers": {
      "custom": {
        "name": "my-provider",
        "baseURL": "https://api.openai.com/v1",
        "apiKey": "sk-xxx",
        "models": ["gpt-4o", "gpt-4o-mini"]
      }
    }
  }
}
```

支持任何 OpenAI 兼容的 API 接口（OpenAI、Anthropic、Gemini、本地 Ollama 等）。

### Gateway 端口

默认端口 **19790**（避开 OpenClaw/QQClaw 默认的 19789），可通过环境变量覆盖：

```bash
OPENCLAW_GATEWAY_PORT=19800 npx electron . --dev
```

---

## 常见问题

### Q: 启动后对话报错"网络不可用，我先睡着了"

**原因**：Gateway 未成功启动。常见原因：

1. **Gateway 依赖未安装**：执行 `cd resources/targets/darwin-arm64/gateway && npm install`
2. **内嵌 Node.js 不存在**：执行 `git lfs pull` 或 `node scripts/ensure-runtime-node.js`
3. **配置文件损坏**：删除 `~/.qq-pet/openclaw.json` 后重启，重新走 Setup Wizard

检查 Gateway 状态：

```bash
cat ~/.qq-pet/gateway.log | tail -20
```

### Q: 如何更新 OpenClaw 版本？

```bash
cd resources/targets/darwin-arm64/gateway
npm update openclaw
```

### Q: 支持 Windows / Linux 吗？

目前仅提供 macOS（arm64 / x64）的预构建资源。理论上 Electron 支持跨平台，但需要：
- 准备对应平台的 `resources/targets/<platform>-<arch>/` 资源
- 在对应平台下执行 Gateway 的 `npm install`
- 下载对应平台的 Node.js runtime

### Q: 可以不用 Gateway，直接调用 AI API 吗？

可以。如果 Gateway 不可用，应用会自动降级为直接 HTTP 调用模式，但会失去 Agent 多轮对话和 Skills 能力。

---

## License

MIT © Jerry
