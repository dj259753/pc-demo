/* ═══════════════════════════════════════════
   社交中心独立窗口入口
   只初始化社交模块，不引入宠物核心
   ═══════════════════════════════════════════ */

(function SocialWindowApp() {
  'use strict';

  const PRESENCE_LABEL = {
    online: '在线', busy: '忙碌', focus: '专注', away: '离开', offline: '离线',
  };
  const VISIT_INTERACTION_LABEL = {
    wave: '打招呼', handshake: '握手', hug: '贴贴',
    highfive: '击掌', 'sync-walk': '同步散步', 'invite-game': '邀请小游戏',
  };
  const GOMOKU_SIZE = 15;

  let activeTab = 'visit';
  let gomokuActionPending = false;
  let searchFilter = '';

  /* ─── 工具 ─── */
  const $ = (id) => document.getElementById(id);
  const escapeHtml = (t) => String(t||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  function toast(text, duration = 2200) {
    const el = $('sw-toast');
    if (!el) { console.log('[social-window]', text); return; }
    el.textContent = String(text||'');
    el.classList.remove('hidden');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.add('hidden'), duration);
  }

  /* ─── 标题栏拖拽 ─── */
  function initTitlebar() {
    $('sw-btn-close')?.addEventListener('click', () => {
      if (window.electronAPI?.closeSocialWindow) {
        window.electronAPI.closeSocialWindow();
      } else {
        window.close();
      }
    });
  }

  /* ─── Tab 切换 ─── */
  function setTab(tab) {
    activeTab = tab;
    document.querySelectorAll('.sw-activity-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    document.querySelectorAll('.sw-activity-panel').forEach(panel => {
      panel.classList.toggle('hidden', panel.dataset.panel !== tab);
    });
  }

  /* ─── 渲染：个人信息条 ─── */
  function renderProfileBar(state) {
    const profile = state.profile || null;
    const presence = String(state.presence?.userStatus || 'offline').trim();

    const nameEl = $('sw-profile-name');
    const dotEl = $('sw-presence-dot');
    const labelEl = $('sw-presence-label');
    const codeEl = $('sw-friend-code');
    const profileCodeEl = $('sw-profile-code');
    const genderTagEl = $('sw-pet-gender-tag');

    if (nameEl) nameEl.textContent = profile ? `${profile.ownerName} · ${profile.petName}` : '先起个名字吧';
    if (dotEl) { dotEl.className = `sw-presence-dot is-${presence}`; }
    if (labelEl) labelEl.textContent = PRESENCE_LABEL[presence] || '离线';
    if (codeEl) codeEl.textContent = profile?.displayCode || '未生成';
    if (profileCodeEl) profileCodeEl.textContent = profile?.displayCode || '会自动同步显示';

    // 宠物性别标签：GG ♂ 蓝色 / MM ♀ 粉色
    if (genderTagEl) {
      const g = profile?.petGender || 'gg';
      genderTagEl.textContent = g === 'mm' ? 'MM ♀' : 'GG ♂';
      genderTagEl.className = `sw-pet-gender-tag is-${g}`;
      genderTagEl.title = g === 'mm' ? '女（MM）' : '男（GG）';
    }

    // 更新下拉菜单中的当前激活项
    document.querySelectorAll('.sw-dropdown-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.status === presence);
    });

    // 触发器禁用态（未设置名片时灰化）
    const trigger = $('sw-presence-trigger');
    if (trigger) trigger.style.opacity = profile ? '1' : '0.5';
    if (trigger) trigger.style.pointerEvents = profile ? '' : 'none';

    // 编辑面板输入回填
    const ownerInput = $('sw-edit-owner');
    const petInput = $('sw-edit-pet');
    if (ownerInput && document.activeElement !== ownerInput) ownerInput.value = profile?.ownerName || '';
    if (petInput && document.activeElement !== petInput) petInput.value = profile?.petName || '';
    // 性别回填到编辑面板的按钮组
    const gender = profile?.petGender || 'gg';
    document.querySelectorAll('#sw-edit-panel .sw-gender-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.gender === gender);
    });

    // 隐藏区性别回填（兼容旧逻辑）
    const hiddenOwnerInput = $('sw-owner-name');
    const hiddenPetInput = $('sw-pet-name');
    if (hiddenOwnerInput && document.activeElement !== hiddenOwnerInput) hiddenOwnerInput.value = profile?.ownerName || '';
    if (hiddenPetInput && document.activeElement !== hiddenPetInput) hiddenPetInput.value = profile?.petName || '';
    document.querySelectorAll('.sw-inline-profile-section .sw-gender-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.gender === gender);
    });
  }

  /* ─── 渲染：好友列表（合并在线+离线，在线在上） ─── */
  function renderFriendLists(state) {
    const rawFriends = Array.isArray(state.friends) ? state.friends.filter(f => !f.isBlocked) : [];
    // 按 friendUserId 去重
    const seen = new Set();
    const friends = rawFriends.filter(f => {
      const id = f.friendUserId || f.friendCode || Math.random().toString(16).slice(2);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    const filter = searchFilter.toLowerCase();

    const online = [];
    const offline = [];

    friends.forEach(f => {
      const status = typeof SocialVisitRules !== 'undefined'
        ? SocialVisitRules.normalizeStatus(f.status, 'offline')
        : String(f.status || 'offline').trim();

      const name = `${f.ownerName || '好友'} · ${f.petName || '宠物'}`;
      if (filter && !name.toLowerCase().includes(filter) && !(f.friendCode||'').toLowerCase().includes(filter)) {
        return;
      }

      const item = { ...f, normalizedStatus: status, displayName: name };
      if (status === 'offline') { offline.push(item); } else { online.push(item); }
    });

    // 合并：在线在上，离线在下
    const all = [...online, ...offline];
    const listEl = $('sw-friends-list');
    const countEl = $('sw-friends-count');
    if (!listEl) return;
    if (countEl) countEl.textContent = String(all.length);

    if (all.length === 0) {
      listEl.innerHTML = '<div class="sw-empty">还没有好友，先发一个好友申请吧</div>';
      return;
    }

    listEl.innerHTML = all.map(f => {
      const isOnline = f.normalizedStatus !== 'offline';
      const visitCheck = isOnline && typeof SocialVisitRules !== 'undefined'
        ? SocialVisitRules.canVisitFriend(f.friendUserId, state)
        : { ok: false, message: '' };
      const visitDisabled = !visitCheck.ok;
      const fGender = f.petGender || 'gg';

      // ── 检查是否有外发待处理的拜访请求（来自服务端 /pending，含 direction 字段）──
      const visitReqs = state.visitRequests || [];
      const outboundPending = visitReqs.find(
        r => r.state === 'pending' && r.direction === 'outbound'
          && (r.targetUserId === f.friendUserId)
      );
      const isWaitingOutbound = !!outboundPending;

      // ── 检查是否在「拜访中」（自己或对方都在活跃房间）──
      const activeVisits = state.activeVisits || { myself: null, friendsInVisit: [] };
      const myVisit = activeVisits.myself;           // 我是否在拜访中
      const friendInVisit = activeVisits.friendsInVisit?.find(v => v.userId === f.friendUserId);
      const iAmInVisit = !!myVisit;
      const friendIsVisiting = !!friendInVisit;

      // 正在拜访该好友（我是 guest）或 该好友正在拜访我 / 别人
      const isFriendBusy = friendIsVisiting || (iAmInVisit && friendInVisit);

      // ── 亲密度徽章 ──
      const score = (f.intimacy && typeof f.intimacy.score === 'number') ? f.intimacy.score : 0;
      let intimacyIcon = '🥚', intimacyName = '初识', intimacyColor = '#9E9E9E';
      if (score >= 7000)      { intimacyIcon = '🌟'; intimacyName = '羁友'; intimacyColor = '#E91E63'; }
      else if (score >= 3000) { intimacyIcon = '💎'; intimacyName = '挚交'; intimacyColor = '#9C27B0'; }
      else if (score >= 1200) { intimacyIcon = '🔥'; intimacyName = '死党'; intimacyColor = '#FF9800'; }
      else if (score >= 400)  { intimacyIcon = '💚'; intimacyName = '挚友'; intimacyColor = '#4CAF50'; }
      else if (score >= 100)  { intimacyIcon = '🌱'; intimacyName = '熟人'; intimacyColor = '#8BC34A'; }
      const intimacyBadge = `<span class="sw-intimacy-badge" style="--ic:${intimacyColor}" title="${intimacyName}${score > 0 ? ' · ' + score + ' 分' : ''}">${intimacyIcon} ${intimacyName}${score > 0 ? ' <small>❤️' + score + '</small>' : ''}</span>`;

      // 按钮状态：拜访中 > 外发待处理 > disabled > 正常
      let visitBtnHtml = '';
      if (isOnline) {
        if (isFriendBusy) {
          const busyLabel = friendInVisit?.role === 'host'
            ? `🔒 拜访中` : '🔒 拜访中';
          visitBtnHtml = `<button class="sw-btn-visit sw-btn-visit-busy" disabled title="对方正在拜访会话中">${busyLabel}</button>`;
        } else if (iAmInVisit) {
          visitBtnHtml = `<button class="sw-btn-visit sw-btn-visit-busy" disabled title="你正在拜访中">🚶 拜访中</button>`;
        } else if (isWaitingOutbound) {
          visitBtnHtml = `<button class="sw-btn-visit sw-btn-visit-waiting" data-social-action="cancel-outbound-visit" data-friend-id="${f.friendUserId}" data-visit-request-id="${outboundPending.visitRequestId || ''}" title="点击撤销待处理的拜访申请">⏳ 等待中</button>`;
        } else if (visitDisabled) {
          visitBtnHtml = `<button class="sw-btn-visit disabled" disabled title="${escapeHtml(visitCheck.message||'暂不可访')}">拜访</button>`;
        } else {
          visitBtnHtml = `<button class="sw-btn-visit" data-social-action="visit-friend" data-friend-id="${f.friendUserId}">拜访</button>`;
        }
      }

      return `
        <div class="sw-friend-item${isOnline ? '' : ' sw-friend-offline'}" data-friend-id="${f.friendUserId}">
          <div class="sw-friend-avatar">🐧</div>
          <div class="sw-friend-info">
            <div class="sw-friend-name">${escapeHtml(f.displayName)} <span class="sw-pet-gender-tag is-${fGender}">${fGender === 'mm' ? 'MM ♀' : 'GG ♂'}</span> ${intimacyBadge}</div>
            <div class="sw-friend-meta">${PRESENCE_LABEL[f.normalizedStatus] || '离线'}${f.friendCode ? ' · ' + escapeHtml(f.friendCode) : ''}</div>
          </div>
          <span class="sw-presence-dot is-${f.normalizedStatus}"></span>
          ${visitBtnHtml}
        </div>`;
    }).join('');
  }

  /* ─── 渲染：好友申请 ─── */
  function renderRequests(state) {
    const pending = (state.requests || []).filter(r => r.direction === 'inbound' && r.state === 'pending');
    const section = $('sw-requests-section');
    const countEl = $('sw-request-count');
    const listEl = $('sw-request-list');
    if (!section || !listEl) return;

    section.classList.toggle('hidden', pending.length === 0);
    if (countEl) countEl.textContent = String(pending.length);

    if (pending.length === 0) { listEl.innerHTML = ''; return; }

    listEl.innerHTML = pending.map(req => {
      const owner = req.friendOwnerName || req.fromOwnerName || '好友';
      const pet = req.friendPetName || req.fromPetName || '宠物';
      const msg = String(req.message || '').trim();
      return `
        <div class="sw-request-item" data-request-id="${req.requestId}">
          <div class="sw-friend-avatar">🐧</div>
          <div class="sw-friend-info">
            <div class="sw-friend-name">${escapeHtml(owner)} · ${escapeHtml(pet)}</div>
            ${msg ? `<div class="sw-friend-meta">留言：${escapeHtml(msg)}</div>` : ''}
          </div>
          <button class="sw-btn-accept" data-social-action="accept-request" data-request-id="${req.requestId}">接受</button>
          <button class="sw-btn-reject" data-social-action="reject-request" data-request-id="${req.requestId}">拒绝</button>
        </div>`;
    }).join('');
  }

  /* ─── 渲染：拜访会话 ─── */
  function renderRoom(state) {
    const room = state.currentRoom || null;
    const inRoom = !!room;
    const roomName = room ? (room.guestOwnerName || room.guestPetName || '对方') : '';

    const statusEl = $('sw-room-status');
    const hintEl = $('sw-room-hint');
    const leaveBtn = $('sw-leave-room');
    const actionsEl = $('sw-visit-actions');

    if (statusEl) statusEl.textContent = inRoom ? `拜访中：${roomName}` : '空闲';
    if (hintEl) hintEl.textContent = inRoom ? '互动按钮会把动作事件发给当前拜访会话。' : '从好友列表对在线好友发起拜访后，这里会显示当前会话。';
    if (leaveBtn) { leaveBtn.disabled = !inRoom; }

    if (actionsEl) {
      actionsEl.querySelectorAll('[data-social-action="visit-interaction"]').forEach(btn => {
        const action = btn.dataset.action;
        const blocked = action === 'invite-game' && !state.featureFlags?.miniGameEnabled;
        btn.disabled = !inRoom || blocked;
      });
    }
  }

  /* ─── 渲染：五子棋 ─── */
  function renderGomoku(state) {
    const boardEl = $('sw-gomoku-board');
    const statusEl = $('sw-gomoku-status');
    const resetBtn = $('sw-gomoku-reset');
    if (!boardEl || !statusEl || !resetBtn) return;

    const roomId = state.currentRoom?.roomId || null;
    const game = state.currentGame && state.currentGame.type === 'gomoku' && state.currentGame.roomId === roomId ? state.currentGame : null;
    const enabled = !!state.featureFlags?.miniGameEnabled;
    const ready = !!roomId && !!game && enabled;
    const winner = String(game?.winner || '').trim();

    if (!roomId) {
      statusEl.textContent = '先进入拜访会话，再发送五子棋邀请。';
      boardEl.innerHTML = '';
      boardEl.setAttribute('aria-hidden', 'true');
      resetBtn.disabled = true;
      return;
    }
    if (!enabled) {
      statusEl.textContent = '当前版本还没有开启小游戏能力。';
      boardEl.innerHTML = '';
      resetBtn.disabled = true;
      return;
    }
    if (!game) {
      statusEl.textContent = '已进入拜访；点击"五子棋"按钮后开始对局。';
      boardEl.innerHTML = '';
      resetBtn.disabled = true;
      return;
    }

    const nextLabel = game.nextStone === 'black' ? '黑子' : '白子';
    statusEl.textContent = winner
      ? `本局结束：${winner === 'draw' ? '平局' : `${winner === 'black' ? '黑子' : '白子'}获胜`}。`
      : `当前轮到${nextLabel}。`;

    boardEl.setAttribute('aria-hidden', 'false');
    boardEl.innerHTML = (Array.isArray(game.board) ? game.board : []).map((row, ri) =>
      row.map((cell, ci) => {
        const cls = cell ? ` is-${cell}` : '';
        const dis = !ready || gomokuActionPending || game.status !== 'active' || !!cell;
        return `<button class="sw-gomoku-cell${cls}" data-row="${ri}" data-col="${ci}"${dis ? ' disabled' : ''}></button>`;
      }).join('')
    ).join('');

    resetBtn.disabled = !ready || gomokuActionPending;
  }

  /* ─── 渲染：网关模式 ─── */
  function renderGateway(state) {
    const el = $('sw-gateway-mode');
    const gateway = state.gateway || {};
    const mode = String(gateway.mode || 'local').trim().toLowerCase();
    const fallback = !!gateway.fallback;
    if (el) {
      let text = mode === 'real-remote' ? 'REMOTE' : (mode === 'remote' ? 'MOCK' : 'LOCAL');
      if (fallback) text += '（回退）';
      el.textContent = text;
      el.className = `sw-gateway-badge is-${mode === 'real-remote' ? 'remote' : mode}${fallback ? ' is-fallback' : ''}`;
    }
    const btnLocal = $('sw-switch-local');
    const btnRemote = $('sw-switch-remote');
    const btnRealRemote = $('sw-switch-real-remote');
    if (btnLocal) btnLocal.classList.toggle('active', mode === 'local');
    if (btnRemote) btnRemote.classList.toggle('active', mode === 'remote' && !fallback);
    if (btnRealRemote) btnRealRemote.classList.toggle('active', mode === 'real-remote' && !fallback);
  }

  /* ─── 渲染：调试好友列表 ─── */
  function renderDebugFriendList(state) {
    const listEl = $('sw-debug-friend-list');
    if (!listEl) return;
    const friends = Array.isArray(state.friends) ? state.friends.filter(f => !f.isBlocked) : [];
    if (friends.length === 0) { listEl.innerHTML = '<div class="sw-empty">暂无可模拟状态的好友</div>'; return; }

    listEl.innerHTML = friends.map(f => {
      const ns = typeof SocialVisitRules !== 'undefined' ? SocialVisitRules.normalizeStatus(f.status, 'offline') : 'offline';
      return `
        <div class="sw-debug-item" data-friend-id="${f.friendUserId}">
          <span>${escapeHtml(f.ownerName || '好友')} · ${escapeHtml(f.petName || '宠物')}</span>
          <span class="sw-presence-dot is-${ns}"></span>
          <div class="sw-debug-actions">
            ${['online','busy','focus','away','offline'].map(s =>
              `<button class="sw-btn-tiny${ns===s?' active':''}" data-social-action="set-friend-status" data-friend-id="${f.friendUserId}" data-status="${s}">${PRESENCE_LABEL[s]}</button>`
            ).join('')}
          </div>
        </div>`;
    }).join('');
  }

  /* ─── 渲染：拜访申请通知 ─── */
  function renderVisitRequests(state) {
    let container = $('sw-visit-request-banner');
    if (!container) {
      // 动态创建通知容器，插到 main 前面
      container = document.createElement('div');
      container.id = 'sw-visit-request-banner';
      container.className = 'sw-visit-request-banner';
      const main = document.querySelector('.sw-main');
      if (main) main.parentNode.insertBefore(container, main);
      else return;
    }

    const pending = (state.visitRequests || []).filter(
      r => r.direction === 'inbound' && r.state === 'pending'
    );

    if (pending.length === 0) {
      container.innerHTML = '';
      container.classList.add('hidden');
      return;
    }

    container.classList.remove('hidden');
    container.innerHTML = pending.map(req => {
      const name = req.fromOwnerName || '好友';
      const pet = req.fromPetName || '宠物';
      const msg = String(req.message || '').trim();
      const intentLabel = req.intent === 'say-hi' ? '打招呼' : (req.intent || '拜访');
      return `
        <div class="sw-visit-request-card" data-visit-request-id="${req.visitRequestId}">
          <div class="sw-vr-info">
            <div class="sw-vr-title">🐾 ${escapeHtml(name)} 的 ${escapeHtml(pet)} 想来拜访</div>
            <div class="sw-vr-meta">目的：${escapeHtml(intentLabel)}${msg ? ' · 留言：' + escapeHtml(msg) : ''}</div>
          </div>
          <div class="sw-vr-actions">
            <button class="sw-btn-accept" data-social-action="accept-visit" data-visit-request-id="${req.visitRequestId}">接受</button>
            <button class="sw-btn-reject" data-social-action="reject-visit" data-visit-request-id="${req.visitRequestId}">拒绝</button>
          </div>
        </div>`;
    }).join('');
  }

  /* ─── 统一渲染 ─── */
  /* ─── 渲染：在线大厅（所有在线用户） ─── */
  let lobbyUsers = [];      // 缓存最新大厅数据
  let lobbyLoading = false;
  const LOBBY_AUTO_INTERVAL_MS = 20000; // 窗口开着时每 20s 自动刷新一次
  let lobbyAutoTimer = null;

  async function loadLobby() {
    if (lobbyLoading) return;
    const adapter = typeof SocialGateway !== 'undefined' && SocialGateway.getAdapter ? SocialGateway.getAdapter() : null;
    if (!adapter || typeof adapter.getOnlineUsers !== 'function') return;

    lobbyLoading = true;
    $('sw-lobby-refresh') && ($('sw-lobby-refresh').disabled = true);
    try {
      const res = await adapter.getOnlineUsers();
      if (res?.success && Array.isArray(res.data?.users)) {
        lobbyUsers = res.data.users;
        renderLobby();
      }
    } catch (e) {
      console.warn('[lobby] loadLobby error:', e);
    } finally {
      lobbyLoading = false;
      $('sw-lobby-refresh') && ($('sw-lobby-refresh').disabled = false);
    }
  }

  /** 启动大厅定时自动刷新（窗口可见期间持续运行） */
  function startLobbyAutoRefresh() {
    stopLobbyAutoRefresh();
    lobbyAutoTimer = setInterval(() => {
      // 静默刷新，不阻塞用户操作
      loadLobby();
    }, LOBBY_AUTO_INTERVAL_MS);
  }

  /** 停止大厅定时刷新 */
  function stopLobbyAutoRefresh() {
    if (lobbyAutoTimer) { clearInterval(lobbyAutoTimer); lobbyAutoTimer = null; }
  }

  function renderLobby() {
    const listEl = $('sw-lobby-list');
    const countEl = $('sw-lobby-count');
    if (!listEl) return;
    if (countEl) countEl.textContent = String(lobbyUsers.length);

    if (lobbyUsers.length === 0) {
      listEl.innerHTML = '<div class="sw-empty">当前没有其他在线用户</div>';
      return;
    }

    const state = SocialState.getState();
    const friendIds = new Set(
      (Array.isArray(state.friends) ? state.friends : []).map(f => f.friendUserId)
    );

    listEl.innerHTML = lobbyUsers.map(u => {
      const name = `${escapeHtml(u.ownerName || '用户')} · ${escapeHtml(u.petName || '宠物')}`;
      const statusDot = `<span class="sw-presence-dot is-${u.status || 'online'}"></span>`;
      const isFriend = u.relation === 'friend' || friendIds.has(u.userId);
      const uGender = u.petGender || 'gg';
      const uGenderTag = `<span class="sw-pet-gender-tag is-${uGender}">${uGender === 'mm' ? 'MM ♀' : 'GG ♂'}</span>`;

      let actionBtn = '';
      if (isFriend) {
        // 已是好友：显示拜访按钮
        const visitCheck = typeof SocialVisitRules !== 'undefined'
          ? SocialVisitRules.canVisitFriend(u.userId, state)
          : { ok: true, message: '' };
        const visitDisabled = !visitCheck.ok;
        actionBtn = `<button class="sw-btn-visit${visitDisabled ? ' disabled' : ''}" data-social-action="visit-friend" data-friend-id="${escapeHtml(u.userId)}"${visitDisabled ? ' disabled title="' + escapeHtml(visitCheck.message||'暂不可访') + '"' : ''}>拜访</button>`;
      } else if (u.relation === 'pending-out') {
        actionBtn = `<span class="sw-lobby-tag is-pending">已申请</span>`;
      } else if (u.relation === 'pending-in') {
        actionBtn = `<span class="sw-lobby-tag is-pending">待处理</span>`;
      } else {
        actionBtn = `<button class="sw-btn-add-lobby" data-social-action="add-from-lobby" data-friend-code="${escapeHtml(u.friendCode || '')}" data-user-id="${escapeHtml(u.userId || '')}">＋ 加好友</button>`;
      }
      return `
        <div class="sw-friend-item sw-lobby-item" data-user-id="${escapeHtml(u.userId)}">
          <div class="sw-friend-avatar">🐧</div>
          <div class="sw-friend-info">
            <div class="sw-friend-name">${name}${uGenderTag}</div>
            <div class="sw-friend-meta">${PRESENCE_LABEL[u.status] || '在线'}${u.displayCode ? ' · ' + escapeHtml(u.displayCode) : ''}</div>
          </div>
          ${statusDot}
          ${actionBtn}
        </div>`;
    }).join('');
  }

  function renderAll() {
    const state = SocialState.getState();
    renderProfileBar(state);
    renderFriendLists(state);
    renderRequests(state);
    renderVisitRequests(state);
    renderRoom(state);
    renderGomoku(state);
    renderGateway(state);
    renderDebugFriendList(state);
    renderLobby(); // 大厅用本地缓存即时渲染，不重复请求
  }

  /* ─── 事件绑定 ─── */
  function bindEvents() {
    // Tab 切换
    $('sw-activity-tabs')?.addEventListener('click', e => {
      const btn = e.target.closest('.sw-activity-tab');
      if (btn?.dataset.tab) setTab(btn.dataset.tab);
    });

    // 搜索
    $('sw-search-input')?.addEventListener('input', e => {
      searchFilter = String(e.target.value || '').trim();
      renderFriendLists(SocialState.getState());
    });

    // 添加好友面板切换
    $('sw-btn-add-friend')?.addEventListener('click', () => {
      $('sw-add-friend-panel')?.classList.toggle('hidden');
    });

    // 发送好友申请
    $('sw-send-request')?.addEventListener('click', () => handleSendRequest(false));
    $('sw-send-loopback')?.addEventListener('click', () => handleSendRequest(true));

    // 状态下拉菜单
    const presenceTrigger = $('sw-presence-trigger');
    const presenceDropdown = $('sw-presence-dropdown');
    if (presenceTrigger && presenceDropdown) {
      presenceTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = !presenceDropdown.classList.contains('hidden');
        presenceDropdown.classList.toggle('hidden', isOpen);
        presenceTrigger.classList.toggle('open', !isOpen);
      });
      presenceDropdown.addEventListener('click', (e) => {
        const btn = e.target.closest('.sw-dropdown-item');
        if (btn?.dataset.status) {
          handlePresenceChange(btn.dataset.status);
          presenceDropdown.classList.add('hidden');
          presenceTrigger.classList.remove('open');
        }
      });
      // 点击外部关闭
      document.addEventListener('click', () => {
        presenceDropdown.classList.add('hidden');
        presenceTrigger.classList.remove('open');
      });
    }

    // 复制好友码
    $('sw-copy-code')?.addEventListener('click', handleCopyCode);

    // 保存名片（隐藏区兼容）
    $('sw-save-profile')?.addEventListener('click', handleSaveProfile);

    // ─── 编辑资料面板（✏️ 按钮） ───
    const editBtn = $('sw-edit-profile-btn');
    const editPanel = $('sw-edit-panel');
    if (editBtn && editPanel) {
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        // 回填当前值
        const state = SocialState.getState();
        const p = state.profile || {};
        $('sw-edit-owner').value = p.ownerName || '';
        $('sw-edit-pet').value = p.petName || '';
        document.querySelectorAll('#sw-edit-panel .sw-gender-btn').forEach(btn => {
          btn.classList.toggle('active', btn.dataset.gender === (p.petGender || 'gg'));
        });
        editPanel.classList.toggle('hidden');
      });

      // 取消按钮
      $('sw-cancel-edit-btn')?.addEventListener('click', () => {
        editPanel.classList.add('hidden');
      });

      // 保存修改（核心：写配置 + 通知主窗口切换 SWF）
      $('sw-save-edit-btn')?.addEventListener('click', async () => {
        const owner = ($('sw-edit-owner')?.value || '').trim();
        const pet = ($('sw-edit-pet')?.value || '').trim();
        if (!owner || !pet) { toast('主人名和宠物名不能为空', 2000); return; }
        const activeGenderBtn = document.querySelector('#sw-edit-panel .sw-gender-btn.active');
        const petGender = activeGenderBtn?.dataset.gender || 'gg';

        const saveBtn = $('sw-save-edit-btn');
        if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '保存中…'; }

        try {
          // ─── 步骤1：若尚未注册（没有 token），先向服务端注册 ───
          const adapter = window.SocialRealRemoteAdapter;
          if (adapter && !adapter.isReady()) {
            toast('正在连接服务器…', 1500);
            const regRes = await adapter.register(owner, pet);
            if (!regRes?.success) {
              const errMsg = String(regRes?.message || '');
              if (errMsg.includes('fetch') || errMsg.includes('Failed') || errMsg.includes('Network')) {
                toast('❌ 服务器连接失败，无法保存资料', 2800);
              } else {
                toast(`注册失败：${errMsg || '服务器未响应'}`, 2600);
              }
              return;
            }
            // 注册成功：用服务端返回的 profile 初始化 state
            const profileData = regRes.data || {};
            // 本地也同步写一份（让重启后 IPC 那边有数据）
            await window.electronAPI?.socialUpsertProfile({
              ownerName: profileData.ownerName || owner,
              petName: profileData.petName || pet,
              petGender,
            });
            SocialState.patch({
              profile: { ...profileData, petGender },
              requiresAdoption: false,
            }, 'profile.registered');
            // 成功，直接走通知逻辑
            editPanel.classList.add('hidden');
            if (window.electronAPI?.notifyPetGenderChange) {
              window.electronAPI.notifyPetGenderChange(petGender);
            }
            toast(`欢迎，${owner}！宠物 ${pet} 已注册到服务器 🐾`, 2800);
            return;
          }

          // ─── 步骤2：已注册，走 upsertProfile 更新资料 ───
          const res = await SocialActions.adoptProfile(owner, pet, petGender);
          if (!res?.success) {
            const errMsg = String(res?.message || '');
            if (errMsg.includes('fetch') || errMsg.includes('Failed') || errMsg.includes('Network') || errMsg.includes('not-ready')) {
              toast('❌ 服务器无法访问，暂不允许修改资料', 2800);
            } else {
              toast(`保存失败：${errMsg}`, 2400);
            }
            return;
          }

          // 收起编辑面板
          editPanel.classList.add('hidden');

          // 强制保证 petGender 写入 state 并立即重渲染（防服务端返回数据无此字段）
          const currentState = SocialState.getState();
          if (currentState.profile && currentState.profile.petGender !== petGender) {
            SocialState.patch({
              profile: { ...currentState.profile, petGender },
            }, 'profile.gender-fixed');
          }
          renderAll();

          // 本地 IPC 同步写配置（给主进程 / 重启恢复用）
          await window.electronAPI?.socialUpsertProfile({ ownerName: owner, petName: pet, petGender });

          // 🔑 通知主窗口切换 SWF 资源
          if (window.electronAPI?.notifyPetGenderChange) {
            window.electronAPI.notifyPetGenderChange(petGender);
          }
          toast(`资料已更新！宠物性别已切换为 ${petGender === 'mm' ? 'MM ♀' : 'GG ♂'} 🐾`, 2500);

        } finally {
          if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '保存修改'; }
        }
      });

      // 编辑面板内性别按钮点击
      document.querySelectorAll('#sw-edit-panel .sw-gender-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('#sw-edit-panel .sw-gender-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
        });
      });
    }

    // 性别切换
    document.querySelectorAll('.sw-gender-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.sw-gender-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // 离开拜访
    $('sw-leave-room')?.addEventListener('click', handleLeaveRoom);

    // 好友列表点击（拜访 / 取消外发待处理申请）
    $('sw-friends-list')?.addEventListener('click', async e => {
      // 拜访
      const btn = e.target.closest('[data-social-action="visit-friend"]');
      if (btn?.dataset.friendId) handleVisit(btn.dataset.friendId);

      // 取消外发待处理申请
      const cancelBtn = e.target.closest('[data-social-action="cancel-outbound-visit"]');
      if (cancelBtn?.dataset.visitRequestId) {
        const requestId = cancelBtn.dataset.visitRequestId;
        cancelBtn.disabled = true;
        cancelBtn.textContent = '撤销中…';
        try {
          const res = await SocialActions.cancelVisitRequest(requestId);
          if (res?.success) {
            toast('✅ 已撤销拜访申请', 2200);
          } else {
            toast(`撤销失败：${res?.message || '未知'}`, 2400);
          }
          renderAll();
        } catch(e) {
          toast(`撤销出错：${e.message}`, 2400);
        }
      }
    });

    // 好友申请 accept / reject
    $('sw-request-list')?.addEventListener('click', e => {
      const acceptBtn = e.target.closest('[data-social-action="accept-request"]');
      if (acceptBtn?.dataset.requestId) handleRequestAction('accept', acceptBtn.dataset.requestId);

      const rejectBtn = e.target.closest('[data-social-action="reject-request"]');
      if (rejectBtn?.dataset.requestId) handleRequestAction('reject', rejectBtn.dataset.requestId);
    });

    // 大厅：加好友 + 好友拜访
    $('sw-lobby-list')?.addEventListener('click', async e => {
      // 已是好友 → 发起拜访
      const visitBtn = e.target.closest('[data-social-action="visit-friend"]');
      if (visitBtn?.dataset.friendId) {
        handleVisit(visitBtn.dataset.friendId);
        return;
      }
      // 陌生人 → 加好友
      const addBtn = e.target.closest('[data-social-action="add-from-lobby"]');
      if (!addBtn) return;
      const code = addBtn.dataset.friendCode || '';
      if (!code) { toast('无法获取好友码', 1800); return; }
      addBtn.disabled = true;
      addBtn.textContent = '发送中…';
      const res = await SocialActions.sendFriendRequest(code, '', {});
      if (res?.success) {
        toast('好友申请已发送 🐾', 2000);
        const userId = addBtn.dataset.userId;
        const u = lobbyUsers.find(x => x.userId === userId);
        if (u) { u.relation = 'pending-out'; renderLobby(); }
      } else {
        addBtn.disabled = false;
        addBtn.textContent = '＋ 加好友';
        toast(`申请失败：${res?.message || '未知错误'}`, 2400);
      }
    });

    // 拜访申请通知（动态容器，用 body 级委托）
    document.body.addEventListener('click', e => {
      const acceptVisit = e.target.closest('[data-social-action="accept-visit"]');
      if (acceptVisit?.dataset.visitRequestId) {
        handleAcceptVisit(acceptVisit.dataset.visitRequestId);
        return;
      }
      const rejectVisit = e.target.closest('[data-social-action="reject-visit"]');
      if (rejectVisit?.dataset.visitRequestId) {
        handleRejectVisit(rejectVisit.dataset.visitRequestId);
      }
    });

    // 拜访互动
    $('sw-visit-actions')?.addEventListener('click', e => {
      const btn = e.target.closest('[data-social-action="visit-interaction"]');
      if (btn?.dataset.action) handleVisitInteraction(btn.dataset.action);
    });

    // 五子棋
    $('sw-gomoku-board')?.addEventListener('click', e => {
      const btn = e.target.closest('.sw-gomoku-cell');
      if (btn) handleGomokuMove(btn.dataset.row, btn.dataset.col);
    });
    $('sw-gomoku-reset')?.addEventListener('click', handleGomokuReset);

    // 网关切换
    $('sw-switch-local')?.addEventListener('click', () => handleSwitchGateway('local'));
    $('sw-switch-remote')?.addEventListener('click', () => handleSwitchGateway('remote'));
    $('sw-switch-real-remote')?.addEventListener('click', () => handleSwitchToRealRemote());

    // 调试好友状态
    $('sw-debug-friend-list')?.addEventListener('click', e => {
      const btn = e.target.closest('[data-social-action="set-friend-status"]');
      if (btn) handleSetFriendStatus(btn.dataset.friendId, btn.dataset.status);
    });

    // 状态变化监听
    SocialState.on('change', ({ state } = {}) => {
      const next = state || SocialState.getState();
      if (next.currentGame?.type === 'gomoku' && next.currentGame?.roomId === next.currentRoom?.roomId) {
        // 五子棋对局开始/更新，打开独立窗口
        window.electronAPI?.openGomokuWindow?.();
      }
      renderAll();
    });

    // ── 在线大厅 ──
    // 手动刷新按钮
    $('sw-lobby-refresh')?.addEventListener('click', () => loadLobby());

    // WS 推送：在线用户变化 → 刷新大厅
    if (typeof SocialRealRemoteAdapter !== 'undefined') {
      SocialRealRemoteAdapter.onSocialEvent((evt) => {
        if (!evt || !evt.type) return;
        if (evt.type === 'users.online.updated') {
          loadLobby();
        }
        if (evt.type === 'friends.request.created') {
          // 收到新的好友申请：刷新申请列表 + toast 提示
          const payload = evt.payload || {};
          const from = payload.fromOwnerName || '对方';
          toast(`📩 ${from} 向你发来了好友申请`, 3500);
          // 刷新好友申请（通过 bootstrap 重拉）
          if (typeof SocialGateway !== 'undefined') {
            SocialGateway.bootstrap().then(res => {
              if (res?.success && res.data) SocialState.bootstrap(res.data);
            }).catch(() => {});
          }
          // 刷新大厅里该用户的关系标注
          if (payload.fromUserId) {
            const u = lobbyUsers.find(x => x.userId === payload.fromUserId);
            if (u) { u.relation = 'pending-in'; renderLobby(); }
          }
        }
        if (evt.type === 'visit.game.request.created') {
          const payload = evt.payload || {};
          const from = payload.fromOwnerName || payload.fromPetName || '对方';
          toast(`♟ ${from} 向你发来了五子棋邀请`, 3500);
        }
      });
    }
  } // end bindEvents

  /* ─── 动作处理 ─── */
  async function handleSendRequest(loopback) {
    const code = $('sw-friend-code-input')?.value || '';
    const msg = $('sw-friend-message-input')?.value || '';
    const res = await SocialActions.sendFriendRequest(code.trim(), msg.trim(), { allowLoopback: loopback });
    if (res?.success) {
      if ($('sw-friend-code-input')) $('sw-friend-code-input').value = '';
      if ($('sw-friend-message-input')) $('sw-friend-message-input').value = '';
      $('sw-add-friend-panel')?.classList.add('hidden');
      toast(loopback ? '已创建本地模拟申请' : '好友申请已发送', 2200);
    } else {
      toast(`发送失败：${res?.message || '未知错误'}`, 2600);
    }
  }

  async function handlePresenceChange(status) {
    const res = await SocialActions.setPresence(status);
    if (!res?.success) toast(`切换失败：${res?.message || '未知错误'}`, 2200);
    else toast(`已切换为${PRESENCE_LABEL[status] || status}`, 1600);
  }

  async function handleCopyCode() {
    const code = SocialState.getState().profile?.displayCode || '';
    if (!code) { toast('好友码尚未生成', 1800); return; }
    try {
      if (window.electronAPI?.writeClipboard) await window.electronAPI.writeClipboard(code);
      else if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(code);
      toast('好友码已复制', 1600);
    } catch { toast('复制失败', 1800); }
  }

  async function handleSaveProfile() {
    const owner = $('sw-owner-name')?.value || '';
    const pet = $('sw-pet-name')?.value || '';
    const genderBtn = document.querySelector('.sw-gender-btn.active');
    const petGender = genderBtn?.dataset.gender || 'gg';
    const res = await SocialActions.adoptProfile(owner, pet, petGender);
    if (res?.success) { toast('社交资料已保存', 1800); }
    else toast(`保存失败：${res?.message || '未知错误'}`, 2400);
  }

  async function handleLeaveRoom() {
    if (!SocialState.getState().currentRoom) { toast('当前没有进行中的拜访', 1800); return; }
    const res = await SocialActions.leaveVisitRoom('manual-leave');
    if (res?.success) toast('已离开拜访', 1800);
    else {
      const detail = res?.message || '未知错误';
      // ── 服务端房间不存在时，强制本地清理 ──
      if (detail.includes('not-in-visit') || detail.includes('visit-room-not-found')) {
        console.warn('[social-window] 服务端无活跃房间，强制本地退出');
        SocialState.patch({ currentRoom: null }, 'visit.room.force-leave');
        toast('已断开拜访连接', 2000);
        return;
      }
      toast(`离开失败：${detail}`, 2200);
    }
  }

  async function handleVisit(friendId) {
    const state = SocialState.getState();

    // ── 检查是否已在拜访中 ──
    if (state.currentRoom) {
      toast('你当前正在拜访中，请先离开当前拜访', 2400);
      return;
    }

    // ── 检查对方是否在拜访中 ──
    const activeVisits = state.activeVisits || { myself: null, friendsInVisit: [] };
    const friendInVisit = activeVisits.friendsInVisit?.find(v => v.userId === friendId);
    if (friendInVisit) {
      toast('对方正在拜访会话中，请稍后再试', 2400);
      return;
    }

    const check = typeof SocialVisitRules !== 'undefined' ? SocialVisitRules.canVisitFriend(friendId, state) : { ok: true };
    if (!check.ok) { toast(check.message || '当前不可拜访', 2400); return; }

    // 发送拜访申请
    const res = await SocialActions.sendVisitRequest(friendId, 'say-hi', '');
    if (res?.success) {
      toast('已发送拜访申请，等待对方确认 📨', 2200);
      console.log('[social-window] 拜访请求已发出，结果:', JSON.stringify(res));
      // 刷新状态（服务端 /pending 现在返回 outbound）
      try {
        const fresh = await SocialGateway.bootstrap();
        if (fresh?.success && fresh.data) {
          SocialState.bootstrap(fresh.data);
        }
        renderAll();
      } catch (_) {}
      return;
    }

    // 错误处理
    const msg = res?.message || '';
    if (msg.includes('pending') || msg.includes('already-pending')) {
      // 有 pending → 自动取消 + 重试一次
      toast('检测到待处理的申请，正在自动取消…', 2000);
      try {
        const cancelRes = await SocialActions.cancelVisitRequest({ targetUserId: friendId });
        console.log('[social-window] 自动取消结果:', JSON.stringify(cancelRes));
        // 等 500ms 再重试
        await new Promise(r => setTimeout(r, 500));
        const retryRes = await SocialActions.sendVisitRequest(friendId, 'say-hi', '');
        if (retryRes?.success) {
          toast('✅ 已重新发送拜访申请 📨', 2200);
          try {
            const f = await SocialGateway.bootstrap();
            if (f?.success && f.data) SocialState.bootstrap(f.data);
            renderAll();
          } catch(_) {}
          return;
        }
        toast(`⚠️ ${retryRes?.message || '重试失败'}\n请在对方设备上处理后重试`, 3500);
      } catch(e) {
        toast(`自动取消出错：${e.message}`, 2800);
      }
    } else if (msg.includes('offline') || msg.includes('not-available')) {
      toast('好友当前不在线或忙碌', 2400);
    } else {
      toast(`拜访失败：${msg}`, 2600);
    }
  }

  async function handleAcceptVisit(visitRequestId) {
    const res = await SocialActions.respondVisitRequest(visitRequestId, 'accept');
    if (res?.success) {
      setTab('visit');
      toast('已接受拜访，双宠同屏！', 1800);
    } else {
      const errMsg = res?.message || '';
      if (errMsg.includes('request-not-found') || errMsg.includes('request-expired')) {
        // 请求已过期或不存在，从 UI 清理
        toast('该拜访申请已过期，对方可能已取消 📨', 2400);
        // 刷新状态，清理掉过期的请求
        try {
          const fresh = await SocialGateway.bootstrap();
          if (fresh?.success && fresh.data) {
            SocialState.bootstrap(fresh.data);
            renderAll();
          }
        } catch (_) {}
      } else {
        toast(`接受失败：${errMsg}`, 2400);
      }
    }
  }

  async function handleRejectVisit(visitRequestId) {
    const res = await SocialActions.respondVisitRequest(visitRequestId, 'reject');
    if (res?.success) {
      toast('已拒绝拜访申请', 1800);
    } else {
      toast(`拒绝失败：${res?.message || '未知错误'}`, 2200);
    }
  }

  async function handleRequestAction(action, requestId) {
    if (!requestId) { toast('缺少请求 ID', 1800); return; }
    try {
      const res = await SocialActions.respondFriendRequest(requestId, action);
      if (res?.success) {
        toast(action === 'accept' ? '已接受好友申请 🐾' : '已拒绝好友申请', 1800);
      } else {
        toast(`处理失败：${res?.message || '未知错误'}`, 2600);
      }
    } catch (err) {
      console.error('[social-window] handleRequestAction error:', err);
      toast(`操作异常：${err?.message || '未知'}`, 2600);
    }
  }

  async function handleVisitInteraction(action) {
    if (!SocialState.getState().currentRoom) { toast('请先进入拜访', 2000); return; }
    if (action === 'invite-game') { await handleStartGomoku(); return; }
    const res = await SocialActions.sendVisitInteraction(action, { source: 'social-window' });
    if (res?.success) toast(`已发送${VISIT_INTERACTION_LABEL[action]||'互动'}`, 1800);
    else toast(`互动失败：${res?.message||'未知错误'}`, 2200);
  }

  async function handleStartGomoku() {
    const state = SocialState.getState();
    if (state.currentGame?.type === 'gomoku' && state.currentGame?.roomId === state.currentRoom?.roomId) {
      // 已有对局，打开独立五子棋窗口
      window.electronAPI?.openGomokuWindow?.();
      return;
    }
    if (gomokuActionPending) return;
    gomokuActionPending = true; renderGomoku(SocialState.getState());
    const res = await SocialActions.sendMiniGameRequest('gomoku', { source: 'social-window' });
    gomokuActionPending = false; renderGomoku(SocialState.getState());
    if (!res?.success) toast(`邀请失败：${res?.message||'未知错误'}`, 2400);
    else toast('已发起五子棋邀请，等对方确认', 2000);
  }

  async function handleGomokuMove(row, col) {
    if (gomokuActionPending) return;
    const r = Number(row), c = Number(col);
    if (!Number.isInteger(r) || !Number.isInteger(c)) return;
    gomokuActionPending = true; renderGomoku(SocialState.getState());
    const res = await SocialActions.playMiniGameMove('gomoku', { row: r, col: c, source: 'social-window' });
    gomokuActionPending = false; renderGomoku(SocialState.getState());
    if (!res?.success) toast(`落子失败：${res?.message||'未知错误'}`, 2200);
  }

  async function handleGomokuReset() {
    if (gomokuActionPending) return;
    gomokuActionPending = true; renderGomoku(SocialState.getState());
    const res = await SocialActions.resetMiniGame('gomoku', { source: 'social-window' });
    gomokuActionPending = false; renderGomoku(SocialState.getState());
    if (!res?.success) toast(`重开失败：${res?.message||'未知错误'}`, 2200);
  }

  async function handleSwitchGateway(target) {
    const mode = String(target||'').toLowerCase();
    if (!['local','remote'].includes(mode)) return;
    const res = await SocialActions.setRemoteEnabled(mode === 'remote');
    if (!res?.success) { toast(`切换失败：${res?.message||''}`, 2400); return; }
    const s = SocialState.getState();
    if (mode === 'remote' && s.gateway?.fallback) toast('远端未就绪，已回退本地', 2400);
    else toast(mode === 'remote' ? '已切换远端 Mock' : '已切换本地', 2000);
  }

  async function handleSwitchToRealRemote() {
    if (typeof SocialRealRemoteAdapter === 'undefined') {
      toast('真实远端适配器未加载', 2400);
      return;
    }

    // 检查是否有保存的会话
    const restored = SocialRealRemoteAdapter.restoreSession();

    if (!restored || !SocialRealRemoteAdapter.isReady()) {
      // 需要注册
      const state = SocialState.getState();
      const ownerName = state.profile?.ownerName || '';
      const petName = state.profile?.petName || '';

      if (!ownerName || !petName) {
        toast('请先在名片中填写主人名和宠物名', 2400);
        setTab('profile');
        return;
      }

      toast('正在远端注册...', 1800);
      const regRes = await SocialRealRemoteAdapter.register(ownerName, petName);
      if (!regRes?.success) {
        toast(`远端注册失败：${regRes?.message || '未知错误'}`, 3000);
        return;
      }
      toast(`远端注册成功！好友码: ${regRes.data?.friendCode || ''}`, 2800);
    }

    // 切换 gateway 到 real-remote
    const modeMeta = SocialGateway.applyMode('real-remote', 'manual.real-remote');
    SocialState.patch({
      gateway: {
        ...SocialState.getState().gateway,
        ...modeMeta,
      },
    }, 'gateway.mode.real-remote');

    // 重新 bootstrap
    const bootstrapRes = await SocialGateway.bootstrap();
    if (bootstrapRes?.success && bootstrapRes.data) {
      SocialState.bootstrap(bootstrapRes.data);
      toast('已切换到远端服务！', 2200);
    } else {
      toast(`远端 bootstrap 失败：${bootstrapRes?.message || ''}`, 3000);
      // 回退本地
      SocialGateway.applyMode('local', 'real-remote-fallback');
    }

    renderAll();
  }

  async function handleSetFriendStatus(friendId, status) {
    const res = await SocialActions.setFriendPresence(friendId, status, 180);
    if (res?.success) toast('已更新模拟状态', 1600);
    else toast(`更新失败：${res?.message||''}`, 2200);
  }

  /* ─── 启动 ─── */
  async function init() {
    initTitlebar();
    bindEvents();

    // 覆盖 SocialVisitFeedback 的 bubble 方法，让它用窗口内 toast
    if (typeof SocialVisitFeedback !== 'undefined') {
      // SocialVisitFeedback 内部调 BubbleSystem.show，这里提供一个降级
      window.BubbleSystem = {
        show: (text, dur) => toast(text, dur),
        hide: () => {},
        showThinking: () => {},
        hideThinking: () => {},
      };
    }

    // 初始化社交架构壳
    if (typeof SocialBootstrap !== 'undefined') {
      await SocialBootstrap.init();
    }

    // 初始化拜访反馈
    if (typeof SocialVisitFeedback !== 'undefined') {
      SocialVisitFeedback.init();
    }

    // 安装调试 API
    if (typeof SocialActions !== 'undefined' && SocialActions.installDebugAPI) {
      SocialActions.installDebugAPI();
    }

    renderAll();
    // 首次加载大厅在线用户（稍作延迟，等 bootstrap 完成）
    setTimeout(() => loadLobby(), 800);
    // 启动定时自动刷新（窗口开着期间每 20s 拉一次）
    startLobbyAutoRefresh();
    // 窗口隐藏/最小化时暂停刷新，恢复时继续（省资源）
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { stopLobbyAutoRefresh(); }
      else { startLobbyAutoRefresh(); }
    });
    console.log('🐾 社交中心独立窗口就绪');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => void init());
  } else {
    void init();
  }
})();
