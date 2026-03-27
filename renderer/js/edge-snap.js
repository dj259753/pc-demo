/* ═══════════════════════════════════════════
   边界感知 & 吸附系统
   ═══════════════════════════════════════════ */

const EdgeSnap = (() => {
  const SNAP_THRESHOLD = 30; // 吸附阈值（像素）
  let isSnapped = false;
  let snapSide = null; // 'left' | 'right' | 'top' | 'bottom'

  async function check() {
    if (!window.electronAPI) return;

    try {
      const [screenSize, winPos] = await Promise.all([
        window.electronAPI.getScreenSize(),
        window.electronAPI.getWindowPosition(),
      ]);

      // 动态获取当前窗口尺寸（适配compact/full模式）
      const isCompact = typeof TaskbarUI !== 'undefined' && TaskbarUI.isCompact;
      const winW = isCompact ? 160 : 320;
      const winH = isCompact ? 160 : 460;
      const { width: sW, height: sH } = screenSize;
      const { x, y } = winPos;

      let snapped = false;
      let side = null;
      let newX = x, newY = y;

      // 左边界
      if (x < SNAP_THRESHOLD) {
        newX = 0;
        snapped = true;
        side = 'left';
      }
      // 右边界
      else if (x + winW > sW - SNAP_THRESHOLD) {
        newX = sW - winW;
        snapped = true;
        side = 'right';
      }

      // 上边界
      if (y < SNAP_THRESHOLD) {
        newY = 0;
        snapped = true;
        side = side || 'top';
      }
      // 下边界
      else if (y + winH > sH - SNAP_THRESHOLD) {
        newY = sH - winH;
        snapped = true;
        side = side || 'bottom';
      }

      if (snapped && (newX !== x || newY !== y)) {
        window.electronAPI.setWindowPosition({ x: newX, y: newY });

        if (!isSnapped) {
          SoundEngine.snap();
          // compact 模式下不显示气泡（简洁）
          if (!isCompact && (side === 'left' || side === 'right')) {
            BubbleSystem.show('靠墙休息一下~', 2000);
          }
        }
      }

      isSnapped = snapped;
      snapSide = side;

    } catch (err) {
      // 静默
    }
  }

  return {
    check,
    get isSnapped() { return isSnapped; },
    get snapSide() { return snapSide; },
  };
})();
