/* ═══════════════════════════════════════════
   社交状态中心（架构壳）
   统一管理 profile/friends/presence/visitRoom/featureFlags
   ═══════════════════════════════════════════ */

const SocialState = (() => {
  const listeners = {};

  const initialState = {
    ready: false,
    requiresAdoption: true,
    profile: null,
    friends: [],
    requests: [],
    presence: {
      userStatus: 'offline',
      sessionStatus: 'idle',
      statusMessage: '',
      updatedAt: '',
    },
    currentRoom: null,
    lastVisitInteraction: null,
    visitRequests: [],
    miniGameRequests: [],
    currentGame: null,
    lastGameEvent: null,
    visitChatMessages: [],
    currentGuessGame: null,
    gateway: {
      mode: 'local',
      requested: 'local',
      previousMode: 'local',
      fallback: false,
      reason: 'init',
      trigger: 'init',
      updatedAt: '',
    },
    featureFlags: {
      socialEnabled: true,
      visitModeEnabled: true,
      dualActionEnabled: false,
      miniGameEnabled: true,
      photoCardEnabled: false,
      leaveNoteEnabled: false,
      socialRemoteEnabled: false,
    },
    lastSyncAt: '',
  };

  let state = JSON.parse(JSON.stringify(initialState));

  function nowISO() {
    return new Date().toISOString();
  }

  function emit(event, payload) {
    if (!listeners[event]) return;
    listeners[event].forEach((fn) => {
      try { fn(payload); } catch (err) {
        console.warn('[social-state] listener error:', err);
      }
    });
  }

  function on(event, fn) {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(fn);
    return () => {
      listeners[event] = (listeners[event] || []).filter((item) => item !== fn);
    };
  }

  function snapshot() {
    return JSON.parse(JSON.stringify(state));
  }

  function apply(nextState, reason = 'state.updated') {
    state = {
      ...state,
      ...nextState,
      lastSyncAt: nowISO(),
    };
    emit('change', { reason, state: snapshot() });
  }

  function patch(partial, reason = 'state.patched') {
    apply(partial, reason);
  }

  function bootstrap(data = {}) {
    apply({
      ready: true,
      requiresAdoption: !!data.requiresAdoption,
      profile: data.profile || null,
      friends: Array.isArray(data.friends) ? data.friends : [],
      requests: Array.isArray(data.requests) ? data.requests : [],
      presence: {
        ...initialState.presence,
        ...(data.presence || {}),
      },
      currentRoom: data.currentRoom || null,
      lastVisitInteraction: data.lastVisitInteraction || null,
      visitRequests: Array.isArray(data.visitRequests) ? data.visitRequests : [],
      miniGameRequests: Array.isArray(data.miniGameRequests) ? data.miniGameRequests : [],
      currentGame: data.currentGame || null,
      lastGameEvent: data.lastGameEvent || null,
      gateway: {
        ...initialState.gateway,
        ...(data.gateway || {}),
      },
      featureFlags: {
        ...initialState.featureFlags,
        ...(data.featureFlags || {}),
      },
    }, 'bootstrap.loaded');
  }

  function applySocialEvent(evt = {}) {
    const type = String(evt.type || '').trim();
    const payload = evt.payload;

    switch (type) {
      case 'profile.updated': {
        const prevGender = state.profile?.petGender || 'gg';
        patch({ profile: payload || null, requiresAdoption: !payload }, type);
        // 性别变更 → 通知 sprite 重载 manifest
        const newGender = payload?.petGender || 'gg';
        if (prevGender !== newGender && typeof SpriteRenderer !== 'undefined' && SpriteRenderer.reloadForGender) {
          SpriteRenderer.reloadForGender(newGender);
        }
        break;
      }
      case 'friends.list.updated':
        patch({ friends: Array.isArray(payload) ? payload : [] }, type);
        break;
      case 'friends.request.created':
      case 'friends.request.updated': {
        const all = Array.isArray(state.requests) ? [...state.requests] : [];
        const idx = all.findIndex((item) => item.requestId === payload?.requestId);
        if (idx >= 0) all[idx] = payload;
        else if (payload) all.push(payload);
        patch({ requests: all }, type);
        break;
      }
      case 'presence.updated':
        patch({
          presence: {
            ...state.presence,
            ...(payload || {}),
          },
        }, type);
        break;
      case 'visit.room.updated':
        patch({ currentRoom: payload || null }, type);
        break;
      case 'visit.interaction':
        patch({ lastVisitInteraction: payload || null }, type);
        break;
      case 'visit.request.created':
      case 'visit.request.updated': {
        const allReqs = Array.isArray(state.visitRequests) ? [...state.visitRequests] : [];
        const idx = allReqs.findIndex((r) => r.visitRequestId === payload?.visitRequestId);
        if (idx >= 0) allReqs[idx] = payload;
        else if (payload) allReqs.push(payload);
        patch({ visitRequests: allReqs }, type);
        break;
      }
      case 'visit.requests.updated':
        patch({ visitRequests: Array.isArray(payload) ? payload : [] }, type);
        break;
      case 'visit.game.request.created':
      case 'visit.game.request.updated': {
        const allGameReqs = Array.isArray(state.miniGameRequests) ? [...state.miniGameRequests] : [];
        const idx = allGameReqs.findIndex((r) => r.gameRequestId === payload?.gameRequestId);
        if (idx >= 0) allGameReqs[idx] = payload;
        else if (payload) allGameReqs.push(payload);
        patch({ miniGameRequests: allGameReqs }, type);
        break;
      }
      case 'visit.game.requests.updated':
        patch({ miniGameRequests: Array.isArray(payload) ? payload : [] }, type);
        break;
      case 'visit.game.updated':
        patch({ currentGame: payload || null }, type);
        break;
      case 'visit.game.resigned':
        // 对方认输/退出：清除 currentGame + 记录退出信息用于 UI 提示
        patch({
          currentGame: null,
          _gameResignedInfo: { winner: payload?.winner, reason: payload?.reason, at: new Date().toISOString() },
          lastGameEvent: null,
        }, type);
        break;
      case 'visit.game.event':
        patch({ lastGameEvent: payload || null }, type);
        break;
      case 'feature-flags.updated':
        patch({
          featureFlags: {
            ...state.featureFlags,
            ...(payload || {}),
          },
        }, type);
        break;
      case 'gateway.mode.updated':
        patch({
          gateway: {
            ...state.gateway,
            ...(payload || {}),
          },
        }, type);
        break;
      // ── 亲密度体系事件 ──
      case 'intimacy.level-up':
        patch({ _intimacyLevelUp: payload || null }, type);
        break;
      case 'intimacy.points-added':
        patch({ _intimacyPointsAdded: payload || null }, type);
        break;
      // ── 拜访聊天消息 ──
      case 'visit.chat':
        {
          const msgs = Array.isArray(state.visitChatMessages) ? [...state.visitChatMessages] : [];
          msgs.push(payload);
          if (msgs.length > 20) msgs.splice(0, msgs.length - 20);
          patch({ visitChatMessages: msgs }, type);
        }
        break;
      // ── 猜拳小游戏事件 ──
      case 'visit.guess-game.request':
      case 'visit.guess-game.updated':
        patch({ currentGuessGame: payload || null }, type);
        break;
      case 'visit.guess-game.settled':
        patch({ currentGuessGame: null }, type);
        break;
      default:
        break;
    }
  }

  function reset() {
    state = JSON.parse(JSON.stringify(initialState));
    emit('change', { reason: 'state.reset', state: snapshot() });
  }

  return {
    on,
    emit,
    getState: snapshot,
    patch,
    bootstrap,
    applySocialEvent,
    reset,
  };
})();
