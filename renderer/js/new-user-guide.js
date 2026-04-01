/* 新手引导（首次完成配置后自动提示 + 菜单可手动打开） */
const NewUserGuide = (() => {
  'use strict';

  const SEEN_KEY = 'qqpet_onboarding_seen_v1';

  function getEls() {
    return {
      overlay: document.getElementById('onboarding-overlay'),
      close: document.getElementById('onboarding-close'),
      ok: document.getElementById('onboarding-ok'),
      openSkills: document.getElementById('onboarding-open-skills'),
    };
  }

  function open(opts = {}) {
    const { overlay } = getEls();
    if (!overlay) return;
    overlay.classList.remove('hidden');
    if (!opts.manual) {
      try { localStorage.setItem(SEEN_KEY, '1'); } catch {}
    }
  }

  function close() {
    const { overlay } = getEls();
    if (!overlay) return;
    overlay.classList.add('hidden');
    try { localStorage.setItem(SEEN_KEY, '1'); } catch {}
  }

  async function isConfigured() {
    try {
      const provider = await window.electronAPI?.backendGetProviderConfig?.();
      const gatewayState = await window.electronAPI?.backendGetGatewayState?.();
      const asr = await window.electronAPI?.getAsrConfig?.();
      const aiReady = !!(provider && (provider.model || provider.provider || provider.baseUrl || provider.apiKey));
      const asrReady = !!(asr && asr.appId && asr.secretId && asr.secretKeySet);
      return aiReady || asrReady || gatewayState === 'running';
    } catch {
      return false;
    }
  }

  async function maybeAutoShow() {
    let seen = false;
    try { seen = localStorage.getItem(SEEN_KEY) === '1'; } catch {}
    if (seen) return;
    if (!(await isConfigured())) return;
    open({ manual: false });
  }

  function init() {
    const { overlay, close: btnClose, ok, openSkills } = getEls();
    if (!overlay) return;
    btnClose?.addEventListener('click', close);
    ok?.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
    openSkills?.addEventListener('click', () => {
      window.electronAPI?.openSkillsWindow?.();
      close();
    });
    setTimeout(() => { maybeAutoShow(); }, 900);
  }

  return { init, open, close };
})();
