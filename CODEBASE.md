# QQ 宠物桌面端 — AI 快速索引

> **用途**：本文件专供 AI coding agent 首次接入时快速了解项目结构。
> **使用方式**：接到任务后先读此文件，定位相关模块再深入具体文件，无需全量遍历。

---

## 一、项目概览

| 项 | 值 |
|---|---|
| 技术栈 | Electron（主进程）+ 原生 renderer（无框架）+ Ruffle（SWF 播放） |
| 入口 | `electron/main.js` |
| 渲染入口 | `renderer/index.html` |
| 包管理 | 根目录 `package.json` |
| 构建命令 | `cd bundle/pc-pet-demo && npm run build`（注意：不在根目录） |

### 架构角色分工

```
electron/main.js          → Electron 主进程（IPC、窗口管理、托 tray、自动更新、Gateway 连接）
electron/backend/         → 后端引擎层（Agent RPC、状态持久化、自我进化文件读写）
renderer/                 → 前端渲染层（宠物 UI、动画、交互面板）
renderer/js/              → 所有前端业务逻辑（每个 .js 大致一个功能模块）
social-service/           → 社交独立服务进程（好友同步、房间、拜访信令）
installer/                → 首次安装向导（网关检测、端口扫描、AI 配置）
agents/                   → Agent 人设与提示词配置
scripts/                  → 构建/发布/开发辅助脚本
docs/                     → 设计文档（含动画参考文档 animation-reference.md）
resources/ / dist/       → 构建产物 / 依赖（AI 任务通常不需要关注）
```

---

## 二、功能模块 → 文件速查表

### 🔴 宠物本体（动画 / 外观 / 行为）

| 要做什么 | 找哪个文件 | 说明 |
|---|---|---|
| 动画播放 / SWF 加载 | `renderer/js/sprite.js` | 核心：Ruffle 实例管理、SWF manifest 按 GG/MM 性别加载 |
| SWF 动画清单 | `renderer/sprites/qc/swf-manifest.json` (GG) | 424 个动画名列表 |
|  | `renderer/sprites/qc/mm-swf-manifest.json` (MM) | 422 个动画名列表 |
| 动画参考文档 | `docs/animation-reference.md` | 5 类心情映射、路由规则、interact 编码 |
| 空闲行为调度 | `renderer/js/behavior.js` | Speak(30%) + play(70%) 概率、定时器 |
| 心情 / 状态机 | `renderer/js/state.js` | happy/sad/peaceful/upset/prostrate 状态转换 |
| 启动入场动画 | `renderer/js/app.js` → `Enter1`/`Enter3` | 窗口创建后的首次播放 |
| 特效引擎 | `renderer/js/effects-engine.js` | 气泡飘出、粒子效果等视觉反馈 |

### 🟢 交互操作

| 要做什么 | 找哪个文件 | 说明 |
|---|---|---|
| 鼠标拖拽宠物 | `renderer/js/drag.js` | 含多显示器边界、锚点规则 |
| 边缘吸附 | `renderer/js/edge-snap.js` | 顶部/右侧贴边，与 drag 共用锚点 |
| 点击穿透 | `renderer/js/click-through.js` | 透明区域事件透传 |
| 抚摸 / 拍一拍 | `renderer/js/app.js` | 1 秒连续滑动触发 peaceful interact |
| 文件拖入处理 | `renderer/js/file-drop.js` | 拖文件到宠物的响应 |

### 🤖 AI 与对话

| 要做什么 | 找哪个文件 | 说明 |
|---|---|---|
| AI 对话主逻辑 | `renderer/js/ai-brain.js` | 优先走 Gateway RPC，失败回退旧路径 |
| 气泡对话框 | `renderer/js/bubble.js` | 文字气泡展示、工具执行进度 |
| 聊天输入 UI | `renderer/js/chat.js` | 聊天面板交互 |
| 主动碎碎念 | `renderer/js/proactive-chat.js` | 定时触发 AI 闲聊 |
| 人格 / 性格 | `renderer/js/personality.js` | 宠物性格参数 |
| 记忆系统 | `renderer/js/memory.js` | 对话记忆持久化 |
| 语音模式 | `renderer/js/voice-mode.js` | 语音交互 |
| Agent 提示词 / SOUL | `agents/` 目录 + `~/.openclaw/agents/qq-pet/SOUL.md` | 人设配置 |

### 🪟 窗口与 UI

