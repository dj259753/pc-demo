/* ═══════════════════════════════════════════
 社交系统启动器（架构壳）
 仅做初始化和状态同步，不侵入现有 UI 业务
 ═══════════════════════════════════════════ */

const SocialBootstrap = (() => {
  let initialized = false;
  let heartbeatTimer = null;
  let socialEventUnsubscribe = null;
  let lastRemoteEnabled = null;

  function shouldAutoOnline(profile, presence) {
    if (!profile) return false;
    const current = String(presence?.userStatus || '').trim();
    return !current || current === 'offline';
  }

  function patchGatewayMeta(meta = {}, reason = 'gateway.mode.updated') {
    const state = SocialState.getState();
    SocialState.patch({
      gateway: {
        ...(state.gateway || {}),
        ...meta,
      },
    }, reason);
  }

  function isRemoteEnabledInState() {
    const state = SocialState.getState();
    return !!state.featureFlags?.socialRemoteEnabled;
  }

  function reconcileGatewayMode(trigger = 'state.feature-flags', force = false) {
    const remoteEnabled = isRemoteEnabledInState();
    if (!force && remoteEnabled === lastRemoteEnabled) {
      return SocialGateway.getModeMeta();
    }

    lastRemoteEnabled = remoteEnabled;
    const targetMode = remoteEnabled ? SocialGateway.GATEWAY_MODE.REMOTE : SocialGateway.GATEWAY_MODE.LOCAL;
    const modeMeta = SocialGateway.applyMode(targetMode, trigger);
    patchGatewayMeta(modeMeta, 'gateway.mode.reconciled');
    bindEventBridge();

    if (modeMeta.fallback) {
      console.warn('[social-bootstrap] remote adapter not ready, fallback to local mode');
    }

    return modeMeta;
  }

  function bindEventBridge() {
    if (typeof socialEventUnsubscribe === 'function') {
      try {
        socialEventUnsubscribe();
      } catch (_err) {
        // noop
      }
      socialEventUnsubscribe = null;
    }

    socialEventUnsubscribe = SocialGateway.onSocialEvent((evt) => {
      SocialState.applySocialEvent(evt);
    });
  }

  async function syncPresenceOnlineIfNeeded() {
    const state = SocialState.getState();
    if (!shouldAutoOnline(state.profile, state.presence)) return;

    const res = await SocialGateway.setPresence({
      userStatus: 'online',
      sessionStatus: state.currentRoom ? 'visiting' : 'idle',
    });

    if (res?.success && res.data) {
      SocialState.patch({
        presence: {
          ...state.presence,
          ...res.data,
        },
      }, 'presence.auto-online');
    }
  }

  async function syncHeartbeat() {
    if (typeof SocialActions === 'undefined' || typeof SocialActions.heartbeat !== 'function') return;
    const state = SocialState.getState();
    if (!state.profile) return;

    const heartbeatRes = await SocialActions.heartbeat({ keepOnline: true });
    if (!heartbeatRes?.success) {
      const msg = String(heartbeatRes?.message || 'unknown');
      if (!msg.includes('remote-gateway-not-ready')) {
        console.warn('[social-bootstrap] heartbeat failed:', msg);
      }
    }
  }

  function startHeartbeat() {
    if (heartbeatTimer) return;

    heartbeatTimer = setInterval(() => {
      syncHeartbeat().catch((err) => {
        console.warn('[social-bootstrap] heartbeat tick error:', err);
      });
    }, 20000);
  }

  async function init() {
    if (initialized) return;
    initialized = true;

    SocialGateway.onModeChange((meta) => {
      patchGatewayMeta(meta, 'gateway.mode.changed');
    });

    const initModeMeta = SocialGateway.applyMode(SocialGateway.GATEWAY_MODE.LOCAL, 'bootstrap.init');
    patchGatewayMeta(initModeMeta, 'gateway.mode.init');
    bindEventBridge();

    const bootstrapRes = await SocialGateway.bootstrap();
    if (!bootstrapRes?.success) {
      console.warn('[social-bootstrap] bootstrap failed:', bootstrapRes?.message || 'unknown-error');
      return;
    }

    SocialState.bootstrap(bootstrapRes.data || {});

    lastRemoteEnabled = null;
    reconcileGatewayMode('bootstrap.feature-flags', true);

    SocialState.on('change', (payload = {}) => {
      if (payload.reason === 'feature-flags.updated') {
        reconcileGatewayMode('state.feature-flags');
      }
    });

    VisitSession.init();

    // 初始化亲密度事件监听器
    if (typeof IntimacyListener !== 'undefined') {
      IntimacyListener.init();
    }

    if (typeof SocialActions !== 'undefined') {
      SocialActions.installDebugAPI();
      await SocialActions.hydrateFriendsAndRequests();
    }

    if (SocialState.getState().requiresAdoption && typeof SocialOnboarding !== 'undefined') {
      const adoptionRes = await SocialOnboarding.runAdoptionFlow();
      if (!adoptionRes?.success) {
        console.warn('[social-bootstrap] adoption pending:', adoptionRes?.message || 'unknown-error');
      }
    }

    await syncPresenceOnlineIfNeeded();
    await syncHeartbeat();
    startHeartbeat();

    console.log('[social-bootstrap] ready');
  }

  async function setRemoteEnabled(enabled) {
    const res = await SocialGateway.updateFeatureFlags({
      socialRemoteEnabled: !!enabled,
    });

    if (res?.success && res.data) {
      const state = SocialState.getState();
      SocialState.patch({
        featureFlags: {
          ...state.featureFlags,
          ...res.data,
        },
      }, 'feature-flags.updated');
      reconcileGatewayMode('manual.feature-flags', true);
    }

    return res;
  }

  return {
    init,
    reconcileGatewayMode,
    setRemoteEnabled,
  };
})();


