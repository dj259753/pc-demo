'use strict';

const crypto = require('crypto');
const { readStore, mutateStore, ensureStoreFile } = require('./social-store');
const { resolveFeatureFlags } = require('./social-feature-flags');
const { emitSocialEvent } = require('./social-events');
const { addPoints, resolveLevel, getProgressToNext, createEmptyIntimacy } = require('./social-intimacy');
const petStatsClient = require('./pet-stats-client');

const ALLOWED_USER_STATUS = new Set(['online', 'busy', 'focus', 'away', 'offline']);
const ALLOWED_SESSION_STATUS = new Set(['idle', 'inviting', 'visiting', 'playing', 'recovering']);
const ALLOWED_VISIT_INTERACTIONS = new Set(['wave', 'handshake', 'hug', 'highfive', 'sync-walk', 'invite-game']);
const ALLOWED_GAME_TYPES = new Set(['gomoku']);
const GOMOKU_SIZE = 15;
const FRIEND_CODE_PATTERN = /^QP-[A-Z2-9]{4}-[A-Z2-9]{2}$/;
const FRIEND_PRESENCE_TTL_MIN = 20;
const FRIEND_PRESENCE_TTL_MAX = 600;

function nowISO() {
  return new Date().toISOString();
}

function addSeconds(iso, seconds) {
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return nowISO();
  return new Date(ts + (Math.max(0, Number(seconds) || 0) * 1000)).toISOString();
}

function clampTTL(seconds, fallback = 120) {
  const n = Number(seconds);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(FRIEND_PRESENCE_TTL_MAX, Math.max(FRIEND_PRESENCE_TTL_MIN, Math.floor(n)));
}

function makeId(prefix) {
  if (typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  }
  return `${prefix}_${Math.random().toString(16).slice(2, 10)}${Date.now().toString(16).slice(-8)}`;
}

function makeDisplayCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const pick = () => chars[Math.floor(Math.random() * chars.length)];
  return `QP-${pick()}${pick()}${pick()}${pick()}-${pick()}${pick()}`;
}

function normalizeName(name, min, max) {
  const text = String(name || '').trim().replace(/\s+/g, ' ');
  if (text.length < min || text.length > max) {
    throw new Error(`name-length-invalid:${min}-${max}`);
  }
  return text;
}

function normalizeFriendCode(value) {
  const code = String(value || '').trim().toUpperCase();
  if (!FRIEND_CODE_PATTERN.test(code)) {
    throw new Error('invalid-friend-code');
  }
  return code;
}

function normalizeUserStatus(value, fallback = 'offline') {
  const raw = String(value || '').trim();
  if (raw === 'hidden') return 'away';
  if (ALLOWED_USER_STATUS.has(raw)) return raw;
  return fallback;
}

function normalizeSessionStatus(value, fallback = 'idle') {
  const raw = String(value || '').trim();
  if (ALLOWED_SESSION_STATUS.has(raw)) return raw;
  return fallback;
}

function normalizePresence(presence = {}, fallback = {}) {
  return {
    ...(presence || {}),
    userStatus: normalizeUserStatus(presence?.userStatus, fallback.userStatus || 'offline'),
    sessionStatus: normalizeSessionStatus(presence?.sessionStatus, fallback.sessionStatus || 'idle'),
    statusMessage: String(presence?.statusMessage || fallback.statusMessage || '').slice(0, 60),
    updatedAt: presence?.updatedAt || fallback.updatedAt || nowISO(),
  };
}

function normalizeFriendStatus(value, fallback = 'offline') {
  return normalizeUserStatus(value, fallback);
}

function normalizeFriend(friend = {}) {
  return {
    ...(friend || {}),
    status: normalizeFriendStatus(friend?.status, 'offline'),
  };
}

function normalizeFriends(list = []) {
  if (!Array.isArray(list)) return [];
  return list.map((item) => normalizeFriend(item));
}

function normalizeInteractionAction(action) {
  const text = String(action || '').trim();
  if (!ALLOWED_VISIT_INTERACTIONS.has(text)) {
    throw new Error('invalid-visit-interaction-action');
  }
  return text;
}

function normalizeGameType(gameType) {
  const text = String(gameType || '').trim().toLowerCase();
  if (!ALLOWED_GAME_TYPES.has(text)) {
    throw new Error('invalid-mini-game-type');
  }
  return text;
}

function createEmptyGomokuBoard() {
  return Array.from({ length: GOMOKU_SIZE }, () => Array.from({ length: GOMOKU_SIZE }, () => ''));
}

function countGomokuDirection(board, row, col, deltaRow, deltaCol, stone) {
  let total = 0;
  let nextRow = row + deltaRow;
  let nextCol = col + deltaCol;
  while (
    nextRow >= 0 && nextRow < GOMOKU_SIZE
    && nextCol >= 0 && nextCol < GOMOKU_SIZE
    && board[nextRow]?.[nextCol] === stone
  ) {
    total += 1;
    nextRow += deltaRow;
    nextCol += deltaCol;
  }
  return total;
}

function resolveGomokuWinner(board, row, col, stone) {
  const directions = [
    [[0, -1], [0, 1]],
    [[-1, 0], [1, 0]],
    [[-1, -1], [1, 1]],
    [[-1, 1], [1, -1]],
  ];

  return directions.some((pair) => {
    const total = 1 + pair.reduce((sum, [deltaRow, deltaCol]) => {
      return sum + countGomokuDirection(board, row, col, deltaRow, deltaCol, stone);
    }, 0);
    return total >= 5;
  });
}

function createGomokuGame({ roomId, interactionId = null, blackUserId = null, whiteUserId = null,
  blackOwnerName = '', whiteOwnerName = '', now = nowISO() } = {}) {
  if (!roomId) {
    throw new Error('visit-room-not-found');
  }
  return {
    gameId: makeId('game'),
    type: 'gomoku',
    roomId,
    status: 'active',
    board: createEmptyGomokuBoard(),
    nextStone: 'black',
    winner: '',
    moveCount: 0,
    lastMove: null,
    sourceInteractionId: interactionId,
    // ★ 黑白方用户ID（邀请方=黑，接受方=白）
    blackUserId: blackUserId || '',
    whiteUserId: whiteUserId || '',
    // ★ 黑白方显示名
    blackOwnerName: blackOwnerName || '',
    whiteOwnerName: whiteOwnerName || '',
    createdAt: now,
    updatedAt: now,
  };
}

function resolveSessionStatusByDraft(draft) {
  if (draft?.currentGame) return 'playing';
  if (draft?.visitRoom) return 'visiting';
  return 'idle';
}

function syncVisitRuntimeStateDraft(draft) {
  if (!draft?.visitRoom) {
    draft.currentGame = null;
    draft.lastGameEvent = null;
    draft.miniGameRequests = [];
    return;
  }

  if (!Array.isArray(draft.miniGameRequests)) {
    draft.miniGameRequests = [];
  }
  draft.miniGameRequests = draft.miniGameRequests.filter((item) => !item?.roomId || item.roomId === draft.visitRoom.roomId);

  if (draft.currentGame && draft.currentGame.roomId !== draft.visitRoom.roomId) {
    draft.currentGame = null;
    draft.lastGameEvent = null;
  }
}

function shouldExpireFriendPresence(friend, now) {
  const expiresAt = friend?.presenceExpiresAt;
  if (!expiresAt || String(friend?.status || '') === 'offline') return false;
  const expireTs = new Date(expiresAt).getTime();
  const nowTs = new Date(now).getTime();
  if (!Number.isFinite(expireTs) || !Number.isFinite(nowTs)) return false;
  return expireTs <= nowTs;
}

