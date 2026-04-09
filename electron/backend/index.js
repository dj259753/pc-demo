/**
 * index.js — Backend 统一入口
 * 整合 Gateway 生命周期管理、Provider 配置、Workspace 初始化
 * 
 * 使用方式：
 *   const backend = require('./backend');
 *   await backend.init();        // 首次启动/恢复
 *   backend.registerIPC(ipcMain); // 注册 IPC handlers
 */

'use strict';

// 兜底：EPIPE 等管道错误不应弹窗（带节流，防止死循环刷日志）
let _lastSuppressedTime = 0;
let _suppressCount = 0;
process.on('uncaughtException', (err) => {
  if (['EPIPE', 'ERR_STREAM_WRITE_AFTER_END', 'ENOTCONN'].includes(err.code)) {
    const now = Date.now();
    _suppressCount++;
    if (now - _lastSuppressedTime > 5000) {
      // 每 5 秒最多打一条，避免刷爆日志
      console.warn(`[backend] suppressed ${_suppressCount} stream error(s) (latest: ${err.code})`);
      _lastSuppressedTime = now;
      _suppressCount = 0;
    }
    return;
  }
  throw err; // 其他异常继续抛出
});

const { ipcMain, BrowserWindow } = require('electron');
const constants = require('./constants');
const { GatewayProcess } = require('./gateway-process');
const { GatewayRpcClient } = require('./gateway-rpc');
const { resolveGatewayAuthToken, ensureGatewayAuthTokenInConfig } = require('./gateway-auth');
const { readUserConfig, writeUserConfig, verifyCustom, saveProviderConfig, getCurrentProviderConfig, ensureConfigSanitizedAndMigrated, ensureDreamingEnabled } = require('./provider-config');
const { backupCurrentUserConfig, recordSetupBaselineConfigSnapshot, recordLastKnownGoodConfigSnapshot, getConfigRecoveryData } = require('./config-backup');
const { ensureWorkspace, getDefaultPetSoul } = require('./workspace-init');
const { SocialClient } = require('./social-client');
const { VisitSessionController } = require('./visit-session');
const { socialEvents } = require('./social-events');

let gateway = null;
let rpcClient = null;   // Gateway WebSocket RPC 客户端
let socialEventBound = false;
const socialClient = new SocialClient();
const visitSession = new VisitSessionController(socialClient);

/**
 * 初始化 Backend
 * - 确保 workspace 目录结构
 * - 如果配置已完成，启动 Gateway
 * - 返回 { setupRequired, gatewayState }
 */
async function init() {
  // 1. 确保 workspace 存在
  ensureWorkspace();
  // 迁移 ~/.openclaw → ~/.qq-pet，并修正与当前 OpenClaw 不兼容的字段（仅宠物使用的配置）
  ensureConfigSanitizedAndMigrated();
  // 初始化社交本地存储壳
  socialClient.bootstrap();

  // 确保 Dreaming（做梦模式）默认开启
  ensureDreamingEnabled();

  // 2. 检查是否需要首次配置
  if (!constants.isSetupComplete()) {
    console.log('[backend] 首次启动，需要配置向导');
    return { setupRequired: true, gatewayState: 'stopped' };
  }

  // 3. 配置已完成，启动 Gateway
  console.log('[backend] 配置已完成，启动 Gateway...');
  const state = await startGateway();
  return { setupRequired: false, gatewayState: state };
}

/**
 * 启动 Gateway 子进程
 */
