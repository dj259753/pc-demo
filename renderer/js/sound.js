/* ═══════════════════════════════════════════
   音效引擎 - 所有电子音效已屏蔽
   SWF 内嵌音效由 Ruffle 直接播放
   保留所有接口避免其他模块报错
   ═══════════════════════════════════════════ */

const SoundEngine = (() => {
  const noop = () => {};
  return {
    click:         noop,
    menuOpen:      noop,
    menuClose:     noop,
    feed:          noop,
    wash:          noop,
    coffee:        noop,
    warning:       noop,
    aiReply:       noop,
    happy:         noop,
    snap:          noop,
    error:         noop,
    sweep:         noop,
    focusComplete: noop,
    devour:        noop,
    discover:      noop,
    voiceStart:    noop,
    voiceStop:     noop,
    voiceError:    noop,
  };
})();
