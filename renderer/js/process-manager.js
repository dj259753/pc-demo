/* ═══════════════════════════════════════════
   进程管理器 - "洗澡"功能实操化
   可视化杀进程 + 吞噬动画
   ═══════════════════════════════════════════ */

const ProcessManager = (() => {
  let isProcessPanelOpen = false;
  let processList = [];

  function init() {
    // 无需额外初始化，由面板系统调用
  }

  // ─── 打开任务管理器面板 ───
  async function openTaskManager() {
    if (!window.electronAPI) return;

    isProcessPanelOpen = true;
    const panel = document.getElementById('process-panel');
    if (!panel) return;

    // 关闭其他面板
    document.querySelectorAll('.retro-panel').forEach(p => p.classList.add('hidden'));
    panel.classList.remove('hidden');
    SoundEngine.menuOpen();

    await refreshProcessList();
  }

  function closeTaskManager() {
    isProcessPanelOpen = false;
    const panel = document.getElementById('process-panel');
    if (panel) panel.classList.add('hidden');
    SoundEngine.menuClose();
  }

  // ─── 刷新进程列表 ───
  async function refreshProcessList() {
    if (!window.electronAPI) return;

    const list = await window.electronAPI.getProcessList();
    processList = list.slice(0, 5); // 前5个高占用进程
    renderProcessList();
  }

  function renderProcessList() {
    const listEl = document.getElementById('process-list');
    if (!listEl) return;

    listEl.innerHTML = '';

    if (processList.length === 0) {
      listEl.innerHTML = '<div class="process-empty">没有高占用进程 ✨</div>';
      return;
    }

    processList.forEach((proc, idx) => {
      const row = document.createElement('div');
      row.className = 'process-row';
      row.dataset.pid = proc.pid;

      const info = document.createElement('div');
      info.className = 'process-info';

      const name = document.createElement('span');
      name.className = 'process-name';
      name.textContent = proc.name.substring(0, 20);

      const stats = document.createElement('span');
      stats.className = 'process-stats';
      stats.textContent = `${proc.memMB}MB (${proc.memPercent.toFixed(1)}%) CPU:${proc.cpuPercent.toFixed(0)}%`;

      info.appendChild(name);
      info.appendChild(stats);

      const killBtn = document.createElement('button');
      killBtn.className = 'process-kill-btn';
      killBtn.textContent = '🧹 清理';
      killBtn.addEventListener('click', () => killProcess(proc));

      // 内存条
      const memBar = document.createElement('div');
      memBar.className = 'process-mem-bar';
      const memFill = document.createElement('div');
      memFill.className = 'process-mem-fill';
      memFill.style.width = `${Math.min(proc.memPercent * 2, 100)}%`;
      if (proc.memPercent > 40) memFill.classList.add('high');
      memBar.appendChild(memFill);

      row.appendChild(info);
      row.appendChild(memBar);
      row.appendChild(killBtn);
      listEl.appendChild(row);
    });
  }

  // ─── 杀进程（吞噬动画） ───
  async function killProcess(proc) {
    if (!window.electronAPI) return;

    // 企鹅吃进程动画
    SpriteRenderer.setAnimation('eating');
    BubbleSystem.show(`正在吞噬 ${proc.name}... 🍽️`, 2000);
    SoundEngine.feed();

    // 等动画播放一下
    await new Promise(r => setTimeout(r, 1500));

    // 执行杀进程
    const result = await window.electronAPI.killProcess(proc.pid);

    if (result.success) {
      // 打嗝动画（用happy替代burp）
      SpriteRenderer.setAnimation('happy');
      BubbleSystem.show(`吃掉了 ${proc.name}！\n*打嗝* 释放了 ${proc.memMB}MB 内存！🫧`, 4000);
      SoundEngine.happy();
      if (typeof PetDiary !== 'undefined') PetDiary.addEntry('process', `吞噬了进程 ${proc.name}，释放 ${proc.memMB}MB`);

      // 恢复清洁值
      PetState.setStat('clean', PetState.stats.clean + 15);

      // 刷新进程列表
      setTimeout(async () => {
        await refreshProcessList();
        SpriteRenderer.setAnimation('idle');
      }, 2000);
    } else {
      SpriteRenderer.setAnimation('error');
      BubbleSystem.show(`吃不下 ${proc.name}... 😵\n${result.error || '权限不足'}`, 3000);
      SoundEngine.error();
      setTimeout(() => SpriteRenderer.setAnimation('idle'), 2000);
    }
  }

  return { init, openTaskManager, closeTaskManager, refreshProcessList };
})();
