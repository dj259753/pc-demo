/* ═══════════════════════════════════════════
   番茄钟 Focus Mode - 25分钟专注工作
   ═══════════════════════════════════════════ */

const FocusMode = (() => {
  const FOCUS_DURATION = 25 * 60 * 1000; // 25分钟
  let isActive = false;
  let startTime = 0;
  let focusTimer = null;
  let countdownInterval = null;
  let distractionWarningShown = false;

  // ─── 启动专注模式 ───
  function start() {
    if (isActive) return;
    isActive = true;
    startTime = Date.now();
    distractionWarningShown = false;

    // 通知主进程开始监控活动窗口
    if (window.electronAPI) {
      window.electronAPI.focusModeStart();
    }

    // 切换企鹅为工作动画
    SpriteRenderer.setAnimation('working_1');
    BehaviorEngine.pause();
    BubbleSystem.show('🍅 番茄钟开始！专注25分钟！\n让我们一起加油！💪', 4000);
    if (typeof PetDiary !== 'undefined') PetDiary.addEntry('focus_start', '番茄钟开始！专注25分钟！');
    SoundEngine.click();

    // 显示专注进度条UI
    showFocusUI();
    updateFocusCountdown();

    // 每秒更新
    countdownInterval = setInterval(() => {
      if (!isActive) { clearInterval(countdownInterval); return; }
      updateFocusCountdown();
      // 随机切换工作动画
      if (Math.random() < 0.03) {
        SpriteRenderer.setAnimation(Math.random() > 0.5 ? 'working_1' : 'working_2');
      }
    }, 1000);

    // 25分钟结束
    focusTimer = setTimeout(() => {
      complete();
    }, FOCUS_DURATION);
  }

  // ─── 完成专注 ───
  function complete() {
    isActive = false;
    clearTimeout(focusTimer);
    clearInterval(countdownInterval);

    // 通知主进程停止监控
    if (window.electronAPI) {
      window.electronAPI.focusModeStop();
    }

    hideFocusUI();

    // 奖励：发放虚拟饼干到背包
    PetState.inventory.cookie += 3;
    PetState.emit('inventory-change', { item: 'cookie', count: PetState.inventory.cookie });

    // 增加饥饿值（工作后消耗）
    PetState.setStat('hunger', PetState.stats.hunger + 20);

    // 切换到开心动画
    SpriteRenderer.setAnimation('happy');
    BubbleSystem.show('🍅🎉 番茄钟完成！\n奖励3块饼干到背包啦！🍪🍪🍪\n休息一下吧～', 6000);
    SoundEngine.happy();
    if (typeof PetDiary !== 'undefined') PetDiary.addEntry('focus_end', '番茄钟完成！奖励3块饼干🍪');

    // 更新库存UI
    PanelManager.updateInventoryUI();

    // 5秒后恢复
    setTimeout(() => {
      SpriteRenderer.setAnimation('idle');
      BehaviorEngine.resume();
    }, 5000);
  }

  // ─── 手动停止 ───
  function stop() {
    if (!isActive) return;
    isActive = false;
    clearTimeout(focusTimer);
    clearInterval(countdownInterval);

    if (window.electronAPI) {
      window.electronAPI.focusModeStop();
    }

    hideFocusUI();

    const elapsed = Date.now() - startTime;
    const mins = Math.floor(elapsed / 60000);
    const secs = Math.floor((elapsed % 60000) / 1000);

    SpriteRenderer.setAnimation('idle');
    BubbleSystem.show(`🍅 专注模式结束\n已专注 ${mins}分${secs}秒`, 3000);
    BehaviorEngine.resume();
  }

  // ─── 分心警告 ───
  function onDistraction(data) {
    if (!isActive) return;

    // 播放生气动画
    SpriteRenderer.setAnimation('error');
    SoundEngine.warning();

    // 弹出警告
    BubbleSystem.show(`⚠️ 专注模式中！\n检测到分心应用: ${data.title}\n请切回工作窗口！😤🍅`, 8000);

    // 3秒后恢复工作动画
    setTimeout(() => {
      if (isActive) {
        SpriteRenderer.setAnimation('working_1');
      }
    }, 3000);
  }

  // ─── 专注UI控制 ───
  function showFocusUI() {
    const el = document.getElementById('focus-timer');
    if (el) {
      el.classList.remove('hidden');
      el.querySelector('.focus-timer-icon').textContent = '🍅';
      el.querySelector('.focus-timer-label').textContent = '专注中';
    }
  }

  function hideFocusUI() {
    const el = document.getElementById('focus-timer');
    if (el) el.classList.add('hidden');
  }

  function updateFocusCountdown() {
    const countdownEl = document.getElementById('focus-countdown');
    const progressEl = document.getElementById('focus-progress');
    if (!countdownEl || !progressEl) return;

    const elapsed = Date.now() - startTime;
    const remaining = Math.max(0, FOCUS_DURATION - elapsed);
    const progress = Math.min(elapsed / FOCUS_DURATION, 1) * 100;

    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    countdownEl.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    progressEl.style.width = `${progress}%`;

    // 最后2分钟变红
    if (remaining <= 120000) {
      countdownEl.classList.add('warning');
      progressEl.classList.add('ending');
    } else {
      countdownEl.classList.remove('warning');
      progressEl.classList.remove('ending');
    }
  }

  // ─── 初始化 ───
  function init() {
    if (window.electronAPI) {
      window.electronAPI.onStartFocusMode(() => {
        if (isActive) {
          stop();
        } else {
          start();
        }
      });
      window.electronAPI.onStopFocusMode(() => stop());
      window.electronAPI.onFocusDistraction((data) => onDistraction(data));
    }
  }

  return { init, start, stop, get isActive() { return isActive; } };
})();
