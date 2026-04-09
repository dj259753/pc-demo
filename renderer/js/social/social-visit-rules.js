/* ═══════════════════════════════════════════
   拜访规则层（前端）
   仅负责发起拜访前可否进入的判断，不做留痕
   ═══════════════════════════════════════════ */

const SocialVisitRules = (() => {
  const FRIEND_STATUS_LABEL = {
    online: '在线',
    busy: '忙碌',
    focus: '专注',
    away: '离开',
    offline: '离线',
  };

  const SELF_STATUS_BLOCK_MESSAGE = {
    busy: '你当前是忙碌状态，请先切到在线后再发起拜访',
    focus: '你当前在专注状态，请先结束专注再发起拜访',
    away: '你当前是离开状态，建议切回在线后再发起拜访',
    offline: '你当前离线，请先切到在线状态',
  };

  const FRIEND_STATUS_BLOCK_MESSAGE = {
    busy: '对方当前忙碌，先别打扰啦',
    focus: '对方正在专注，稍后再来拜访吧',
    away: '对方暂时离开了，晚点再试',
    offline: '对方当前离线，暂时无法拜访',
  };

  function normalizeStatus(value, fallback = 'offline') {
    const text = String(value || '').trim();
    if (!text) return fallback;
    if (text === 'hidden') return 'away';
    if (Object.prototype.hasOwnProperty.call(FRIEND_STATUS_LABEL, text)) {
      return text;
    }
    return fallback;
  }

  function getFriendById(friendUserId, state = SocialState.getState()) {
    const list = Array.isArray(state.friends) ? state.friends : [];
    return list.find((item) => item.friendUserId === friendUserId) || null;
  }

  function checkSelfBeforeVisit(state = SocialState.getState()) {
    if (!state.profile) {
      return {
        ok: false,
        code: 'profile-required',
        message: '请先保存社交资料后再发起拜访',
      };
    }

    if (state.currentRoom) {
      return {
        ok: false,
        code: 'already-in-room',
        message: '你已经在拜访会话中，请先离开当前会话',
      };
    }

    const selfStatus = normalizeStatus(state.presence?.userStatus, 'offline');
    if (selfStatus !== 'online') {
      return {
        ok: false,
        code: `self-${selfStatus}`,
        message: SELF_STATUS_BLOCK_MESSAGE[selfStatus] || '当前状态不允许发起拜访',
      };
    }

    return {
      ok: true,
      code: 'ok',
      message: '',
    };
  }

  function checkFriendBeforeVisit(friendUserId, state = SocialState.getState()) {
    const friend = getFriendById(friendUserId, state);
    if (!friend) {
      return {
        ok: false,
        code: 'friend-not-found',
        message: '未找到该好友，请刷新后重试',
        friend: null,
      };
    }

    if (friend.isBlocked) {
      return {
        ok: false,
        code: 'friend-blocked',
        message: '该好友已被拉黑，无法发起拜访',
        friend,
      };
    }

    const friendStatus = normalizeStatus(friend.status, 'offline');
    if (friendStatus !== 'online') {
      return {
        ok: false,
        code: `friend-${friendStatus}`,
        message: FRIEND_STATUS_BLOCK_MESSAGE[friendStatus] || '对方当前状态不可拜访',
        friend: {
          ...friend,
          status: friendStatus,
        },
      };
    }

    return {
      ok: true,
      code: 'ok',
      message: '',
      friend: {
        ...friend,
        status: friendStatus,
      },
    };
  }

  function canVisitFriend(friendUserId, state = SocialState.getState()) {
    const selfCheck = checkSelfBeforeVisit(state);
    if (!selfCheck.ok) return selfCheck;

    return checkFriendBeforeVisit(friendUserId, state);
  }

  return {
    FRIEND_STATUS_LABEL,
    normalizeStatus,
    checkSelfBeforeVisit,
    checkFriendBeforeVisit,
    canVisitFriend,
    getFriendById,
  };
})();
