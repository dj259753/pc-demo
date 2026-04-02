# 任务记录（已落实）

## 运行时 node

- 未将 `runtime/node` 提交 Git 时：开发启动会先执行 `npm run ensure:runtime-node`（或 Gateway 起子进程前）从 CDN 拉取。默认 `http://qqai.gtimg.com/qqpet/runtime/node`，可用环境变量 **`PET_RUNTIME_NODE_URL`** 覆盖。打包版不写入 `.app` 内目录。

## 关键项

1. **内置 Gateway 免手工处理权限/签名**  
   应用启动 Gateway 前（仅 macOS）会对 `resources/targets/...` 执行 `xattr -cr`，并对 `runtime/node` 与所有 `*.node` 做 `codesign --force --sign -`。见 `electron/backend/macos-gateway-native.js`，由 `gateway-process.js` 调用。

2. **OpenClaw 配置以宠物为准（~/.qq-pet）**  
   - 子进程环境：`OPENCLAW_STATE_DIR` 与 `OPENCLAW_HOME` 均指向 `~/.qq-pet`。  
   - 若不存在 `~/.qq-pet/openclaw.json` 但存在 `~/.openclaw/openclaw.json`，启动时会**自动迁移**并净化。  
   - **系统设置 → AI 配置** 保存的 Provider 仍写入 `~/.qq-pet/openclaw.json`（`saveProviderConfig`），并会 **sanitize** 掉易触发校验失败的字段（如 `commands.ownerDisplay`、`tools.web.search`）。

## 非关键：405 说明与修复

- **原因**：内嵌 Gateway 的 HTTP 路由对 `POST /v1/chat/completions` 返回 **405**；主对话走 **WebSocket RPC** 仍正常，但 `ai-brain` 里 `callAI` / `chatViaFetch` 曾用同一 `api_url` 去 **fetch**，控制台会看到 405。  
- **处理**：Gateway 运行时 `get-ai-config` 增加 `use_upstream_proxy: true`，上述补调用改由主进程 **`upstream-chat-completions` IPC** 转发到 `openclaw.json` 里的上游 `baseUrl/chat/completions`（`node-fetch`），不再 POST 网关。
