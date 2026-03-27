/* ═══════════════════════════════════════════
   剪贴板背包 - 监听复制，管理最近10条记录
   ═══════════════════════════════════════════ */

const ClipboardBag = (() => {
  let history = [];

  function init() {
    if (!window.electronAPI) return;

    // 监听新的剪贴板内容
    window.electronAPI.onClipboardNew((data) => {
      history.unshift(data);
      if (history.length > 10) history.pop();

      // 企鹅播放"捡到东西"动画
      SpriteRenderer.setAnimation('happy');
      BubbleSystem.show('捡到东西了！📋✨\n已存入剪贴板背包~', 2500);
      SoundEngine.click();
      if (typeof PetDiary !== 'undefined') PetDiary.addEntry('clipboard', `捡到剪贴板: "${data.preview.substring(0, 20)}..."`);

      setTimeout(() => {
        if (!FocusMode.isActive) {
          SpriteRenderer.setAnimation('idle');
        }
      }, 1500);

      // 更新面板（如果打开了）
      updateClipboardPanel();
    });

    // 加载历史
    window.electronAPI.getClipboardHistory().then(h => {
      history = h || [];
      updateClipboardPanel();
    });
  }

  function updateClipboardPanel() {
    const list = document.getElementById('clipboard-list');
    if (!list) return;

    list.innerHTML = '';
    if (history.length === 0) {
      list.innerHTML = '<div class="clipboard-empty">暂无剪贴板记录</div>';
      return;
    }

    history.forEach((item, idx) => {
      const row = document.createElement('div');
      row.className = 'clipboard-row';
      row.title = item.text;

      const preview = document.createElement('span');
      preview.className = 'clipboard-preview';
      preview.textContent = item.preview || item.text.substring(0, 60);

      const timeStr = new Date(item.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
      const time = document.createElement('span');
      time.className = 'clipboard-time';
      time.textContent = timeStr;

      const copyBtn = document.createElement('button');
      copyBtn.className = 'clipboard-copy-btn';
      copyBtn.textContent = '📋';
      copyBtn.title = '复制到剪贴板';
      copyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.electronAPI) {
          window.electronAPI.clipboardCopy(item.text);
          BubbleSystem.show('已复制到剪贴板！📋', 1500);
          SoundEngine.click();
        }
      });

      row.appendChild(preview);
      row.appendChild(time);
      row.appendChild(copyBtn);
      list.appendChild(row);
    });
  }

  function getHistory() {
    return history;
  }

  return { init, updateClipboardPanel, getHistory };
})();
