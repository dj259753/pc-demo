/* ═══════════════════════════════════════════
  社交真实远端适配器（real remote adapter）
  - 通过真实服务端 REST + WebSocket 通信
  - 对外暴露 window.SocialRealRemoteAdapter
  - 不影响旧的 SocialRemoteAdapter（mock）
  ═══════════════════════════════════════════ */

const SocialRealRemoteAdapter = (() => {
  // 服务端配置（可从设置读取或硬编码）
  const DEFAULT_SERVER = 'http://106.53.50.4:3210';
  const DEFAULT_WS_SERVER = 'ws://106.53.50.4:3210/ws';

  let serverURL = DEFAULT_SERVER;
  let wsURL = DEFAULT_WS_SERVER;
  let authToken = '';
  let authUserId = '';
  let ws = null;
  let wsReconnectTimer = null;
  let wsReconnectDelay = 2000;
  let wsConnected = false;
  let wsPendingAuth = false;
  const eventListeners = new Set();

  /* ─── 配置 ─── */
  function configure({ server, wsServer, userId, token } = {}) {
    if (server) serverURL = String(server).replace(/\/+$/, '');
    if (wsServer) wsURL = String(wsServer);
    if (userId) authUserId = String(userId);
    if (token) authToken = String(token);
  }

  function getConfig() {
    return { serverURL, wsURL, authUserId, authToken, wsConnected };
  }

  function isReady() {
    return !!(serverURL && authUserId && authToken);
  }

  /* ─── REST ─── */
  function makeNotReady(action) {
    return { success: false, message: `real-remote-not-ready:${action}` };
  }

  async function apiRequest(action, pathname, { method = 'GET', body = null, skipAuth = false } = {}) {
    if (!serverURL) return makeNotReady(action);
    if (!skipAuth && !isReady()) return makeNotReady(action);

    const url = `${serverURL}${pathname}`;
    const headers = {};
    if (authUserId) headers['X-User-Id'] = authUserId;
    if (authToken) headers['X-Token'] = authToken;
    const opts = { method, headers };

    if (body && method !== 'GET') {
      headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, opts);
      const text = await response.text();

      // 检查 HTTP 状态码：非 2xx 视为服务端错误
      if (!response.ok) {
        // 尝试从响应中提取错误信息（可能是 JSON 也可能是 HTML）
        let errMsg = `http-${response.status}`;
        if (text && text.trim().startsWith('{')) {
          try {
            const errJson = JSON.parse(text);
            errMsg = errJson?.message || errJson?.error || errMsg;
          } catch (_) { /* 非 JSON，保留状态码 */ }
        } else if (text && text.includes('<')) {
          errMsg = `server-error:${response.status}(html)`;
        }
        return { success: false, message: errMsg };
      }

      // 空响应处理
      if (!text || !text.trim()) {
        return { success: false, message: 'empty-response' };
      }

      // 安全解析 JSON（防止服务端返回 HTML 导致 parse 异常）
      const trimmed = text.trim();
      if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
        return { success: false, message: 'invalid-response-not-json' };
      }
      const payload = JSON.parse(text);

      // 兼容服务端返回的多种格式
      if (payload === null || typeof payload !== 'object') {
        return { success: false, message: 'invalid-response-shape' };
      }

      return payload;
    } catch (err) {
      // 区分网络错误和 JSON 解析错误
      const msg = err?.message || String(err);
      const isParseError = msg.includes('JSON') || msg.includes('token');
      return {
        success: false,
        message: isParseError ? `invalid-server-response(${msg})` : msg,
      };
    }
  }

  /* ─── WebSocket ─── */
  function connectWs() {
    if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
    if (!authUserId || !authToken) return;

    try {
      ws = new WebSocket(wsURL);
    } catch (e) {
      console.warn('[real-remote] ws create failed:', e.message);
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      console.log('[real-remote] ws connected, authenticating...');
      wsPendingAuth = true;
      ws.send(JSON.stringify({ type: 'auth', userId: authUserId, token: authToken }));
    };

    ws.onmessage = (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }

      if (msg.type === 'auth.ok') {
        wsConnected = true;
        wsPendingAuth = false;
        wsReconnectDelay = 2000;
        console.log('[real-remote] ws authenticated as', msg.userId);
        return;
      }

      if (msg.type === 'auth.error') {
        console.warn('[real-remote] ws auth failed:', msg.message);
        wsConnected = false;
        wsPendingAuth = false;
        return;
      }

      if (msg.type === 'pong') return;

      // 所有其他消息当作社交事件分发
      dispatchEvent(msg);
    };

    ws.onclose = () => {
      wsConnected = false;
      wsPendingAuth = false;
      console.log('[real-remote] ws disconnected');
      scheduleReconnect();
    };

    ws.onerror = (err) => {
      console.warn('[real-remote] ws error');
    };
  }

  function disconnectWs() {
    clearTimeout(wsReconnectTimer);
    wsReconnectTimer = null;
    if (ws) {
      try { ws.close(); } catch {}
      ws = null;
    }
    wsConnected = false;
    wsPendingAuth = false;
  }

  function scheduleReconnect() {
    if (wsReconnectTimer) return;
    wsReconnectTimer = setTimeout(() => {
      wsReconnectTimer = null;
      if (isReady()) connectWs();
    }, wsReconnectDelay);
    // 指数退避，最多 30 秒
    wsReconnectDelay = Math.min(30000, wsReconnectDelay * 1.5);
  }

  function sendWsMessage(msg) {
    if (!ws || ws.readyState !== 1 || !wsConnected) return false;
    ws.send(JSON.stringify(msg));
    return true;
  }

  // 心跳保活
  let wsPingTimer = null;
  function startWsPing() {
    if (wsPingTimer) return;
    wsPingTimer = setInterval(() => {
      sendWsMessage({ type: 'ping' });
    }, 25000);
  }
  function stopWsPing() {
    clearInterval(wsPingTimer);
    wsPingTimer = null;
  }

  /* ─── 事件分发 ─── */
  function dispatchEvent(evt) {
    for (const listener of eventListeners) {
      try { listener(evt); } catch (e) {
        console.warn('[real-remote] event listener error:', e);
      }
    }
  }

  /* ─── 认证流程 ─── */
  async function register(ownerName, petName) {
    const res = await apiRequest('register', '/api/auth/register', {
      method: 'POST',
      body: { ownerName, petName },
      skipAuth: true,
    });
    if (res?.success && res.data) {
      authUserId = res.data.userId;
      authToken = res.data.token;
      // 保存到 localStorage
      try {
        localStorage.setItem('qq-pet-social-userId', authUserId);
        localStorage.setItem('qq-pet-social-token', authToken);
      } catch {}
      connectWs();
      startWsPing();
    }
    return res;
  }

  async function login(userId, token) {
    configure({ userId, token });
    const res = await apiRequest('login', '/api/auth/login', {
      method: 'POST',
      body: { userId, token },
      skipAuth: true,
    });
    if (res?.success && res.data) {
      authUserId = res.data.userId;
      authToken = res.data.token || token;
      try {
        localStorage.setItem('qq-pet-social-userId', authUserId);
        localStorage.setItem('qq-pet-social-token', authToken);
      } catch {}
      connectWs();
      startWsPing();
    }
    return res;
  }

  function restoreSession() {
    try {
      const savedUserId = localStorage.getItem('qq-pet-social-userId');
      const savedToken = localStorage.getItem('qq-pet-social-token');
      if (savedUserId && savedToken) {
        authUserId = savedUserId;
        authToken = savedToken;
        return true;
      }
    } catch {}
    return false;
  }

  /* ─── 适配器接口（和 SocialRemoteAdapter 一致） ─── */
  async function bootstrap() {
    // 尝试恢复会话
    if (!authUserId || !authToken) {
      restoreSession();
    }
    if (!authUserId || !authToken) {
      return { success: false, message: 'not-authenticated', requiresRegistration: true };
    }
    // 尝试登录
    const loginRes = await login(authUserId, authToken);
    if (!loginRes?.success) {
      return { success: false, message: 'login-failed', requiresRegistration: true };
    }
    // 获取好友列表
    const friendsRes = await apiRequest('getFriends', '/api/friends/list');
    const friends = friendsRes?.success ? (friendsRes.data?.friends || []) : [];
    // 获取好友申请
    const reqsRes = await apiRequest('getRequests', '/api/friends/requests');
    const requests = reqsRes?.success ? (reqsRes.data || []) : [];
    const roomRes = await apiRequest('getCurrentRoom', '/api/visits/current');
    const visitReqsRes = await apiRequest('getPendingVisitRequests', '/api/visits/requests/pending');
    const miniGameReqsRes = await apiRequest('getPendingMiniGameRequests', '/api/visits/game-requests/pending');
    const currentGameRes = await apiRequest('getCurrentGame', '/api/visits/game/current');
    // 获取拜访中状态（哪些好友在活跃拜访中）
    const activeVisitsRes = await apiRequest('getActiveVisits', '/api/visits/active-visits');

    return {
      success: true,
      data: {
        profile: loginRes.data,
        friends,
        requests,
        presence: { userStatus: 'online', sessionStatus: currentGameRes?.data ? 'playing' : (roomRes?.data ? 'visiting' : 'idle'), statusMessage: '' },
        currentRoom: roomRes?.success ? (roomRes.data || null) : null,
        visitRequests: visitReqsRes?.success ? (visitReqsRes.data || []) : [],
        miniGameRequests: miniGameReqsRes?.success ? (miniGameReqsRes.data || []) : [],
        currentGame: currentGameRes?.success ? (currentGameRes.data || null) : null,
        activeVisits: activeVisitsRes?.success ? (activeVisitsRes.data || { myself: null, friendsInVisit: [] }) : { myself: null, friendsInVisit: [] },
        lastGameEvent: null,
        featureFlags: {
          socialEnabled: true,
          visitModeEnabled: true,
          miniGameEnabled: true,
          socialRemoteEnabled: true,
        },
        requiresAdoption: false,
        gateway: {
          mode: 'real-remote',
          requested: 'real-remote',
          previousMode: 'local',
          fallback: false,
          reason: 'real-remote-active',
          trigger: 'real-remote.bootstrap',
          updatedAt: new Date().toISOString(),
        },
      },
    };
  }

  return {
    // 配置与认证
    configure,
    getConfig,
    isReady,
    register,
    login,
    restoreSession,
    connectWs,
    disconnectWs,

    // 标准接口（和 gateway 契约一致）
    bootstrap,
    getProfile: () => apiRequest('getProfile', '/api/auth/profile'),
    upsertProfile: (payload = {}) => apiRequest('upsertProfile', '/api/auth/profile', { method: 'POST', body: payload }),
    getFriends: () => apiRequest('getFriends', '/api/friends/list'),
    sendFriendRequest: (payload = {}) => apiRequest('sendFriendRequest', '/api/friends/request', { method: 'POST', body: payload }),
    respondFriendRequest: (payload = {}) => apiRequest('respondFriendRequest', '/api/friends/respond', { method: 'POST', body: payload }),
    getPresence: () => apiRequest('getPresence', '/api/presence/status'),
    setPresence: (payload = {}) => apiRequest('setPresence', '/api/presence/status', { method: 'POST', body: payload }),
    heartbeat: (payload = {}) => {
      // 心跳通过 WebSocket ping 实现，REST 只返回当前状态
      sendWsMessage({ type: 'ping' });
      return apiRequest('heartbeat', '/api/friends/list');
    },
    setFriendPresence: () => ({ success: true }), // 服务端自动管理
    createVisitRoom: (payload = {}) => apiRequest('createVisitRoom', '/api/visits/respond', { method: 'POST', body: { ...payload, action: 'accept' } }),
    leaveVisitRoom: (payload = {}) => apiRequest('leaveVisitRoom', '/api/visits/leave', { method: 'POST', body: payload }),
    getCurrentRoom: () => apiRequest('getCurrentRoom', '/api/visits/current'),
    sendVisitInteraction: (payload = {}) => {
      // 走 WebSocket 实时转发
      sendWsMessage({ type: 'visit.interaction', payload });
      return Promise.resolve({ success: true });
    },
    sendVisitChat: (payload = {}) => {
      // 拜访聊天走 WebSocket 实时转发
      sendWsMessage({ type: 'visit.chat', payload });
      return Promise.resolve({ success: true });
    },
    sendVisitRequest: (payload = {}) => apiRequest('sendVisitRequest', '/api/visits/request', { method: 'POST', body: payload }),
    cancelVisitRequest: (payload = {}) => apiRequest('cancelVisitRequest', '/api/visits/request', { method: 'POST', body: { ...payload, action: 'cancel' } }),
    respondVisitRequest: (payload = {}) => apiRequest('respondVisitRequest', '/api/visits/respond', { method: 'POST', body: payload }),
    getPendingVisitRequests: () => apiRequest('getPendingVisitRequests', '/api/visits/requests/pending'),
    getActiveVisits: () => apiRequest('getActiveVisits', '/api/visits/active-visits'),
    sendMiniGameRequest: (payload = {}) => apiRequest('sendMiniGameRequest', '/api/visits/game-request', { method: 'POST', body: payload }),
    respondMiniGameRequest: (payload = {}) => apiRequest('respondMiniGameRequest', '/api/visits/game-respond', { method: 'POST', body: payload }),
    startMiniGame: (payload = {}) => {
      sendWsMessage({ type: 'visit.game.event', payload: { kind: 'start', ...payload } });
      return Promise.resolve({ success: true });
    },
    playMiniGameMove: (payload = {}) => {
      sendWsMessage({ type: 'visit.game.event', payload: { kind: 'move', ...payload } });
      return Promise.resolve({ success: true });
    },
    resetMiniGame: (payload = {}) => {
      sendWsMessage({ type: 'visit.game.event', payload: { kind: 'reset', ...payload } });
      return Promise.resolve({ success: true });
    },
    getFeatureFlags: () => Promise.resolve({ success: true, data: { socialEnabled: true, visitModeEnabled: true, miniGameEnabled: true, socialRemoteEnabled: true } }),
    getOnlineUsers: () => apiRequest('getOnlineUsers', '/api/users/online'),
    updateFeatureFlags: (payload = {}) => Promise.resolve({ success: true, data: payload }),
    getRemoteMockInfo: () => Promise.resolve({ success: true, data: { running: true, baseURL: serverURL, mode: 'real-remote' } }),
    onSocialEvent: (callback) => {
      if (typeof callback !== 'function') return () => {};
      eventListeners.add(callback);
      if (isReady() && !wsConnected && !wsPendingAuth) {
        connectWs();
        startWsPing();
      }
      return () => {
        eventListeners.delete(callback);
        if (eventListeners.size === 0) {
          stopWsPing();
          // 不断开 ws，保持连接以便随时恢复
        }
      };
    },
  };
})();

window.SocialRealRemoteAdapter = SocialRealRemoteAdapter;
