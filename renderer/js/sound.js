/* ═══════════════════════════════════════════
   8-bit 音效引擎 (Web Audio API 合成)
   无需外部音频文件，纯代码生成复古音效
   ═══════════════════════════════════════════ */

const SoundEngine = (() => {
  let ctx = null;

  function getCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    return ctx;
  }

  // 播放一个音符
  function playTone(freq, duration, type = 'square', volume = 0.15) {
    const c = getCtx();
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, c.currentTime);
    gain.gain.setValueAtTime(volume, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(c.currentTime);
    osc.stop(c.currentTime + duration);
  }

  // 播放音符序列
  function playSequence(notes, type = 'square', volume = 0.12) {
    const c = getCtx();
    let time = c.currentTime;
    notes.forEach(([freq, dur]) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, time);
      gain.gain.setValueAtTime(volume, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
      osc.connect(gain);
      gain.connect(c.destination);
      osc.start(time);
      osc.stop(time + dur);
      time += dur;
    });
  }

  return {
    // 点击音效
    click() {
      playTone(800, 0.08, 'square', 0.1);
    },

    // 菜单打开
    menuOpen() {
      playSequence([[400, 0.06], [600, 0.06], [800, 0.08]], 'square', 0.1);
    },

    // 菜单关闭
    menuClose() {
      playSequence([[800, 0.06], [600, 0.06], [400, 0.08]], 'square', 0.1);
    },

    // 喂食音效
    feed() {
      playSequence([
        [523, 0.1], [659, 0.1], [784, 0.1], [1047, 0.15]
      ], 'square', 0.12);
    },

    // 清洗音效
    wash() {
      playSequence([
        [300, 0.08], [350, 0.08], [300, 0.08], [400, 0.08], [350, 0.1]
      ], 'sine', 0.1);
    },

    // 喝咖啡
    coffee() {
      playSequence([
        [200, 0.12], [250, 0.12], [300, 0.1], [500, 0.15]
      ], 'sawtooth', 0.08);
    },

    // 警告音
    warning() {
      playSequence([
        [440, 0.15], [0, 0.1], [440, 0.15], [0, 0.1], [440, 0.2]
      ], 'square', 0.15);
    },

    // AI 回复音效
    aiReply() {
      playSequence([
        [600, 0.06], [700, 0.06], [800, 0.06], [900, 0.08], [1000, 0.1]
      ], 'sine', 0.1);
    },

    // 开心音效
    happy() {
      playSequence([
        [523, 0.08], [659, 0.08], [784, 0.08], [1047, 0.12],
        [784, 0.06], [1047, 0.15]
      ], 'square', 0.1);
    },

    // 边界吸附
    snap() {
      playTone(1200, 0.05, 'square', 0.08);
    },

    // 错误
    error() {
      playSequence([
        [200, 0.2], [150, 0.3]
      ], 'sawtooth', 0.12);
    },

    // 扫地/整理音效
    sweep() {
      playSequence([
        [800, 0.05], [600, 0.05], [900, 0.05], [700, 0.05],
        [850, 0.05], [650, 0.05], [950, 0.08]
      ], 'square', 0.06);
    },

    // 番茄钟完成音效
    focusComplete() {
      playSequence([
        [523, 0.1], [659, 0.1], [784, 0.1], [1047, 0.15],
        [0, 0.1],
        [1047, 0.1], [784, 0.1], [1047, 0.2]
      ], 'square', 0.12);
    },

    // 进程吞噬音效
    devour() {
      playSequence([
        [200, 0.08], [300, 0.08], [400, 0.08], [500, 0.1],
        [150, 0.15], [100, 0.2]
      ], 'sawtooth', 0.1);
    },

    // 磁盘挂载/USB发现音效
    discover() {
      playSequence([
        [600, 0.08], [800, 0.08], [1000, 0.1], [1200, 0.12]
      ], 'sine', 0.1);
    },

    // 🎤 语音模式 - 开始聆听（上升音阶，轻柔提示）
    voiceStart() {
      playSequence([
        [400, 0.06], [500, 0.06], [600, 0.06], [800, 0.08]
      ], 'sine', 0.1);
    },

    // 🎤 语音模式 - 停止聆听（下降音阶，确认完成）
    voiceStop() {
      playSequence([
        [800, 0.06], [600, 0.06], [500, 0.06], [400, 0.08]
      ], 'sine', 0.08);
    },

    // 🎤 语音模式 - 识别错误
    voiceError() {
      playSequence([
        [300, 0.12], [200, 0.15]
      ], 'sawtooth', 0.1);
    },
  };
})();
