/* ═══════════════════════════════════════════
   社交桥接层（renderer -> main IPC）
   统一封装调用，避免业务模块直接散落调用 electronAPI
   ═══════════════════════════════════════════ */

const SocialBridge = (() => {
  function hasAPI() {
    return !!window.electronAPI;
  }

  async function call(name, payload) {
    if (!hasAPI() || typeof window.electronAPI[name] !== 'function') {
      return { success: false, message: `missing-api:${name}` };
    }
    try {
      return await window.electronAPI[name](payload);
    } catch (err) {
      return { success: false, message: err?.message || String(err) };
    }
  }

  function onSocialEvent(callback) {
    if (!hasAPI() || typeof window.electronAPI.onSocialEvent !== 'function') {
      return () => {};
    }
    const unsubscribe = window.electronAPI.onSocialEvent((evt) => callback(evt || {}));
    return typeof unsubscribe === 'function' ? unsubscribe : () => {};
  }

  return {
    bootstrap: () => call('socialBootstrap'),
    getProfile: () => call('socialGetProfile'),
    upsertProfile: (payload) => call('socialUpsertProfile', payload),
    getFriends: () => call('socialGetFriends'),
    sendFriendRequest: (payload) => call('socialSendFriendRequest', payload),
    respondFriendRequest: (payload) => call('socialRespondFriendRequest', payload),
    getPresence: () => call('socialGetPresence'),
    setPresence: (payload) => call('socialSetPresence', payload),
    heartbeat: (payload) => call('socialHeartbeat', payload),
    setFriendPresence: (payload) => call('socialSetFriendPresence', payload),
    createVisitRoom: (payload) => call('socialCreateVisitRoom', payload),
    leaveVisitRoom: (payload) => call('socialLeaveVisitRoom', payload),
    getCurrentRoom: () => call('socialGetCurrentRoom'),
    sendVisitInteraction: (payload) => call('socialSendVisitInteraction', payload),
    sendVisitRequest: (payload) => call('socialSendVisitRequest', payload),
    respondVisitRequest: (payload) => call('socialRespondVisitRequest', payload),
    getPendingVisitRequests: () => call('socialGetPendingVisitRequests'),
    sendMiniGameRequest: (payload) => call('socialSendMiniGameRequest', payload),
    respondMiniGameRequest: (payload) => call('socialRespondMiniGameRequest', payload),
    startMiniGame: (payload) => call('socialStartMiniGame', payload),
    playMiniGameMove: (payload) => call('socialPlayMiniGameMove', payload),
    resetMiniGame: (payload) => call('socialResetMiniGame', payload),
    sendVisitChat: (payload) => call('socialSendVisitChat', payload),
    getFeatureFlags: () => call('socialGetFeatureFlags'),
    updateFeatureFlags: (payload) => call('socialUpdateFeatureFlags', payload),
    getRemoteMockInfo: () => call('socialGetRemoteMockInfo'),

  // ── 亲密度体系 ──
  addIntimacyPoints: (payload) => call('socialAddIntimacyPoints', payload),
  getIntimacy: (payload) => call('socialGetIntimacy', payload),
  getIntimacyOverview: () => call('socialGetIntimacyOverview'),
    onSocialEvent,
  };
})();
