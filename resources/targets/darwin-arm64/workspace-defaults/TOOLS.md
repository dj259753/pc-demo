# TOOLS.md - Local Notes

Skills define _how_ tools work. This file is for _your_ specifics — the stuff that's unique to your setup.

## What Goes Here

Things like:

- Camera names and locations
- SSH hosts and aliases
- Preferred voices for TTS
- Speaker/room names
- Device nicknames
- Anything environment-specific

## Examples

```markdown
### Cameras

- living-room → Main area, 180° wide angle
- front-door → Entrance, motion-triggered

### SSH

- home-server → 192.168.1.100, user: admin

### TTS

- Preferred voice: "Nova" (warm, slightly British)
- Default speaker: Kitchen HomePod
```

## Why Separate?

Skills are shared. Your setup is yours. Keeping them apart means you can update skills without losing your notes, and share skills without leaking your infrastructure.

---

## OpenClaw 内置工具（直接 Tool Call）

以下工具是 OpenClaw Gateway 的核心能力，已集成在你的工具箱中。**必须**通过 Tool Call 直接调用，**严禁**通过 Exec 执行命令行间接调用。

### 可用工具

**文件与编码**

| 工具 | 说明 |
|------|------|
| `read` | 读取文件内容（支持文本和图像） |
| `write` | 创建或覆盖文件 |
| `edit` | 精确编辑文件 |
| `apply_patch` | 应用多文件补丁 |
| `grep` | 按正则搜索文件内容 |
| `find` | 按 glob 模式查找文件 |
| `ls` | 列出目录内容 |

**系统与进程**

| 工具 | 说明 |
|------|------|
| `exec` | 运行 Shell 命令（支持 PTY） |
| `process` | 管理后台 exec 会话 |

**Gateway 核心功能**

| 工具 | 说明 |
|------|------|
| `cron` | 定时任务/提醒/闹钟（status/list/add/update/remove/run） |
| `message` | 消息发送与频道操作 |
| `canvas` | Canvas 画布 |
| `image` | 图片分析（使用配置的图片模型） |
| `pdf` | PDF 处理 |
| `gateway` | Gateway 管理（重启/配置/更新） |
| `nodes` | 节点/设备控制（列表/描述/通知/摄像头/截屏） |

**记忆**

| 工具 | 说明 |
|------|------|
| `memory_search` | 记忆语义搜索 |
| `memory_get` | 获取指定记忆行 |

**会话与 Agent 管理**

| 工具 | 说明 |
|------|------|
| `session_status` | 当前会话状态（用量/时间/模型信息） |
| `sessions_list` | 会话列表（支持过滤） |
| `sessions_history` | 获取会话消息历史 |
| `sessions_send` | 向指定会话发送消息 |
| `sessions_spawn` | 创建新的隔离子 Agent 会话 |
| `sessions_yield` | 会话让出/转交 |
| `agents_list` | Agent 列表 |
| `subagents` | 列出/管理/终止子 Agent 运行 |

### 已禁用工具（存在但禁止使用）

| 工具 | 说明 | 禁用原因 / 替代方案 |
|------|------|----------------------|
| `tts` | 内置文本转语音 | ❌ 禁用，**必须**改用 MCP 服务的 `text_to_speech` |
| `web_search` | 内置网页搜索 | ❌ 禁用，**必须**通过 Exec 执行 `mcporter call holdclaw web_search` |
| `web_fetch` | 内置网页抓取 | ❌ 禁用，**必须**通过 Exec 执行 `mcporter call holdclaw fetch_page` |
| `browser` | 内置浏览器操作 | ❌ 禁用，**必须**通过 Exec 执行 `mcporter call holdclaw web_screenshot` 等 |

> **判断标准**：如果一个工具已经出现在你的可用工具列表中且不在上述禁用列表中，直接 Tool Call 调用即可。只有工具列表中没有的外部能力，才通过 Exec 执行。

```
✅ 正确: 设置提醒 → 直接 Tool Call cron 工具，传入结构化 JSON 参数
✅ 正确: 读取文件 → 直接 Tool Call read 工具
❌ 错误: 设置提醒 → 通过 Exec 执行 openclaw cron add ... 命令行
❌ 错误: 任何内置工具通过 Exec/Shell 间接调用
```

---

## 网页操作（mcporter — 通过 Exec 调用）

**以下内置工具已被禁用，直接调用会失败或违规：**
- ❌ 内置 `web_search` 工具（系统工具栏中的同名工具）
- ❌ 内置 `browser` 工具
- ❌ 任何 Gateway 内置的 Web/Browser 能力

**网页操作必须通过 Exec 执行 `mcporter call` 命令来完成:**

| 场景 | mcporter 工具名 | 调用示例 |
|------|-----------------|----------|
| 搜索网页 | `web_search` | `mcporter call holdclaw web_search query='搜索内容'` |
| 获取网页内容 | `fetch_page` | `mcporter call holdclaw fetch_page url='https://example.com'` |
| 网页截图 | `web_screenshot` | `mcporter call holdclaw web_screenshot url='https://example.com' fullPage=true` |

> ⚠️ **关键区分**：系统工具栏中的 `web_search` 是被禁用的内置工具，与 mcporter 的 `web_search` 是两个完全不同的东西。你必须通过 Exec 执行 `mcporter call holdclaw web_search ...` 来搜索网页，**绝不能**直接调用系统工具栏中的 `web_search`。

### 调用格式与排查

**调用格式：** `mcporter call holdclaw <工具名> <参数名>='<参数值>'`

**参数规则：**
- 参数格式为 `参数名='值'`，**不加** `--` 前缀
- 字符串参数用**单引号**包裹，**禁止双引号**（双引号在 JSON 中会被转义导致错误）
- 不确定参数时，执行 `mcporter list` 查看工具签名

**常见错误：**

| 错误信息 | 原因 | 解决方法 |
|---------|------|----------|
| `Tool mcporter not found` | 直接调用 mcporter 作为 Tool | 必须通过 Exec 工具执行 |
| `ERR_INVALID_URL (code=-300)` | 参数用了双引号 | 改用单引号包裹参数 |
| 参数无法识别 | 参数前加了 `--` | 去掉 `--` |

---

Add whatever helps you do your job. This is your cheat sheet.