function normalizeFriendDraftPresence(friend, now, defaultTTL = 120) {
  const normalizedStatus = normalizeFriendStatus(friend.status, 'offline');
  friend.status = normalizedStatus;

  if (normalizedStatus === 'offline') {
    friend.presenceExpiresAt = null;
    return;
  }

  const ttl = clampTTL(friend.presenceTTL || defaultTTL, defaultTTL);
  const currentExpireTs = new Date(friend.presenceExpiresAt || '').getTime();
  const nowTs = new Date(now).getTime();
  if (!Number.isFinite(currentExpireTs) || currentExpireTs <= nowTs) {
    friend.presenceExpiresAt = addSeconds(now, ttl);
  }
}

function reconcileFriendsPresenceDraft(draft, now = nowISO()) {
  const list = Array.isArray(draft?.friends) ? draft.friends : [];
  list.forEach((friend) => {
    normalizeFriendDraftPresence(friend, now, 120);
    if (shouldExpireFriendPresence(friend, now)) {
      friend.status = 'offline';
      friend.presenceExpiresAt = null;
      friend.updatedAt = now;
    }
  });
}

/**
 * 清理过期的拜访申请和游戏请求（心跳时调用）
 * 超时的 pending → expired，同时联动标记对应的 outbound/inbound
 */
function reconcilePendingRequestsDraft(draft, now = nowISO()) {
  const nowTs = Date.now();

  // 拜访请求清理
  if (Array.isArray(draft.visitRequests)) {
    for (const req of draft.visitRequests) {
      if (req.state !== 'pending' || !req.expiresAt) continue;
      if (new Date(req.expiresAt).getTime() < nowTs) {
        req.state = 'expired';
        req.updatedAt = now;
        // 同时标记配对的请求
        const paired = draft.visitRequests.find((r) =>
          r.visitRequestId === req.sourceOutboundId ||
          r.sourceOutboundId === req.visitRequestId
        );
        if (paired && paired.state === 'pending') {
          paired.state = 'expired';
          paired.updatedAt = now;
        }
      }
    }
  }

  // 游戏请求清理
  if (Array.isArray(draft.miniGameRequests)) {
    for (const req of draft.miniGameRequests) {
      if (req.state !== 'pending' || !req.expiresAt) continue;
      if (new Date(req.expiresAt).getTime() < nowTs) {
        req.state = 'expired';
        req.updatedAt = now;
        const paired = draft.miniGameRequests.find((r) =>
          r.gameRequestId === req.sourceOutboundId ||
          r.sourceOutboundId === req.gameRequestId
        );
        if (paired && paired.state === 'pending') {
          paired.state = 'expired';
          paired.updatedAt = now;
        }
      }
    }
  }

  // 如果有已过期的邀请，恢复 presence 状态
  let hasExpiredInvitation = false;
  if (Array.isArray(draft.visitRequests)) {
    hasExpiredInvitation = draft.visitRequests.some(
      (r) => r.state === 'expired' && r.direction === 'outbound'
    );
  }
  if (
    hasExpiredInvitation &&
    String(draft.presence?.sessionStatus || '') === 'inviting'
  ) {
    // 检查是否还有其他活跃的 outbound pending
    const hasActiveOutbound = draft.visitRequests.some(
      (r) => r.direction === 'outbound' && r.state === 'pending'
    );
    if (!hasActiveOutbound && !draft.visitRoom) {
      draft.presence = normalizePresence(
        { ...(draft.presence || {}), sessionStatus: 'idle', updatedAt: now },
        { userStatus: 'online', sessionStatus: 'idle', statusMessage: '', updatedAt: now }
      );
    }
  }
}

class SocialClient {
  bootstrap() {
    ensureStoreFile();
    return this.getBootstrap();
  }

  syncStoreRuntimeState({ emitFriendUpdates = false } = {}) {
    const now = nowISO();
    const next = mutateStore((draft) => {
      reconcileFriendsPresenceDraft(draft, now);
      syncVisitRuntimeStateDraft(draft);
      draft.presence = normalizePresence(draft.presence, {
        userStatus: draft.identity ? 'online' : 'offline',
        sessionStatus: resolveSessionStatusByDraft(draft),
        statusMessage: '',
        updatedAt: now,
      });
    });

    if (emitFriendUpdates) {
      emitSocialEvent('friends.list.updated', normalizeFriends(next.friends));
    }

    return next;
  }

  resolveBootstrapFromStore(store) {
    const safeStore = {
      ...store,
      currentGame: store.currentGame || null,
      lastGameEvent: store.lastGameEvent || null,
    };
    const presence = normalizePresence(safeStore.presence, {
      userStatus: 'offline',
      sessionStatus: resolveSessionStatusByDraft(safeStore),
      statusMessage: '',
    });

    return {
      profile: safeStore.identity,
      friends: normalizeFriends(safeStore.friends),
      requests: safeStore.requests,
      presence,
      currentRoom: safeStore.visitRoom,
      lastVisitInteraction: safeStore.lastVisitInteraction || null,
      visitRequests: Array.isArray(safeStore.visitRequests) ? safeStore.visitRequests : [],
      miniGameRequests: Array.isArray(safeStore.miniGameRequests) ? safeStore.miniGameRequests : [],
      currentGame: safeStore.currentGame || null,
      lastGameEvent: safeStore.lastGameEvent || null,
      featureFlags: resolveFeatureFlags(safeStore.featureFlags),
      requiresAdoption: !safeStore.identity,
    };
  }

  getBootstrap() {
    const store = this.syncStoreRuntimeState({ emitFriendUpdates: false });
    return this.resolveBootstrapFromStore(store);
  }

  getProfile() {
    return readStore().identity;
  }

  async ensureIdentity({ ownerName, petName, petGender }) {
    const safeOwnerName = normalizeName(ownerName, 2, 12);
    const safePetName = normalizeName(petName, 1, 12);
    const safePetGender = (petGender === 'mm') ? 'mm' : 'gg';

    const next = mutateStore((draft) => {
      const now = nowISO();
      if (!draft.identity) {
        draft.identity = {
          userId: makeId('usr'),
          petId: makeId('pet'),
          displayCode: makeDisplayCode(),
          ownerName: safeOwnerName,
          petName: safePetName,
          petGender: safePetGender,
          createdAt: now,
          updatedAt: now,
        };
      } else {
        draft.identity.userId = draft.identity.userId || makeId('usr');
        draft.identity.petId = draft.identity.petId || makeId('pet');
        draft.identity.displayCode = draft.identity.displayCode || makeDisplayCode();
        draft.identity.ownerName = safeOwnerName;
        draft.identity.petName = safePetName;
        draft.identity.petGender = safePetGender;
        draft.identity.updatedAt = now;
      }
      draft.presence = normalizePresence(draft.presence, {
        userStatus: 'online',
        sessionStatus: 'idle',
        statusMessage: '',
        updatedAt: now,
      });
      if (!draft.presence.userStatus || draft.presence.userStatus === 'offline') {
        draft.presence.userStatus = 'online';
      }
      draft.presence.updatedAt = now;
    });

    const normalizedPresence = normalizePresence(next.presence, {
      userStatus: 'online',
      sessionStatus: 'idle',
      statusMessage: '',
    });
    emitSocialEvent('profile.updated', next.identity);
    emitSocialEvent('presence.updated', normalizedPresence);

    // ── 云端注册：将本地身份同步到服务端 ──
    if (!petStatsClient.isAuthenticated()) {
      try {
        const regResult = await petStatsClient.register({
          ownerName: safeOwnerName,
          petName: safePetName,
          petGender: safePetGender,
        });
        if (regResult.success) {
          // 用服务端返回的 userId 和 friendCode 更新本地身份
          const synced = mutateStore((draft) => {
            if (draft.identity) {
              draft.identity.userId = regResult.data.userId || draft.identity.userId;
              draft.identity.displayCode = regResult.data.displayCode || draft.identity.displayCode;
              draft.identity.friendCode = regResult.data.friendCode || draft.identity.friendCode;
              draft.identity.updatedAt = nowISO();
            }
          });
          emitSocialEvent('profile.updated', synced.identity);
          return synced.identity;
        }
      } catch (err) {
        console.warn('[social-client] 云端注册失败，继续本地模式:', err.message);
      }
    }

    return next.identity;
  }

