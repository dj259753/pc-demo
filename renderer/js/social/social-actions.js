/* ═══════════════════════════════════════════
  社交动作层（最小功能闭环）
  统一封装 profile/friends/presence/visit 的可执行动作
  ═══════════════════════════════════════════ */

const SocialActions = (() => {
  function patchFriendsData(data = {}, reason = 'friends.synced') {
    SocialState.patch({
      friends: Array.isArray(data.friends) ? data.friends : SocialState.getState().friends,
      requests: Array.isArray(data.requests) ? data.requests : SocialState.getState().requests,
    }, reason);
  }

  async function hydrateFriendsAndRequests() {
    const res = await SocialGateway.getFriends();
    if (res?.success && res.data) {
      patchFriendsData(res.data, 'friends.hydrated');
    }
    return res;
  }

  async function adoptProfile(ownerName, petName, petGender) {
    const payload = {
      ownerName: String(ownerName || '').trim(),
      petName: String(petName || '').trim(),
      petGender: String(petGender || 'gg').trim(),
    };

    const res = await SocialGateway.upsertProfile(payload);
    if (res?.success && res.data) {
      SocialState.patch({
        // 服务端返回的 data 可能没有 petGender，强制用本地传入值兜底
        profile: { ...res.data, petGender: res.data.petGender || payload.petGender },
        requiresAdoption: false,
      }, 'profile.adopted');
    }
    return res;
  }

  async function sendFriendRequest(targetCode, message = '', options = {}) {
    const payload = {
      targetCode: String(targetCode || '').trim(),
      message: String(message || '').trim(),
      allowLoopback: !!options.allowLoopback,
    };

    const res = await SocialGateway.sendFriendRequest(payload);
    if (res?.success && res.data) {
      patchFriendsData(res.data, 'friends.request.sent');
    }
    return res;
  }

  async function respondFriendRequest(requestId, action) {
    const payload = {
      requestId: String(requestId || '').trim(),
      action: String(action || '').trim(),
    };

    const res = await SocialGateway.respondFriendRequest(payload);
    if (res?.success && res.data) {
      patchFriendsData(res.data, 'friends.request.responded');
    }
    return res;
  }

  async function setPresence(userStatus, statusMessage = '') {
    const current = SocialState.getState();
    const payload = {
      userStatus: String(userStatus || current.presence?.userStatus || 'online').trim(),
      sessionStatus: String(current.presence?.sessionStatus || 'idle').trim(),
      statusMessage: String(statusMessage || current.presence?.statusMessage || '').trim(),
    };

    const res = await SocialGateway.setPresence(payload);
    if (res?.success && res.data) {
      SocialState.patch({
        presence: {
          ...current.presence,
          ...res.data,
        },
      }, 'presence.changed');
    }
    return res;
  }

  async function heartbeat(options = {}) {
    const payload = {
      keepOnline: options.keepOnline !== false,
    };

    const res = await SocialGateway.heartbeat(payload);
    if (res?.success && res.data) {
      const nextPatch = {};
      if (res.data.presence) nextPatch.presence = { ...SocialState.getState().presence, ...res.data.presence };
      if (Array.isArray(res.data.friends)) nextPatch.friends = res.data.friends;
      if (Array.isArray(res.data.requests)) nextPatch.requests = res.data.requests;
      if (Object.prototype.hasOwnProperty.call(res.data, 'currentRoom')) {
        nextPatch.currentRoom = res.data.currentRoom || null;
      }
      if (Object.prototype.hasOwnProperty.call(res.data, 'currentGame')) {
        nextPatch.currentGame = res.data.currentGame || null;
      }
      if (Array.isArray(res.data.visitRequests)) {
        nextPatch.visitRequests = res.data.visitRequests;
      }
      if (Array.isArray(res.data.miniGameRequests)) {
        nextPatch.miniGameRequests = res.data.miniGameRequests;
      }
      if (Object.keys(nextPatch).length > 0) {
        SocialState.patch(nextPatch, 'presence.heartbeat.synced');
      }
    }

    return res;
  }

  async function setFriendPresence(friendUserId, userStatus, ttlSeconds = 120) {
    const payload = {
      friendUserId: String(friendUserId || '').trim(),
      userStatus: String(userStatus || '').trim(),
      ttlSeconds,
    };

    const res = await SocialGateway.setFriendPresence(payload);
    if (res?.success) {
      await hydrateFriendsAndRequests();
    }
    return res;
  }

  async function createVisitRoomWithFriend(friendUserId, intent = 'say-hi') {
    const payload = {
      guestUserId: String(friendUserId || '').trim(),
      intent: String(intent || 'say-hi').trim(),
    };
    return VisitSession.createRoom(payload);
  }

  async function leaveVisitRoom(reason = 'manual-leave') {
    return VisitSession.leaveRoom(reason);
  }

  async function sendVisitInteraction(action, payload = {}) {
    return VisitSession.sendInteraction(action, payload);
  }

  async function sendVisitChat(text) {
    const payload = {
      text: String(text || '').trim().substring(0, 80),
      roomId: SocialState.getState().currentRoom?.roomId || '',
      timestamp: Date.now(),
    };
    if (!payload.text) return { success: false, message: 'empty-text' };
    if (!payload.roomId) return { success: false, message: 'not-in-visit' };

    const res = await SocialGateway.sendVisitChat(payload);
    if (res?.success) {
      // 本地也添加到消息列表
      const profile = SocialState.getState().profile || {};
      SocialState.applySocialEvent({
        type: 'visit.chat',
        payload: {
          text: payload.text,
          senderId: profile.userId || 'me',
          senderName: profile.ownerName || '我',
          timestamp: payload.timestamp,
          isLocal: true,
        },
      });
    }
    return res;
  }

  async function sendVisitRequest(targetUserId, intent = 'say-hi', message = '') {
    const payload = {
      targetUserId: String(targetUserId || '').trim(),
      intent: String(intent || 'say-hi').trim(),
      message: String(message || '').trim(),
    };
    const res = await SocialGateway.sendVisitRequest(payload);
    if (res?.success && res.data?.requests) {
      SocialState.patch({ visitRequests: res.data.requests }, 'visit.request.sent');
    }
    return res;
  }

  async function cancelVisitRequest(param) {
    // 支持两种调用：字符串(visitRequestId) 或 对象({ targetUserId / visitRequestId })
    let payload;
    if (typeof param === 'string' || typeof param === 'number') {
      payload = { visitRequestId: String(param).trim() };
    } else if (param && typeof param === 'object') {
      payload = { ...param };
    } else {
      payload = {};
    }
    const res = await SocialGateway.cancelVisitRequest(payload);
    // 取消成功后刷新 pending 列表
    if (res?.success) {
      try {
        const fresh = await SocialGateway.getPendingVisitRequests();
        if (fresh?.success && fresh.data !== undefined && fresh.data !== null) {
          SocialState.patch({ visitRequests: Array.isArray(fresh.data) ? fresh.data : [] }, 'visit.request.cancelled');
        }
      } catch (_) {}
    }
    return res;
  }

  async function respondVisitRequest(visitRequestId, action) {
    const payload = {
      visitRequestId: String(visitRequestId || '').trim(),
      action: String(action || '').trim(),
    };
    const res = await SocialGateway.respondVisitRequest(payload);
    if (res?.success && res.data) {
      const nextPatch = {};
      if (res.data.requests) nextPatch.visitRequests = res.data.requests;
      if (res.data.room) nextPatch.currentRoom = res.data.room;
      if (Object.keys(nextPatch).length > 0) {
        SocialState.patch(nextPatch, 'visit.request.responded');
      }
    }
    return res;
  }

  async function sendMiniGameRequest(gameType, payload = {}) {
    const res = await VisitSession.sendMiniGameRequest(gameType, payload);
    if (res?.success && res.data?.request) {
      SocialState.applySocialEvent({ type: 'visit.game.request.created', payload: res.data.request });
    }
    return res;
  }

  async function respondMiniGameRequest(gameRequestId, action, payload = {}) {
    const res = await VisitSession.respondMiniGameRequest(gameRequestId, action, payload);
    if (res?.success && res.data?.request) {
      SocialState.applySocialEvent({ type: 'visit.game.request.updated', payload: res.data.request });
    }
    if (res?.success && res.data?.game) {
      SocialState.applySocialEvent({ type: 'visit.game.updated', payload: res.data.game });
    }
    if (res?.success && res.data?.event) {
      SocialState.applySocialEvent({ type: 'visit.game.event', payload: res.data.event });
    }
    return res;
  }

  async function startMiniGame(gameType, payload = {}) {
    return VisitSession.startMiniGame(gameType, payload);
  }

  async function playMiniGameMove(gameType, payload = {}) {
    return VisitSession.playMiniGameMove(gameType, payload);
  }

  async function resetMiniGame(gameType, payload = {}) {
    return VisitSession.resetMiniGame(gameType, payload);
  }

  async function updateFeatureFlags(patch = {}) {
    const res = await SocialGateway.updateFeatureFlags(patch || {});
    if (res?.success && res.data) {
      SocialState.patch({
        featureFlags: {
          ...SocialState.getState().featureFlags,
          ...res.data,
        },
      }, 'feature-flags.updated');
    }
    return res;
  }

  async function setRemoteEnabled(enabled) {
    if (typeof SocialBootstrap === 'undefined' || typeof SocialBootstrap.setRemoteEnabled !== 'function') {
      return { success: false, message: 'social-bootstrap-not-ready' };
    }
    return SocialBootstrap.setRemoteEnabled(!!enabled);
  }

  async function getRemoteMockInfo() {
    return SocialGateway.getRemoteMockInfo();
  }

  // ── 亲密度体系 ──

  /**
   * 为好友增加亲密积分（前端调用入口）
   */
  async function addIntimacyPoints(friendUserId, eventType, amountOverride) {
    const res = await SocialGateway.addIntimacyPoints({
      friendUserId: String(friendUserId || '').trim(),
      eventType: String(eventType || '').trim(),
      amountOverride: amountOverride !== undefined ? Number(amountOverride) : undefined,
    });
    if (res?.success && res.data) {
      // 触发前端状态更新
      if (res.data.leveledUp) {
        const levelUpPayload = res.data;
        SocialState.patch({ _intimacyLevelUp: levelUpPayload }, 'intimacy.level-up');
        // 刷新好友列表以获取最新数据
        await hydrateFriendsAndRequests();
      }
    }
    return res;
  }

  /**
   * 获取单个好友的亲密度
   */
  async function getIntimacy(friendUserId) {
    return SocialGateway.getIntimacy({
      friendUserId: String(friendUserId || '').trim(),
    });
  }

  /**
   * 获取所有好友的亲密度概览
   */
  async function getIntimacyOverview() {
    return SocialGateway.getIntimacyOverview();
  }

  function getPendingInboundRequests() {
    const state = SocialState.getState();
    return (state.requests || []).filter((item) => item.direction === 'inbound' && item.state === 'pending');
  }

  function installDebugAPI() {
    if (window.__SOCIAL_DEV_API_READY__) return;
    window.__SOCIAL_DEV_API_READY__ = true;

    window.SocialDev = {
      state: () => SocialState.getState(),
      adoptProfile,
      hydrateFriendsAndRequests,
      setPresence,
      heartbeat,
      setFriendPresence,
      sendFriendRequest,
      respondFriendRequest,
      getPendingInboundRequests,
      createVisitRoomWithFriend,
      leaveVisitRoom,
      sendVisitInteraction,
      sendVisitChat,
      sendVisitRequest,
      respondVisitRequest,
      sendMiniGameRequest,
      respondMiniGameRequest,
      startMiniGame,
      playMiniGameMove,
      resetMiniGame,
      updateFeatureFlags,
      setRemoteEnabled,
      getRemoteMockInfo,
      // ── 亲密度体系 ──
      addIntimacyPoints,
      getIntimacy,
      getIntimacyOverview,
    };

    console.log('[social] SocialDev API ready. Try: SocialDev.state() / SocialDev.adoptProfile("主人", "宠物")');
  }

  return {
    hydrateFriendsAndRequests,
    adoptProfile,
    sendFriendRequest,
    respondFriendRequest,
    setPresence,
    heartbeat,
    setFriendPresence,
    createVisitRoomWithFriend,
    leaveVisitRoom,
    sendVisitInteraction,
    sendVisitChat,
    sendVisitRequest,
    cancelVisitRequest,
    respondVisitRequest,
    sendMiniGameRequest,
    respondMiniGameRequest,
    startMiniGame,
    playMiniGameMove,
    resetMiniGame,
    updateFeatureFlags,
    setRemoteEnabled,
    getRemoteMockInfo,
    getPendingInboundRequests,
    // ── 亲密度体系 ──
    addIntimacyPoints,
    getIntimacy,
    getIntimacyOverview,
    installDebugAPI,
  };
})();

