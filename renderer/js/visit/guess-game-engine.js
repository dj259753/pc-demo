/* ═══════════════════════════════════════════
   猜拳小游戏引擎（纯逻辑，无 UI / 无 IO）
   - 石头 > 剪刀 > 布 > 石头
   - 支持多轮平局重试（最多 3 轮）
   ═══════════════════════════════════════════ */

const GuessGameEngine = (() => {
  const CHOICE = { ROCK: 'rock', PAPER: 'paper', SCISSORS: 'scissors' };
  const BEATS = { rock: 'scissors', scissors: 'paper', paper: 'rock' };
  const LABELS = { rock: '石头', paper: '布', scissors: '剪刀' };
  const MAX_ROUNDS = 3;

  let hostChoice = null;
  let guestChoice = null;
  let round = 1;
  let startedAt = 0;

  function reset() {
    hostChoice = null;
    guestChoice = null;
    round = 1;
    startedAt = 0;
  }

  function submitChoice(playerId, choice) {
    const c = String(choice || '').trim().toLowerCase();
    if (!CHOICE[c.toUpperCase()] && c !== 'rock' && c !== 'paper' && c !== 'scissors') {
      return { success: false, message: 'invalid-choice' };
    }
    if (playerId === 'host') {
      if (hostChoice) return { success: false, message: 'already-chosen' };
      hostChoice = c;
    } else {
      if (guestChoice) return { success: false, message: 'already-chosen' };
      guestChoice = c;
    }
    return { success: true };
  }

  function getWinner() {
    if (!hostChoice || !guestChoice) return null;
    if (hostChoice === guestChoice) return 'draw';
    if (BEATS[hostChoice] === guestChoice) return 'host';
    return 'guest';
  }

  function getState() {
    return {
      hostChoice,
      guestChoice,
      round,
      startedAt,
      winner: getWinner(),
      settled: !!(hostChoice && guestChoice),
    };
  }

  function nextRound() {
    if (round >= MAX_ROUNDS) return false;
    round++;
    hostChoice = null;
    guestChoice = null;
    return true;
  }

  function exportState() {
    return {
      hostChoice,
      guestChoice,
      round,
      startedAt,
      winner: getWinner(),
    };
  }

  function importState(s) {
    if (!s) return;
    hostChoice = s.hostChoice || null;
    guestChoice = s.guestChoice || null;
    round = s.round || 1;
    startedAt = s.startedAt || 0;
  }

  function start() {
    startedAt = Date.now();
    hostChoice = null;
    guestChoice = null;
  }

  return {
    CHOICE,
    BEATS,
    LABELS,
    MAX_ROUNDS,
    reset,
    start,
    submitChoice,
    getWinner,
    getState,
    nextRound,
    exportState,
    importState,
  };
})();