async function startGateway() {
  if (gateway && gateway.getState() === 'running') {
    console.log('[backend] Gateway 已在运行');
    return 'running';
  }

  // 读取或生成 auth token
  const token = resolveGatewayAuthToken();

  gateway = new GatewayProcess({
    port: constants.DEFAULT_PORT,
    token,
    onStateChange: (state) => {
      console.log(`[backend] Gateway state: ${state}`);
      // 通知所有窗口 Gateway 状态变化
      const { BrowserWindow } = require('electron');
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
          win.webContents.send('gateway-state-changed', state);
        }
      }
    },
    onAgentLog: (evt) => {
      // 将 agent 事件转发给渲染进程（用于气泡展示工具执行进度）
      const { BrowserWindow } = require('electron');
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
          win.webContents.send('agent-event', evt);
        }
      }
    },
  });

  await gateway.start();

  if (gateway.getState() === 'running') {
    // 记录"最近一次可启动"快照
    recordLastKnownGoodConfigSnapshot();
    console.log(`[backend] Gateway 启动成功: http://127.0.0.1:${gateway.getPort()}`);

    // 建立 WebSocket RPC 长连接（用于 Agent chat loop）
    connectGatewayRpc();
  }

  return gateway.getState();
}

/**
 * 建立 Gateway WebSocket RPC 长连接
 */
function connectGatewayRpc() {
  // 先断开旧连接
  if (rpcClient) {
    rpcClient.stop();
    rpcClient = null;
  }

  if (!gateway || gateway.getState() !== 'running') return;

  const port = gateway.getPort();
  const token = gateway.getToken();

  rpcClient = new GatewayRpcClient({
    url: `ws://127.0.0.1:${port}/`,
    token,
    onChatEvent: (payload) => {
      // 转发 chat 事件到所有渲染进程
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
          win.webContents.send('gateway-chat-event', payload);
        }
      }
    },
    onAgentEvent: (payload) => {
      // 转发 agent 事件到所有渲染进程
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
          win.webContents.send('gateway-agent-event', payload);
        }
      }
    },
    onConnected: () => {
      console.log('[backend] Gateway RPC 已连接');
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
          win.webContents.send('gateway-rpc-connected');
        }
      }
    },
    onDisconnected: () => {
      console.log('[backend] Gateway RPC 已断开');
    },
  });

  rpcClient.start();
}

/**
 * 停止 Gateway
 */
function stopGateway() {
  if (rpcClient) {
    rpcClient.stop();
    rpcClient = null;
  }
  if (gateway) {
    gateway.stop();
    gateway = null;
  }
  Promise.resolve();
}

/**
 * 获取 Gateway 连接信息（给 ai-brain.js 用）
 */
function getGatewayInfo() {
  if (!gateway || gateway.getState() !== 'running') {
    return { running: false, url: '', token: '', model: '' };
  }

  const config = readUserConfig();
  const primary = config?.agents?.defaults?.model?.primary || '';
  const [providerKey, ...modelParts] = primary.split('/');
  const modelID = modelParts.join('/');
  const provider = config?.models?.providers?.[providerKey];

  return {
    running: true,
    // AI Brain 直接往 Gateway 发请求，Gateway 会路由到配置的 provider
    url: `http://127.0.0.1:${gateway.getPort()}/v1`,
    token: gateway.getToken(),
    model: primary,  // 格式: providerKey/modelID
    // 也返回原始信息供直接调用
    directUrl: provider?.baseUrl || '',
    directKey: provider?.apiKey || '',
    directModel: modelID,
  };
}

function broadcastSocialEvent(payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('social-event', payload);
    }
  }
}

/**
 * 注册所有 Backend IPC Handlers
 */