  getFriends() {
    const store = this.syncStoreRuntimeState({ emitFriendUpdates: false });
    return {
      friends: normalizeFriends(store.friends),
      requests: store.requests,
    };
  }

  sendFriendRequest({ targetCode, message = '', allowLoopback = false }) {
    const code = normalizeFriendCode(targetCode);
    let createdRequests = [];

    const next = mutateStore((draft) => {
      if (!draft.identity) throw new Error('identity-required');
      if (code === draft.identity.displayCode) {
        throw new Error('cannot-add-self');
      }

      const hasPendingOutbound = draft.requests.some((item) => (
        item.direction === 'outbound'
        && item.state === 'pending'
        && item.toCode === code
      ));
      if (hasPendingOutbound) {
        throw new Error('friend-request-already-pending');
      }

      const alreadyFriend = draft.friends.some((item) => item.friendCode === code);
      if (alreadyFriend) {
        throw new Error('already-friend');
      }

      const now = nowISO();
      const outbound = {
        requestId: makeId('fr'),
        direction: 'outbound',
        state: 'pending',
        fromUserId: draft.identity.userId,
        fromOwnerName: draft.identity.ownerName,
        fromPetName: draft.identity.petName,
        toCode: code,
        message: String(message || '').trim().slice(0, 60),
        createdAt: now,
        updatedAt: now,
      };
      draft.requests.push(outbound);
      createdRequests.push(outbound);

      if (allowLoopback) {
        const inbound = {
          requestId: makeId('fr'),
          direction: 'inbound',
          state: 'pending',
          friendUserId: makeId('friend'),
          friendCode: code,
          friendOwnerName: `来自${code}`,
          friendPetName: '访客宠物',
          toUserId: draft.identity.userId,
          toCode: draft.identity.displayCode,
          message: '回环联调请求',
          createdAt: now,
          updatedAt: now,
        };
        draft.requests.push(inbound);
        createdRequests.push(inbound);
      }
    });

    const normalizedFriends = normalizeFriends(next.friends);
    createdRequests.forEach((item) => {
      emitSocialEvent('friends.request.created', item);
    });
    emitSocialEvent('friends.list.updated', normalizedFriends);

    return {
      createdRequests,
      friends: normalizedFriends,
      requests: next.requests,
    };
  }

  respondFriendRequest({ requestId, action }) {
    const nextAction = String(action || '').trim();
    if (!['accept', 'reject'].includes(nextAction)) {
      throw new Error('invalid-friend-request-action');
    }

    let changedRequest = null;

    const next = mutateStore((draft) => {
      const target = draft.requests.find((item) => item.requestId === requestId);
      if (!target) throw new Error('friend-request-not-found');
      if (target.direction !== 'inbound') throw new Error('friend-request-not-inbound');
      if (target.state !== 'pending') throw new Error('friend-request-not-pending');

      target.state = nextAction === 'accept' ? 'accepted' : 'rejected';
      target.updatedAt = nowISO();
      changedRequest = { ...target };

      if (nextAction === 'accept') {
        const friendUserId = target.friendUserId || makeId('friend');
        const friendCode = target.friendCode || null;
        const exists = draft.friends.some((f) => (
          f.friendUserId === friendUserId
          || (!!friendCode && f.friendCode === friendCode)
        ));
        if (!exists) {
          const now = nowISO();
          draft.friends.push({
            relationId: makeId('rel'),
            friendUserId,
            friendCode,
            ownerName: target.friendOwnerName || target.fromOwnerName || '好友',
            petName: target.friendPetName || target.fromPetName || '宠物',
            alias: '',
            status: 'online',
            intimacy: createEmptyIntimacy(),
            presenceTTL: 180,
            presenceExpiresAt: addSeconds(now, 180),
            presenceSource: 'local-loopback',
            isPinned: false,
            isBlocked: false,
            lastInteractionAt: null,
            createdAt: now,
            updatedAt: now,
          });
        }
      }
    });

    const normalizedFriends = normalizeFriends(next.friends);
    emitSocialEvent('friends.request.updated', changedRequest);
    emitSocialEvent('friends.list.updated', normalizedFriends);
    return {
      request: changedRequest,
      friends: normalizedFriends,
      requests: next.requests,
    };
  }

  setPresence({ userStatus, sessionStatus, statusMessage = '' }) {
    const next = mutateStore((draft) => {
      const now = nowISO();
      const hasExplicitUserStatus = userStatus !== undefined && userStatus !== null && String(userStatus).trim() !== '';
      const rawUserStatus = hasExplicitUserStatus ? String(userStatus).trim() : draft.presence?.userStatus;
      const rawSessionStatus = sessionStatus ? String(sessionStatus).trim() : draft.presence?.sessionStatus;
      const targetUserStatus = normalizeUserStatus(rawUserStatus, 'offline');
      const targetSessionStatus = normalizeSessionStatus(rawSessionStatus, 'idle');

      if (hasExplicitUserStatus && rawUserStatus === 'hidden') {
        throw new Error('invalid-user-status');
      }
      if (rawUserStatus && rawUserStatus !== 'hidden' && !ALLOWED_USER_STATUS.has(rawUserStatus)) {
        throw new Error('invalid-user-status');
      }
      if (rawSessionStatus && !ALLOWED_SESSION_STATUS.has(rawSessionStatus)) {
        throw new Error('invalid-session-status');
      }

      draft.presence = normalizePresence({
        ...(draft.presence || {}),
        userStatus: targetUserStatus,
        sessionStatus: targetSessionStatus,
        statusMessage: String(statusMessage || draft.presence?.statusMessage || '').slice(0, 60),
        updatedAt: now,
      }, {
        userStatus: 'offline',
        sessionStatus: 'idle',
        statusMessage: '',
        updatedAt: now,
      });
    });

    const normalizedPresence = normalizePresence(next.presence, {
      userStatus: 'offline',
      sessionStatus: 'idle',
      statusMessage: '',
    });
    emitSocialEvent('presence.updated', normalizedPresence);
    return normalizedPresence;
  }

  getPresence() {
    const store = this.syncStoreRuntimeState({ emitFriendUpdates: false });
    return normalizePresence(store.presence, {
      userStatus: 'offline',
      sessionStatus: resolveSessionStatusByDraft(store),
      statusMessage: '',
    });
  }

  heartbeat({ keepOnline = true } = {}) {
    const now = nowISO();
    const next = mutateStore((draft) => {
      reconcileFriendsPresenceDraft(draft, now);
      reconcilePendingRequestsDraft(draft, now);
      syncVisitRuntimeStateDraft(draft);

      const currentPresence = normalizePresence(draft.presence, {
        userStatus: draft.identity ? 'online' : 'offline',
        sessionStatus: resolveSessionStatusByDraft(draft),
        statusMessage: '',
        updatedAt: now,
      });

      if (keepOnline && draft.identity && currentPresence.userStatus === 'offline') {
        currentPresence.userStatus = 'online';
      }
      currentPresence.updatedAt = now;
      draft.presence = currentPresence;
    });

    const payload = {
      presence: normalizePresence(next.presence, {
        userStatus: next.identity ? 'online' : 'offline',
        sessionStatus: resolveSessionStatusByDraft(next),
        statusMessage: '',
      }),
      friends: normalizeFriends(next.friends),
      requests: next.requests,
      currentRoom: next.visitRoom,
      currentGame: next.currentGame || null,
      visitRequests: Array.isArray(next.visitRequests) ? next.visitRequests.filter((r) => r.state === 'pending') : [],
      miniGameRequests: Array.isArray(next.miniGameRequests) ? next.miniGameRequests.filter((r) => r.state === 'pending') : [],
      serverTime: now,
    };

    emitSocialEvent('presence.updated', payload.presence);
    emitSocialEvent('friends.list.updated', payload.friends);
    return payload;
  }

