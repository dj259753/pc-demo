/* ═══════════════════════════════════════════
  社交远端适配器（remote adapter）
  - 通过本地 mock HTTP 服务模拟远端接口
  - 对外暴露 window.SocialRemoteAdapter
  ═══════════════════════════════════════════ */

const SocialRemoteAdapter = (() => {
  let endpointInfo = null;
  let endpointLoadedAt = 0;

  let eventCursor = 0;
  let eventPollTimer = null;
  let eventPolling = false;
  const eventListeners = new Set();

  function now() {
    return Date.now();
  }

  function makeNotReady(action) {
    return {
      success: false,
      message: `remote-gateway-not-ready:${action}`,
    };
  }

  function resolvePollInterval() {
    const n = Number(endpointInfo?.pollIntervalMs);
    if (!Number.isFinite(n)) return 1500;
    return Math.min(5000, Math.max(500, Math.floor(n)));
  }

  function buildURL(pathname, query = null) {
    const baseURL = String(endpointInfo?.baseURL || '').trim();
    if (!baseURL) return '';

    const url = new URL(`${baseURL}${pathname}`);
    if (query && typeof query === 'object') {
      Object.entries(query).forEach(([key, value]) => {
        if (value === undefined || value === null) return;
        url.searchParams.set(key, String(value));
      });
    }

    return url.toString();
  }

  async function ensureEndpoint(force = false) {
    const fresh = endpointInfo && (now() - endpointLoadedAt < 5000);
    if (!force && fresh) return endpointInfo;

    const res = await SocialBridge.getRemoteMockInfo();
    if (!res?.success || !res.data?.running) {
      endpointInfo = null;
      endpointLoadedAt = now();
      return null;
    }

    endpointInfo = {
      baseURL: String(res.data.baseURL || '').trim(),
      token: String(res.data.token || '').trim(),
      pollIntervalMs: Number(res.data.pollIntervalMs) || 1500,
    };
    endpointLoadedAt = now();
    return endpointInfo;
  }

  async function remoteRequest(action, pathname, { method = 'GET', body = null, query = null } = {}) {
    const endpoint = await ensureEndpoint();
    if (!endpoint || !endpoint.baseURL || !endpoint.token) {
      return makeNotReady(action);
    }

    const url = buildURL(pathname, query);
    if (!url) {
      return makeNotReady(action);
    }

    const headers = {
      'X-Social-Mock-Token': endpoint.token,
    };

    const requestInit = {
      method,
      headers,
    };

    if (body && method !== 'GET') {
      headers['Content-Type'] = 'application/json';
      requestInit.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, requestInit);
      const text = await response.text();
      const payload = text ? JSON.parse(text) : { success: false, message: 'empty-remote-response' };

      if (!response.ok) {
        return {
          success: false,
          message: payload?.message || `http-status-${response.status}`,
        };
      }

      if (!payload || typeof payload !== 'object') {
        return {
          success: false,
          message: 'invalid-remote-response-shape',
        };
      }

      return payload;
    } catch (err) {
      return {
        success: false,
        message: err?.message || String(err),
      };
    }
  }

  async function pollEventsOnce() {
    if (eventListeners.size === 0) return;

    const res = await remoteRequest('events', '/events', {
      method: 'GET',
      query: { cursor: eventCursor },
    });

    if (!res?.success || !res.data) {
      const msg = String(res?.message || 'unknown');
      if (!msg.includes('remote-gateway-not-ready')) {
        console.warn('[social-remote-adapter] poll events failed:', msg);
      }
      return;
    }

    const nextCursor = Number(res.data.nextCursor);
    if (Number.isFinite(nextCursor)) {
      eventCursor = Math.max(eventCursor, nextCursor);
    }

    const events = Array.isArray(res.data.events) ? res.data.events : [];
    if (events.length === 0) return;

    events.forEach((evt) => {
      eventListeners.forEach((listener) => {
        try {
          listener(evt || {});
        } catch (err) {
          console.warn('[social-remote-adapter] event listener error:', err);
        }
      });
    });
  }

  function scheduleEventPolling(delayMs = resolvePollInterval()) {
    if (!eventPolling) return;
    clearTimeout(eventPollTimer);
    eventPollTimer = setTimeout(async () => {
      try {
        await pollEventsOnce();
      } catch (err) {
        console.warn('[social-remote-adapter] poll tick error:', err);
      } finally {
        scheduleEventPolling(resolvePollInterval());
      }
    }, delayMs);
  }

  function startEventPolling() {
    if (eventPolling) return;
    eventPolling = true;
    scheduleEventPolling(200);
  }

  function stopEventPolling() {
    eventPolling = false;
    clearTimeout(eventPollTimer);
    eventPollTimer = null;
  }

  return {
    bootstrap: () => remoteRequest('bootstrap', '/bootstrap', { method: 'POST' }),
    getProfile: () => remoteRequest('getProfile', '/profile', { method: 'GET' }),
    upsertProfile: (payload = {}) => remoteRequest('upsertProfile', '/profile', { method: 'PUT', body: payload }),
    getFriends: () => remoteRequest('getFriends', '/friends', { method: 'GET' }),
    sendFriendRequest: (payload = {}) => remoteRequest('sendFriendRequest', '/friends/requests', { method: 'POST', body: payload }),
    respondFriendRequest: (payload = {}) => remoteRequest('respondFriendRequest', '/friends/requests/respond', { method: 'POST', body: payload }),
    getPresence: () => remoteRequest('getPresence', '/presence', { method: 'GET' }),
    setPresence: (payload = {}) => remoteRequest('setPresence', '/presence', { method: 'PUT', body: payload }),
    heartbeat: (payload = {}) => remoteRequest('heartbeat', '/presence/heartbeat', { method: 'POST', body: payload }),
    setFriendPresence: (payload = {}) => remoteRequest('setFriendPresence', '/friends/presence', { method: 'POST', body: payload }),
    createVisitRoom: (payload = {}) => remoteRequest('createVisitRoom', '/visit/rooms', { method: 'POST', body: payload }),
    leaveVisitRoom: (payload = {}) => remoteRequest('leaveVisitRoom', '/visit/rooms/leave', { method: 'POST', body: payload }),
    getCurrentRoom: () => remoteRequest('getCurrentRoom', '/visit/current-room', { method: 'GET' }),
    sendVisitInteraction: (payload = {}) => remoteRequest('sendVisitInteraction', '/visit/interactions', { method: 'POST', body: payload }),
    sendVisitRequest: (payload = {}) => remoteRequest('sendVisitRequest', '/visit/requests', { method: 'POST', body: payload }),
    respondVisitRequest: (payload = {}) => remoteRequest('respondVisitRequest', '/visit/requests/respond', { method: 'POST', body: payload }),
    getPendingVisitRequests: () => remoteRequest('getPendingVisitRequests', '/visit/requests/pending', { method: 'GET' }),
    sendMiniGameRequest: (payload = {}) => Promise.resolve({ success: false, message: 'remote-mini-game-request-not-implemented' }),
    respondMiniGameRequest: (payload = {}) => Promise.resolve({ success: false, message: 'remote-mini-game-request-not-implemented' }),
    startMiniGame: (payload = {}) => remoteRequest('startMiniGame', '/mini-games/start', { method: 'POST', body: payload }),
    playMiniGameMove: (payload = {}) => remoteRequest('playMiniGameMove', '/mini-games/move', { method: 'POST', body: payload }),
    resetMiniGame: (payload = {}) => remoteRequest('resetMiniGame', '/mini-games/reset', { method: 'POST', body: payload }),
    getFeatureFlags: () => remoteRequest('getFeatureFlags', '/feature-flags', { method: 'GET' }),
    getOnlineUsers: () => Promise.resolve({ success: true, data: { users: [] } }),
    updateFeatureFlags: (payload = {}) => remoteRequest('updateFeatureFlags', '/feature-flags', { method: 'PUT', body: payload }),
    onSocialEvent: (callback) => {
      if (typeof callback !== 'function') return () => {};
      eventListeners.add(callback);
      startEventPolling();
      return () => {
        eventListeners.delete(callback);
        if (eventListeners.size === 0) {
          stopEventPolling();
        }
      };
    },
  };
})();

window.SocialRemoteAdapter = SocialRemoteAdapter;
