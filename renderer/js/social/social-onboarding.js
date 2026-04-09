/* ═══════════════════════════════════════════
   社交领养引导（最小实现）
   在无身份时引导填写主人名与宠物名
   ═══════════════════════════════════════════ */

const SocialOnboarding = (() => {
  function validateName(value, min, max) {
    const text = String(value || '').trim().replace(/\s+/g, ' ');
    if (text.length < min || text.length > max) {
      throw new Error(`name-length-invalid:${min}-${max}`);
    }
    return text;
  }

  function promptInput(message, defaultValue = '') {
    if (typeof window === 'undefined' || typeof window.prompt !== 'function') {
      return null;
    }
    const result = window.prompt(message, defaultValue);
    if (result == null) return null;
    return String(result).trim();
  }

  function openFormalPanelGuide() {
    // 打开独立社交窗口
    if (window.electronAPI?.openSocialWindow) {
      window.electronAPI.openSocialWindow();
      if (typeof BubbleSystem !== 'undefined' && typeof BubbleSystem.show === 'function') {
        BubbleSystem.show('先在社交中心起名，好友和拜访都基于这里。', 2600, { force: true });
      }
      return true;
    }

    return false;
  }

  async function runAdoptionFlow() {
    const snapshot = SocialState.getState();
    if (!snapshot.requiresAdoption) {
      return { success: true, skipped: true };
    }

    if (openFormalPanelGuide()) {
      return { success: false, pending: true, message: 'adoption-pending-profile' };
    }

    let ownerName = '';
    let petName = '';
    let petGender = 'gg';

    for (let i = 0; i < 3; i += 1) {
      const ownerInput = promptInput('欢迎领养 QQ 宠物\n\n请输入主人名（2-12 字）', ownerName || '主人');
      if (!ownerInput) return { success: false, message: 'adoption-cancelled-owner' };

      const petInput = promptInput('请输入宠物名（1-12 字）', petName || 'QQ');
      if (!petInput) return { success: false, message: 'adoption-cancelled-pet' };

      const genderInput = promptInput('请选择宠物性别\n输入 gg 选 GG（公）\n输入 mm 选 MM（母）', petGender || 'gg');
      if (genderInput && genderInput.toLowerCase() === 'mm') petGender = 'mm';
      else petGender = 'gg';

      try {
        ownerName = validateName(ownerInput, 2, 12);
        petName = validateName(petInput, 1, 12);
      } catch (_err) {
        window.alert('名字长度不符合要求，请重试。');
        continue;
      }

      const res = await SocialActions.adoptProfile(ownerName, petName, petGender);
      if (res?.success) {
        return { success: true, data: res.data };
      }

      window.alert(`保存失败：${res?.message || '未知错误'}，请重试。`);
    }

    return { success: false, message: 'adoption-max-retry' };
  }

  return {
    runAdoptionFlow,
  };
})();