  setFriendPresence({ friendUserId, userStatus, ttlSeconds = 120 } = {}) {
    const targetId = String(friendUserId || '').trim();
    if (!targetId) throw new Error('friend-user-required');

    const hasExplicitStatus = userStatus !== undefined && userStatus !== null && String(userStatus).trim() !== '';
    if (!hasExplicitStatus) throw new Error('friend-status-required');

    const rawStatus = String(userStatus).trim();
    if (rawStatus === 'hidden') throw new Error('invalid-user-status');
    if (!ALLOWED_USER_STATUS.has(rawStatus)) throw new Error('invalid-user-status');

    const now = nowISO();
    const ttl = clampTTL(ttlSeconds, 120);
    let matched = null;

    const next = mutateStore((draft) => {
      reconcileFriendsPresenceDraft(draft, now);
      const friend = draft.friends.find((item) => item.friendUserId === targetId);
      if (!friend) throw new Error('friend-not-found');
      if (friend.isBlocked) throw new Error('friend-blocked');

      friend.status = normalizeFriendStatus(rawStatus, 'offline');
      friend.presenceTTL = ttl;
      friend.presenceSource = 'local-debug';
      friend.presenceExpiresAt = friend.status === 'offline' ? null : addSeconds(now, ttl);
      friend.updatedAt = now;
      matched = { ...friend };
    });

    const normalizedFriends = normalizeFriends(next.friends);
    emitSocialEvent('friends.list.updated', normalizedFriends);
    return {
      friend: normalizeFriend(matched),
      friends: normalizedFriends,
      serverTime: now,
    };
  }

  // ═══════════════════════════════════════════
  // 拜访申请状态机
  // sendVisitRequest → 对方 respondVisitRequest(accept/reject) → createVisitRoom
  // ═══════════════════════════════════════════

  sendVisitRequest({ targetUserId, intent = 'say-hi', message = '' } = {}) {
    const targetId = String(targetUserId || '').trim();
    if (!targetId) throw new Error('target-user-required');
    const now = nowISO();
    let visitRequest = null;

    const next = mutateStore((draft) => {
      if (!draft.identity) throw new Error('identity-required');

      // 已在拜访中不能再发申请
      if (draft.visitRoom) throw new Error('already-in-visit');

      const friend = draft.friends.find((item) => item.friendUserId === targetId);
      if (!friend) throw new Error('friend-not-found');
      if (friend.isBlocked) throw new Error('friend-blocked');

      const friendStatus = normalizeFriendStatus(friend.status, 'offline');
      if (friendStatus !== 'online') throw new Error('friend-not-available');

      // 检查是否已有 pending 的拜访申请给同一个人 → 自动过期旧请求，允许重发
      const allPending = (draft.visitRequests || []).filter((r) => r.state === 'pending');
      const existing = allPending.find((r) => r.targetUserId === targetId);
      console.log(`[social-client] sendVisitRequest target=${targetId}, found ${allPending.length} total pending, match=${!!existing}`);
      if (existing) {
        // 自动过期旧的 pending 请求及其配对的 inbound
        console.log(`[social-client] auto-expiring old pending visit: ${existing.visitRequestId}`);
        existing.state = 'expired';
        existing.updatedAt = now;
        const paired = (draft.visitRequests || []).find((r) =>
          r.visitRequestId === existing.sourceOutboundId ||
          r.sourceOutboundId === existing.visitRequestId
        );
        if (paired && paired.state === 'pending') {
          paired.state = 'expired';
          paired.updatedAt = now;
        }
      }

      if (!Array.isArray(draft.visitRequests)) {
        draft.visitRequests = [];
      }

      visitRequest = {
        visitRequestId: makeId('vr'),
        direction: 'outbound',
        state: 'pending',
        fromUserId: draft.identity.userId,
        fromOwnerName: draft.identity.ownerName,
        fromPetName: draft.identity.petName,
        fromFriendCode: draft.identity.displayCode || '',
        targetUserId: targetId,
        targetOwnerName: friend.ownerName || '',
        targetPetName: friend.petName || '',
        intent: String(intent || 'say-hi').trim(),
        message: String(message || '').trim().slice(0, 100),
        createdAt: now,
        expiresAt: addSeconds(now, 10),
        updatedAt: now,
      };

      draft.visitRequests.push(visitRequest);

      // 本地模拟：同时给自己创建一条对应的 inbound 申请（供对方确认）
      const inbound = {
        visitRequestId: makeId('vr'),
        direction: 'inbound',
        state: 'pending',
        fromUserId: draft.identity.userId,
        fromOwnerName: draft.identity.ownerName,
        fromPetName: draft.identity.petName,
        fromFriendCode: draft.identity.displayCode || '',
        targetUserId: targetId,
        targetOwnerName: friend.ownerName || '',
        targetPetName: friend.petName || '',
        sourceOutboundId: visitRequest.visitRequestId,
        intent: visitRequest.intent,
        message: visitRequest.message,
        createdAt: now,
        expiresAt: addSeconds(now, 10),
        updatedAt: now,
      };
      draft.visitRequests.push(inbound);

      // 更新好友互动时间
      friend.lastInteractionAt = now;
      friend.updatedAt = now;

      // 切到 inviting 状态
      draft.presence = normalizePresence({
        ...(draft.presence || {}),
        userStatus: normalizeUserStatus(draft.presence?.userStatus, 'online'),
        sessionStatus: 'inviting',
        statusMessage: draft.presence?.statusMessage || '',
        updatedAt: now,
      }, {
        userStatus: 'online',
        sessionStatus: 'inviting',
        statusMessage: '',
        updatedAt: now,
      });
    });

    emitSocialEvent('visit.request.created', visitRequest);
    emitSocialEvent('visit.requests.updated', next.visitRequests || []);
    emitSocialEvent('presence.updated', normalizePresence(next.presence, {
      userStatus: 'online',
      sessionStatus: 'inviting',
      statusMessage: '',
    }));
    emitSocialEvent('friends.list.updated', normalizeFriends(next.friends));

    return {
      request: visitRequest,
      requests: next.visitRequests || [],
    };
  }