function registerIPC() {
  if (!socialEventBound) {
    socialEvents.on('social-event', broadcastSocialEvent);
    socialEventBound = true;
  }

  // ── 配置向导相关 ──

  // 验证 AI Provider
  ipcMain.handle('backend-verify-provider', async (_event, { apiKey, baseURL, modelID }) => {
    try {
      await verifyCustom(apiKey, baseURL, modelID);
      return { success: true };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  // 保存 AI 配置并启动 Gateway
  ipcMain.handle('backend-save-provider', async (_event, { apiKey, baseURL, modelID }) => {
    try {
      // 保存 provider 配置
      const config = saveProviderConfig(apiKey, baseURL, modelID);
      // 确保 gateway auth token
      ensureGatewayAuthTokenInConfig(config);
      writeUserConfig(config);
      // 记录基线快照
      recordSetupBaselineConfigSnapshot();
      // 启动 Gateway
      const state = await startGateway();
      return { success: true, gatewayState: state };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  // 获取当前 Provider 配置（供设置页显示）
  ipcMain.handle('backend-get-provider-config', () => {
    return getCurrentProviderConfig();
  });

  // 获取 Gateway 连接信息（给 ai-brain.js 用）
  ipcMain.handle('backend-get-gateway-info', () => {
    return getGatewayInfo();
  });

  // 获取 Gateway 状态
  ipcMain.handle('backend-get-gateway-state', () => {
    return gateway ? gateway.getState() : 'stopped';
  });

  // 重启 Gateway
  ipcMain.handle('backend-restart-gateway', async () => {
    try {
      if (gateway) {
        await gateway.restart();
        return { success: true, state: gateway.getState() };
      }
      const state = await startGateway();
      return { success: true, state };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  // 配置恢复数据
  ipcMain.handle('backend-get-recovery-data', () => {
    return getConfigRecoveryData();
  });

  // 检查 setup 是否完成
  ipcMain.handle('backend-is-setup-complete', () => {
    return constants.isSetupComplete();
  });

  // ── 社交架构壳 IPC ──
  ipcMain.handle('social-bootstrap', () => {
    try {
      return { success: true, data: socialClient.bootstrap() };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  ipcMain.handle('social-get-profile', () => {
    try {
      return { success: true, data: socialClient.getProfile() };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  ipcMain.handle('social-upsert-profile', (_event, payload = {}) => {
    try {
      return { success: true, data: socialClient.ensureIdentity(payload) };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  ipcMain.handle('social-get-friends', () => {
    try {
      return { success: true, data: socialClient.getFriends() };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  ipcMain.handle('social-send-friend-request', (_event, payload = {}) => {
    try {
      return { success: true, data: socialClient.sendFriendRequest(payload) };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  ipcMain.handle('social-respond-friend-request', (_event, payload = {}) => {
    try {
      return { success: true, data: socialClient.respondFriendRequest(payload) };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  ipcMain.handle('social-get-presence', () => {
    try {
      return { success: true, data: socialClient.getPresence() };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  ipcMain.handle('social-set-presence', (_event, payload = {}) => {
    try {
      return { success: true, data: socialClient.setPresence(payload) };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  ipcMain.handle('social-heartbeat', (_event, payload = {}) => {
    try {
      return { success: true, data: socialClient.heartbeat(payload) };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  ipcMain.handle('social-set-friend-presence', (_event, payload = {}) => {
    try {
      return { success: true, data: socialClient.setFriendPresence(payload) };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  ipcMain.handle('social-create-visit-room', (_event, payload = {}) => {
    try {
      return { success: true, data: visitSession.createRoom(payload) };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  ipcMain.handle('social-leave-visit-room', (_event, payload = {}) => {
    try {
      return { success: true, data: visitSession.leaveRoom(payload.reason || 'manual-leave') };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  ipcMain.handle('social-get-current-room', () => {
    try {
      return { success: true, data: visitSession.getCurrentRoom() };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  ipcMain.handle('social-send-visit-interaction', (_event, payload = {}) => {
    try {
      return { success: true, data: socialClient.sendVisitInteraction(payload) };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  ipcMain.handle('social-send-visit-chat', (_event, payload = {}) => {
    try {
      return { success: true, data: socialClient.sendVisitChat(payload) };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  ipcMain.handle('social-send-visit-request', (_event, payload = {}) => {
    try {
      return { success: true, data: socialClient.sendVisitRequest(payload) };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  ipcMain.handle('social-respond-visit-request', (_event, payload = {}) => {
    try {
      return { success: true, data: socialClient.respondVisitRequest(payload) };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  ipcMain.handle('social-get-pending-visit-requests', () => {
    try {
      return { success: true, data: socialClient.getPendingVisitRequests() };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  ipcMain.handle('social-send-mini-game-request', (_event, payload = {}) => {
    try {
      console.log('[social-ipc] sendMiniGameRequest payload:', JSON.stringify(payload));
      const result = socialClient.sendMiniGameRequest(payload);
      console.log('[social-ipc] sendMiniGameRequest result:', JSON.stringify(result));
      return { success: true, data: result };
    } catch (err) {
      console.error('[social-ipc] sendMiniGameRequest error:', err);
      return { success: false, message: err.message };
    }
  });

  ipcMain.handle('social-respond-mini-game-request', (_event, payload = {}) => {
    try {
      return { success: true, data: socialClient.respondMiniGameRequest(payload) };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  ipcMain.handle('social-start-mini-game', (_event, payload = {}) => {
    try {
      return { success: true, data: socialClient.startMiniGame(payload) };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  ipcMain.handle('social-play-mini-game-move', (_event, payload = {}) => {
    try {
      return { success: true, data: socialClient.playMiniGameMove(payload) };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  ipcMain.handle('social-reset-mini-game', (_event, payload = {}) => {
    try {
      return { success: true, data: socialClient.resetMiniGame(payload) };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  ipcMain.handle('social-get-feature-flags', () => {
    try {
      return { success: true, data: socialClient.getFeatureFlags() };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  ipcMain.handle('social-update-feature-flags', (_event, payload = {}) => {
    try {
      return { success: true, data: socialClient.updateFeatureFlags(payload) };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  // ── 亲密度体系 ──
  ipcMain.handle('social-add-intimacy-points', (_event, payload = {}) => {
    try {
      return { success: true, data: socialClient.addIntimacyPoints(payload || {}) };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  ipcMain.handle('social-get-intimacy', (_event, payload = {}) => {
    try {
      return { success: true, data: socialClient.getIntimacy(payload.friendUserId) };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  ipcMain.handle('social-get-intimacy-overview', () => {
    try {
      return { success: true, data: socialClient.getIntimacyOverview() };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  // ── Gateway RPC 聊天（走完整 Agent loop） ──

  // 发送聊天消息（Agent loop 模式）
  ipcMain.handle('gateway-chat-send', async (_event, { message, sessionKey }) => {
    if (!rpcClient || !rpcClient.isConnected()) {
      return { success: false, error: 'Gateway RPC 未连接' };
    }
    try {
      const result = await rpcClient.chatSend(message, sessionKey);
      return { success: true, result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // 中止当前运行
  ipcMain.handle('gateway-chat-abort', async (_event, { runId, sessionKey } = {}) => {
    if (!rpcClient || !rpcClient.isConnected()) {
      return { success: false, error: 'Gateway RPC 未连接' };
    }
    try {
      await rpcClient.chatAbort(runId, sessionKey);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // 获取聊天历史
  ipcMain.handle('gateway-chat-history', async (_event, { sessionKey, limit } = {}) => {
    if (!rpcClient || !rpcClient.isConnected()) {
      return { success: false, error: 'Gateway RPC 未连接' };
    }
    try {
      const result = await rpcClient.chatHistory(sessionKey, limit);
      return { success: true, result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // 获取 RPC 连接状态
  ipcMain.handle('gateway-rpc-status', () => {
    return {
      connected: rpcClient ? rpcClient.isConnected() : false,
      sessionKey: rpcClient ? rpcClient.getSessionKey() : null,
    };
  });

  console.log('[backend] IPC handlers 已注册');
}

module.exports = {
  init,
  startGateway,
  stopGateway,
  connectGatewayRpc,
  getGatewayInfo,
  registerIPC,
  constants,
};
