/* 录音纪要：实时转写 + 停止后生成纪要文档 */
const MeetingNotes = (() => {
  'use strict';

  const state = {
    active: false,
    paused: false,
    generating: false,
    startedAt: null,
    endedAt: null,
    transcriptParts: [],
    pcmSamples: [],
    timer: null,
    elapsedSec: 0,
    wavPath: '',
  };

  function els() {
    return {
      box: document.getElementById('meeting-notes-control'),
      time: document.getElementById('meeting-notes-time'),
      pause: document.getElementById('meeting-notes-pause'),
      stop: document.getElementById('meeting-notes-stop'),
    };
  }

  function fmt(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function pushTranscript(text) {
    const t = String(text || '').trim();
    if (!t) return;
    if (state.transcriptParts[state.transcriptParts.length - 1] === t) return;
    state.transcriptParts.push(t);
  }

  function fullTranscript() {
    return state.transcriptParts.join('\n').trim();
  }

  function showControl() {
    const { box, time, pause, stop } = els();
    if (box) box.classList.remove('hidden');
    if (time) time.textContent = fmt(state.elapsedSec);
    if (pause) {
      pause.disabled = false;
      pause.style.opacity = '1';
      pause.style.cursor = 'pointer';
      pause.textContent = state.paused ? '▶' : '⏸';
    }
    if (stop) {
      stop.disabled = false;
      stop.style.opacity = '1';
      stop.style.cursor = 'pointer';
      stop.textContent = '⏹';
    }
  }

  function hideControl() {
    const { box } = els();
    if (box) box.classList.add('hidden');
  }

  function startTicker() {
    clearInterval(state.timer);
    state.timer = setInterval(() => {
      if (state.paused) return;
      state.elapsedSec += 1;
      const { time } = els();
      if (time) time.textContent = fmt(state.elapsedSec);
    }, 1000);
  }

  function stopTicker() {
    clearInterval(state.timer);
    state.timer = null;
  }

  async function setPaused(nextPaused) {
    if (!state.active || state.generating) return;
    const { pause } = els();
    if (pause) {
      pause.style.transform = 'scale(0.96)';
      setTimeout(() => { pause.style.transform = ''; }, 120);
    }
    if (typeof VoiceMode.pauseRecording !== 'function' || typeof VoiceMode.resumeRecording !== 'function') {
      BubbleSystem.show('当前版本暂不支持暂停/继续，可直接停止生成纪要', 1800);
      return;
    }
    if (nextPaused) {
      const ok = await VoiceMode.pauseRecording();
      if (!ok) return;
      state.paused = true;
      const { pause } = els();
      if (pause) pause.textContent = '▶';
      return;
    }
    const ok = await VoiceMode.resumeRecording();
    if (!ok) return;
    state.paused = false;
    const { pause } = els();
    if (pause) pause.textContent = '⏸';
  }

  function resetState() {
    state.active = false;
    state.paused = false;
    state.generating = false;
    state.startedAt = null;
    state.endedAt = null;
    state.transcriptParts = [];
    state.pcmSamples = [];
    state.elapsedSec = 0;
    state.wavPath = '';
    stopTicker();
    hideControl();
    const { pause } = els();
    if (pause) pause.textContent = '⏸';
  }

  async function saveWav() {
    if (!state.pcmSamples.length) return '';
    const payload = {
      sampleRate: 16000,
      samples: state.pcmSamples,
    };
    const res = await window.electronAPI?.meetingNotesSaveWav?.(payload);
    if (!res?.ok) return '';
    return res.wavPath || '';
  }

  async function summarizeAndDocx() {
    const transcript = fullTranscript();
    let summary = '';
    try {
      summary = await AIBrain.summarizeMeetingDirect(transcript);
    } catch {
      summary = '纪要生成失败，请稍后重试。';
    }
    const res = await window.electronAPI?.meetingNotesBuildDocx?.({
      wavPath: state.wavPath,
      transcript,
      summary,
      startedAt: state.startedAt ? state.startedAt.toISOString() : '',
      endedAt: state.endedAt ? state.endedAt.toISOString() : '',
    });
    return res?.ok ? res : null;
  }

  async function stopAndGenerate() {
    if (!state.active || state.generating) return;
    state.generating = true;
    state.endedAt = new Date();
    const { pause, stop } = els();
    if (pause) {
      pause.disabled = true;
      pause.style.opacity = '0.55';
      pause.style.cursor = 'default';
    }
    if (stop) {
      stop.disabled = true;
      stop.style.opacity = '0.55';
      stop.style.cursor = 'default';
      stop.textContent = '…';
    }
    // 停止后立即收起控制条，避免等待生成期间停留在界面上
    hideControl();
    BubbleSystem.showTranslate?.('正在帮你生成录音纪要', 2200);
    try {
      await VoiceMode.stopRecording();
    } catch {}
    try {
      state.wavPath = await saveWav();
      const docRes = await summarizeAndDocx();
      if (docRes?.docPath) {
        const safeDocPath = String(docRes.docPath || '');
        const fileName = safeDocPath.split('/').pop() || 'meeting-notes.docx';
        const dirPath = String(docRes.bundleDir || '').trim() || safeDocPath.slice(0, Math.max(0, safeDocPath.lastIndexOf('/'))) || safeDocPath;
        BubbleSystem.showTranslate?.(`录音纪要已生成：${fileName}`, 4200);
        if (window.electronAPI?.sendQuickChatReply) {
          const docUri = `localpath://${encodeURI(safeDocPath)}`;
          const dirUri = `localpath://${encodeURI(dirPath)}`;
          const msg = [
            `录音纪要已生成：${fileName}`,
            `[📄 打开纪要文件](${docUri})`,
            `[📁 打开所在目录](${dirUri})`,
            `路径：[${dirPath}](${dirUri})`,
          ].join('\n');
          window.electronAPI.sendQuickChatReply(msg);
        }
      } else {
        BubbleSystem.showTranslate?.('录音纪要生成失败', 2600);
      }
    } finally {
      resetState();
    }
  }

  async function start() {
    if (state.active || state.generating) return;
    if (!window.electronAPI?.meetingNotesSaveWav || !window.electronAPI?.meetingNotesBuildDocx) {
      BubbleSystem.show('录音纪要功能未就绪', 1800);
      return;
    }
    if (typeof VoiceMode === 'undefined' || !VoiceMode.isSupported || !VoiceMode.asrAvailable) {
      BubbleSystem.show('语音能力不可用，无法开始录音纪要', 2200);
      return;
    }
    state.active = true;
    state.paused = false;
    state.generating = false;
    state.startedAt = new Date();
    state.transcriptParts = [];
    state.pcmSamples = [];
    state.elapsedSec = 0;
    state.wavPath = '';
    showControl();
    startTicker();
    const ok = await VoiceMode.startRecording();
    if (!ok) {
      resetState();
      BubbleSystem.show('录音纪要启动失败', 1800);
      return;
    }
    BubbleSystem.showTranslate?.('录音纪要已开始', 1200);
  }

  function handleStreaming(text) {
    if (!state.active) return false;
    pushTranscript(text);
    return true;
  }

  function handleResult(text) {
    if (!state.active) return false;
    pushTranscript(text);
    return true;
  }

  function handleError() {
    if (!state.active) return false;
    resetState();
    BubbleSystem.showTranslate?.('录音纪要中断，请重试', 1800);
    return true;
  }

  function onPcmFrame(int16Array) {
    if (!state.active || state.paused || state.generating) return;
    for (let i = 0; i < int16Array.length; i++) state.pcmSamples.push(int16Array[i]);
  }

  function init() {
    const { pause, stop } = els();
    pause?.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (state.generating) return;
      await setPaused(!state.paused);
    });
    stop?.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (state.generating) return;
      await stopAndGenerate();
    });
    if (typeof VoiceMode !== 'undefined' && typeof VoiceMode.onPcmFrame === 'function') {
      VoiceMode.onPcmFrame(onPcmFrame);
    }
    document.addEventListener('meeting-notes:start', async () => {
      await start();
    });
  }

  return {
    init,
    start,
    stopAndGenerate,
    handleStreaming,
    handleResult,
    handleError,
    get isActive() { return state.active; },
    get isGenerating() { return state.generating; },
  };
})();

// 显式挂到 window，避免不同脚本作用域下取不到 MeetingNotes
try {
  window.MeetingNotes = MeetingNotes;
  // 脚本已加载即可视为模块可用；init 在 app/按钮路径中调用
  window.__meetingNotesReady = true;
} catch {}
