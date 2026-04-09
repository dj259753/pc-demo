/* ═══════════════════════════════════════════
  社交接入网关（强制远端模式）
  - 始终通过 SocialRealRemoteAdapter 走真实服务端
  ═══════════════════════════════════════════ */

const SocialGateway = (() => {
  const GATEWAY_MODE = {
    REAL_REMOTE: 'real-remote',
  };

  const REMOTE_REQUIRED_METHODS = [
    'bootstrap',
    'getProfile',
    'upsertProfile',
    'getFriends',
    'sendFriendRequest',
    'respondFriendRequest',
    'getPresence',
    'setPresence',
    'heartbeat',
    'setFriendPresence',
    'createVisitRoom',
    'leaveVisitRoom',
    'getCurrentRoom',
    'sendVisitInteraction',
    'sendVisitRequest',
    'cancelVisitRequest',
    'respondVisitRequest',
    'getPendingVisitRequests',
    'sendMiniGameRequest',
    'respondMiniGameRequest',
    'startMiniGame',
    'playMiniGameMove',
    'resetMiniGame',
    'sendVisitChat',
    'getFeatureFlags',
    'updateFeatureFlags',
    'onSocialEvent',
  ];

  let mode = GATEWAY_MODE.REAL_REMOTE;
  let eventUnsubscribe = null;
  const modeListeners = new Set();
  let lastModeMeta = {
    requested: GATEWAY_MODE.REAL_REMOTE,
    mode: GATEWAY_MODE.REAL_REMOTE,
    previousMode: GATEWAY_MODE.REAL_REMOTE,
    changed: false,
    fallback: false,
    reason: 'init',
    trigger: 'init',
    updatedAt: new Date().toISOString(),
  };

  function nowISO() {
    return new Date().toISOString();
  }

  function makeMissingRemoteResult(action) {
    return {
      success: false,
      message: `remote-gateway-not-ready:${action}`,
    };
  }

  const localClient = {
    bootstrap: () => SocialBridge.bootstrap(),
    getProfile: () => SocialBridge.getProfile(),
    upsertProfile: (payload) => SocialBridge.upsertProfile(payload),
    getFriends: () => SocialBridge.getFriends(),
    sendFriendRequest: (payload) => SocialBridge.sendFriendRequest(payload),
    respondFriendRequest: (payload) => SocialBridge.respondFriendRequest(payload),
    getPresence: () => SocialBridge.getPresence(),
    setPresence: (payload) => SocialBridge.setPresence(payload),
    heartbeat: (payload) => SocialBridge.heartbeat(payload),
    setFriendPresence: (payload) => SocialBridge.setFriendPresence(payload),
    createVisitRoom: (payload) => SocialBridge.createVisitRoom(payload),
    leaveVisitRoom: (payload) => SocialBridge.leaveVisitRoom(payload),
    getCurrentRoom: () => SocialBridge.getCurrentRoom(),
    sendVisitInteraction: (payload) => SocialBridge.sendVisitInteraction(payload),
    sendVisitRequest: (payload) => SocialBridge.sendVisitRequest(payload),
    cancelVisitRequest: (payload) => typeof SocialBridge.cancelVisitRequest === 'function' ? SocialBridge.cancelVisitRequest(payload) : { success: false, message: 'bridge-unsupported:cancelVisitRequest' },
    respondVisitRequest: (payload) => SocialBridge.respondVisitRequest(payload),
    getPendingVisitRequests: () => SocialBridge.getPendingVisitRequests(),
    sendMiniGameRequest: (payload) => SocialBridge.sendMiniGameRequest(payload),
    respondMiniGameRequest: (payload) => SocialBridge.respondMiniGameRequest(payload),
    startMiniGame: (payload) => SocialBridge.startMiniGame(payload),
    playMiniGameMove: (payload) => SocialBridge.playMiniGameMove(payload),
    resetMiniGame: (payload) => SocialBridge.resetMiniGame(payload),
    sendVisitChat: (payload) => SocialBridge.sendVisitChat(payload),
    getFeatureFlags: () => SocialBridge.getFeatureFlags(),
    getOnlineUsers: () => (typeof window.SocialRealRemoteAdapter?.getOnlineUsers === 'function'
      ? window.SocialRealRemoteAdapter.getOnlineUsers()
      : Promise.resolve({ success: true, data: { users: [] } })),
    updateFeatureFlags: (payload) => SocialBridge.updateFeatureFlags(payload),
    getRemoteMockInfo: () => SocialBridge.getRemoteMockInfo(),
    onSocialEvent: (cb) => SocialBridge.onSocialEvent(cb),
    // ── 亲密度体系 ──
    addIntimacyPoints: (payload) => SocialBridge.addIntimacyPoints(payload),
    getIntimacy: (payload) => SocialBridge.getIntimacy(payload),
    getIntimacyOverview: () => SocialBridge.getIntimacyOverview(),
  };

  const remoteFallbackClient = {
    bootstrap: async () => makeMissingRemoteResult('bootstrap'),
    getProfile: async () => makeMissingRemoteResult('getProfile'),
    upsertProfile: async () => makeMissingRemoteResult('upsertProfile'),
    getFriends: async () => makeMissingRemoteResult('getFriends'),
    sendFriendRequest: async () => makeMissingRemoteResult('sendFriendRequest'),
    respondFriendRequest: async () => makeMissingRemoteResult('respondFriendRequest'),
    getPresence: async () => makeMissingRemoteResult('getPresence'),
    setPresence: async () => makeMissingRemoteResult('setPresence'),
    heartbeat: async () => makeMissingRemoteResult('heartbeat'),
    setFriendPresence: async () => makeMissingRemoteResult('setFriendPresence'),
    createVisitRoom: async () => makeMissingRemoteResult('createVisitRoom'),
    leaveVisitRoom: async () => makeMissingRemoteResult('leaveVisitRoom'),
    getCurrentRoom: async () => makeMissingRemoteResult('getCurrentRoom'),
    sendVisitInteraction: async () => makeMissingRemoteResult('sendVisitInteraction'),
    sendVisitRequest: async () => makeMissingRemoteResult('sendVisitRequest'),
    cancelVisitRequest: async () => makeMissingRemoteResult('cancelVisitRequest'),
    respondVisitRequest: async () => makeMissingRemoteResult('respondVisitRequest'),
    getPendingVisitRequests: async () => makeMissingRemoteResult('getPendingVisitRequests'),
    sendMiniGameRequest: async () => makeMissingRemoteResult('sendMiniGameRequest'),
    respondMiniGameRequest: async () => makeMissingRemoteResult('respondMiniGameRequest'),
    startMiniGame: async () => makeMissingRemoteResult('startMiniGame'),
    playMiniGameMove: async () => makeMissingRemoteResult('playMiniGameMove'),
    resetMiniGame: async () => makeMissingRemoteResult('resetMiniGame'),
    sendVisitChat: async () => makeMissingRemoteResult('sendVisitChat'),
    getFeatureFlags: async () => makeMissingRemoteResult('getFeatureFlags'),
    getOnlineUsers: async () => makeMissingRemoteResult('getOnlineUsers'),
    updateFeatureFlags: async () => makeMissingRemoteResult('updateFeatureFlags'),
    getRemoteMockInfo: async () => makeMissingRemoteResult('getRemoteMockInfo'),
    addIntimacyPoints: async () => makeMissingRemoteResult('addIntimacyPoints'),
    getIntimacy: async () => makeMissingRemoteResult('getIntimacy'),
    getIntimacyOverview: async () => makeMissingRemoteResult('getIntimacyOverview'),
    onSocialEvent: () => () => {},
  };

  function getRemoteAdapter() {
    const adapter = window.SocialRemoteAdapter;
    if (!adapter || typeof adapter !== 'object') return null;

    const valid = REMOTE_REQUIRED_METHODS.every((name) => typeof adapter[name] === 'function');
    return valid ? adapter : null;
  }

  function getRealRemoteAdapter() {
    const adapter = window.SocialRealRemoteAdapter;
    if (!adapter || typeof adapter !== 'object') return null;

    const valid = REMOTE_REQUIRED_METHODS.every((name) => typeof adapter[name] === 'function');
    return valid ? adapter : null;
  }

  function hasRemoteAdapter() {
    return !!getRemoteAdapter();
  }

  function hasRealRemoteAdapter() {
    return !!getRealRemoteAdapter();
  }

  function getClient() {
    return getRealRemoteAdapter() || remoteFallbackClient;
  }

  function cleanupEventSubscription() {
    if (typeof eventUnsubscribe === 'function') {
      try {
        eventUnsubscribe();
      } catch (_err) {
        // noop
      }
      eventUnsubscribe = null;
    }
  }

  function publishModeMeta(meta) {
    lastModeMeta = meta;
    modeListeners.forEach((listener) => {
      try {
        listener({ ...meta });
      } catch (err) {
        console.warn('[social-gateway] mode listener error:', err);
      }
    });
  }

  function applyMode(nextMode, trigger = 'manual') {
    const normalized = 'real-remote'; // 强制远端
    if (mode === normalized) {
      publishModeMeta({
        requested: normalized, mode, previousMode: mode,
        changed: false, fallback: false, reason: 'unchanged', trigger,
        updatedAt: nowISO(),
      });
      return lastModeMeta;
    }
    mode = normalized;
    cleanupEventSubscription();
    const appliedMeta = {
      requested: normalized, mode,
      previousMode: lastModeMeta.mode || mode,
      changed: true, fallback: false, reason: 'forced-remote', trigger,
      updatedAt: nowISO(),
    };
    publishModeMeta(appliedMeta);
    return appliedMeta;
  }

  function setMode(nextMode) {
    return applyMode(nextMode, 'setMode').mode;
  }

  function getMode() {
    return mode;
  }

  function getModeMeta() {
    return { ...lastModeMeta };
  }

  function onModeChange(callback) {
    if (typeof callback !== 'function') return () => {};
    modeListeners.add(callback);
    return () => {
      modeListeners.delete(callback);
    };
  }

  function onSocialEvent(callback) {
    if (typeof callback !== 'function') return () => {};

    const unsubscribe = getClient().onSocialEvent(callback);
    eventUnsubscribe = typeof unsubscribe === 'function' ? unsubscribe : null;
    return eventUnsubscribe || (() => {});
  }

  function getAdapter() {
    return getClient();
  }

  return {
    GATEWAY_MODE,
    setMode,
    applyMode,
    getMode,
    getModeMeta,
    getAdapter,
    hasRemoteAdapter,
    onModeChange,
    bootstrap: (payload) => getClient().bootstrap(payload),
    getProfile: (payload) => getClient().getProfile(payload),
    upsertProfile: (payload) => getClient().upsertProfile(payload),
    getFriends: (payload) => getClient().getFriends(payload),
    sendFriendRequest: (payload) => getClient().sendFriendRequest(payload),
    respondFriendRequest: (payload) => getClient().respondFriendRequest(payload),
    getPresence: (payload) => getClient().getPresence(payload),
    setPresence: (payload) => getClient().setPresence(payload),
    heartbeat: (payload) => getClient().heartbeat(payload),
    setFriendPresence: (payload) => getClient().setFriendPresence(payload),
    createVisitRoom: (payload) => getClient().createVisitRoom(payload),
    leaveVisitRoom: (payload) => getClient().leaveVisitRoom(payload),
    getCurrentRoom: (payload) => getClient().getCurrentRoom(payload),
    sendVisitInteraction: (payload) => getClient().sendVisitInteraction(payload),
    sendVisitRequest: (payload) => getClient().sendVisitRequest(payload),
    cancelVisitRequest: (payload) => getClient().cancelVisitRequest(payload),
    respondVisitRequest: (payload) => getClient().respondVisitRequest(payload),
    getPendingVisitRequests: (payload) => getClient().getPendingVisitRequests(payload),
    sendMiniGameRequest: (payload) => getClient().sendMiniGameRequest(payload),
    respondMiniGameRequest: (payload) => getClient().respondMiniGameRequest(payload),
    startMiniGame: (payload) => getClient().startMiniGame(payload),
    playMiniGameMove: (payload) => getClient().playMiniGameMove(payload),
    resetMiniGame: (payload) => getClient().resetMiniGame(payload),
    sendVisitChat: (payload) => getClient().sendVisitChat(payload),
    getFeatureFlags: (payload) => getClient().getFeatureFlags(payload),
    getOnlineUsers: (payload) => getClient().getOnlineUsers(payload),
    updateFeatureFlags: (payload) => getClient().updateFeatureFlags(payload),
    getRemoteMockInfo: (payload) => localClient.getRemoteMockInfo(payload),
    // ── 亲密度体系 ──
    addIntimacyPoints: (payload) => getClient().addIntimacyPoints(payload),
    getIntimacy: (payload) => getClient().getIntimacy(payload),
    getIntimacyOverview: () => getClient().getIntimacyOverview(),
    onSocialEvent,
  };
})();

