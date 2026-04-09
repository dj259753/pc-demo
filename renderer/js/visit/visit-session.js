/* ═══════════════════════════════════════════
   拜访会话编排层（renderer 壳）
   负责 room 生命周期和拜访期间行为抑制开关
   ═══════════════════════════════════════════ */

const VisitSession = (() => {
  let initialized = false;
  let suppressingBehavior = false;
  let lastRoomId = null;
  let lastInteractionId = null;

  function setBehaviorSuppression(enabled) {
    suppressingBehavior = !!enabled;
    if (typeof BehaviorEngine === 'undefined') return;

    if (suppressingBehavior) {
      BehaviorEngine.pause();
    } else {
      BehaviorEngine.resume();
    }
  }

  function getRoomLabel(room) {
    if (!room) return '';
    return room.guestOwnerName || room.guestPetName || room.guestUserId || '对方';
  }

  function playVisitSceneInteraction(interaction, roomLabel) {
    if (!interaction || typeof SpriteRenderer === 'undefined') return;
    const mood = (typeof PetState !== 'undefined' ? PetState.mood : '') || 'peaceful';
    const action = String(interaction.action || '').trim();
    if (!action) return;

    const hostAnim = typeof SpriteRenderer.getQCVisitAction === 'function'
      ? SpriteRenderer.getQCVisitAction(action, mood)
      : null;
    if (hostAnim) {
      SpriteRenderer.playOnce(hostAnim, () => {});
    }

    if (typeof SpriteRenderer.playGuestVisitAction === 'function') {
      SpriteRenderer.playGuestVisitAction(action, 'peaceful', { label: roomLabel });
    }
  }

  function syncVisitScene(state = SocialState.getState()) {
    if (typeof SpriteRenderer === 'undefined') return;

    const room = state.currentRoom || null;
    const roomId = room?.roomId || null;
    const roomLabel = getRoomLabel(room);

    if (!room) {
      lastRoomId = null;
      lastInteractionId = null;
      if (typeof SpriteRenderer.setGuestVisible === 'function') {
        SpriteRenderer.setGuestVisible(false);
      }
      return;
    }

    if (roomId !== lastRoomId) {
      lastRoomId = roomId;
      lastInteractionId = null;
      if (typeof SpriteRenderer.setGuestStand === 'function') {
        SpriteRenderer.setGuestStand('peaceful', { label: roomLabel });
      }
    } else if (typeof SpriteRenderer.setGuestVisible === 'function') {
      SpriteRenderer.setGuestVisible(true, { label: roomLabel });
    }

    const interaction = state.lastVisitInteraction || null;
    const interactionId = interaction?.interactionId || null;
    if (interactionId && interactionId !== lastInteractionId) {
      lastInteractionId = interactionId;
      playVisitSceneInteraction(interaction, roomLabel);
    }
  }

  function syncByState(state = SocialState.getState()) {
    const inVisit = !!state.currentRoom;
    setBehaviorSuppression(inVisit);
    syncVisitScene(state);
  }

  function init() {
    if (initialized) return;
    initialized = true;

    SocialState.on('change', (payload = {}) => {
      syncByState(payload.state || SocialState.getState());
    });

    syncByState();
  }

  async function createRoom(payload = {}) {
    const res = await SocialGateway.createVisitRoom(payload);
    if (res?.success && res.data) {
      SocialState.patch({ currentRoom: res.data }, 'visit.room.local-create');
      SocialState.patch({
        presence: {
          ...SocialState.getState().presence,
          sessionStatus: 'visiting',
        },
      }, 'visit.session.enter');
    }
    return res;
  }

  async function leaveRoom(reason = 'manual-leave') {
    const res = await SocialGateway.leaveVisitRoom({ reason });
    if (res?.success) {
      SocialState.patch({ currentRoom: null }, 'visit.room.local-leave');
      SocialState.patch({
        presence: {
          ...SocialState.getState().presence,
          sessionStatus: 'idle',
        },
      }, 'visit.session.leave');
    }
    return res;
  }

  async function sendInteraction(action, payload = {}) {
    const res = await SocialGateway.sendVisitInteraction({ action, payload });
    if (res?.success && res.data) {
      SocialState.patch({
        lastVisitInteraction: res.data,
      }, 'visit.interaction.sent');
    }
    return res;
  }

  async function sendMiniGameRequest(gameType, payload = {}) {
    return SocialGateway.sendMiniGameRequest({ gameType, payload });
  }

  async function respondMiniGameRequest(gameRequestId, action, payload = {}) {
    return SocialGateway.respondMiniGameRequest({ gameRequestId, action, payload });
  }

  async function startMiniGame(gameType, payload = {}) {
    return SocialGateway.startMiniGame({ gameType, payload });
  }

  async function playMiniGameMove(gameType, payload = {}) {
    return SocialGateway.playMiniGameMove({ gameType, payload });
  }

  async function resetMiniGame(gameType, payload = {}) {
    return SocialGateway.resetMiniGame({ gameType, payload });
  }

  function isInVisit() {
    return !!SocialState.getState().currentRoom;
  }

  function isBehaviorSuppressed() {
    return suppressingBehavior;
  }

  return {
    init,
    createRoom,
    leaveRoom,
    sendInteraction,
    sendMiniGameRequest,
    respondMiniGameRequest,
    startMiniGame,
    playMiniGameMove,
    resetMiniGame,
    isInVisit,
    isBehaviorSuppressed,
  };
})();
