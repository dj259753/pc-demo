/* ═══════════════════════════════════════════
   系统监控 - CPU/内存 联动宠物状态
   内存 > 80% 时企鹅大汗淋漓
   ═══════════════════════════════════════════ */

const SystemMonitor = (() => {
  let monitorInterval = null;
  let lastCpuHigh = false;
  let lastMemHigh = false;

  async function check() {
    if (!window.electronAPI) return;

    try {
      const info = await window.electronAPI.getSystemInfo();
      const { cpuUsage, memUsage } = info;

      // CPU > 80% → 强制工作状态
      if (cpuUsage > 80) {
        if (!lastCpuHigh) {
          PetState.forceWorking();
          SpriteRenderer.setAnimation(Math.random() > 0.5 ? 'working_1' : 'working_2');
          lastCpuHigh = true;
        }
      } else {
        if (lastCpuHigh) {
          lastCpuHigh = false;
          PetState.autoState();
        }
      }

      // 内存 > 80% → 大汗淋漓（sweating）
      if (memUsage > 80) {
        if (!lastMemHigh) {
          lastMemHigh = true;
          // 使用 sad 动画模拟出汗（项目无专用sweating精灵图，复用sad+特效）
          if (!lastCpuHigh && !FocusMode.isActive) {
            SpriteRenderer.setAnimation('sad');
          }
          // 降低清洁值
          PetState.setStat('clean', PetState.stats.clean - 10);
        }
      } else {
        if (lastMemHigh) {
          lastMemHigh = false;
          if (!lastCpuHigh && !FocusMode.isActive) {
            PetState.autoState();
          }
        }
      }

      // 清洁值 < 20% → 不弹气泡

      // 更新进程面板的内存总量显示
      const memTotal = document.getElementById('process-mem-total');
      if (memTotal) {
        memTotal.textContent = `内存: ${memUsage}%`;
        memTotal.classList.toggle('high', memUsage > 80);
      }

    } catch (err) {
      // 静默失败
    }
  }

  function start() {
    check();
    monitorInterval = setInterval(check, 10000);
  }

  function stop() {
    clearInterval(monitorInterval);
  }

  return { start, stop };
})();
