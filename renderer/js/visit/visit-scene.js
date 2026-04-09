/* ═══════════════════════════════════════════
   拜访模式桌面表现层
   - 双宠同屏 HUD
   - 客宠右键互动菜单
   - 小游戏邀请卡
   - 独立五子棋窗口联动
   - 快速对话（气泡聊天）
   - 猜拳小游戏
   ═══════════════════════════════════════════ */

const VisitScene = (() => {
  let initialized = false;
  let currentRoomId = null;
  let currentRequestId = null;
  let currentGameId = null;
  let gomokuWindowOpened = false;

  // ─── 猜拳状态 ───
  let guessPhase = 'idle'; // idle | invited | countdown | chosen | settled
  let guessCountdownTimer = null;
  let guessSettleTimer = null;
  let lastChatSentAt = 0;

  const GUEST_ACTION_LABEL = {
    wave: '打招呼',
    handshake: '握手',
    hug: '贴贴',
    highfive: '击掌',
    'invite-game': '邀请五子棋',
    'guess-game': '猜拳',
  };

  function $(id) {
    return document.getElementById(id);
  }

  function toast(message, duration = 1800) {
    if (typeof BubbleSystem !== 'undefined' && BubbleSystem?.show) {
      BubbleSystem.show(message, duration);
      return;
    }
    console.log('[visit-scene]', message);
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[ch] || ch));
  }

  function getRoomLabel(room) {
    if (!room) return '';
    const owner = String(room.guestOwnerName || '').trim();
    const pet = String(room.guestPetName || '').trim();
    if (owner && pet) return `${owner} · ${pet}`;
    return owner || pet || room.guestUserId || '对方';
  }

  function getInboundPendingGameRequest(state = SocialState.getState()) {
    const list = Array.isArray(state.miniGameRequests) ? state.miniGameRequests : [];
    return list.find((item) => item && item.direction === 'inbound' && item.state === 'pending') || null;
  }

  // ═══════════════════════════════════════════
  //  快速对话
  // ═══════════════════════════════════════════

  function showChatInput() {
    const panel = $('visit-chat-input');
    if (!panel) return;
    panel.classList.remove('hidden');
    panel.setAttribute('aria-hidden', 'false');
    const input = $('visit-chat-text');
    if (input) input.focus();
  }

  function hideChatInput() {
    const panel = $('visit-chat-input');
    if (!panel) return;
    panel.classList.add('hidden');
    panel.setAttribute('aria-hidden', 'true');
    const input = $('visit-chat-text');
    if (input) input.value = '';
  }

  async function handleSendChat() {
    const input = $('visit-chat-text');
    if (!input) return;
    const text = String(input.value || '').trim();
    if (!text) return;

    // 3 秒节流
    const now = Date.now();
    if (now - lastChatSentAt < 3000) {
      toast('说话太快了，慢一点~', 1400);
      return;
    }

    lastChatSentAt = now;
    input.value = '';

    // 本地主宠头顶气泡显示
    if (typeof BubbleSystem !== 'undefined' && BubbleSystem.show) {
      BubbleSystem.show(text, 5000, { force: true, expandable: false });
    }

    // 发送给对方
    const res = await SocialActions.sendVisitChat(text);
    if (!res?.success) {
      console.warn('[visit-scene] 聊天发送失败:', res?.message);
    }
  }

  function onVisitChatReceived(payload) {
    if (!payload) return;
    const from = payload.senderName || '对方';
    const text = String(payload.text || '').trim();
    if (!text) return;

    // 在客宠头顶显示金色气泡
    if (typeof BubbleSystem !== 'undefined' && BubbleSystem.showGuestBubble) {
      BubbleSystem.showGuestBubble(`${from}: ${text}`, 5000);
    }
  }

  // ═══════════════════════════════════════════
  //  猜拳小游戏
  // ═══════════════════════════════════════════

  function showGuessPanel() {
    const panel = $('guess-game-panel');
    if (!panel) return;
    panel.classList.remove('hidden');
    panel.setAttribute('aria-hidden', 'false');
  }

  function hideGuessPanel() {
    const panel = $('guess-game-panel');
    if (!panel) return;
    panel.classList.add('hidden');
    panel.setAttribute('aria-hidden', 'true');
    // 重置按钮状态
    document.querySelectorAll('.guess-choice-btn').forEach((btn) => {
      btn.disabled = false;
    });
    const countdown = $('guess-game-countdown');
    const result = $('guess-game-result');
    if (countdown) { countdown.classList.add('hidden'); countdown.textContent = ''; }
    if (result) { result.classList.add('hidden'); result.textContent = ''; }
  }

  function handleGuessGameInvite() {
    if (!VisitSession?.isInVisit?.()) {
      toast('请先进入拜访', 1800);
      return;
    }
    if (guessPhase !== 'idle') {
      toast('当前有进行中的猜拳', 1800);
      return;
    }

    // 发起猜拳邀请（走 visit.interaction 通道，action=guess-game）
    SocialActions.sendVisitInteraction('guess-game', { source: 'guest-context-menu' })
      .then((res) => {
        if (res?.success) {
          toast('猜拳邀请已发出', 1600);
          guessPhase = 'invited';
        } else {
          toast(`猜拳邀请失败：${res?.message || '未知错误'}`, 2200);
        }
      });
  }

  function startGuessCountdown() {
    guessPhase = 'countdown';
    GuessGameEngine.reset();
    GuessGameEngine.start();

    showGuessPanel();
    const countdown = $('guess-game-countdown');
    const choices = $('guess-game-choices');
    const result = $('guess-game-result');
    if (countdown) { countdown.classList.remove('hidden'); }
    if (choices) { choices.classList.remove('hidden'); }
    if (result) { result.classList.add('hidden'); result.textContent = ''; }

    let count = 3;
    if (countdown) countdown.textContent = String(count);

    if (guessCountdownTimer) clearInterval(guessCountdownTimer);
    guessCountdownTimer = setInterval(() => {
      count--;
      if (count <= 0) {
        clearInterval(guessCountdownTimer);
        guessCountdownTimer = null;
        if (countdown) countdown.textContent = '出拳！';
        // 5 秒超时：如果还没出拳，自动随机
        setTimeout(() => {
          if (guessPhase === 'countdown' || guessPhase === 'chosen') {
            if (!GuessGameEngine.getState().hostChoice) {
              const random = ['rock', 'paper', 'scissors'][Math.floor(Math.random() * 3)];
              GuessGameEngine.submitChoice('host', random);
              submitGuessChoice(random);
            }
          }
        }, 5000);
        return;
      }
      if (countdown) countdown.textContent = String(count);
    }, 1000);
  }

  function submitGuessChoice(choice) {
    GuessGameEngine.submitChoice('host', choice);

    // 禁用按钮
    document.querySelectorAll('.guess-choice-btn').forEach((btn) => {
      btn.disabled = true;
    });

    // 发送给对方
    SocialGateway.sendVisitInteraction({
      action: 'guess-game-choice',
      choice,
      roomId: SocialState.getState().currentRoom?.roomId || '',
    });

    guessPhase = 'chosen';
    const countdown = $('guess-game-countdown');
    if (countdown) { countdown.textContent = '已出拳'; countdown.classList.add('hidden'); }
  }

  function settleGuessGame(payload) {
    guessPhase = 'settled';
    if (guessCountdownTimer) { clearInterval(guessCountdownTimer); guessCountdownTimer = null; }

    const result = $('guess-game-result');
    const countdown = $('guess-game-countdown');
    const myChoice = payload.hostChoice || GuessGameEngine.getState().hostChoice;
    const theirChoice = payload.guestChoice || '?';
    const winner = payload.winner;

    const labels = GuessGameEngine.LABELS;
    const myLabel = labels[myChoice] || myChoice;
    const theirLabel = labels[theirChoice] || theirChoice;

    if (countdown) countdown.classList.add('hidden');

    if (winner === 'draw') {
      if (result) {
        result.textContent = `平局！双方都出了${myLabel}`;
        result.classList.remove('hidden');
      }
      toast('平局！再来一次', 1800);
      // 自动重试
      guessSettleTimer = setTimeout(() => {
        if (guessPhase === 'settled') {
          startGuessCountdown();
        }
      }, 2500);
    } else {
      const iWon = winner === 'host';
      if (result) {
        result.textContent = iWon
          ? `你赢了！${myLabel} 胜 ${theirLabel} 🎉`
          : `你输了！${theirLabel} 胜 ${myLabel} 😢`;
        result.classList.remove('hidden');
      }
      toast(iWon ? '你赢了！🎉' : '你输了~', 2200);

      // 播放结果动画
      if (typeof SpriteRenderer !== 'undefined') {
        if (iWon) {
          SpriteRenderer.playOnce(SpriteRenderer.getQCVisitAction('wave', 'happy') || SpriteRenderer.getQCStand('happy'), () => {});
          if (typeof SpriteRenderer.playGuestVisitAction === 'function') {
            SpriteRenderer.playGuestVisitAction('wave', 'sad', { label: '' });
          }
        } else {
          if (typeof SpriteRenderer.playGuestVisitAction === 'function') {
            SpriteRenderer.playGuestVisitAction('wave', 'happy', { label: '' });
          }
        }
      }

      // 5 秒后自动关闭面板
      guessSettleTimer = setTimeout(() => {
        hideGuessPanel();
        guessPhase = 'idle';
      }, 5000);
    }
  }

  function showGuessRequestCard(fromLabel) {
    const card = $('guess-game-request-card');
    const text = $('guess-game-request-text');
    if (!card || !text) return;
    text.textContent = `${fromLabel || '对方'} 邀请你一起猜拳！`;
    card.classList.remove('hidden');
    card.setAttribute('aria-hidden', 'false');
  }

  function hideGuessRequestCard() {
    const card = $('guess-game-request-card');
    if (!card) return;
    card.classList.add('hidden');
    card.setAttribute('aria-hidden', 'true');
  }

  function handleGuessRequestAccept() {
    hideGuessRequestCard();
    startGuessCountdown();
    // 通知对方
    SocialGateway.sendVisitInteraction({
      action: 'guess-game-accept',
      roomId: SocialState.getState().currentRoom?.roomId || '',
    });
  }

  function handleGuessRequestReject() {
    hideGuessRequestCard();
    SocialGateway.sendVisitInteraction({
      action: 'guess-game-reject',
      roomId: SocialState.getState().currentRoom?.roomId || '',
    });
    toast('已拒绝猜拳邀请', 1600);
  }

  // ═══════════════════════════════════════════
  //  互动菜单
  // ═══════════════════════════════════════════

  function hideGuestContextMenu() {
    const menu = $('guest-context-menu');
    if (!menu) return;
    menu.classList.add('hidden');
    menu.setAttribute('aria-hidden', 'true');
  }

  function showGuestContextMenu(x, y) {
    const menu = $('guest-context-menu');
    if (!menu || !VisitSession?.isInVisit?.()) return;
    menu.classList.remove('hidden');
    menu.setAttribute('aria-hidden', 'false');
    const margin = 8;
    const rect = menu.getBoundingClientRect();
    const maxLeft = window.innerWidth - rect.width - margin;
    const maxTop = window.innerHeight - rect.height - margin;
    menu.style.left = `${Math.max(margin, Math.min(x, maxLeft))}px`;
    menu.style.top = `${Math.max(margin, Math.min(y, maxTop))}px`;
  }

  async function handleGuestAction(action) {
    hideGuestContextMenu();
    if (!VisitSession?.isInVisit?.()) {
      toast('请先进入拜访', 1800);
      return;
    }

    if (action === 'open-social') {
      if (window.electronAPI?.openSocialWindow) {
        window.electronAPI.openSocialWindow();
      }
      return;
    }

    if (action === 'leave-room') {
      await handleLeaveRoom();
      return;
    }

    if (action === 'invite-game') {
      await handleInviteGame();
      return;
    }

    if (action === 'guess-game') {
      handleGuessGameInvite();
      return;
    }

    const res = await SocialActions.sendVisitInteraction(action, { source: 'guest-context-menu' });
    if (res?.success) {
      toast(`已发送${GUEST_ACTION_LABEL[action] || '互动'}`, 1600);
    } else {
      const detail = res?.message || '未知错误';
      console.warn('[visit-scene] 互动失败:', detail);
      toast(`互动失败：${detail}`, 2200);
    }
  }

  async function handleLeaveRoom() {
    const res = await SocialActions.leaveVisitRoom('visit-hud-manual-leave');
    if (res?.success) {
      toast('已离开拜访', 1800);
      window.electronAPI?.closeGomokuWindow?.();
      hideChatInput();
      hideGuessPanel();
      hideGuessRequestCard();
      guessPhase = 'idle';
    } else {
      const detail = res?.message || '未知错误';
      // ── 服务端房间已不存在时，强制本地清理，防止卡死 ──
      if (detail.includes('not-in-visit') || detail.includes('visit-room-not-found')) {
        console.warn('[visit-scene] 服务端无活跃房间，强制本地退出');
        SocialState.patch({ currentRoom: null }, 'visit.room.force-leave');
        if (typeof VisitSession !== 'undefined' && typeof SocialActions !== 'undefined') {
          SocialState.patch({
            presence: { ...SocialState.getState().presence, sessionStatus: 'idle' },
            currentGame: null,
          }, 'visit.session.force-leave');
        }
        window.electronAPI?.closeGomokuWindow?.();
        hideChatInput();
        hideGuessPanel();
        hideGuessRequestCard();
        guessPhase = 'idle';
        toast('已断开拜访连接', 2000);
        return;
      }
      console.warn('[visit-scene] 离开失败:', detail);
      toast(`离开失败：${detail}`, 2200);
    }
  }

  async function handleInviteGame() {
    const state = SocialState.getState();
    if (!state.currentRoom) {
      toast('请先进入拜访', 1800);
      return;
    }
    if (state.currentGame?.type === 'gomoku' && state.currentGame?.roomId === state.currentRoom?.roomId) {
      window.electronAPI?.openGomokuWindow?.();
      gomokuWindowOpened = true;
      return;
    }
    if (typeof SocialActions?.sendMiniGameRequest !== 'function') {
      toast('小游戏邀请模块未就绪', 2200);
      return;
    }

    const existingPending = (state.miniGameRequests || []).find((item) => item && item.state === 'pending');
    if (existingPending) {
      toast('当前已有待处理的五子棋邀请', 2200);
      return;
    }

    const res = await SocialActions.sendMiniGameRequest('gomoku', { source: 'visit-hud' });
    if (res?.success) {
      toast('五子棋邀请已发出', 1800);
    } else {
      const detail = res?.message || '未知错误';
      console.warn('[visit-scene] 邀请失败:', detail);
      toast(`邀请失败：${detail}`, 3200);
    }
  }

  async function handleRespondGameRequest(action) {
    const pending = getInboundPendingGameRequest();
    if (!pending || !pending.gameRequestId) {
      toast('当前没有待处理邀请', 1800);
      return;
    }
    const res = await SocialActions.respondMiniGameRequest(pending.gameRequestId, action);
    if (res?.success) {
      toast(action === 'accept' ? '已接受五子棋邀请' : '已拒绝五子棋邀请', 1800);
    } else {
      const detail = res?.message || '未知错误';
      console.warn('[visit-scene] 响应邀请失败:', detail);
      toast(`${action === 'accept' ? '接受' : '拒绝'}失败：${detail}`, 2400);
    }
  }

  function syncHud(state = SocialState.getState()) {
    const hud = $('visit-hud');
    const subtitle = $('visit-hud-subtitle');
    if (!hud || !subtitle) return;

    const room = state.currentRoom || null;
    const visible = !!room;
    hud.classList.toggle('hidden', !visible);
    hud.setAttribute('aria-hidden', visible ? 'false' : 'true');

    if (!visible) {
      subtitle.textContent = '等待进入会话…';
      hideGuestContextMenu();
      hideChatInput();
      hideGuessPanel();
      hideGuessRequestCard();
      guessPhase = 'idle';
      return;
    }

    subtitle.textContent = `正在和 ${getRoomLabel(room)} 一起玩`;
  }

  function syncGameRequestCard(state = SocialState.getState()) {
    const card = $('visit-game-request-card');
    const textEl = $('visit-game-request-text');
    if (!card || !textEl) return;

    const pending = getInboundPendingGameRequest(state);
    const visible = !!pending;
    card.classList.toggle('hidden', !visible);
    card.setAttribute('aria-hidden', visible ? 'false' : 'true');

    if (!visible) return;

    const fromOwner = String(pending.fromOwnerName || '').trim();
    const fromPet = String(pending.fromPetName || '').trim();
    const label = [fromOwner, fromPet].filter(Boolean).join(' · ') || '对方';
    textEl.innerHTML = `${escapeHtml(label)} 邀请你一起下 <strong>五子棋</strong>。`;
  }

  function syncGameWindow(state = SocialState.getState()) {
    const roomId = state.currentRoom?.roomId || null;
    const game = state.currentGame && state.currentGame.type === 'gomoku' && state.currentGame.roomId === roomId
      ? state.currentGame
      : null;

    if (game) {
      if (!gomokuWindowOpened) {
        window.electronAPI?.openGomokuWindow?.();
        gomokuWindowOpened = true;
      }
      return;
    }
  }

  // ═══════════════════════════════════════════
  //  处理远端互动事件（猜拳邀请/选择/结果）
  // ═══════════════════════════════════════════

  function handleRemoteInteraction(interaction) {
    if (!interaction) return;
    const action = String(interaction.action || '').trim();

    if (action === 'guess-game') {
      // 对方发起猜拳邀请
      const from = interaction.fromOwnerName || interaction.fromPetName || '对方';
      showGuessRequestCard(from);
      return;
    }

    if (action === 'guess-game-accept') {
      // 对方接受了猜拳邀请
      toast('对方接受了猜拳！', 1600);
      startGuessCountdown();
      return;
    }

    if (action === 'guess-game-reject') {
      toast('对方拒绝了猜拳', 1800);
      guessPhase = 'idle';
      return;
    }

    if (action === 'guess-game-choice') {
      // 对方出拳了
      const theirChoice = interaction.choice;
      if (theirChoice) {
        GuessGameEngine.submitChoice('guest', theirChoice);
      }
      // 检查是否双方都出了
      const gs = GuessGameEngine.getState();
      if (gs.hostChoice && gs.guestChoice) {
        const winner = GuessGameEngine.getWinner();
        settleGuessGame({
          hostChoice: gs.hostChoice,
          guestChoice: gs.guestChoice,
          winner,
        });
      }
      return;
    }
  }

  function bindEvents() {
    $('guest-pet-container')?.addEventListener('contextmenu', (e) => {
      if (!VisitSession?.isInVisit?.()) return;
      e.preventDefault();
      e.stopPropagation();
      showGuestContextMenu(e.clientX, e.clientY);
    });

    $('guest-context-menu')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-guest-action]');
      const action = btn?.dataset.guestAction;
      if (!action) return;
      handleGuestAction(action);
    });

    $('visit-hud-btn-interact')?.addEventListener('click', (e) => {
      const guest = $('guest-pet-container');
      if (!guest || !guest.classList.contains('visible')) {
        toast('对方宠物还没出现', 1600);
        return;
      }
      const rect = guest.getBoundingClientRect();
      showGuestContextMenu(rect.left + rect.width * 0.55, rect.top + rect.height * 0.35);
    });

    $('visit-hud-btn-chat')?.addEventListener('click', () => {
      if (!VisitSession?.isInVisit?.()) {
        toast('请先进入拜访', 1800);
        return;
      }
      const panel = $('visit-chat-input');
      if (panel && !panel.classList.contains('hidden')) {
        hideChatInput();
      } else {
        showChatInput();
      }
    });

    $('visit-hud-btn-game')?.addEventListener('click', () => {
      handleInviteGame();
    });

    $('visit-hud-btn-leave')?.addEventListener('click', () => {
      handleLeaveRoom();
    });

    $('visit-game-request-accept')?.addEventListener('click', () => {
      handleRespondGameRequest('accept');
    });

    $('visit-game-request-reject')?.addEventListener('click', () => {
      handleRespondGameRequest('reject');
    });

    // ─── 聊天输入框事件 ───
    $('visit-chat-send')?.addEventListener('click', () => {
      handleSendChat();
    });

    $('visit-chat-text')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendChat();
      }
      if (e.key === 'Escape') {
        hideChatInput();
      }
    });

    // ─── 猜拳面板事件 ───
    $('guess-game-choices')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-choice]');
      if (!btn || btn.disabled) return;
      const choice = btn.dataset.choice;
      if (guessPhase === 'countdown') {
        submitGuessChoice(choice);
      }
    });

    $('guess-game-request-accept')?.addEventListener('click', () => {
      handleGuessRequestAccept();
    });

    $('guess-game-request-reject')?.addEventListener('click', () => {
      handleGuessRequestReject();
    });

    // ─── 点击空白关闭 ───
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#guest-context-menu') && !e.target.closest('#guest-pet-container') && !e.target.closest('#visit-hud-btn-interact')) {
        hideGuestContextMenu();
      }
      // 点击聊天框外部关闭
      if (!e.target.closest('#visit-chat-input') && !e.target.closest('#visit-hud-btn-chat')) {
        const chatPanel = $('visit-chat-input');
        if (chatPanel && !chatPanel.classList.contains('hidden')) {
          const input = $('visit-chat-text');
          if (!input?.value) hideChatInput();
        }
      }
    });

    window.addEventListener('blur', hideGuestContextMenu);

    SocialState.on('change', ({ state, reason } = {}) => {
      const next = state || SocialState.getState();
      syncHud(next);
      syncGameRequestCard(next);
      syncGameWindow(next);

      if (next.currentRoom?.roomId !== currentRoomId) {
        currentRoomId = next.currentRoom?.roomId || null;
        hideGuestContextMenu();
      }

      // ─── 五子棋邀请通知 ───
      if (reason === 'visit.game.request.created') {
        const pending = getInboundPendingGameRequest(next);
        if (pending && pending.gameRequestId && pending.gameRequestId !== currentRequestId) {
          currentRequestId = pending.gameRequestId;
          const from = pending.fromOwnerName || pending.fromPetName || '对方';
          toast(`♟ ${from} 向你发来了五子棋邀请`, 2600);
        }
      }

      // ─── 悔棋请求通知 ───
      if (reason === 'visit.game.undo-request') {
        const from = next._undoFromName || '对方';
        toast(`♟ ${from} 请求悔棋`, 2600);
      }

      // ─── 悔棋响应通知 ───
      if (reason === 'visit.game.undo-response') {
        const accepted = next._undoAccepted;
        toast(accepted ? '对方同意了悔棋' : '对方拒绝了悔棋', 2000);
      }

      // ─── 拜访聊天消息 ───
      if (reason === 'visit.chat') {
        const msgs = next.visitChatMessages || [];
        const lastMsg = msgs[msgs.length - 1];
        if (lastMsg && !lastMsg.isLocal) {
          onVisitChatReceived(lastMsg);
        }
      }

      // ─── 远端互动事件（猜拳等） ───
      if (reason === 'visit.interaction') {
        const interaction = next.lastVisitInteraction;
        if (interaction) {
          handleRemoteInteraction(interaction);
        }
      }

      const nextGameId = next.currentGame?.gameId || null;
      if (nextGameId && nextGameId !== currentGameId) {
        currentGameId = nextGameId;
        toast('五子棋已开始', 1600);
      }
      if (!nextGameId) {
        currentGameId = null;
      }
      if (!getInboundPendingGameRequest(next)) {
        currentRequestId = null;
      }
    });
  }

  function init() {
    if (initialized) return;
    initialized = true;
    bindEvents();
    syncHud();
    syncGameRequestCard();
    syncGameWindow();
  }

  return {
    init,
  };
})();