  respondVisitRequest({ visitRequestId, action } = {}) {
    const reqId = String(visitRequestId || '').trim();
    const nextAction = String(action || '').trim();
    if (!reqId) throw new Error('visit-request-id-required');
    if (!['accept', 'reject'].includes(nextAction)) throw new Error('invalid-visit-request-action');

    const now = nowISO();
    let matched = null;
    let roomCreated = null;

    const next = mutateStore((draft) => {
      if (!draft.identity) throw new Error('identity-required');
      if (!Array.isArray(draft.visitRequests)) draft.visitRequests = [];

      const target = draft.visitRequests.find((r) => r.visitRequestId === reqId);
      if (!target) throw new Error('visit-request-not-found');
      if (target.direction !== 'inbound') throw new Error('visit-request-not-inbound');
      if (target.state !== 'pending') throw new Error('visit-request-not-pending');

      // 检查是否已超时
      if (target.expiresAt && new Date(target.expiresAt).getTime() < Date.now()) {
        target.state = 'expired';
        target.updatedAt = now;
        matched = { ...target };
        // 同时把对应的 outbound 也标记过期
        const outbound = draft.visitRequests.find(
          (r) => r.visitRequestId === target.sourceOutboundId || r.sourceOutboundId === target.visitRequestId
        );
        if (outbound && outbound.state === 'pending') {
          outbound.state = 'expired';
          outbound.updatedAt = now;
        }
        throw new Error('visit-request-expired');
      }

      target.state = nextAction === 'accept' ? 'accepted' : 'rejected';
      target.updatedAt = now;
      matched = { ...target };

      // 同时更新对应的 outbound 申请
      const outbound = draft.visitRequests.find(
        (r) => r.visitRequestId === target.sourceOutboundId || r.sourceOutboundId === target.visitRequestId
      );
      if (outbound && outbound.state === 'pending') {
        outbound.state = target.state;
        outbound.updatedAt = now;
      }

      // 如果接受，自动建房
      if (nextAction === 'accept') {
        const guestId = target.fromUserId;
        const friend = draft.friends.find((item) => item.friendUserId === guestId);

        draft.visitRoom = {
          roomId: makeId('room'),
          hostUserId: draft.identity.userId,
          guestUserId: guestId,
          guestPetName: target.fromPetName || (friend ? friend.petName : ''),
          guestOwnerName: target.fromOwnerName || (friend ? friend.ownerName : ''),
          sourceRequestId: target.visitRequestId,
          intent: target.intent || 'say-hi',
          roomState: 'active',
          createdAt: now,
          updatedAt: now,
        };
        draft.currentGame = null;
        draft.lastGameEvent = null;

        roomCreated = { ...draft.visitRoom };

        if (friend) {
          friend.status = normalizeFriendStatus(friend.status, 'online');
          friend.presenceTTL = clampTTL(friend.presenceTTL || 180, 180);
          friend.presenceExpiresAt = addSeconds(now, friend.presenceTTL);
          friend.presenceSource = 'visit-request-accepted';
          friend.lastInteractionAt = now;
          friend.updatedAt = now;
        }

        draft.presence = normalizePresence({
          ...(draft.presence || {}),
          userStatus: normalizeUserStatus(draft.presence?.userStatus, 'online'),
          sessionStatus: 'visiting',
          statusMessage: draft.presence?.statusMessage || '',
          updatedAt: now,
        }, {
          userStatus: 'online',
          sessionStatus: 'visiting',
          statusMessage: '',
          updatedAt: now,
        });
      } else {
        // 拒绝后恢复 idle
        draft.presence = normalizePresence({
          ...(draft.presence || {}),
          userStatus: normalizeUserStatus(draft.presence?.userStatus, 'online'),
          sessionStatus: resolveSessionStatusByDraft(draft),
          statusMessage: draft.presence?.statusMessage || '',
          updatedAt: now,
        }, {
          userStatus: 'online',
          sessionStatus: 'idle',
          statusMessage: '',
          updatedAt: now,
        });
      }
    });

    emitSocialEvent('visit.request.updated', matched);
    emitSocialEvent('visit.requests.updated', next.visitRequests || []);
    emitSocialEvent('presence.updated', normalizePresence(next.presence, {
      userStatus: 'online',
      sessionStatus: roomCreated ? 'visiting' : 'idle',
      statusMessage: '',
    }));

    if (roomCreated) {
      emitSocialEvent('visit.room.updated', roomCreated);
      emitSocialEvent('visit.game.updated', null);
      emitSocialEvent('visit.game.event', null);
    }

    emitSocialEvent('friends.list.updated', normalizeFriends(next.friends));

    return {
      request: matched,
      room: roomCreated,
      requests: next.visitRequests || [],
    };
  }

  getPendingVisitRequests() {
    const store = readStore();
    return (store.visitRequests || []).filter((r) => r.state === 'pending');
  }

  sendMiniGameRequest({ gameType = 'gomoku', payload = {} } = {}) {
    const safeGameType = normalizeGameType(gameType);
    const now = nowISO();
    let request = null;

    const next = mutateStore((draft) => {
      if (!draft.identity) throw new Error('identity-required');
      if (!draft.visitRoom) throw new Error('visit-room-not-found');
      if (!resolveFeatureFlags(draft.featureFlags).miniGameEnabled) throw new Error('mini-game-disabled');
      if (draft.currentGame && draft.currentGame.roomId === draft.visitRoom.roomId && draft.currentGame.status === 'active') {
        throw new Error('mini-game-already-active');
      }

      if (!Array.isArray(draft.miniGameRequests)) draft.miniGameRequests = [];
      const existingPending = draft.miniGameRequests.find((item) => item.roomId === draft.visitRoom.roomId && item.state === 'pending');
      if (existingPending) throw new Error('mini-game-request-already-pending');

      request = {
        gameRequestId: makeId('mgr'),
        roomId: draft.visitRoom.roomId,
        direction: 'outbound',
        state: 'pending',
        gameType: safeGameType,
        fromUserId: draft.identity.userId,
        fromOwnerName: draft.identity.ownerName,
        fromPetName: draft.identity.petName,
        targetUserId: draft.visitRoom.guestUserId,
        createdAt: now,
        expiresAt: addSeconds(now, 30),
        updatedAt: now,
        payload: payload && typeof payload === 'object' ? payload : {},
      };
      draft.miniGameRequests.push(request);

      draft.miniGameRequests.push({
        ...request,
        gameRequestId: makeId('mgr'),
        direction: 'inbound',
        sourceOutboundId: request.gameRequestId,
      });
    });

    emitSocialEvent('visit.game.request.created', request);
    emitSocialEvent('visit.game.requests.updated', next.miniGameRequests || []);
    return {
      request,
      requests: next.miniGameRequests || [],
    };
  }

  respondMiniGameRequest({ gameRequestId, action, payload = {} } = {}) {
    const reqId = String(gameRequestId || '').trim();
    const nextAction = String(action || '').trim();
    if (!reqId) throw new Error('mini-game-request-id-required');
    if (!['accept', 'reject'].includes(nextAction)) throw new Error('invalid-mini-game-request-action');

    const now = nowISO();
    let matched = null;
    let game = null;
    let gameEvent = null;

    const next = mutateStore((draft) => {
      if (!draft.identity) throw new Error('identity-required');
      if (!draft.visitRoom) throw new Error('visit-room-not-found');
      if (!Array.isArray(draft.miniGameRequests)) draft.miniGameRequests = [];

      const target = draft.miniGameRequests.find((item) => item.gameRequestId === reqId);
      if (!target) throw new Error('mini-game-request-not-found');
      if (target.direction !== 'inbound') throw new Error('mini-game-request-not-inbound');
      if (target.state !== 'pending') throw new Error('mini-game-request-not-pending');

      if (target.expiresAt && new Date(target.expiresAt).getTime() < Date.now()) {
        target.state = 'expired';
        target.updatedAt = now;
        matched = { ...target };
        const outboundExpired = draft.miniGameRequests.find((item) => item.gameRequestId === target.sourceOutboundId || item.sourceOutboundId === target.gameRequestId);
        if (outboundExpired && outboundExpired.state === 'pending') {
          outboundExpired.state = 'expired';
          outboundExpired.updatedAt = now;
        }
        throw new Error('mini-game-request-expired');
      }

      target.state = nextAction === 'accept' ? 'accepted' : 'rejected';
      target.updatedAt = now;
      target.payload = { ...(target.payload || {}), ...(payload && typeof payload === 'object' ? payload : {}) };
      matched = { ...target };

      const outbound = draft.miniGameRequests.find((item) => item.gameRequestId === target.sourceOutboundId || item.sourceOutboundId === target.gameRequestId);
      if (outbound && outbound.state === 'pending') {
        outbound.state = target.state;
        outbound.updatedAt = now;
        outbound.payload = { ...(outbound.payload || {}), ...(payload && typeof payload === 'object' ? payload : {}) };
      }

      if (nextAction === 'accept') {
        // ★ 接受游戏时分配黑白方：
        //   邀请方（对方）= 黑子，接受方（自己）= 白子
        const myId = draft.identity.userId;
        const roomId = draft.visitRoom.roomId;
        // 对方 ID：如果我是 host 则对方是 guest，反之亦然
        const iAmHost = (draft.visitRoom.hostUserId === myId);
        const opponentId = iAmHost ? draft.visitRoom.guestUserId : draft.visitRoom.hostUserId;
        // 对方名字：从好友列表或房间字段查找
        const opponentFriend = draft.friends.find(f => f.friendUserId === opponentId);
        const opponentName = opponentFriend
          ? `${opponentFriend.ownerName || ''}·${opponentFriend.petName || ''}`.replace(/^·|·$/g, '')
          : (iAmHost
            ? (draft.visitRoom.guestOwnerName || draft.visitRoom.guestPetName || '对方')
            : '对方');
        game = createGomokuGame({
          roomId,
          interactionId: target.gameRequestId,
          blackUserId: opponentId || '',   // ★ 邀请方=黑
          blackOwnerName: opponentName,
          whiteUserId: myId,               // ★ 接受方=白
          whiteOwnerName: `${draft.identity.ownerName || ''}·${draft.identity.petName || ''}`.replace(/^·|·$/g, ''),
          now,
        });
        gameEvent = {
          eventId: makeId('ge'),
          roomId: draft.visitRoom.roomId,
          gameId: game.gameId,
          gameType: target.gameType || 'gomoku',
          kind: 'started',
          actorUserId: draft.identity.userId,
          createdAt: now,
          payload: { nextStone: game.nextStone },
        };

        draft.currentGame = game;
        draft.lastGameEvent = gameEvent;
        draft.presence = normalizePresence({
          ...(draft.presence || {}),
          userStatus: normalizeUserStatus(draft.presence?.userStatus, 'online'),
          sessionStatus: 'playing',
          statusMessage: draft.presence?.statusMessage || '',
          updatedAt: now,
        }, {
          userStatus: 'online',
          sessionStatus: 'playing',
          statusMessage: '',
          updatedAt: now,
        });
      }
    });

    emitSocialEvent('visit.game.request.updated', matched);
    emitSocialEvent('visit.game.requests.updated', next.miniGameRequests || []);

    if (game) {
      emitSocialEvent('visit.game.updated', game);
      emitSocialEvent('visit.game.event', gameEvent);
      emitSocialEvent('presence.updated', normalizePresence(next.presence, {
        userStatus: 'online',
        sessionStatus: 'playing',
        statusMessage: '',
      }));
    }

    return {
      request: matched,
      requests: next.miniGameRequests || [],
      game,
      event: gameEvent,
    };
  }

