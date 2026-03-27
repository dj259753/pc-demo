/* ═══════════════════════════════════════════
   全局鼠标拖拽 - 挣扎/落地动画 + 屏幕边界约束
   ═══════════════════════════════════════════ */

const DragSystem = (() => {
  let isDragging = false;
  let dragTimer = null;       // 持续拖拽定时器
  let dragDuration = 0;       // 拖拽持续时间（秒）

  // 拖拽时的挣扎台词
  const struggleQuotes = [
    '放开我啦！🐧💦',
    '呜呜头好晕...🌀',
    '我的小脚丫悬空了！😱',
    '主人轻点轻点~',
    '啊啊啊要飞起来了！',
    '不要拽我嘛！🐧',
    '主人干嘛拖着我呀？',
    '我不是玩具啦！💦',
  ];

  // 落地台词
  const landingQuotes = [
    '终于落地了...🥴',
    '呼~安全着陆！🐧',
    '脚踏实地的感觉真好~',
    '不要再拽我了嘛！😤',
    '头还在转...🌀',
  ];

  function init() {
    const petContainer = document.getElementById('pet-container');

    // ─── 企鹅区域拖拽（full模式 + compact模式都生效） ───
    petContainer.addEventListener('mousedown', onDragStart);

    // ─── compact 模式下整个 body 也可拖拽 ───
    document.body.addEventListener('mousedown', (e) => {
      // 只在compact模式下，且不是点击浮动控制栏按钮时
      if (!TaskbarUI.isCompact) return;
      if (e.target.closest('#compact-toolbar')) return;
      if (e.button !== 0) return;
      startDrag(e);
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      window.electronAPI.dragMove({
        mouseX: e.screenX,
        mouseY: e.screenY,
      });
    });

    document.addEventListener('mouseup', () => {
      if (!isDragging) return;
      isDragging = false;

      // 清除拖拽定时器
      clearTimeout(dragTimer);
      clearInterval(dragTimer);
      dragTimer = null;

      window.electronAPI.dragEnd();
      document.getElementById('pet-container').style.cursor = 'grab';

      // compact模式下不恢复行为引擎（保持暂停）
      if (TaskbarUI.isCompact) {
        SpriteRenderer.setAnimation('idle');
        enforceScreenBounds();
        EdgeSnap.check();
        return;
      }

      // ── 落地动画 ──
      SpriteRenderer.setAnimation('happy_jump');
      const quote = landingQuotes[Math.floor(Math.random() * landingQuotes.length)];
      BubbleSystem.show(quote, 2500);

      // 落地后检查屏幕边界
      enforceScreenBounds();
      EdgeSnap.check();

      setTimeout(() => {
        SpriteRenderer.setAnimation('idle');
        BehaviorEngine.resume();
      }, 1200);
    });
  }

  function onDragStart(e) {
    if (e.button !== 0) return; // 仅左键
    // 不拦截动作栏按钮、面板、菜单上的点击
    if (e.target.closest('.action-bar-btn') || e.target.closest('.retro-panel') || e.target.closest('#start-menu') || e.target.closest('#compact-toolbar') || e.target.closest('#action-bar') || e.target.closest('#hover-panel')) return;
    startDrag(e);
  }

  function startDrag(e) {
    isDragging = true;
    dragDuration = 0;
    window.electronAPI.dragStart({
      mouseX: e.screenX,
      mouseY: e.screenY,
    });
    document.getElementById('pet-container').style.cursor = 'grabbing';
    SoundEngine.click();

    // compact 模式下不显示挣扎动画（简洁拖拽）
    if (TaskbarUI.isCompact) return;

    // ── 拖拽立即切换到挣扎动画 ──
    BehaviorEngine.pause();
    SpriteRenderer.setAnimation('question'); // question 精灵表作为挣扎动画

    // 500ms 后开始显示挣扎台词
    dragTimer = setTimeout(() => {
      if (isDragging) {
        const msg = struggleQuotes[Math.floor(Math.random() * struggleQuotes.length)];
        BubbleSystem.show(msg, 3000);

        // 持续拖拽：每3秒换一句挣扎台词
        dragTimer = setInterval(() => {
          if (!isDragging) {
            clearInterval(dragTimer);
            return;
          }
          dragDuration += 3;
          const msg = struggleQuotes[Math.floor(Math.random() * struggleQuotes.length)];
          BubbleSystem.show(msg, 3000);
        }, 3000);
      }
    }, 500);
  }

  // ─── 屏幕边界约束（防止拖出屏幕） ───
  async function enforceScreenBounds() {
    if (!window.electronAPI) return;
    try {
      const [screenSize, winPos] = await Promise.all([
        window.electronAPI.getScreenSize(),
        window.electronAPI.getWindowPosition(),
      ]);
      const isCompact = typeof TaskbarUI !== 'undefined' && TaskbarUI.isCompact;
      const winW = isCompact ? 160 : 320;
      const winH = isCompact ? 160 : 460;
      const { width: sW, height: sH } = screenSize;
      let { x, y } = winPos;
      let clamped = false;

      if (x < 0) { x = 0; clamped = true; }
      if (y < 0) { y = 0; clamped = true; }
      if (x + winW > sW) { x = sW - winW; clamped = true; }
      if (y + winH > sH) { y = sH - winH; clamped = true; }

      if (clamped) {
        window.electronAPI.setWindowPosition({ x, y });
      }
    } catch (e) {
      // 静默
    }
  }

  return { init, get isDragging() { return isDragging; } };
})();