| 要做什么 | 找哪个文件 | 说明 |
|---|---|---|
| 主窗口初始化 | `electron/main.js` → `launchPetApp()` | 窗口、托 tray、快捷键、更新 |
| 设置面板 | `renderer/js/system-settings.js` | 设置页 UI 逻辑 |
| 面板管理 | `renderer/js/panels.js` | 各嵌入式面板的开关 |
| 任务栏 UI | `renderer/js/taskbar-ui.js` | 桌面任务栏集成 |
| 新手引导 | `renderer/js/new-user-guide.js` | 首次使用引导流程 |
| 日记本 | `renderer/js/diary.js` | 宠物日记 |
| 剪贴板背包 | `renderer/js/clipboard-bag.js` | 剪贴板历史 |
| 桌面牧羊犬 | `renderer/js/desktop-shepherd.js` | 桌面图标感知 |

### 🔌 后端 / 主进程

| 要做什么 | 找哪个文件 | 说明 |
|---|---|---|
| IPC 通道定义 | `electron/main.js` | ipcMain/ipcRenderer 全部注册 |
| Gateway RPC | `electron/backend/` 目录 | WebSocket 长连接到 19790 端口 |
| Agent 自我进化 | `electron/backend/` 中文件读写 IPC | 仅限 `~/.qq-pet/` 和 agents 目录 |
| 安装向导 | `electron/setup-wizard.html` + `installer/` | 首次启动检测流程 |
| Preload 脚本 | `electron/preload.js`, `electron/preload-setup.js` 等 | contextBridge 暴露 API |

### 👥 社交与拜访

| 要做什么 | 找哪个文件 | 说明 |
|---|---|---|
| 嵌入式社交面板 | `renderer/js/social/` 目录（13 个文件） | 好友列表、状态、编辑资料 |
| 拜访场景 HUD | `renderer/js/visit/visit-scene.js` | 来访宠物容器、右键菜单、邀请卡 |
| 社交服务进程 | `social-service/` 目录（10 文件） | 独立进程，好友同步/房间/信令 |
| 独立社交窗口（250×750） | `renderer/social.html` + `js/social/social-window-app.js` | 好友列表大窗口，btn-social 点击打开 |
| 五子棋窗口 | `renderer/gomoku.html` + `js/visit/gomoku-engine.js` + `gomoku-window-app.js` | 拜访模式五子棋，独立窗口 |

### 🔊 音效与其他

| 要做什么 | 找哪个文件 | 说明 |
|---|---|---|
| 音效管理 | `renderer/js/sound.js` | 音效加载与播放 |
| 系统监控 | `renderer/js/system-monitor.js` | CPU/内存等 |
| 进程管理 | `renderer/js/process-manager.js` | 子进程管理 |
| 专注模式 | `renderer/js/focus-mode.js` | 专注状态 |
| Claw Bridge | `renderer/js/claw-bridge.js` | QQClaw 通信桥接 |
| 快捷聊天 | `renderer/quick-chat.html` | 快聊窗口 |
| 会议笔记 | `renderer/meeting-notes-window.html` + `renderer/js/meeting-notes.js` | 会议记录 |
| 技能页面 | `renderer/skills.html` | 技能菜单 |

---

## 三、关键约定与陷阱 ⚠️

1. **性别素材分离**：GG 在 `sprites/qc/swf/`，MM 在 `sprites/qc/swf-mm/`，sprite.js 按性别选 manifest
2. **Ruffle panic 兜底**：部分 interact SWF 会 panic，自动回退 Stand 并标记不可用
3. **吸附锚点**：顶部贴边按企鹅头顶算，不是窗口顶边；`drag.js` 和 `edge-snap.js` 必须共用规则
4. **Gateway 双端口**：19790 = OpenClaw Gateway，19789 = QQClaw
5. **状态目录**：所有运行时状态在 `~/.qq-pet/`，配置在 `~/.qq-pet/openclaw.json`
6. **架构原则**：plug-in no rewrite——模块独立，改一个不影响另一个
7. **Git 规范**：改前先 pull，commit 前再 pull，构建 release 必须基于最新代码

---

## 四、常见任务 → 推荐搜索路径

| 任务类型 | 先看这些 | 别浪费时间搜 |
|---|---|---|
| 改动画/加动画 | `sprite.js` + `behavior.js` + `swf-manifest.json` | 不需要碰 electron/ |
| 改对话/AI 人格 | `ai-brain.js` + `bubble.js` + `agents/` | 不需要碰 sprite/ |
| 改拖拽/吸附 | `drag.js` + `edge-snap.js` | 两个文件搞定 |
| 改社交功能 | `renderer/js/social/` + `social-service/` | 不需要碰 behavior/ |
| 改安装/首次体验 | `installer/` + `setup-wizard.html` + `preload-setup.js` | |
| 改窗口/托盘/更新 | `electron/main.js` | 主进程的事 |
| 加新面板/UI | `panels.js` + `system-settings.js` + `renderer/css/` | |

---

*最后更新：2026-04-08 by 阿爪*