  createVisitRoom({ hostUserId, guestUserId, sourceRequestId = null, intent = 'say-hi' } = {}) {
    const next = mutateStore((draft) => {
      if (!draft.identity) throw new Error('identity-required');
      const now = nowISO();
      reconcileFriendsPresenceDraft(draft, now);

      const targetGuestId = String(guestUserId || '').trim();
      if (!targetGuestId) {
        throw new Error('guest-user-required');
      }

      const friend = draft.friends.find((item) => item.friendUserId === targetGuestId);
      if (!friend) {
        throw new Error('friend-not-found');
      }
      if (friend.isBlocked) {
        throw new Error('friend-blocked');
      }

      const friendStatus = normalizeFriendStatus(friend.status, 'offline');
      if (friendStatus !== 'online') {
        throw new Error('friend-not-available');
      }

      friend.status = friendStatus;
      friend.presenceTTL = clampTTL(friend.presenceTTL || 180, 180);
      friend.presenceExpiresAt = addSeconds(now, friend.presenceTTL);
      friend.presenceSource = 'visit-session';
      friend.lastInteractionAt = now;
      friend.updatedAt = now;

      draft.visitRoom = {
        roomId: makeId('room'),
        hostUserId: hostUserId || draft.identity.userId,
        guestUserId: targetGuestId,
        guestPetName: friend.petName,
        guestOwnerName: friend.ownerName,
        sourceRequestId,
        intent,
        roomState: 'active',
        createdAt: now,
        updatedAt: now,
      };
      draft.currentGame = null;
      draft.lastGameEvent = null;

      draft.presence = normalizePresence({
        ...(draft.presence || {}),
        userStatus: normalizeUserStatus(draft.presence?.userStatus, 'online'),
        sessionStatus: 'visiting',
        statusMessage: draft.presence?.statusMessage || '',
        updatedAt: now,
      }, {
        userStatus: 'online',
        sessionStatus: 'visiting',
        statusMessage: '',
        updatedAt: now,
      });
    });

    const normalizedPresence = normalizePresence(next.presence, {
      userStatus: 'online',
      sessionStatus: 'visiting',
      statusMessage: '',
    });
    emitSocialEvent('visit.room.updated', next.visitRoom);
    emitSocialEvent('visit.game.updated', null);
    emitSocialEvent('visit.game.event', null);
    emitSocialEvent('friends.list.updated', normalizeFriends(next.friends));
    emitSocialEvent('presence.updated', normalizedPresence);
    return next.visitRoom;
  }

  leaveVisitRoom({ reason = 'manual-leave' } = {}) {
    const next = mutateStore((draft) => {
      const now = nowISO();
      if (draft.visitRoom) {
        const lastRoom = { ...draft.visitRoom };
        draft.visitRoom = {
          ...draft.visitRoom,
          roomState: 'closed',
          closeReason: reason,
          closedAt: now,
          updatedAt: now,
        };

        const friend = draft.friends.find((item) => item.friendUserId === lastRoom.guestUserId);
        if (friend) {
          friend.status = normalizeFriendStatus(friend.status, 'online');
          friend.presenceTTL = clampTTL(friend.presenceTTL || 120, 120);
          friend.presenceExpiresAt = addSeconds(now, friend.presenceTTL);
          friend.presenceSource = 'visit-session-end';
          friend.lastInteractionAt = now;
          friend.updatedAt = now;
        }
      }
      draft.visitRoom = null;
      draft.currentGame = null;
      draft.lastGameEvent = null;
      draft.miniGameRequests = [];
      draft.presence = normalizePresence({
        ...(draft.presence || {}),
        userStatus: normalizeUserStatus(draft.presence?.userStatus, 'online'),
        sessionStatus: 'idle',
        statusMessage: draft.presence?.statusMessage || '',
        updatedAt: now,
      }, {
        userStatus: 'online',
        sessionStatus: 'idle',
        statusMessage: '',
        updatedAt: now,
      });
    });

    const normalizedPresence = normalizePresence(next.presence, {
      userStatus: 'online',
      sessionStatus: 'idle',
      statusMessage: '',
    });
    emitSocialEvent('visit.room.updated', null);
    emitSocialEvent('visit.game.updated', null);
    emitSocialEvent('visit.game.event', null);
    emitSocialEvent('friends.list.updated', normalizeFriends(next.friends));
    emitSocialEvent('presence.updated', normalizedPresence);
    return normalizedPresence;
  }

  sendVisitInteraction({ action, payload = {} } = {}) {
    const safeAction = normalizeInteractionAction(action);
    const now = nowISO();
    let interaction = null;

    const next = mutateStore((draft) => {
      if (!draft.identity) throw new Error('identity-required');
      if (!draft.visitRoom) throw new Error('visit-room-not-found');

      const room = {
        ...draft.visitRoom,
        updatedAt: now,
      };
      draft.visitRoom = room;

      const friend = draft.friends.find((item) => item.friendUserId === room.guestUserId);
      if (friend) {
        friend.lastInteractionAt = now;
        friend.updatedAt = now;
        friend.status = normalizeFriendStatus(friend.status, 'online');
        friend.presenceTTL = clampTTL(friend.presenceTTL || 180, 180);
        friend.presenceExpiresAt = addSeconds(now, friend.presenceTTL);
        friend.presenceSource = 'visit-interaction';
      }

      interaction = {
        interactionId: makeId('vi'),
        roomId: room.roomId,
        action: safeAction,
        actorUserId: draft.identity.userId,
        actorPetName: draft.identity.petName,
        actorOwnerName: draft.identity.ownerName,
        targetUserId: room.guestUserId,
        createdAt: now,
        payload: payload && typeof payload === 'object' ? payload : {},
      };
      draft.lastVisitInteraction = interaction;
    });

    emitSocialEvent('visit.interaction', interaction);
    emitSocialEvent('friends.list.updated', normalizeFriends(next.friends));
    return interaction;
  }

