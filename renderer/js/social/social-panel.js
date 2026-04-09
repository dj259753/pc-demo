/* ═══════════════════════════════════════════
   社交中心面板
   把轻社交从系统设置中迁出，形成正式一级 UI
   ═══════════════════════════════════════════ */

const SocialPanel = (() => {
  let initialized = false;
  let activeTab = 'overview';
  let lastRoomId = null;
  let gomokuActionPending = false;

  const PRESENCE_LABEL = {
    online: '在线',
    busy: '忙碌',
    focus: '专注',
    away: '离开',
    offline: '离线',
  };

  const VISIT_INTERACTION_LABEL = {
    wave: '打招呼',
    handshake: '握手',
    hug: '贴贴',
    highfive: '击掌',
    'sync-walk': '同步散步',
    'invite-game': '邀请小游戏',
  };

  const TAB_SET = new Set(['overview', 'friends', 'visit', 'profile']);

  function getEl(id) {
    return document.getElementById(id);
  }

  function toast(text, duration = 2200) {
    if (typeof BubbleSystem !== 'undefined' && BubbleSystem.show) {
      BubbleSystem.show(text, duration, { force: true });
      return;
    }
    console.log('[social-panel]', text);
  }

  function normalizeTab(tab) {
    const text = String(tab || '').trim().toLowerCase();
    return TAB_SET.has(text) ? text : 'overview';
  }

  function getCurrentRoomId(state = SocialState.getState()) {
    return state.currentRoom?.roomId || null;
  }

  function getCurrentGomokuGame(state = SocialState.getState()) {
    const roomId = getCurrentRoomId(state);
    const game = state.currentGame || null;
    if (!roomId || !game || game.type !== 'gomoku' || game.roomId !== roomId) {
      return null;
    }
    return game;
  }

  function setActiveTab(tab) {
    activeTab = normalizeTab(tab);
    syncActiveTabUI();
    if (activeTab === 'profile') {
      focusProfileInput();
    }
  }

  function syncActiveTabUI() {
    document.querySelectorAll('[data-social-tab]').forEach((btn) => {
      const selected = btn.dataset.socialTab === activeTab;
      btn.classList.toggle('active', selected);
      btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });

    document.querySelectorAll('[data-social-tab-panel]').forEach((panel) => {
      panel.classList.toggle('hidden', panel.dataset.socialTabPanel !== activeTab);
    });
  }

  function open(options = {}) {
    const rawTab = options.tab || '';
    let nextTab = rawTab === 'profile-edit' ? 'profile' : normalizeTab(rawTab);
    // profile-edit → 打开编辑器
    const shouldOpenEditor = rawTab === 'profile-edit';

    const panel = getEl('social-panel');

    if (panel && panel.classList.contains('hidden')) {
      if (typeof PanelManager !== 'undefined' && typeof PanelManager.togglePanel === 'function') {
        PanelManager.togglePanel('social');
      } else {
        panel.classList.remove('hidden');
      }
    }

    setActiveTab(nextTab);
    renderAll();

    if (shouldOpenEditor && typeof openInlineEditor === 'function') {
      setTimeout(() => openInlineEditor(), 100);
    } else if (nextTab === 'profile') {
      focusProfileInput();
    }
  }

  function safeSetInputValue(id, value) {
    const el = getEl(id);
    if (!el) return;
    if (document.activeElement === el) return;
    el.value = String(value || '');
  }

  function focusProfileInput() {
    window.setTimeout(() => {
      const ownerInput = getEl('social-owner-name-input');
      const petInput = getEl('social-pet-name-input');
      const target = ownerInput?.value?.trim() ? (petInput?.value?.trim() ? ownerInput : petInput) : ownerInput;
      if (!target || typeof target.focus !== 'function') return;
      target.focus();
      if (typeof target.select === 'function') {
        target.select();
      }
    }, 60);
  }

  async function copyText(text) {
    const value = String(text || '').trim();
    if (!value) return false;

    try {
      if (window.electronAPI?.writeClipboard) {
        await window.electronAPI.writeClipboard(value);
        return true;
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return true;
      }
    } catch (_err) {
      return false;
    }

    return false;
  }

  function roomDisplayName(room) {
    if (!room) return '对方';
    return room.guestOwnerName || room.guestPetName || room.guestUserId || '对方';
  }

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderGomoku(state) {
    const host = getEl('social-gomoku-host');
    const boardEl = getEl('social-gomoku-board');
    const statusEl = getEl('social-gomoku-status');
    const resetBtn = getEl('social-gomoku-reset');
    if (!host || !boardEl || !statusEl || !resetBtn) return;

    const roomId = getCurrentRoomId(state);
    const game = getCurrentGomokuGame(state);
    const enabled = !!state.featureFlags?.miniGameEnabled;
    const ready = !!roomId && !!game && enabled;
    const winner = String(game?.winner || '').trim();

    if (!roomId) {
      statusEl.textContent = '先进入拜访会话，再发送五子棋邀请。';
      boardEl.setAttribute('aria-hidden', 'true');
      boardEl.innerHTML = '';
      resetBtn.disabled = true;
      resetBtn.classList.add('is-disabled');
      host.classList.toggle('is-disabled', true);
      return;
    }

    if (!enabled) {
      statusEl.textContent = '当前版本还没有开启小游戏能力。';
      boardEl.setAttribute('aria-hidden', 'true');
      boardEl.innerHTML = '';
      resetBtn.disabled = true;
      resetBtn.classList.add('is-disabled');
      host.classList.toggle('is-disabled', true);
      return;
    }

    host.classList.toggle('is-disabled', false);

    if (!game) {
      statusEl.textContent = '已进入拜访；点击“邀请五子棋”后，这里会进入对局。';
      boardEl.setAttribute('aria-hidden', 'true');
      boardEl.innerHTML = '';
      resetBtn.disabled = true;
      resetBtn.classList.add('is-disabled');
      return;
    }

    const nextLabel = game.nextStone === 'black' ? '黑子' : '白子';
    statusEl.textContent = winner
      ? `本局结束：${winner === 'draw' ? '平局' : `${winner === 'black' ? '黑子' : '白子'}获胜`}。`
      : `房间态五子棋进行中：当前轮到${nextLabel}。`;

    boardEl.setAttribute('aria-hidden', ready ? 'false' : 'true');
    boardEl.innerHTML = (Array.isArray(game.board) ? game.board : []).map((row, rowIndex) => {
      return row.map((cell, colIndex) => {
        const stoneClass = cell ? ` is-${cell}` : '';
        const disabled = !ready || gomokuActionPending || game.status !== 'active' || !!cell;
        const label = cell === 'black' ? '黑子' : (cell === 'white' ? '白子' : '空位');
        return `<button class="social-gomoku-cell${stoneClass}" data-social-action="gomoku-cell" data-row="${rowIndex}" data-col="${colIndex}" aria-label="${label}"${disabled ? ' disabled' : ''}></button>`;
      }).join('');
    }).join('');

    resetBtn.disabled = !ready || gomokuActionPending;
    resetBtn.classList.toggle('is-disabled', !ready || gomokuActionPending);
  }

  async function handleStartGomoku() {
    const state = SocialState.getState();
    if (!state.currentRoom) {
      toast('请先进入拜访会话，再邀请五子棋', 2000);
      return;
    }
    if (!state.featureFlags?.miniGameEnabled) {
      toast('当前版本尚未开启小游戏能力', 2200);
      return;
    }
    if (gomokuActionPending) return;

    gomokuActionPending = true;
    renderGomoku(state);
    const res = await SocialActions.startMiniGame('gomoku', {
      source: 'social-panel',
    });
    gomokuActionPending = false;
    renderGomoku(SocialState.getState());

    if (!res?.success) {
      toast(`五子棋开局失败：${res?.message || '未知错误'}`, 2400);
      return;
    }
    toast('已发起五子棋对局', 1800);
  }

  async function handleGomokuMove(row, col) {
    const game = getCurrentGomokuGame();
    if (!game || game.status !== 'active' || gomokuActionPending) return;

    const rowIndex = Number(row);
    const colIndex = Number(col);
    if (!Number.isInteger(rowIndex) || !Number.isInteger(colIndex)) return;
    if (!game.board?.[rowIndex] || game.board[rowIndex][colIndex]) return;

    gomokuActionPending = true;
    renderGomoku(SocialState.getState());
    const res = await SocialActions.playMiniGameMove('gomoku', {
      row: rowIndex,
      col: colIndex,
      source: 'social-panel',
    });
    gomokuActionPending = false;
    renderGomoku(SocialState.getState());

    if (!res?.success) {
      toast(`落子失败：${res?.message || '未知错误'}`, 2200);
    }
  }

  async function handleGomokuReset() {
    const state = SocialState.getState();
    if (!state.currentRoom || gomokuActionPending) return;

    gomokuActionPending = true;
    renderGomoku(state);
    const res = await SocialActions.resetMiniGame('gomoku', {
      source: 'social-panel',
    });
    gomokuActionPending = false;
    renderGomoku(SocialState.getState());

    if (!res?.success) {
      toast(`重开失败：${res?.message || '未知错误'}`, 2200);
    }
  }

  function getPendingInboundRequests(state) {
    return (state.requests || []).filter((item) => item.direction === 'inbound' && item.state === 'pending');
  }

  function renderEntryBadge(state) {
    const badge = getEl('social-entry-badge');
    if (!badge) return;

    const pending = getPendingInboundRequests(state).length;
    if (state.currentRoom) {
      badge.textContent = '访';
      badge.classList.remove('hidden');
      badge.title = '当前正在拜访中';
      return;
    }

    if (pending > 0) {
      badge.textContent = pending > 99 ? '99+' : String(pending);
      badge.classList.remove('hidden');
      badge.title = `有 ${pending} 条待处理好友申请`;
      return;
    }

    badge.classList.add('hidden');
    badge.textContent = '0';
    badge.title = '';
  }

  function renderGateway(state) {
    const gatewayEl = getEl('social-gateway-mode');
    if (!gatewayEl) return;
    // 检查远端适配器是否就绪
    const adapterReady = !!(typeof window.SocialRealRemoteAdapter !== 'undefined'
      && window.SocialRealRemoteAdapter?.isReady?.()
      || window.SocialRealRemoteAdapter?.wsConnected);
    if (adapterReady) {
      gatewayEl.textContent = '服务器在线';
      gatewayEl.className = 'social-gateway-mode is-online';
      gatewayEl.title = '已连接到远端社交服务';
    } else {
      gatewayEl.textContent = '离线';
      gatewayEl.className = 'social-gateway-mode is-offline';
      gatewayEl.title = '无法连接远端服务器，请检查网络或稍后重试';
    }
  }

  const GENDER_LABEL = { gg: '♂ GG', mm: '♀ MM' };

  function renderProfile(state) {
    const profile = state.profile || null;
    const displayCode = getEl('social-display-code');
    const displayCodeDuplicate = getEl('social-display-code-duplicate');
    const nextCode = profile?.displayCode || '未生成';

    safeSetInputValue('social-owner-name-input', profile?.ownerName || '');
    safeSetInputValue('social-pet-name-input', profile?.petName || '');

    // 同步性别选择器状态（隐藏占位的 + 内嵌编辑器的）
    const savedGender = profile?.petGender || 'gg';
    document.querySelectorAll('#social-gender-selector .gender-opt').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.gender === savedGender);
    });
    document.querySelectorAll('.social-edit-gender .gender-opt').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.gender === savedGender);
    });

    if (displayCode) {
      displayCode.textContent = nextCode;
    }
    if (displayCodeDuplicate) {
      displayCodeDuplicate.textContent = nextCode;
    }
  }

  function renderHeader(state) {
    const profile = state.profile || null;
    const presence = String(state.presence?.userStatus || 'offline').trim();
    const room = state.currentRoom || null;
    const pending = getPendingInboundRequests(state).length;
    const friendsCount = Array.isArray(state.friends) ? state.friends.filter((item) => !item.isBlocked).length : 0;

    const profileSummary = getEl('social-profile-summary');
    const presenceSummary = getEl('social-presence-summary');
    const visitSummary = getEl('social-visit-summary');
    const overviewStatus = getEl('social-overview-status');
    const overviewFriends = getEl('social-overview-friends');
    const overviewVisit = getEl('social-overview-visit');
    const requestCount = getEl('social-request-count');
    const friendsCountEl = getEl('social-friends-count');

    if (profileSummary) {
      const genderTag = profile ? `<span class="social-gender-tag is-${profile.petGender || 'gg'}">${GENDER_LABEL[profile.petGender || 'gg']}</span>` : '';
      profileSummary.innerHTML = profile
        ? `${escapeHtml(profile.ownerName)} · ${escapeHtml(profile.petName)} ${genderTag}`
        : '先给你和宠物起个名字吧';
    }

    if (presenceSummary) {
      presenceSummary.textContent = profile
        ? `当前状态：${PRESENCE_LABEL[presence] || '离线'}`
        : '尚未建立社交身份';
    }

    if (visitSummary) {
      visitSummary.textContent = room
        ? `正在拜访 ${roomDisplayName(room)}`
        : '当前没有进行中的拜访';
    }

    if (overviewStatus) {
      overviewStatus.textContent = profile
        ? `${profile.ownerName} 的 ${profile.petName} 当前为「${PRESENCE_LABEL[presence] || '离线'}」状态。`
        : '请先在「我的名片」完成起名，社交功能才会进入正式可用状态。';
    }

    if (overviewFriends) {
      overviewFriends.textContent = pending > 0
        ? `已有 ${friendsCount} 位好友，当前还有 ${pending} 条待处理申请。`
        : (friendsCount > 0 ? `已有 ${friendsCount} 位好友，可以直接发起拜访。` : '还没有好友，先去添加一个吧。');
    }

    if (overviewVisit) {
      overviewVisit.textContent = room
        ? `当前正在与 ${roomDisplayName(room)} 进行拜访，可以进入「拜访」页互动。`
        : '当前空闲，可从好友列表对在线好友发起拜访。';
    }

    if (requestCount) requestCount.textContent = String(pending);
    if (friendsCountEl) friendsCountEl.textContent = String(friendsCount);
  }

  function renderPresence(state) {
    const current = String(state.presence?.userStatus || 'offline').trim();
    const disabled = !state.profile;
    document.querySelectorAll('.social-presence-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.status === current);
      btn.disabled = disabled;
      btn.classList.toggle('is-disabled', disabled);
    });
  }

  function renderRoom(state) {
    const roomState = getEl('social-room-state');
    const roomHint = getEl('social-room-hint');
    const actionRow = getEl('social-visit-actions');
    const leaveBtn = getEl('social-leave-room');
    const inRoom = !!state.currentRoom;

    if (roomState) {
      if (!inRoom) {
        roomState.textContent = '空闲';
      } else {
        roomState.textContent = `拜访中：${roomDisplayName(state.currentRoom)}`;
      }
    }

    if (roomHint) {
      roomHint.textContent = inRoom
        ? '互动按钮会把动作事件发给当前拜访会话。'
        : '从好友列表对在线好友发起拜访后，这里会显示当前会话。';
    }

    if (actionRow) {
      actionRow.querySelectorAll('[data-social-action="visit-interaction"]').forEach((btn) => {
        const action = btn.dataset.action;
        const blockedByMiniGame = action === 'invite-game' && !state.featureFlags?.miniGameEnabled;
        const disabled = !inRoom || blockedByMiniGame;
        btn.disabled = disabled;
        btn.classList.toggle('is-disabled', disabled);
      });
    }

    if (leaveBtn) {
      leaveBtn.disabled = !inRoom;
      leaveBtn.classList.toggle('is-disabled', !inRoom);
    }
  }

  function renderRequestList(state) {
    const listEl = getEl('social-request-list');
    if (!listEl) return;

    const inboundPending = getPendingInboundRequests(state);
    if (inboundPending.length === 0) {
      listEl.innerHTML = '<div class="social-list-empty">暂无待处理请求</div>';
      return;
    }

    listEl.innerHTML = inboundPending.map((item) => {
      const owner = item.friendOwnerName || item.fromOwnerName || '好友';
      const pet = item.friendPetName || item.fromPetName || '宠物';
      const message = String(item.message || '').trim();
      const messageHtml = message ? `<div class="social-list-sub">留言：${escapeHtml(message)}</div>` : '';

      return `
        <div class="social-list-item" data-request-id="${item.requestId}">
          <div class="social-list-main">${escapeHtml(owner)} · ${escapeHtml(pet)} 请求加好友</div>
          ${messageHtml}
          <div class="social-list-actions">
            <button class="settings-action-btn" data-social-action="reject-request" data-request-id="${item.requestId}">拒绝</button>
            <button class="settings-action-btn" data-social-action="accept-request" data-request-id="${item.requestId}">接受</button>
          </div>
        </div>
      `;
    }).join('');
  }

  function renderFriendList(state) {
    const listEl = getEl('social-friends-list');
    if (!listEl) return;

    const friends = Array.isArray(state.friends) ? state.friends.filter((item) => !item.isBlocked) : [];
    if (friends.length === 0) {
      listEl.innerHTML = '<div class="social-list-empty">还没有好友，先去发送一个好友申请吧</div>';
      return;
    }

    listEl.innerHTML = friends.map((friend) => {
      const normalizedStatus = typeof SocialVisitRules !== 'undefined'
        ? SocialVisitRules.normalizeStatus(friend.status, 'offline')
        : String(friend.status || 'offline').trim();
      const status = PRESENCE_LABEL[normalizedStatus] || '离线';
      const code = friend.friendCode ? ` · ${escapeHtml(friend.friendCode)}` : '';
      const genderTag = friend.petGender
        ? `<span class="social-gender-tag is-${friend.petGender}">${GENDER_LABEL[friend.petGender] || ''}</span>`
        : '';

      // ── 亲密度展示 ──
      const intimacyData = friend.intimacy || null;
      const score = intimacyData && typeof intimacyData.score === 'number' ? intimacyData.score : 0;
      let intimacyLevelIcon = '🥚';
      let intimacyLevelName = '初识';
      let intimacyColor = '#9E9E9E';

      // 简化的等级解析（前端不需要引入后端模块，硬编码对应关系）
      if (score >= 7000) { intimacyLevelIcon = '🌟'; intimacyLevelName = '羁友'; intimacyColor = '#E91E63'; }
      else if (score >= 3000) { intimacyLevelIcon = '💎'; intimacyLevelName = '挚交'; intimacyColor = '#9C27B0'; }
      else if (score >= 1200) { intimacyLevelIcon = '🔥'; intimacyLevelName = '死党'; intimacyColor = '#FF9800'; }
      else if (score >= 400) { intimacyLevelIcon = '💚'; intimacyLevelName = '挚友'; intimacyColor = '#4CAF50'; }
      else if (score >= 100) { intimacyLevelIcon = '🌱'; intimacyLevelName = '熟人'; intimacyColor = '#8BC34A'; }
      // else 默认初识 🥚 #9E9E9E

      const intimacyBadge = score > 0
        ? `<span class="social-intimacy-badge" style="--intimacy-color: ${intimacyColor}" title="${intimacyLevelName} · ${score} 分">${intimacyLevelIcon}<em>${intimacyLevelName}</em><small>❤️ ${score}</small></span>`
        : `<span class="social-intimacy-badge is-zero" title="${intimacyLevelName}">🥚<em>初识</em></span>`;

      const visitCheck = typeof SocialVisitRules !== 'undefined'
        ? SocialVisitRules.canVisitFriend(friend.friendUserId, state)
        : { ok: normalizedStatus === 'online', message: '' };
      const disabled = !visitCheck.ok;
      const buttonTitle = disabled ? ` title="${escapeHtml(visitCheck.message || '当前不可拜访')}"` : '';

      return `
        <div class="social-list-item" data-friend-id="${friend.friendUserId}">
          <div class="social-friend-row">
            <div>
              <div class="social-list-main">${escapeHtml(friend.ownerName || '好友')} · ${escapeHtml(friend.petName || '宠物')} ${genderTag} ${intimacyBadge}</div>
              <div class="social-list-sub">好友码：${friend.friendCode ? escapeHtml(friend.friendCode) : '未记录'}${code ? '' : ''}</div>
            </div>
            <span class="social-status-badge is-${normalizedStatus}">${status}</span>
          </div>
          <div class="social-list-actions">
            <button class="settings-action-btn social-visit-btn${disabled ? ' is-disabled' : ''}" data-social-action="visit-friend" data-friend-id="${friend.friendUserId}"${disabled ? ' disabled' : ''}${buttonTitle}>${disabled ? '暂不可访' : '发起拜访'}</button>
          </div>
        </div>
      `;
    }).join('');
  }

  function renderDebugFriendList(state) {
    const listEl = getEl('social-friends-debug-list');
    if (!listEl) return;

    const friends = Array.isArray(state.friends) ? state.friends.filter((item) => !item.isBlocked) : [];
    if (friends.length === 0) {
      listEl.innerHTML = '<div class="social-list-empty">暂无可模拟状态的好友</div>';
      return;
    }

    listEl.innerHTML = friends.map((friend) => {
      const normalizedStatus = typeof SocialVisitRules !== 'undefined'
        ? SocialVisitRules.normalizeStatus(friend.status, 'offline')
        : String(friend.status || 'offline').trim();
      return `
        <div class="social-debug-item" data-friend-id="${friend.friendUserId}">
          <div class="social-debug-title">
            <span>${escapeHtml(friend.ownerName || '好友')} · ${escapeHtml(friend.petName || '宠物')}</span>
            <span class="social-status-badge is-${normalizedStatus}">${PRESENCE_LABEL[normalizedStatus] || '离线'}</span>
          </div>
          <div class="social-friend-status-actions">
            <button class="settings-action-btn social-mini-btn${normalizedStatus === 'online' ? ' active' : ''}" data-social-action="set-friend-status" data-friend-id="${friend.friendUserId}" data-status="online">在线</button>
            <button class="settings-action-btn social-mini-btn${normalizedStatus === 'busy' ? ' active' : ''}" data-social-action="set-friend-status" data-friend-id="${friend.friendUserId}" data-status="busy">忙碌</button>
            <button class="settings-action-btn social-mini-btn${normalizedStatus === 'focus' ? ' active' : ''}" data-social-action="set-friend-status" data-friend-id="${friend.friendUserId}" data-status="focus">专注</button>
            <button class="settings-action-btn social-mini-btn${normalizedStatus === 'away' ? ' active' : ''}" data-social-action="set-friend-status" data-friend-id="${friend.friendUserId}" data-status="away">离开</button>
            <button class="settings-action-btn social-mini-btn${normalizedStatus === 'offline' ? ' active' : ''}" data-social-action="set-friend-status" data-friend-id="${friend.friendUserId}" data-status="offline">离线</button>
          </div>
        </div>
      `;
    }).join('');
  }

  function renderAll() {
    const state = SocialState.getState();

    syncActiveTabUI();
    renderEntryBadge(state);
    renderGateway(state);
    renderHeader(state);
    renderProfile(state);  /* 同步输入框值（隐藏的），保存功能仍可用 */
    renderPresence(state);
    renderRequestList(state);
    renderFriendList(state);
  }

  /* ═══ 内嵌编辑器逻辑 ═══ */
  const inlineEditEl = () => getEl('social-inline-editor');
  const editOwnerInput = () => getEl('edit-owner-name');
  const editPetInput = () => getEl('edit-pet-name');

  function openInlineEditor() {
    const editor = inlineEditEl();
    if (!editor) return;
    // 填入当前值
    const profile = SocialState.getState().profile || null;
    if (editOwnerInput()) editOwnerInput().value = profile?.ownerName || '';
    if (editPetInput()) editPetInput().value = profile?.petName || '';
    // 同步性别
    const gender = profile?.petGender || 'gg';
    document.querySelectorAll('.social-edit-gender .gender-opt').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.gender === gender);
    });
    editor.classList.remove('hidden');
    editOwnerInput()?.focus();
  }

  function closeInlineEditor() {
    const editor = inlineEditEl();
    if (editor) editor.classList.add('hidden');
  }

  async function handleInlineSave() {
    const owner = String(editOwnerInput()?.value || '').trim();
    const pet = String(editPetInput()?.value || '').trim();
    if (!owner || !pet) {
      toast('主人名和宠物名都不能为空', 2000);
      return;
    }
    const activeGenderBtn = document.querySelector('.social-edit-gender .gender-opt.active');
    const petGender = activeGenderBtn?.dataset.gender || 'gg';

    const res = await SocialActions.adoptProfile(owner, pet, petGender);
    if (res?.success) {
      toast('资料已更新', 1600);
      closeInlineEditor();
      renderAll();
      if (typeof SpriteRenderer !== 'undefined' && typeof SpriteRenderer.reloadForGender === 'function') {
        await SpriteRenderer.reloadForGender(petGender);
      }
      return;
    }
    toast(`保存失败：${res?.message || '未知错误'}`, 2400);
  }

  async function handleSaveProfile() {
    const owner = getEl('social-owner-name-input')?.value || '';
    const pet = getEl('social-pet-name-input')?.value || '';
    const activeGenderBtn = document.querySelector('#social-gender-selector .gender-opt.active');
    const petGender = activeGenderBtn?.dataset.gender || 'gg';

    const res = await SocialActions.adoptProfile(owner, pet, petGender);
    if (res?.success) {
      toast('资料已保存', 1800);
      renderAll();

      // 如果切换了性别，通知 SpriteRenderer 重载 SWF 清单
      if (typeof SpriteRenderer !== 'undefined' && typeof SpriteRenderer.reloadForGender === 'function') {
        await SpriteRenderer.reloadForGender(petGender);
      }
      return;
    }
    toast(`保存失败：${res?.message || '未知错误'}`, 2400);
  }

  async function handleCopyCode() {
    const code = SocialState.getState().profile?.displayCode;
    const ok = await copyText(code || '');
    toast(ok ? '好友码已复制' : '复制失败', 1800);
  }

  async function handleSendRequest(allowLoopback = false) {
    const codeInput = getEl('social-friend-code-input');
    const msgInput = getEl('social-friend-message-input');
    const code = String(codeInput?.value || '').trim();
    const message = String(msgInput?.value || '').trim();

    const res = await SocialActions.sendFriendRequest(code, message, { allowLoopback });
    if (res?.success) {
      if (codeInput) codeInput.value = '';
      if (msgInput) msgInput.value = '';
      toast(allowLoopback ? '已创建本地模拟申请，可在待处理列表中接受' : '好友申请已发送', 2200);
      return;
    }
    toast(`发送失败：${res?.message || '未知错误'}`, 2600);
  }

  async function handlePresenceChange(userStatus) {
    const res = await SocialActions.setPresence(userStatus);
    if (!res?.success) {
      toast(`状态切换失败：${res?.message || '未知错误'}`, 2200);
      return;
    }
    toast(`已切换为${PRESENCE_LABEL[userStatus] || '当前状态'}`, 1600);
  }

  async function handleSwitchGateway(target) {
    const mode = String(target || '').trim().toLowerCase();
    if (!['local', 'remote'].includes(mode)) return;

    const res = await SocialActions.setRemoteEnabled(mode === 'remote');
    if (!res?.success) {
      toast(`切换失败：${res?.message || '未知错误'}`, 2400);
      return;
    }

    const state = SocialState.getState();
    const fallback = !!state.gateway?.fallback;
    if (mode === 'remote' && fallback) {
      toast('远端接入未就绪，已自动回退本地模式', 2400);
      return;
    }

    toast(mode === 'remote' ? '已切换到远端接入（Mock）' : '已切换到本地接入', 2000);
  }

  async function handleSetFriendStatus(friendUserId, userStatus) {
    const res = await SocialActions.setFriendPresence(friendUserId, userStatus, 180);
    if (!res?.success) {
      toast(`好友状态更新失败：${res?.message || '未知错误'}`, 2200);
      return;
    }
    toast('已更新模拟好友状态', 1600);
  }

  async function handleVisitInteraction(action) {
    const state = SocialState.getState();
    if (!state.currentRoom) {
      toast('请先进入拜访会话再触发双宠互动', 2000);
      return;
    }

    if (action === 'invite-game') {
      await handleStartGomoku();
      return;
    }

    const res = await SocialActions.sendVisitInteraction(action, {
      source: 'social-panel',
    });

    if (res?.success) {
      const label = VISIT_INTERACTION_LABEL[action] || '互动';
      toast(`已发送${label}动作`, 1800);
      return;
    }

    toast(`互动发送失败：${res?.message || '未知错误'}`, 2200);
  }

  async function handleVisit(friendUserId) {
    const state = SocialState.getState();
    const visitCheck = typeof SocialVisitRules !== 'undefined'
      ? SocialVisitRules.canVisitFriend(friendUserId, state)
      : { ok: true, message: '' };

    if (!visitCheck.ok) {
      toast(visitCheck.message || '当前状态不允许发起拜访', 2400);
      return;
    }

    const res = await SocialActions.createVisitRoomWithFriend(friendUserId, 'say-hi');
    if (res?.success) {
      open({ tab: 'visit' });
      toast('已发起拜访会话', 1800);
      return;
    }

    toast(`发起拜访失败：${res?.message || '未知错误'}`, 2600);
  }

  async function handleLeaveRoom() {
    const state = SocialState.getState();
    if (!state.currentRoom) {
      toast('当前没有进行中的拜访会话', 1800);
      return;
    }

    const res = await SocialActions.leaveVisitRoom('manual-leave');
    if (res?.success) {
      toast('已离开拜访会话', 1800);
      return;
    }
    toast(`离开失败：${res?.message || '未知错误'}`, 2400);
  }

  async function handleRequestAction(action, requestId) {
    const act = action === 'accept-request' ? 'accept' : 'reject';
    const res = await SocialActions.respondFriendRequest(requestId, act);
    if (res?.success) {
      toast(act === 'accept' ? '已接受好友申请' : '已拒绝好友申请', 1800);
      return;
    }
    toast(`处理失败：${res?.message || '未知错误'}`, 2400);
  }

  function bindEvents() {
    const btnSaveProfile = getEl('social-save-profile');
    const btnCopyCode = getEl('social-copy-code');
    const btnSendRequest = getEl('social-send-friend-request');
    const btnLeaveRoom = getEl('social-leave-room');
    const btnOpenFromSettings = getEl('setting-open-social-center');
    const btnOpenFromActionBar = getEl('btn-social');
    const requestList = getEl('social-request-list');
    const friendsList = getEl('social-friends-list');
    const presenceButtons = getEl('social-presence-buttons');
    const btnCloseProfile = getEl('social-close-profile');

    btnSaveProfile?.addEventListener('click', handleSaveProfile);
    btnCopyCode?.addEventListener('click', handleCopyCode);

    // 性别选择器切换（隐藏占位）
    document.querySelectorAll('#social-gender-selector .gender-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#social-gender-selector .gender-opt').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // 性别选择器切换（内嵌编辑器）
    document.querySelectorAll('.social-edit-gender .gender-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.social-edit-gender .gender-opt').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // ✏️ 编辑按钮 → 打开内嵌编辑表单
    const editBtn = getEl('social-edit-btn');
    const inlineEditor = getEl('social-inline-editor');
    editBtn?.addEventListener('click', () => openInlineEditor());

    // 取消 / 保存（内嵌编辑器）
    getEl('social-cancel-edit')?.addEventListener('click', closeInlineEditor);
    getEl('social-save-edit')?.addEventListener('click', handleInlineSave);

    btnSendRequest?.addEventListener('click', () => handleSendRequest(false));
    btnLeaveRoom?.addEventListener('click', handleLeaveRoom);

    // 个人资料区域收起/展开
    btnCloseProfile?.addEventListener('click', () => {
      const section = getEl('social-profile-section');
      if (section) section.classList.add('hidden');
    });

    btnOpenFromSettings?.addEventListener('click', () => open());
    btnOpenFromActionBar?.addEventListener('click', (e) => {
      e.stopPropagation();
      open();
    });

    presenceButtons?.addEventListener('click', (e) => {
      const btn = e.target.closest('.social-presence-btn');
      if (!btn) return;
      const status = btn.dataset.status;
      if (!status) return;
      handlePresenceChange(status);
    });

    requestList?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-social-action]');
      if (!btn) return;
      const action = btn.dataset.socialAction;
      const requestId = btn.dataset.requestId;
      if (!requestId) return;
      if (action === 'accept-request' || action === 'reject-request') {
        handleRequestAction(action, requestId);
      }
    });

    friendsList?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-social-action]');
      if (!btn) return;
      const action = btn.dataset.socialAction;
      if (action === 'visit-friend') {
        const friendUserId = btn.dataset.friendId;
        if (!friendUserId) return;
        handleVisit(friendUserId);
      }
    });

    const debugFriendsList = getEl('social-friends-debug-list');
    debugFriendsList?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-social-action="set-friend-status"]');
      if (!btn) return;
      const friendUserId = btn.dataset.friendId;
      const status = btn.dataset.status;
      if (!friendUserId || !status) return;
      handleSetFriendStatus(friendUserId, status);
    });

    const visitActions = getEl('social-visit-actions');
    visitActions?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-social-action="visit-interaction"]');
      if (!btn) return;
      const action = btn.dataset.action;
      if (!action) return;
      handleVisitInteraction(action);
    });

    const gomokuBoard = getEl('social-gomoku-board');
    gomokuBoard?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-social-action="gomoku-cell"]');
      if (!btn) return;
      handleGomokuMove(btn.dataset.row, btn.dataset.col);
    });

    const gomokuReset = getEl('social-gomoku-reset');
    gomokuReset?.addEventListener('click', () => {
      handleGomokuReset();
    });
  }

  function init() {
    if (initialized) return;
    initialized = true;

    bindEvents();
    const snapshot = SocialState.getState();
    lastRoomId = snapshot.currentRoom?.roomId || null;

    SocialState.on('change', (payload = {}) => {
      const state = payload.state || SocialState.getState();
      const nextRoomId = state.currentRoom?.roomId || null;
      if (!lastRoomId && nextRoomId) {
        activeTab = 'visit';
      }
      lastRoomId = nextRoomId;

      // ── 亲密度升级动画 ──
      if (payload.reason === 'intimacy.level-up' && state._intimacyLevelUp) {
        const levelUpData = state._intimacyLevelUp;
        // 延迟一帧让 DOM 更新完毕后添加动画 class
        requestAnimationFrame(() => {
          const friendEl = document.querySelector(`[data-friend-id="${levelUpData.friendUserId}"]`);
          const badge = friendEl?.querySelector('.social-intimacy-badge');
          if (badge) {
            badge.classList.add('is-leveled-up');
            setTimeout(() => badge.classList.remove('is-leveled-up'), 1000);
          }
        });
      }

      renderAll();
    });

    renderAll();
  }

  return {
    init,
    open,
    render: renderAll,
    setActiveTab,
  };
})();

window.SocialPanel = SocialPanel;
