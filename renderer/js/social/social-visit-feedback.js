/* ═══════════════════════════════════════════
   拜访会话反馈层（前端）
   负责进入/离开拜访的轻量提示，不记录留痕
   ═══════════════════════════════════════════ */

const SocialVisitFeedback = (() => {
  let initialized = false;
  let lastRoomId = null;
  let lastInteractionId = null;
  let lastGameEventId = null;

  const INTERACTION_TEXT = {
    wave: '发起了打招呼动作',
    handshake: '发起了握手动作',
    hug: '发起了贴贴动作',
    highfive: '发起了击掌动作',
    'sync-walk': '发起了同步散步',
    'invite-game': '发起了小游戏邀请',
  };

  function bubble(text, duration = 2200) {
    const msg = String(text || '').trim();
    if (!msg) return;

    if (typeof BubbleSystem !== 'undefined' && BubbleSystem.show) {
      BubbleSystem.show(msg, duration);
      return;
    }

    console.log('[social-visit-feedback]', msg);
  }

  function roomDisplayName(room) {
    if (!room) return '对方';
    return room.guestOwnerName || room.guestPetName || room.guestUserId || '对方';
  }

  function emitInteractionFeedback(interaction) {
    if (!interaction) return;
    const text = INTERACTION_TEXT[interaction.action] || '发起了互动动作';
    const actor = interaction.actorPetName || interaction.actorOwnerName || '小伙伴';
    bubble(`${actor}${text}`, 1800);
  }

  function emitGameFeedback(gameEvent) {
    if (!gameEvent) return;
    const kind = String(gameEvent.kind || '').trim();
    const payload = gameEvent.payload || {};
    const winner = String(payload.winner || '').trim();

    if (kind === 'started') {
      bubble('五子棋对局已开始', 1800);
      return;
    }

    if (kind === 'reset') {
      bubble('五子棋已重开一局', 1800);
      return;
    }

    if (kind === 'finished') {
      const winnerText = winner === 'draw'
        ? '平局'
        : `${winner === 'black' ? '黑子' : '白子'}获胜`;
      bubble(`五子棋本局结束：${winnerText}`, 2200);
    }
  }

  function onStateChange(payload = {}) {
    const nextState = payload.state || SocialState.getState();
    const room = nextState.currentRoom || null;
    const currentRoomId = room?.roomId || null;

    if (!lastRoomId && currentRoomId) {
      bubble(`已进入与 ${roomDisplayName(room)} 的拜访会话`, 2000);
    } else if (lastRoomId && !currentRoomId) {
      bubble('拜访会话已结束，已恢复单宠陪伴', 2000);
    } else if (lastRoomId && currentRoomId && lastRoomId !== currentRoomId) {
      bubble(`已切换到与 ${roomDisplayName(room)} 的拜访会话`, 2000);
    }
    lastRoomId = currentRoomId;

    const interaction = nextState.lastVisitInteraction || null;
    const interactionId = interaction?.interactionId || null;
    if (interactionId && interactionId !== lastInteractionId) {
      emitInteractionFeedback(interaction);
      lastInteractionId = interactionId;
    }

    const gameEvent = nextState.lastGameEvent || null;
    const gameEventId = gameEvent?.eventId || null;
    if (gameEventId && gameEventId !== lastGameEventId) {
      emitGameFeedback(gameEvent);
      lastGameEventId = gameEventId;
    }
  }

  function init() {
    if (initialized) return;
    initialized = true;

    const snapshot = SocialState.getState();
    lastRoomId = snapshot.currentRoom?.roomId || null;
    lastInteractionId = snapshot.lastVisitInteraction?.interactionId || null;
    lastGameEventId = snapshot.lastGameEvent?.eventId || null;

    SocialState.on('change', onStateChange);
  }

  return {
    init,
  };
})();