  startMiniGame({ gameType = 'gomoku', payload = {} } = {}) {
    const safeGameType = normalizeGameType(gameType);
    const now = nowISO();
    let interaction = null;
    let game = null;
    let gameEvent = null;

    const next = mutateStore((draft) => {
      if (!draft.identity) throw new Error('identity-required');
      if (!draft.visitRoom) throw new Error('visit-room-not-found');

      const featureFlags = resolveFeatureFlags(draft.featureFlags);
      if (!featureFlags.miniGameEnabled) {
        throw new Error('mini-game-disabled');
      }

      const room = {
        ...draft.visitRoom,
        updatedAt: now,
      };
      draft.visitRoom = room;

      interaction = {
        interactionId: makeId('vi'),
        roomId: room.roomId,
        action: 'invite-game',
        actorUserId: draft.identity.userId,
        actorPetName: draft.identity.petName,
        actorOwnerName: draft.identity.ownerName,
        targetUserId: room.guestUserId,
        createdAt: now,
        payload: {
          ...(payload && typeof payload === 'object' ? payload : {}),
          gameType: safeGameType,
        },
      };

      if (safeGameType !== 'gomoku') {
        throw new Error('unsupported-mini-game-type');
      }

      game = createGomokuGame({
        roomId: room.roomId,
        interactionId: interaction.interactionId,
        // ★ 邀请方=黑子，被邀请方（room.guestUserId）=白子
        blackUserId: draft.identity.userId,
        blackOwnerName: draft.identity.ownerName || draft.identity.petName || '',
        whiteUserId: room.guestUserId,
        whiteOwnerName: room.guestOwnerName || room.guestPetName || '',
        now,
      });

      gameEvent = {
        eventId: makeId('ge'),
        roomId: room.roomId,
        gameId: game.gameId,
        gameType: safeGameType,
        kind: 'started',
        actorUserId: draft.identity.userId,
        createdAt: now,
        payload: {
          nextStone: game.nextStone,
        },
      };

      draft.currentGame = game;
      draft.lastGameEvent = gameEvent;
      draft.lastVisitInteraction = interaction;
      draft.presence = normalizePresence({
        ...(draft.presence || {}),
        userStatus: normalizeUserStatus(draft.presence?.userStatus, 'online'),
        sessionStatus: 'playing',
        statusMessage: draft.presence?.statusMessage || '',
        updatedAt: now,
      }, {
        userStatus: 'online',
        sessionStatus: 'playing',
        statusMessage: '',
        updatedAt: now,
      });

      const friend = draft.friends.find((item) => item.friendUserId === room.guestUserId);
      if (friend) {
        friend.lastInteractionAt = now;
        friend.updatedAt = now;
        friend.status = normalizeFriendStatus(friend.status, 'online');
        friend.presenceTTL = clampTTL(friend.presenceTTL || 180, 180);
        friend.presenceExpiresAt = addSeconds(now, friend.presenceTTL);
        friend.presenceSource = 'mini-game-start';
      }
    });

    emitSocialEvent('visit.interaction', interaction);
    emitSocialEvent('visit.game.updated', game);
    emitSocialEvent('visit.game.event', gameEvent);
    emitSocialEvent('friends.list.updated', normalizeFriends(next.friends));
    emitSocialEvent('presence.updated', normalizePresence(next.presence, {
      userStatus: 'online',
      sessionStatus: 'playing',
      statusMessage: '',
    }));

    return {
      game,
      interaction,
      event: gameEvent,
    };
  }

  playMiniGameMove({ gameType = 'gomoku', payload = {} } = {}) {
    const safeGameType = normalizeGameType(gameType);

    // ★ 认输 / 退出游戏：不需要 row/col
    if (payload?.resign) {
      return _handleResignGame(safeGameType, payload);
    }

    const row = Number(payload?.row);
    const col = Number(payload?.col);
    if (!Number.isInteger(row) || !Number.isInteger(col)) {
      throw new Error('invalid-gomoku-position');
    }
    if (row < 0 || row >= GOMOKU_SIZE || col < 0 || col >= GOMOKU_SIZE) {
      throw new Error('invalid-gomoku-position');
    }

    const now = nowISO();
    let game = null;
    let gameEvent = null;

    const next = mutateStore((draft) => {
      if (!draft.identity) throw new Error('identity-required');
      if (!draft.visitRoom) throw new Error('visit-room-not-found');
      if (!draft.currentGame) throw new Error('mini-game-not-found');
      if (draft.currentGame.type !== safeGameType) throw new Error('mini-game-type-mismatch');
      if (draft.currentGame.status !== 'active') throw new Error('mini-game-not-active');
      if (draft.currentGame.roomId !== draft.visitRoom.roomId) throw new Error('mini-game-room-mismatch');

      const nextBoard = draft.currentGame.board.map((line) => [...line]);
      if (!nextBoard[row] || nextBoard[row][col]) {
        throw new Error('gomoku-cell-occupied');
      }

      const stone = draft.currentGame.nextStone === 'white' ? 'white' : 'black';
      nextBoard[row][col] = stone;
      const moveCount = Number(draft.currentGame.moveCount || 0) + 1;
      const winner = resolveGomokuWinner(nextBoard, row, col, stone)
        ? stone
        : (moveCount >= GOMOKU_SIZE * GOMOKU_SIZE ? 'draw' : '');

      game = {
        ...draft.currentGame,
        board: nextBoard,
        moveCount,
        winner,
        status: winner ? 'finished' : 'active',
        nextStone: winner ? '' : (stone === 'black' ? 'white' : 'black'),
        lastMove: {
          row,
          col,
          stone,
          at: now,
        },
        finishedAt: winner ? now : null,
        updatedAt: now,
      };

      gameEvent = {
        eventId: makeId('ge'),
        roomId: draft.visitRoom.roomId,
        gameId: game.gameId,
        gameType: safeGameType,
        kind: winner ? 'finished' : 'move',
        actorUserId: draft.identity.userId,
        createdAt: now,
        payload: {
          row,
          col,
          stone,
          nextStone: game.nextStone,
          winner,
          moveCount,
        },
      };

      draft.currentGame = game;
      draft.lastGameEvent = gameEvent;
      draft.presence = normalizePresence({
        ...(draft.presence || {}),
        userStatus: normalizeUserStatus(draft.presence?.userStatus, 'online'),
        sessionStatus: 'playing',
        statusMessage: draft.presence?.statusMessage || '',
        updatedAt: now,
      }, {
        userStatus: 'online',
        sessionStatus: 'playing',
        statusMessage: '',
        updatedAt: now,
      });

      const friend = draft.friends.find((item) => item.friendUserId === draft.visitRoom.guestUserId);
      if (friend) {
        friend.lastInteractionAt = now;
        friend.updatedAt = now;
      }
    });

    emitSocialEvent('visit.game.updated', game);
    emitSocialEvent('visit.game.event', gameEvent);
    emitSocialEvent('friends.list.updated', normalizeFriends(next.friends));
    emitSocialEvent('presence.updated', normalizePresence(next.presence, {
      userStatus: 'online',
      sessionStatus: 'playing',
      statusMessage: '',
    }));

    return {
      game,
      event: gameEvent,
    };
  }

