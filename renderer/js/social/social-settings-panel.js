/* ═══════════════════════════════════════════
   社交设置面板（最小可见闭环）
   在系统设置内提供资料、好友、状态、拜访的基础 UI
   ═══════════════════════════════════════════ */

const SocialSettingsPanel = (() => {
  let initialized = false;

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

  function getEl(id) {
    return document.getElementById(id);
  }

  function toast(text, duration = 2200) {
    if (typeof BubbleSystem !== 'undefined' && BubbleSystem.show) {
      BubbleSystem.show(text, duration);
      return;
    }
    console.log('[social-settings]', text);
  }

  function safeSetInputValue(id, value) {
    const el = getEl(id);
    if (!el) return;
    if (document.activeElement === el) return;
    el.value = String(value || '');
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

  function renderGateway(state) {
    const gatewayEl = getEl('social-gateway-mode');
    if (!gatewayEl) return;

    const btnLocal = getEl('social-switch-local');
    const btnRemote = getEl('social-switch-remote');

    const gateway = state.gateway || {};
    const mode = String(gateway.mode || 'local').trim().toLowerCase();
    const fallback = !!gateway.fallback;

    let text = mode === 'remote' ? 'REMOTE' : 'LOCAL';
    if (fallback) text = `${text}（回退）`;
    gatewayEl.textContent = text;

    gatewayEl.classList.remove('is-local', 'is-remote', 'is-fallback');
    gatewayEl.classList.add(mode === 'remote' ? 'is-remote' : 'is-local');
    if (fallback) gatewayEl.classList.add('is-fallback');

    if (btnLocal) {
      btnLocal.classList.toggle('active', mode === 'local');
    }
    if (btnRemote) {
      btnRemote.classList.toggle('active', mode === 'remote' && !fallback);
    }

    const requested = String(gateway.requested || mode || 'local').toLowerCase();
    if (fallback && requested === 'remote') {
      gatewayEl.title = '远端接入未就绪，已自动回退到本地模式';
      return;
    }

    gatewayEl.title = mode === 'remote'
      ? '当前由远端适配器提供社交能力'
      : '当前由本地 Electron backend 提供社交能力';
  }

  function renderProfile(state) {
    const profile = state.profile || null;
    const displayCode = getEl('social-display-code');

    safeSetInputValue('social-owner-name-input', profile?.ownerName || '');
    safeSetInputValue('social-pet-name-input', profile?.petName || '');

    if (displayCode) {
      displayCode.textContent = profile?.displayCode || '未生成';
    }
  }

  function renderPresence(state) {
    const current = String(state.presence?.userStatus || 'offline').trim();
    document.querySelectorAll('.social-presence-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.status === current);
    });
  }

  function renderRoom(state) {
    const roomState = getEl('social-room-state');
    const actionRow = getEl('social-visit-actions');
    const inRoom = !!state.currentRoom;

    if (roomState) {
      if (!inRoom) {
        roomState.textContent = '空闲';
      } else {
        const room = state.currentRoom;
        const guest = room.guestOwnerName || room.guestPetName || room.guestUserId || '访客';
        roomState.textContent = `拜访中（${guest}）`;
      }
    }

    if (actionRow) {
      actionRow.querySelectorAll('[data-social-action="visit-interaction"]').forEach((btn) => {
        btn.disabled = !inRoom;
        btn.classList.toggle('is-disabled', !inRoom);
      });
    }
  }

  function renderRequestList(state) {
    const listEl = getEl('social-request-list');
    if (!listEl) return;

    const inboundPending = (state.requests || []).filter((item) => item.direction === 'inbound' && item.state === 'pending');
    if (inboundPending.length === 0) {
      listEl.innerHTML = '<div class="social-list-empty">暂无待处理请求</div>';
      return;
    }

    listEl.innerHTML = inboundPending.map((item) => {
      const owner = item.friendOwnerName || item.fromOwnerName || '好友';
      const pet = item.friendPetName || item.fromPetName || '宠物';
      const message = String(item.message || '').trim();
      const messageHtml = message ? `<div class="social-list-sub">附言：${escapeHtml(message)}</div>` : '';

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
      listEl.innerHTML = '<div class="social-list-empty">还没有好友，先用好友码添加一个吧</div>';
      return;
    }

    listEl.innerHTML = friends.map((friend) => {
      const normalizedStatus = typeof SocialVisitRules !== 'undefined'
        ? SocialVisitRules.normalizeStatus(friend.status, 'offline')
        : String(friend.status || 'offline').trim();
      const status = PRESENCE_LABEL[normalizedStatus] || '离线';
      const code = friend.friendCode ? ` · ${escapeHtml(friend.friendCode)}` : '';
      const visitCheck = typeof SocialVisitRules !== 'undefined'
        ? SocialVisitRules.canVisitFriend(friend.friendUserId, state)
        : { ok: normalizedStatus === 'online', message: '' };
      const disabled = !visitCheck.ok;
      const buttonTitle = disabled ? ` title="${escapeHtml(visitCheck.message || '当前不可拜访')}"` : '';

      return `
        <div class="social-list-item" data-friend-id="${friend.friendUserId}">
          <div class="social-list-main">${escapeHtml(friend.ownerName || '好友')} · ${escapeHtml(friend.petName || '宠物')}</div>
          <div class="social-list-sub">状态：${status}${code}</div>
          <div class="social-friend-status-actions">
            <button class="settings-action-btn social-mini-btn${normalizedStatus === 'online' ? ' active' : ''}" data-social-action="set-friend-status" data-friend-id="${friend.friendUserId}" data-status="online">在线</button>
            <button class="settings-action-btn social-mini-btn${normalizedStatus === 'busy' ? ' active' : ''}" data-social-action="set-friend-status" data-friend-id="${friend.friendUserId}" data-status="busy">忙碌</button>
            <button class="settings-action-btn social-mini-btn${normalizedStatus === 'focus' ? ' active' : ''}" data-social-action="set-friend-status" data-friend-id="${friend.friendUserId}" data-status="focus">专注</button>
            <button class="settings-action-btn social-mini-btn${normalizedStatus === 'away' ? ' active' : ''}" data-social-action="set-friend-status" data-friend-id="${friend.friendUserId}" data-status="away">离开</button>
            <button class="settings-action-btn social-mini-btn${normalizedStatus === 'offline' ? ' active' : ''}" data-social-action="set-friend-status" data-friend-id="${friend.friendUserId}" data-status="offline">离线</button>
          </div>
          <div class="social-list-actions">
            <button class="settings-action-btn social-visit-btn${disabled ? ' is-disabled' : ''}" data-social-action="visit-friend" data-friend-id="${friend.friendUserId}"${disabled ? ' disabled' : ''}${buttonTitle}>${disabled ? '暂不可访' : '发起拜访'}</button>
          </div>
        </div>
      `;
    }).join('');
  }

  function renderAll() {
    const state = SocialState.getState();
    renderGateway(state);
    renderProfile(state);
    renderPresence(state);
    renderRoom(state);
    renderRequestList(state);
    renderFriendList(state);
  }

  async function handleSaveProfile() {
    const owner = getEl('social-owner-name-input')?.value || '';
    const pet = getEl('social-pet-name-input')?.value || '';

    const res = await SocialActions.adoptProfile(owner, pet, 'gg');
    if (res?.success) {
      toast('社交资料已保存', 1800);
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
      if (!allowLoopback && msgInput) msgInput.value = '';
      toast(allowLoopback ? '已创建本地回环请求，可在待处理列表中接受' : '好友申请已发送', 2200);
      return;
    }
    toast(`发送失败：${res?.message || '未知错误'}`, 2600);
  }

  async function handlePresenceChange(userStatus) {
    const res = await SocialActions.setPresence(userStatus);
    if (!res?.success) {
      toast(`状态切换失败：${res?.message || '未知错误'}`, 2200);
    }
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
    }
  }

  async function handleVisitInteraction(action) {
    const state = SocialState.getState();
    if (!state.currentRoom) {
      toast('请先进入拜访会话再触发双宠互动', 2000);
      return;
    }

    const res = await SocialActions.sendVisitInteraction(action, {
      source: 'settings-panel',
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
    const btnLoopback = getEl('social-send-loopback-request');
    const btnSwitchLocal = getEl('social-switch-local');
    const btnSwitchRemote = getEl('social-switch-remote');
    const btnLeaveRoom = getEl('social-leave-room');
    const requestList = getEl('social-request-list');
    const friendsList = getEl('social-friends-list');
    const presenceButtons = getEl('social-presence-buttons');

    btnSaveProfile?.addEventListener('click', handleSaveProfile);
    btnCopyCode?.addEventListener('click', handleCopyCode);
    btnSendRequest?.addEventListener('click', () => handleSendRequest(false));
    btnLoopback?.addEventListener('click', () => handleSendRequest(true));
    btnSwitchLocal?.addEventListener('click', () => handleSwitchGateway('local'));
    btnSwitchRemote?.addEventListener('click', () => handleSwitchGateway('remote'));
    btnLeaveRoom?.addEventListener('click', handleLeaveRoom);

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
        return;
      }

      if (action === 'set-friend-status') {
        const friendUserId = btn.dataset.friendId;
        const status = btn.dataset.status;
        if (!friendUserId || !status) return;
        handleSetFriendStatus(friendUserId, status);
      }
    });

    const visitActions = getEl('social-visit-actions');
    visitActions?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-social-action="visit-interaction"]');
      if (!btn) return;
      const action = btn.dataset.action;
      if (!action) return;
      handleVisitInteraction(action);
    });
  }

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function init() {
    if (initialized) return;
    initialized = true;

    bindEvents();
    SocialState.on('change', () => {
      renderAll();
    });
    renderAll();
  }

  return {
    init,
    render: renderAll,
  };
})();
