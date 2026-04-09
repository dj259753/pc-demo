/* ═══════════════════════════════════════════
  主人状态感知控制器
  - 本地采集键鼠 / 前台 App / 现有子系统状态
  - 归纳成 working / entertainment / idle-light / away
  - 通过 statusMessage 同步到社交层
  - 尽量只做 plug-in 接入，不重写主流程
  ═══════════════════════════════════════════ */

const PresenceController = (() => {
  const listeners = new Set();

  const BASE_STATE = {
    WORKING: 'working',
    ENTERTAINMENT: 'entertainment',
    IDLE_LIGHT: 'idle-light',
    AWAY: 'away',
  };

  const TYPING_WINDOW_MS = 6000;
  const FRONTMOST_POLL_MS = 12000;
  const RESOLVE_INTERVAL_MS = 3000;
  const LIGHT_IDLE_MS = 45000;
  const AWAY_IDLE_MS = 8 * 60 * 1000;

  const WORK_APP_PATTERNS = [
    /cursor/i,
    /visual\s*studio\s*code/i,
    /^code$/i,
    /codebuddy/i,
    /terminal/i,
    /iterm/i,
    /warp/i,
    /xcode/i,
    /webstorm/i,
    /intellij/i,
    /idea/i,
    /android\s*studio/i,
    /figma/i,
    /notion/i,
    /obsidian/i,
    /excel/i,
    /word/i,
    /powerpoint/i,
    /pages/i,
    /keynote/i,
    /numbers/i,
    /飞书/i,
    /微信开发者工具/i,
  ];

  const WATCH_APP_PATTERNS = [
    /iina/i,
    /vlc/i,
    /quicktime/i,
    /music/i,
    /^tv$/i,
    /bilibili/i,
    /腾讯视频/i,
    /优酷/i,
    /爱奇艺/i,
    /spotify/i,
    /netease/i,
    /qqmusic/i,
  ];

  const BROWSER_PATTERNS = [
    /chrome/i,
    /safari/i,
    /firefox/i,
    /edge/i,
    /arc/i,
  ];

  let initialized = false;
  let lastInputAt = Date.now();
  let lastKeyboardAt = 0;
  let keyboardBurst = [];
  let frontmostApp = '';
  let frontmostCategory = 'unknown';
  let frontmostPolledAt = 0;
  let pollTimer = null;
  let resolveTimer = null;
  let syncTimer = null;
  let lastSyncedSignature = '';
  let autoPresenceMode = '';
  let resumeUserStatus = 'online';

  let state = createState({
    baseState: BASE_STATE.IDLE_LIGHT,
    label: '发呆中',
    publicStatusMessage: '发呆中',
    userStatus: 'online',
    since: Date.now(),
    updatedAt: new Date().toISOString(),
    source: 'boot',
  });

  function createState(patch = {}) {
    return {
      baseState: BASE_STATE.IDLE_LIGHT,
      overlay: [],
      label: '发呆中',
      publicStatusMessage: '发呆中',
      userStatus: 'online',
      idleMs: 0,
      appName: '',
      appCategory: 'unknown',
      typing: false,
      since: Date.now(),
      updatedAt: new Date().toISOString(),
      source: 'unknown',
      ...patch,
    };
  }

  function snapshot() {
    return JSON.parse(JSON.stringify(state));
  }

  function emit(payload) {
    listeners.forEach((listener) => {
      try {
        listener(payload);
      } catch (err) {
        console.warn('[presence] listener error:', err);
      }
    });
  }

  function onChange(listener) {
    if (typeof listener !== 'function') return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function normalizeUserStatus(value, fallback = 'online') {
    const raw = String(value || '').trim().toLowerCase();
    if (['online', 'busy', 'focus', 'away'].includes(raw)) return raw;
    if (raw === 'offline') return fallback;
    return fallback;
  }

  function getCurrentPresence() {
    if (typeof SocialState === 'undefined' || typeof SocialState.getState !== 'function') {
      return { userStatus: 'online', sessionStatus: 'idle', statusMessage: '' };
    }
    return SocialState.getState().presence || { userStatus: 'online', sessionStatus: 'idle', statusMessage: '' };
  }

  function classifyFrontmostApp(appName, typing) {
    const text = String(appName || '').trim();
    if (!text) return 'unknown';
    if (WORK_APP_PATTERNS.some((pattern) => pattern.test(text))) return 'work';
    if (WATCH_APP_PATTERNS.some((pattern) => pattern.test(text))) return 'watch';
    if (BROWSER_PATTERNS.some((pattern) => pattern.test(text))) {
      return typing ? 'work' : 'watch';
    }
    return 'unknown';
  }

  function trackInput(type) {
    const now = Date.now();
    lastInputAt = now;
    if (type === 'keyboard') {
      lastKeyboardAt = now;
      keyboardBurst.push(now);
      keyboardBurst = keyboardBurst.filter((ts) => now - ts <= TYPING_WINDOW_MS);
    }
  }

  function bindInputSignals() {
    document.addEventListener('keydown', () => trackInput('keyboard'), true);
    document.addEventListener('mousedown', () => trackInput('mouse'), true);
    document.addEventListener('mousemove', () => trackInput('mouse'), { passive: true, capture: true });
    document.addEventListener('wheel', () => trackInput('mouse'), { passive: true, capture: true });
    document.addEventListener('touchstart', () => trackInput('mouse'), { passive: true, capture: true });
    window.addEventListener('focus', () => trackInput('focus'));
  }

  async function pollFrontmostApp() {
    const now = Date.now();
    if (now - frontmostPolledAt < FRONTMOST_POLL_MS / 2) return;
    frontmostPolledAt = now;

    try {
      const res = await window.electronAPI?.getFrontmostApp?.();
      const name = String(res?.name || '').trim();
      if (name) {
        frontmostApp = name;
        frontmostCategory = classifyFrontmostApp(name, isTypingRecently(now));
      }
    } catch (err) {
      console.warn('[presence] getFrontmostApp failed:', err?.message || err);
    }
  }

  function isTypingRecently(now = Date.now()) {
    keyboardBurst = keyboardBurst.filter((ts) => now - ts <= TYPING_WINDOW_MS);
    return keyboardBurst.length >= 3 || (now - lastKeyboardAt) <= 1800;
  }

  function isQuickChatOrConversationActive() {
    const petState = String(PetState?.state || '').trim();
    return petState === 'thinking' || petState === 'talking';
  }

  function isMeetingNotesActive() {
    return !!(typeof MeetingNotes !== 'undefined' && MeetingNotes?.isActive);
  }

  function isVoiceActive() {
    return !!(typeof VoiceMode !== 'undefined' && (VoiceMode?.isRecording || VoiceMode?.isSessionRunning));
  }

  function resolveAutoUserStatus(nextBaseState) {
    const currentPresence = getCurrentPresence();
    const currentStatus = normalizeUserStatus(currentPresence.userStatus, 'online');
    const forceMode = (typeof FocusMode !== 'undefined' && FocusMode.isActive) || isMeetingNotesActive()
      ? 'focus'
      : (nextBaseState === BASE_STATE.AWAY ? 'away' : '');

    if (forceMode) {
      if (autoPresenceMode !== forceMode) {
        if (!autoPresenceMode) {
          resumeUserStatus = currentStatus === 'away' ? 'online' : currentStatus;
        }
        autoPresenceMode = forceMode;
      }
      return forceMode;
    }

    if (autoPresenceMode) {
      const restored = normalizeUserStatus(resumeUserStatus, 'online');
      autoPresenceMode = '';
      resumeUserStatus = 'online';
      return restored;
    }

    return currentStatus === 'offline' ? 'online' : currentStatus;
  }

  function buildPublicLabel(baseState, overlay, appCategory) {
    let label = '发呆中';

    if ((typeof FocusMode !== 'undefined' && FocusMode.isActive) || isMeetingNotesActive()) {
      label = isMeetingNotesActive() ? '在开会' : '工作中';
    } else if (isVoiceActive()) {
      label = '在说话';
    } else {
      switch (baseState) {
        case BASE_STATE.WORKING:
          label = '工作中';
          break;
        case BASE_STATE.ENTERTAINMENT:
          label = appCategory === 'watch' ? '在看剧' : '放松中';
          break;
        case BASE_STATE.AWAY:
          label = '离开中';
          break;
        case BASE_STATE.IDLE_LIGHT:
        default:
          label = '发呆中';
          break;
      }
    }

    if (overlay.includes('typing') && baseState !== BASE_STATE.AWAY) {
      if (label === '发呆中') return '正在打字';
      return `${label} · 正在打字`;
    }

    return label;
  }

  function resolveNextState(reason = 'tick') {
    const now = Date.now();
    const idleMs = Math.max(0, now - lastInputAt);
    const typing = isTypingRecently(now);
    const overlay = typing ? ['typing'] : [];

    let nextBaseState = BASE_STATE.IDLE_LIGHT;

    if (idleMs >= AWAY_IDLE_MS) {
      nextBaseState = BASE_STATE.AWAY;
    } else if ((typeof FocusMode !== 'undefined' && FocusMode.isActive) || isMeetingNotesActive()) {
      nextBaseState = BASE_STATE.WORKING;
    } else if (isQuickChatOrConversationActive()) {
      nextBaseState = BASE_STATE.WORKING;
    } else if (frontmostCategory === 'work') {
      nextBaseState = BASE_STATE.WORKING;
    } else if (frontmostCategory === 'watch') {
      nextBaseState = BASE_STATE.ENTERTAINMENT;
    } else if (typing) {
      nextBaseState = BASE_STATE.WORKING;
    } else if (idleMs >= LIGHT_IDLE_MS) {
      nextBaseState = BASE_STATE.IDLE_LIGHT;
    }

    const nextLabel = buildPublicLabel(nextBaseState, overlay, frontmostCategory);
    const nextUserStatus = resolveAutoUserStatus(nextBaseState);

    return createState({
      baseState: nextBaseState,
      overlay,
      label: nextLabel,
      publicStatusMessage: nextLabel,
      userStatus: nextUserStatus,
      idleMs,
      appName: frontmostApp,
      appCategory: frontmostCategory,
      typing,
      since: state.baseState === nextBaseState && state.publicStatusMessage === nextLabel ? state.since : now,
      updatedAt: new Date().toISOString(),
      source: reason,
    });
  }

  function canTakeOverPet() {
    if (typeof PetState === 'undefined' || typeof SpriteRenderer === 'undefined') return false;
    if (typeof FocusMode !== 'undefined' && FocusMode.isActive) return false;
    if (typeof VisitSession !== 'undefined' && VisitSession?.isInVisit?.()) return false;
    const petState = String(PetState.state || '').trim();
    if (['eating', 'washing', 'thinking', 'talking', 'error'].includes(petState)) return false;
    return true;
  }

  function syncProactiveMute(nextState) {
    if (typeof ProactiveChat === 'undefined' || typeof ProactiveChat.setMuted !== 'function') return;
    const shouldMute = nextState.baseState === BASE_STATE.AWAY
      || nextState.baseState === BASE_STATE.WORKING
      || (typeof FocusMode !== 'undefined' && FocusMode.isActive)
      || isMeetingNotesActive();
    ProactiveChat.setMuted(shouldMute);
  }

  function syncPetReaction(nextState, prevState) {
    syncProactiveMute(nextState);

    if (!canTakeOverPet()) return;
    if (!prevState || prevState.baseState === nextState.baseState) return;

    if (nextState.baseState === BASE_STATE.AWAY) {
      BehaviorEngine?.pause?.();
      PetState.setState(PetState.STATES.SLEEPING, 15000);
      SpriteRenderer.setAnimation('sleeping');
      return;
    }

    if (prevState.baseState === BASE_STATE.AWAY && nextState.baseState !== BASE_STATE.AWAY) {
      PetState.setState(PetState.STATES.IDLE, 3000);
      SpriteRenderer.setAnimation(SpriteRenderer.getQCStand(PetState.mood || 'peaceful') || 'idle');
      BehaviorEngine?.resume?.();
      return;
    }

    if (nextState.baseState === BASE_STATE.WORKING) {
      BehaviorEngine?.pause?.();
      PetState.setState(PetState.STATES.WORKING, 5000);
      SpriteRenderer.setAnimation(Math.random() > 0.5 ? 'working_1' : 'working_2');
      window.setTimeout(() => {
        if (state.baseState === BASE_STATE.WORKING && !FocusMode?.isActive) {
          PetState.autoState();
          BehaviorEngine?.resume?.();
        }
      }, 4200);
      return;
    }

    if (nextState.baseState === BASE_STATE.ENTERTAINMENT) {
      const mood = PetState.mood || 'peaceful';
      const anim = SpriteRenderer.getQCPlay(mood) || SpriteRenderer.getQCPlay('peaceful');
      if (anim) {
        SpriteRenderer.playOnce(anim, () => {
          PetState.autoState();
        });
      }
      return;
    }

    if (nextState.baseState === BASE_STATE.IDLE_LIGHT) {
      PetState.autoState();
      BehaviorEngine?.resume?.();
    }
  }

  function patchLocalPresence(nextState) {
    if (typeof SocialState === 'undefined' || typeof SocialState.patch !== 'function') return;
    const current = getCurrentPresence();
    SocialState.patch({
      presence: {
        ...current,
        activityState: nextState.baseState,
        activityLabel: nextState.label,
        activityOverlay: Array.isArray(nextState.overlay) ? [...nextState.overlay] : [],
        activityAppName: nextState.appName,
        activityAppCategory: nextState.appCategory,
        activityUpdatedAt: nextState.updatedAt,
      },
    }, 'presence.activity.local');
  }

  function queueSocialSync(nextState) {
    const signature = [nextState.userStatus, nextState.publicStatusMessage].join('|');
    if (signature === lastSyncedSignature) return;

    clearTimeout(syncTimer);
    syncTimer = window.setTimeout(async () => {
      if (typeof SocialActions === 'undefined' || typeof SocialActions.setPresence !== 'function') return;
      const socialState = typeof SocialState !== 'undefined' && typeof SocialState.getState === 'function'
        ? SocialState.getState()
        : null;
      if (!socialState?.profile) return;
      const res = await SocialActions.setPresence(nextState.userStatus, nextState.publicStatusMessage);
      if (res?.success) {
        lastSyncedSignature = signature;
      }
    }, 400);
  }

  function applyState(nextState, reason = 'tick') {
    const prevState = snapshot();
    state = nextState;
    patchLocalPresence(nextState);
    syncPetReaction(nextState, prevState);
    queueSocialSync(nextState);
    emit({ reason, prev: prevState, state: snapshot() });
  }

  async function refresh(reason = 'tick') {
    await pollFrontmostApp();
    const nextState = resolveNextState(reason);
    const changed = nextState.baseState !== state.baseState
      || nextState.publicStatusMessage !== state.publicStatusMessage
      || nextState.userStatus !== state.userStatus
      || nextState.appName !== state.appName;

    if (!changed) {
      state = { ...state, idleMs: nextState.idleMs, updatedAt: nextState.updatedAt };
      patchLocalPresence(state);
      return;
    }

    applyState(nextState, reason);
  }

  function startTimers() {
    if (!resolveTimer) {
      resolveTimer = window.setInterval(() => {
        refresh('interval').catch((err) => {
          console.warn('[presence] refresh failed:', err?.message || err);
        });
      }, RESOLVE_INTERVAL_MS);
    }
    if (!pollTimer) {
      pollTimer = window.setInterval(() => {
        pollFrontmostApp().catch(() => {});
      }, FRONTMOST_POLL_MS);
    }
  }

  function init() {
    if (initialized) return;
    initialized = true;
    bindInputSignals();
    startTimers();
    refresh('init').catch((err) => {
      console.warn('[presence] init refresh failed:', err?.message || err);
    });
  }

  return {
    init,
    refresh,
    onChange,
    getState: snapshot,
    BASE_STATE,
  };
})();