  /** 处理认输/退出游戏 */
  _handleResignGame(safeGameType, payload = {}) {
    const now = nowISO();
    let game = null;
    let gameEvent = null;
    const resignStone = payload.stone || '';
    const reason = payload.reason || 'resign';

    const next = mutateStore((draft) => {
      if (!draft.identity) throw new Error('identity-required');
      if (!draft.visitRoom) throw new Error('visit-room-not-found');
      if (!draft.currentGame) throw new Error('mini-game-not-found');
      if (draft.currentGame.type !== safeGameType) throw new Error('mini-game-type-mismatch');
      if (draft.currentGame.status !== 'active') throw new Event('mini-game-not-active');

      // 对方获胜（认输方 stone 的反色）
      const winnerStone = resignStone === 'black' ? 'white' : (resignStone === 'white' ? 'black' : 'black');

      // 标记游戏结束
      game = {
        ...draft.currentGame,
        status: 'finished',
        winner: winnerStone,
        finishedAt: now,
        updatedAt: now,
      };

      // 清除当前对局（双方都清除）
      draft.currentGame = null;
      draft.lastGameEvent = null;

      // 恢复 presence
      draft.presence = normalizePresence({
        ...(draft.presence || {}),
        userStatus: normalizeUserStatus(draft.presence?.userStatus, 'online'),
        sessionStatus: 'visiting',
        statusMessage: reason === 'window-closed' ? '已退出对局' : '',
        updatedAt: now,
      }, {
        userStatus: 'online',
        sessionStatus: 'visiting',
        statusMessage: '',
        updatedAt: now,
      });

      gameEvent = {
        eventId: makeId('ge'),
        roomId: draft.visitRoom.roomId,
        gameId: game.gameId,
        gameType: safeGameType,
        kind: 'resigned',
        actorUserId: draft.identity.userId,
        createdAt: now,
        payload: {
          winner: winnerStone,
          resignedStone: resignStone,
          reason,
        },
      };
    });

    // 推送事件：对方收到后也会清除 currentGame
    emitSocialEvent('visit.game.resigned', { gameId: game?.gameId, winner: game?.winner, reason });
    emitSocialEvent('visit.game.updated', null);  // ★ 发 null 让双方都清除 currentGame
    emitSocialEvent('visit.game.event', gameEvent);
    emitSocialEvent('presence.updated', normalizePresence(next.presence, {
      userStatus: 'online',
      sessionStatus: 'visiting',
      statusMessage: '',
    }));

    return { game, event: gameEvent };
  }

  resetMiniGame({ gameType = 'gomoku' } = {}) {
    const safeGameType = normalizeGameType(gameType);
    const now = nowISO();
    let game = null;
    let gameEvent = null;

    const next = mutateStore((draft) => {
      if (!draft.identity) throw new Error('identity-required');
      if (!draft.visitRoom) throw new Error('visit-room-not-found');
      if (safeGameType !== 'gomoku') throw new Error('unsupported-mini-game-type');

      game = createGomokuGame({
        roomId: draft.visitRoom.roomId,
        interactionId: draft.currentGame?.sourceInteractionId || null,
        now,
      });

      gameEvent = {
        eventId: makeId('ge'),
        roomId: draft.visitRoom.roomId,
        gameId: game.gameId,
        gameType: safeGameType,
        kind: 'reset',
        actorUserId: draft.identity.userId,
        createdAt: now,
        payload: {
          nextStone: game.nextStone,
        },
      };

      draft.currentGame = game;
      draft.lastGameEvent = gameEvent;
      draft.presence = normalizePresence({
        ...(draft.presence || {}),
        userStatus: normalizeUserStatus(draft.presence?.userStatus, 'online'),
        sessionStatus: 'playing',
        statusMessage: draft.presence?.statusMessage || '',
        updatedAt: now,
      }, {
        userStatus: 'online',
        sessionStatus: 'playing',
        statusMessage: '',
        updatedAt: now,
      });
    });

    emitSocialEvent('visit.game.updated', game);
    emitSocialEvent('visit.game.event', gameEvent);
    emitSocialEvent('presence.updated', normalizePresence(next.presence, {
      userStatus: 'online',
      sessionStatus: 'playing',
      statusMessage: '',
    }));

    return {
      game,
      event: gameEvent,
    };
  }

  getCurrentRoom() {
    return this.syncStoreRuntimeState({ emitFriendUpdates: false }).visitRoom;
  }

  getFeatureFlags() {
    const store = readStore();
    return resolveFeatureFlags(store.featureFlags);
  }

  updateFeatureFlags(patch = {}) {
    const next = mutateStore((draft) => {
      draft.featureFlags = resolveFeatureFlags({
        ...(draft.featureFlags || {}),
        ...(patch || {}),
      });
    });
    emitSocialEvent('feature-flags.updated', next.featureFlags);
    return next.featureFlags;
  }

  // ═══════════════════════════════════════════
  // 亲密度体系
  // ═══════════════════════════════════════════

  /**
   * 为指定好友增加亲密积分
   * @param {{ friendUserId: string, eventType: string, amountOverride?: number }}
   * @returns {{ success, intimacy?, leveledUp?, fromLevel?, toLevel? }}
   */
  addIntimacyPoints({ friendUserId, eventType, amountOverride } = {}) {
    const targetId = String(friendUserId || '').trim();
    if (!targetId) throw new Error('friend-user-required');
    const now = nowISO();
    let result = null;

    const next = mutateStore((draft) => {
      if (!draft.identity) throw new Error('identity-required');

      const friend = draft.friends.find((item) => item.friendUserId === targetId);
      if (!friend) throw new Error('friend-not-found');
      if (friend.isBlocked) throw new Error('friend-blocked');

      // 初始化或复用亲密度数据
      if (!friend.intimacy || typeof friend.intimacy !== 'object') {
        friend.intimacy = createEmptyIntimacy();
      }

      const addResult = addPoints(friend.intimacy, eventType, amountOverride);
      friend.updatedAt = now;

      result = {
        friendUserId: targetId,
        added: addResult.added,
        leveledUp: addResult.leveledUp,
        fromLevel: addResult.leveledUp ? { key: addResult.fromLevel.key, name: addResult.fromLevel.name, icon: addResult.fromLevel.icon } : null,
        toLevel: addResult.leveledUp ? { key: addResult.toLevel.key, name: addResult.toLevel.name, icon: addResult.toLevel.icon } : null,
        intimacy: {
          score: friend.intimacy.score,
          levelKey: resolveLevel(friend.intimacy.score).key,
          levelName: resolveLevel(friend.intimacy.score).name,
          levelIcon: resolveLevel(friend.intimacy.score).icon,
          progress: getProgressToNext(friend.intimacy.score),
        },
      };
    });

    emitSocialEvent('friends.list.updated', normalizeFriends(next.friends));
    if (result?.leveledUp) {
      emitSocialEvent('intimacy.level-up', {
        friendUserId: targetId,
        fromLevel: result.fromLevel,
        toLevel: result.toLevel,
        score: result.intimacy?.score || 0,
        at: now,
      });
    }
    emitSocialEvent('intimacy.points-added', {
      friendUserId: targetId,
      eventType,
      points: result?.added || 0,
      intimacy: result?.intimacy || null,
      at: now,
    });

    return result;
  }

  /**
   * 获取好友的亲密度信息（只读）
   */
  getIntimacy(friendUserId) {
    const store = this.syncStoreRuntimeState({ emitFriendUpdates: false });
    const targetId = String(friendUserId || '').trim();
    const friend = (store.friends || []).find((f) => f.friendUserId === targetId);
    if (!friend) return null;

    const intimacy = friend.intimacy && typeof friend.intimacy === 'object'
      ? friend.intimacy
      : createEmptyIntimacy();

    const score = intimacy.score || 0;
    const level = resolveLevel(score);
    return {
      friendUserId: targetId,
      score,
      level: { key: level.key, name: level.name, icon: level.icon, color: level.color },
      progress: getProgressToNext(score),
      dailyEvents: intimacy.dailyEvents || {},
      lastResetDate: intimacy.lastResetDate || '',
      updatedAt: intimacy.updatedAt || '',
    };
  }

  /**
   * 获取所有好友的亲密度概览
   */
  getIntimacyOverview() {
    const store = this.syncStoreRuntimeState({ emitFriendUpdates: false });
    return (store.friends || [])
      .filter((f) => !f.isBlocked)
      .map((f) => {
        const intimacy = f.intimacy && typeof f.intimacy === 'object' ? f.intimacy : createEmptyIntimacy();
        const score = intimacy.score || 0;
        const level = resolveLevel(score);
        return {
          friendUserId: f.friendUserId,
          ownerName: f.ownerName,
          petName: f.petName,
          score,
          level: { key: level.key, name: level.name, icon: level.icon, color: level.color },
        };
      });
  }
}

module.exports = {
  SocialClient,
};