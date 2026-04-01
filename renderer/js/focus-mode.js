/* ═══════════════════════════════════════════
   番茄钟 Focus Mode - 25分钟专注工作
   ═══════════════════════════════════════════ */

const FocusMode = (() => {
  const FOCUS_DURATION = 25 * 60 * 1000; // 25分钟
  let isActive = false;
  let isPaused = false;
  let startTime = 0;
  let pausedElapsed = 0;   // 暂停时已累计时间
  let focusTimer = null;
  let countdownInterval = null;
  let distractionWarningShown = false;

  // ─── 启动专注模式 ───
  function start() {
    if (isActive) return;
    isActive = true;
    isPaused = false;
    startTime = Date.now();
    pausedElapsed = 0;
    distractionWarningShown = false;

    if (window.electronAPI) window.electronAPI.focusModeStart();

    SpriteRenderer.setAnimation('working_1');
    BehaviorEngine.pause();
    BubbleSystem.show('🍅 番茄钟开始！专注25分钟！\n让我们一起加油！💪', 4000, { force: true });
    if (typeof PetDiary !== 'undefined') PetDiary.addEntry('focus_start', '番茄钟开始！专注25分钟！');
    SoundEngine.click();

    showFocusUI();
    updateFocusCountdown();

    countdownInterval = setInterval(() => {
      if (!isActive || isPaused) return;
      updateFocusCountdown();
      if (Math.random() < 0.03) {
        SpriteRenderer.setAnimation(Math.random() > 0.5 ? 'working_1' : 'working_2');
      }
    }, 1000);

    scheduleFocusEnd();
  }

  // 计算剩余时间并安排完成定时器
  function scheduleFocusEnd() {
    clearTimeout(focusTimer);
    const elapsed = isPaused ? pausedElapsed : (pausedElapsed + Date.now() - startTime);
    const remaining = Math.max(0, FOCUS_DURATION - elapsed);
    if (remaining <= 0) { complete(); return; }
    focusTimer = setTimeout(() => complete(), remaining);
  }

  // ─── 暂停 / 继续 ───
  function togglePause() {
    if (!isActive) return;
    if (isPaused) {
      // 继续
      isPaused = false;
      startTime = Date.now();  // 重置计时起点
      scheduleFocusEnd();
      SpriteRenderer.setAnimation('working_1');
      const btn = document.getElementById('focus-btn-pause');
      if (btn) { btn.textContent = '⏸'; btn.classList.remove('paused'); }
      BubbleSystem.show('继续专注！💪', 2000, { force: true });
    } else {
      // 暂停
      isPaused = true;
      pausedElapsed += Date.now() - startTime;
      clearTimeout(focusTimer);
      SpriteRenderer.setAnimation('idle');
      const btn = document.getElementById('focus-btn-pause');
      if (btn) { btn.textContent = '▶'; btn.classList.add('paused'); }
      BubbleSystem.show('已暂停，随时继续～', 2000, { force: true });
    }
  }

  // ─── 完成专注 ───
  function complete() {
    isActive = false;
    isPaused = false;
    clearTimeout(focusTimer);
    clearInterval(countdownInterval);

    if (window.electronAPI) window.electronAPI.focusModeStop();
    hideFocusUI();

    PetState.inventory.cookie += 3;
    PetState.emit('inventory-change', { item: 'cookie', count: PetState.inventory.cookie });
    PetState.setStat('hunger', PetState.stats.hunger + 20);

    SpriteRenderer.setAnimation('happy');
    BubbleSystem.show('🍅🎉 番茄钟完成！\n奖励3块饼干到背包啦！🍪🍪🍪\n休息一下吧～', 6000, { force: true });
    SoundEngine.happy();
    if (typeof PetDiary !== 'undefined') PetDiary.addEntry('focus_end', '番茄钟完成！奖励3块饼干🍪');

    PanelManager.updateInventoryUI();

    setTimeout(() => {
      SpriteRenderer.setAnimation('idle');
      BehaviorEngine.resume();
    }, 5000);
  }

  // ─── 手动退出专注 ───
  function stop() {
    if (!isActive) return;
    isActive = false;
    isPaused = false;
    clearTimeout(focusTimer);
    clearInterval(countdownInterval);

    if (window.electronAPI) window.electronAPI.focusModeStop();
    hideFocusUI();

    const elapsed = pausedElapsed + (Date.now() - startTime);
    const mins = Math.floor(elapsed / 60000);
    const secs = Math.floor((elapsed % 60000) / 1000);

    SpriteRenderer.setAnimation('idle');
    BubbleSystem.show(`🍅 专注模式结束\n已专注 ${mins}分${secs}秒`, 3000, { force: true });
    BehaviorEngine.resume();
  }

  // ─── 分心警告 ───
  function onDistraction(data) {
    if (!isActive || isPaused) return;

    SpriteRenderer.setAnimation('error');
    SoundEngine.warning();
    BubbleSystem.show(`⚠️ 专注模式中！\n检测到分心应用: ${data.title}\n请切回工作窗口！😤🍅`, 8000, { force: true });

    setTimeout(() => {
      if (isActive && !isPaused) SpriteRenderer.setAnimation('working_1');
    }, 3000);
  }

  // ─── 专注 UI 控制 ───
  function showFocusUI() {
    const el = document.getElementById('focus-timer');
    if (!el) return;
    el.classList.remove('hidden');
    // 重置暂停按钮状态
    const pauseBtn = document.getElementById('focus-btn-pause');
    if (pauseBtn) { pauseBtn.textContent = '⏸'; pauseBtn.classList.remove('paused'); }
  }

  function hideFocusUI() {
    const el = document.getElementById('focus-timer');
    if (el) el.classList.add('hidden');
  }

  function updateFocusCountdown() {
    const countdownEl = document.getElementById('focus-countdown');
    const barEl = document.getElementById('focus-progress');
    if (!countdownEl || !barEl) return;

    const elapsed = isPaused
      ? pausedElapsed
      : pausedElapsed + (Date.now() - startTime);
    const remaining = Math.max(0, FOCUS_DURATION - elapsed);
    const progress = Math.min(elapsed / FOCUS_DURATION, 1) * 100;

    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    countdownEl.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    barEl.style.width = `${progress}%`;

    // 最后2分钟警告
    if (remaining <= 120000) {
      countdownEl.classList.add('warning');
      barEl.classList.add('ending');
    } else {
      countdownEl.classList.remove('warning');
      barEl.classList.remove('ending');
    }
  }

  // ─── 初始化 ───
  function init() {
    if (window.electronAPI) {
      window.electronAPI.onStartFocusMode(() => {
        if (isActive) stop();
        else start();
      });
      window.electronAPI.onStopFocusMode(() => stop());
      window.electronAPI.onFocusDistraction((data) => onDistraction(data));
    }

    // 绑定暂停/退出按钮
    const pauseBtn = document.getElementById('focus-btn-pause');
    const stopBtn  = document.getElementById('focus-btn-stop');
    if (pauseBtn) pauseBtn.addEventListener('click', (e) => { e.stopPropagation(); togglePause(); });
    if (stopBtn)  stopBtn.addEventListener('click',  (e) => { e.stopPropagation(); stop(); });
  }

  return { init, start, stop, togglePause, get isActive() { return isActive; }, get isPaused() { return isPaused; } };
})();

