/* ═══════════════════════════════════════════
   📔 企鹅日记系统
   记录运行期间做了哪些事情
   ═══════════════════════════════════════════ */

const PetDiary = (() => {
  let entries = [];        // 当前会话日记条目
  let sessionStart = null; // 会话开始时间

  // 日记条目类型和对应emoji
  const ENTRY_ICONS = {
    startup:    '🐧',
    feed:       '🐟',
    wash:       '🧼',
    coffee:     '☕',
    play:       '⚽',
    work_start: '💻',
    work_end:   '💻',
    sleep:      '💤',
    wake:       '☀️',
    focus_start:'🍅',
    focus_end:  '🍅',
    chat:       '💬',
    clipboard:  '📋',
    process:    '🧹',
    file_drop:  '📁',
    low_battery:'🔋',
    offline:    '📡',
    online:     '📡',
    usb:        '🔌',
    happy:      '🎉',
    sad:        '😢',
    claw_work:  '🤖',
    custom:     '📝',
  };

  function init() {
    sessionStart = new Date();
    addEntry('startup', '企鹅启动了！新的一天开始~');
  }

  // ─── 添加日记条目 ───
  function addEntry(type, text) {
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    const icon = ENTRY_ICONS[type] || '📝';

    entries.push({
      time: now,
      timeStr,
      type,
      icon,
      text,
    });

    // 限制最多保留200条（防止内存溢出）
    if (entries.length > 200) {
      entries = entries.slice(-150);
    }
  }

  // ─── 获取所有日记条目 ───
  function getEntries() {
    return [...entries];
  }

  // ─── 获取今日摘要 ───
  function getSummary() {
    const counts = {};
    entries.forEach(e => {
      counts[e.type] = (counts[e.type] || 0) + 1;
    });

    const duration = getDuration();
    let summary = `📔 今日企鹅日记\n运行时长: ${duration}\n\n`;

    if (counts.feed) summary += `🐟 吃了 ${counts.feed} 次小鱼\n`;
    if (counts.wash) summary += `🧼 洗了 ${counts.wash} 次澡\n`;
    if (counts.coffee) summary += `☕ 喝了 ${counts.coffee} 杯咖啡\n`;
    if (counts.play) summary += `⚽ 玩了 ${counts.play} 次球\n`;
    if (counts.work_start) summary += `💻 工作了 ${counts.work_start} 次\n`;
    if (counts.focus_start) summary += `🍅 专注了 ${counts.focus_start} 次\n`;
    if (counts.chat) summary += `💬 聊了 ${counts.chat} 次天\n`;
    if (counts.sleep) summary += `💤 打了 ${counts.sleep} 次盹\n`;
    if (counts.clipboard) summary += `📋 捡了 ${counts.clipboard} 次剪贴板\n`;
    if (counts.process) summary += `🧹 管理了 ${counts.process} 次进程\n`;
    if (counts.file_drop) summary += `📁 分析了 ${counts.file_drop} 个文件\n`;
    if (counts.claw_work) summary += `🤖 Claw工作了 ${counts.claw_work} 次\n`;

    return summary.trim();
  }

  // ─── 获取运行时长字符串 ───
  function getDuration() {
    if (!sessionStart) return '0分钟';
    const diff = Date.now() - sessionStart.getTime();
    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    if (hours > 0) return `${hours}小时${mins}分钟`;
    return `${mins}分钟`;
  }

  // ─── 渲染日记面板内容 ───
  function renderDiaryPanel() {
    const listEl = document.getElementById('diary-list');
    if (!listEl) return;

    if (entries.length === 0) {
      listEl.innerHTML = '<div class="diary-empty">暂无日记记录</div>';
      return;
    }

    // 从最新到最旧
    const reversed = [...entries].reverse();
    listEl.innerHTML = reversed.map(e =>
      `<div class="diary-entry">` +
        `<span class="diary-time">${e.timeStr}</span>` +
        `<span class="diary-icon">${e.icon}</span>` +
        `<span class="diary-text">${e.text}</span>` +
      `</div>`
    ).join('');
  }

  // ─── 打开日记面板 ───
  function openDiary() {
    const panel = document.getElementById('diary-panel');
    if (!panel) return;

    // 更新运行时长
    const durationEl = document.getElementById('diary-duration');
    if (durationEl) durationEl.textContent = getDuration();

    // 更新条目计数
    const countEl = document.getElementById('diary-count');
    if (countEl) countEl.textContent = `共 ${entries.length} 条记录`;

    renderDiaryPanel();
    panel.classList.remove('hidden');
    SoundEngine.menuOpen();
  }

  return {
    init,
    addEntry,
    getEntries,
    getSummary,
    getDuration,
    renderDiaryPanel,
    openDiary,
  };
})();
