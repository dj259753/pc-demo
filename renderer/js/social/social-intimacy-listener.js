/* ═══════════════════════════════════════════
   亲密度事件监听器
   监听社交事件 → 自动触发亲密度积分
   在 SocialState change 回调中挂载，纯增量模块
   ═══════════════════════════════════════════ */

const IntimacyListener = (() => {
  let initialized = false;
  let coScreenTimer = null; // 同屏计时器
  let currentCoScreenFriendId = null;
  const CO_SCREEN_TICK_MS = 60_000; // 每分钟 tick 一次

  function nowISO() {
    return new Date().toISOString();
  }

  /**
   * 从 state 中获取当前拜访中的好友 ID
   */
  function resolveCoScreenFriendId(state) {
    if (!state?.currentRoom?.roomId) return null;
    return state.currentRoom.guestUserId || null;
  }

  /**
   * 安全调用积分接口（静默失败不阻塞主流程）
   */
  async function tryAddPoints(friendUserId, eventType, amountOverride) {
    if (!friendUserId || typeof SocialActions?.addIntimacyPoints !== 'function') return null;
    try {
      return await SocialActions.addIntimacyPoints(friendUserId, eventType, amountOverride);
    } catch (err) {
      console.warn('[intimacy-listener] 积分添加失败:', eventType, err?.message || err);
      return null;
    }
  }

  /**
   * 启动同屏计时器（每分钟 +2 分）
   */
  function startCoScreenTimer(friendId) {
    stopCoScreenTimer();
    if (!friendId) return;

    currentCoScreenFriendId = friendId;
    coScreenTimer = setInterval(async () => {
      await tryAddPoints(friendId, 'visit.co-screen.minute');
    }, CO_SCREEN_TICK_MS);
  }

  function stopCoScreenTimer() {
    if (coScreenTimer) {
      clearInterval(coScreenTimer);
      coScreenTimer = null;
    }
    currentCoScreenFriendId = null;
  }

  /**
   * 核心：监听 SocialState 变化，匹配事件类型触发积分
   */
  function onStateChange(payload = {}) {
    const state = payload.state;
    if (!state) return;
    const reason = String(payload.reason || '');

    // ── 拜访成功：+15 ──
    if (reason === 'visit.room.updated' && state.currentRoom?.roomId) {
      const guestId = state.currentRoom.guestUserId;
      if (guestId) {
        tryAddPoints(guestId, 'visit.success');
        startCoScreenTimer(guestId);
      }
    }

    // ── 离开拜访：停止同屏计时 ──
    if (reason === 'visit.room.updated' && !state.currentRoom?.roomId) {
      stopCoScreenTimer();
    }

    // ── 互动事件：根据 action 类型加分 ──
    if (reason === 'visit.interaction') {
      const interaction = state.lastVisitInteraction;
      if (interaction?.targetUserId) {
        const actionMap = {
          hug:       'interaction.hug',
          highfive:  'interaction.highfive',
          handshake: 'interaction.handshake',
          wave:      'interaction.wave',
          'sync-walk': null, // 同步散步暂不给分
        };
        const evtType = actionMap[interaction.action];
        if (evtType) {
          tryAddPoints(interaction.targetUserId, evtType);
        }
      }
    }

    // ── 五子棋对局完成：+10 ──
    if (reason === 'visit.game.event') {
      const gameEvent = state.lastGameEvent;
      if (gameEvent?.kind === 'finished') {
        // 从当前拜访中取对方 ID
        const friendId = resolveCoScreenFriendId(state);
        if (friendId) {
          tryAddPoints(friendId, 'game.gomoku.play');
        }
      }
    }

    // ── 好友被接受时：+8（一次性）──
    if (reason === 'friends.request.updated' || reason === 'friends.list.updated') {
      // 这个事件会在 accept 时触发，但需要判断是否有新加入的好友
      // 通过 friends 列表变化检测新好友比较复杂，简化为：
      // 在 request accepted 后由后端直接处理（social-client.respondFriendRequest 已有入口）
      // 此处作为前端补充保险：如果发现新好友且无亲密度数据则初始化
      const friends = Array.isArray(state.friends) ? state.friends : [];
      for (const f of friends) {
        if (!f.intimacy || f.intimacy.score === undefined) {
          // 新好友初始化（后端 createEmptyIntimacy 会在首次 addPoints 时处理）
          // 这里不做额外调用，等用户第一次互动时自然初始化
        }
      }
    }
  }

  /**
   * 监听升级事件并显示气泡提示
   */
  function onIntimacyLevelUp(payload) {
    if (!payload?.toLevel) return;
    const name = payload.toLevel.name || '';
    const icon = payload.toLevel.icon || '';
    const score = payload.score || 0;
    console.log(`[intimacy] 🎉 升级了！${icon} ${name}（${score} 分）`);

    // 尝试通过 BubbleSystem 显示升级气泡
    if (typeof BubbleSystem !== 'undefined' && BubbleSystem.show) {
      BubbleSystem.show(`${icon} 亲密度提升！与TA的关系变为「${name}」`, 3000);
    }

    // 触发自定义 DOM 事件供 UI 捕获
    window.dispatchEvent(new CustomEvent('intimacy-level-up', { detail: payload }));
  }

  function init() {
    if (initialized) return;
    initialized = true;

    // 挂载到 SocialState 变化回调
    if (typeof SocialState !== 'undefined' && typeof SocialState.on === 'function') {
      SocialState.on('change', onStateChange);

      // 单独监听升级事件
      SocialState.on('change', (payload = {}) => {
        if (payload.reason === 'intimacy.level-up' && payload.state?._intimacyLevelUp) {
          onIntimacyLevelUp(payload.state._intimacyLevelUp);
        }
      });
    }

    console.log('[intimacy] 事件监听器已启动');
  }

  return {
    init,
    startCoScreenTimer,
    stopCoScreenTimer,
    tryAddPoints,
    onStateChange,
  };
})();

window.IntimacyListener = IntimacyListener;
