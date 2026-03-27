/* ═══════════════════════════════════════════
   系统状态感知
   网络/电量/USB 监控
   ═══════════════════════════════════════════ */

const DesktopShepherd = (() => {
  let batteryPercent = 100;
  let isLowBattery = false;
  let isOffline = false;

  function init() {
    if (!window.electronAPI) return;

    // ─── 网络状态监听 ───
    window.addEventListener('offline', () => {
      isOffline = true;
      SpriteRenderer.setAnimation('sad');
      document.getElementById('pet-container').classList.add('searching');
      if (typeof PetDiary !== 'undefined') PetDiary.addEntry('offline', '网络断开了！');
    });

    window.addEventListener('online', () => {
      isOffline = false;
      SpriteRenderer.setAnimation('happy');
      document.getElementById('pet-container').classList.remove('searching');
      if (typeof PetDiary !== 'undefined') PetDiary.addEntry('online', '网络恢复了！');
    });

    // ─── 电量监听 ───
    window.electronAPI.onBatteryUpdate((data) => {
      batteryPercent = data.percent;
      if (data.percent <= 20 && !data.charging && !isLowBattery) {
        isLowBattery = true;
        document.getElementById('pet-container').style.opacity = '0.5';
        document.getElementById('pet-container').classList.add('low-battery');
      } else if (data.percent > 20 || data.charging) {
        if (isLowBattery) {
          isLowBattery = false;
          document.getElementById('pet-container').style.opacity = '1';
          document.getElementById('pet-container').classList.remove('low-battery');
        }
      }
    });

    // ─── USB/磁盘挂载监听 ───
    window.electronAPI.onDiskMounted((data) => {
      SpriteRenderer.setAnimation('happy');
      setTimeout(() => {
        SpriteRenderer.setAnimation('idle');
      }, 3000);
    });
  }

  return {
    init,
    get batteryPercent() { return batteryPercent; },
    get isOffline() { return isOffline; },
  };
})();
