/* ═══════════════════════════════════════════
   GomokuWindowApp — 五子棋独立窗口逻辑
   - Canvas 像素风棋盘渲染
   - 完整游戏流程：邀请→对弈→结束
   - Solo 本地双人模式（无需拜访会话）
   - 悔棋请求/确认协议
   - 步时 + 全局计时
   - 严格规则校验
   ═══════════════════════════════════════════ */

const GomokuWindowApp = (() => {
  'use strict';

  /* ─── 常量 ─── */
  const BOARD_SIZE = 15;
  const CELL_SIZE = 28;          // 每格像素
  const PADDING = 20;            // 棋盘边距
  const STONE_RADIUS = 11;       // 棋子半径
  const CANVAS_SIZE = PADDING * 2 + CELL_SIZE * (BOARD_SIZE - 1);
  const TURN_TIME_LIMIT = 60;    // 每步限时
  const GAME_TIME_LIMIT = 600;   // 全局限时

  /* ─── 状态 ─── */
  let engine = new GomokuEngine(BOARD_SIZE);
  let actionPending = false;
  let myStone = null;           // 'black' | 'white' | null（本窗口对应的颜色）
  let timerInterval = null;
  let hoverPos = null;          // { row, col } | null
  let soloMode = false;         // Solo 本地双人模式标记

  /* ─── 工具 ─── */
  const $ = (id) => document.getElementById(id);

  function setStatus(text, cls = '') {
    const el = $('gm-status');
    if (el) {
      el.textContent = text;
      el.className = 'gm-status' + (cls ? ` ${cls}` : '');
    }
  }

  /* ─── Canvas 渲染 ─── */
  function getCanvas() {
    return $('gm-canvas');
  }

  function getCtx() {
    const canvas = getCanvas();
    return canvas ? canvas.getContext('2d') : null;
  }

  function renderBoard() {
    const ctx = getCtx();
    if (!ctx) return;

    const board = engine.getBoard();
    const lastMove = engine.getLastMove();
    const winLine = engine.getWinLine();
    const winSet = new Set();
    if (winLine) {
      winLine.forEach(p => winSet.add(`${p.row},${p.col}`));
    }

    // 清空画布
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // 棋盘底色
    ctx.fillStyle = '#c8a860';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // 网格线
    ctx.strokeStyle = '#7a6030';
    ctx.lineWidth = 1;
    for (let i = 0; i < BOARD_SIZE; i++) {
      const pos = PADDING + i * CELL_SIZE;
      // 横线
      ctx.beginPath();
      ctx.moveTo(PADDING, pos);
      ctx.lineTo(PADDING + (BOARD_SIZE - 1) * CELL_SIZE, pos);
      ctx.stroke();
      // 竖线
      ctx.beginPath();
      ctx.moveTo(pos, PADDING);
      ctx.lineTo(pos, PADDING + (BOARD_SIZE - 1) * CELL_SIZE);
      ctx.stroke();
    }

    // 星位点（天元 + 四个星位）
    const starPoints = [
      { r: 3, c: 3 }, { r: 3, c: 11 },
      { r: 7, c: 7 },
      { r: 11, c: 3 }, { r: 11, c: 11 },
    ];
    ctx.fillStyle = '#7a6030';
    for (const sp of starPoints) {
      const x = PADDING + sp.c * CELL_SIZE;
      const y = PADDING + sp.r * CELL_SIZE;
      ctx.fillRect(x - 2, y - 2, 4, 4);
    }

    // 棋子
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const stone = board[r][c];
        if (!stone) continue;
        const x = PADDING + c * CELL_SIZE;
        const y = PADDING + r * CELL_SIZE;
        const isWinCell = winSet.has(`${r},${c}`);

        drawStone(ctx, x, y, stone, isWinCell);
      }
    }

    // 最后一手标记
    if (lastMove && !winLine) {
      const x = PADDING + lastMove.col * CELL_SIZE;
      const y = PADDING + lastMove.row * CELL_SIZE;
      ctx.fillStyle = '#e04040';
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // 胜利连线高亮
    if (winLine && winLine.length >= 2) {
      ctx.strokeStyle = 'rgba(255, 68, 68, 0.7)';
      ctx.lineWidth = 3;
      ctx.setLineDash([4, 4]);
      const first = winLine[0];
      const last = winLine[winLine.length - 1];
      ctx.beginPath();
      ctx.moveTo(PADDING + first.col * CELL_SIZE, PADDING + first.row * CELL_SIZE);
      ctx.lineTo(PADDING + last.col * CELL_SIZE, PADDING + last.row * CELL_SIZE);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 悬浮预览
    if (hoverPos && (engine.getStatus() === 'active' || (soloMode && engine.getStatus() === 'idle')) && !actionPending) {
      const { row, col } = hoverPos;
      if (!board[row][col] && isMyTurn()) {
        const x = PADDING + col * CELL_SIZE;
        const y = PADDING + row * CELL_SIZE;
        ctx.globalAlpha = 0.35;
        drawStone(ctx, x, y, engine.getCurrentStone(), false);
        ctx.globalAlpha = 1;
      }
    }
  }

  function drawStone(ctx, x, y, stone, isWinCell) {
    ctx.save();

    if (stone === 'black') {
      // 黑子
      const grad = ctx.createRadialGradient(x - 3, y - 3, 2, x, y, STONE_RADIUS);
      grad.addColorStop(0, '#444');
      grad.addColorStop(1, '#111');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, STONE_RADIUS, 0, Math.PI * 2);
      ctx.fill();

      // 像素高光
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fillRect(x - 4, y - 4, 3, 3);
    } else {
      // 白子
      const grad = ctx.createRadialGradient(x - 3, y - 3, 2, x, y, STONE_RADIUS);
      grad.addColorStop(0, '#fff');
      grad.addColorStop(1, '#ddd');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, STONE_RADIUS, 0, Math.PI * 2);
      ctx.fill();

      // 像素阴影
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(x + 2, y + 2, 3, 3);

      // 边框
      ctx.strokeStyle = '#bbb';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, STONE_RADIUS, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 获胜高亮
    if (isWinCell) {
      ctx.strokeStyle = '#ff4444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, STONE_RADIUS + 2, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  /* ─── UI 同步 ─── */

  function syncUI() {
    // Solo 模式走独立路径
    if (soloMode) {
      syncSoloUI();
      return;
    }

    // SocialState 未就绪时显示 Solo 欢迎屏
    if (typeof SocialState === 'undefined' || !SocialState.getState) {
      const soloWelcome = $('gm-solo-welcome');
      if (soloWelcome) soloWelcome.classList.remove('hidden');
      setStatus('离线模式，点击下方开始本地对局', 'is-waiting');
      renderBoard();
      return;
    }

    const state = SocialState.getState();
    const roomId = state.currentRoom?.roomId || null;
    const game = state.currentGame && state.currentGame.type === 'gomoku' && state.currentGame.roomId === roomId
      ? state.currentGame
      : null;

    // 导入引擎状态（避免在 actionPending 期间覆盖本地预落子）
    if (game && !actionPending) {
      importEngineFromGame(game);
    } else if (!game) {
      engine.reset();
      myStone = null;
    }

    // 房间标签
    const roomLabel = $('gm-room-label');
    if (roomLabel) {
      if (!roomId) {
        roomLabel.textContent = '等待拜访会话…';
      } else {
        const name = state.currentRoom?.guestOwnerName || state.currentRoom?.guestPetName || '对方';
        roomLabel.textContent = `对手：${name}`;
      }
    }

    // Solo 欢迎屏显示/隐藏
    const soloWelcome = $('gm-solo-welcome');
    if (soloWelcome) {
      // 在线模式：有拜访房间且无对局时也可以显示 Solo 入口
      soloWelcome.classList.toggle('hidden', !!game);
    }

    // 状态文字
    if (!roomId) {
      setStatus('先进入拜访会话，再邀请对方开始。', 'is-waiting');
    } else if (!game) {
      setStatus('已进入拜访，点击"下棋"邀请对方。', 'is-waiting');
    } else if (engine.getStatus() === 'ended') {
      const winner = engine.getWinner();
      const winText = winner === 'draw' ? '平局！' :
        `${winner === 'black' ? '黑子' : '白子'}获胜！`;
      setStatus(`游戏结束 — ${winText}`, 'is-ended');
    } else {
      const current = engine.getCurrentStone();
      const label = current === 'black' ? '黑子' : '白子';
      setStatus(`当前轮到 ${label}`, 'is-active');
    }

    // Canvas 启用/禁用
    const canvas = getCanvas();
    if (canvas) {
      canvas.classList.toggle('is-disabled', !game || engine.getStatus() !== 'active');
    }

    // 玩家信息
    syncPlayers(game);

    // 按钮状态
    syncButtons(game);

    // 悔棋次数
    syncUndoBadges();

    // 渲染棋盘
    renderBoard();

    // 计时器
    updateTimers();
  }

  /* ─── Solo 模式 UI 同步 ─── */

  function syncSoloUI() {
    const roomLabel = $('gm-room-label');
    if (roomLabel) roomLabel.textContent = '本地双人模式';

    const soloWelcome = $('gm-solo-welcome');
    if (soloWelcome) soloWelcome.classList.add('hidden');

    const status = engine.getStatus();
    if (status === 'idle') {
      setStatus('点击棋盘开始落子，黑子先行', 'is-waiting');
    } else if (status === 'ended') {
      const winner = engine.getWinner();
      const winText = winner === 'draw' ? '平局！' :
        `${winner === 'black' ? '黑子' : '白子'}获胜！`;
      setStatus(`游戏结束 — ${winText}`, 'is-ended');
    } else {
      const current = engine.getCurrentStone();
      const label = current === 'black' ? '黑子' : '白子';
      setStatus(`当前轮到 ${label}`, 'is-active');
    }

    const canvas = getCanvas();
    if (canvas) {
      canvas.classList.toggle('is-disabled', status !== 'active' && status !== 'idle');
    }

    syncPlayers(null); // Solo 模式用默认名字
    syncSoloButtons();
    syncUndoBadges();
    renderBoard();
    updateTimers();
  }

  function syncSoloButtons() {
    const undoBtn = $('gm-undo');
    const resignBtn = $('gm-resign');
    const resetBtn = $('gm-reset');

    const status = engine.getStatus();
    const isActive = status === 'active';
    const currentStone = engine.getCurrentStone();

    // Solo 模式：悔棋总是允许的（轮到谁就撤谁），且直接撤不需要对方确认
    const canUndo = isActive && engine.getMoveCount() > 0
      && engine.getUndoCounts()[currentStone] < engine.getMaxUndo();
    const isEnded = status === 'ended';

    if (undoBtn) undoBtn.disabled = !canUndo || actionPending;
    if (resignBtn) resignBtn.disabled = !isActive || actionPending;
    if (resetBtn) resetBtn.disabled = !isEnded || actionPending;
  }

  function importEngineFromGame(game) {
    if (!game || !Array.isArray(game.board)) return;

    // 确定我的颜色：邀请方=黑，接受方=白
    const profile = SocialState.getState().profile || {};
    const myUserId = profile.userId || '';
    if (game.blackUserId === myUserId) {
      myStone = 'black';
    } else if (game.whiteUserId === myUserId) {
      myStone = 'white';
    } else {
      // 降级：默认黑子
      myStone = 'black';
    }

    // 从服务端棋盘状态直接导入引擎
    // 不能用 placeStone 逐步落子（会触发换手和胜负判定），
    // 直接修改引擎内部状态
    engine.reset();
    const board = game.board;

    // 复制棋盘
    for (let r = 0; r < BOARD_SIZE && r < board.length; r++) {
      for (let c = 0; c < BOARD_SIZE && c < board[r].length; c++) {
        if (board[r][c]) {
          engine._board[r][c] = board[r][c];
          engine._moveHistory.push({
            row: r, col: c,
            stone: board[r][c],
            timestamp: Date.now(),
          });
        }
      }
    }

    // 根据棋盘子数确定下一步轮到谁
    const moveCount = engine._moveHistory.length;
    engine._currentStone = moveCount % 2 === 0 ? 'black' : 'white';

    // 设置游戏结束状态
    if (game.winner) {
      engine._status = 'ended';
      engine._winner = game.winner;

      // 尝试计算获胜连线
      if (game.winner !== 'draw') {
        // 找最后一手并检测五连
        for (let i = engine._moveHistory.length - 1; i >= 0; i--) {
          const m = engine._moveHistory[i];
          if (m.stone === game.winner) {
            const winLine = GomokuEngine.checkWin(engine._board, m.row, m.col, BOARD_SIZE);
            if (winLine) {
              engine._winLine = winLine;
              break;
            }
          }
        }
      }
    }

    // 在线对局激活，启动计时器
    if (engine._status === 'active') {
      startTimer();
    }
  }

  function syncPlayers(game) {
    const blackPlayer = $('gm-player-black');
    const whitePlayer = $('gm-player-white');
    const blackName = $('gm-black-name');
    const whiteName = $('gm-white-name');
    const turnIndicator = $('gm-turn-indicator');

    if (blackPlayer) blackPlayer.classList.toggle('is-active', engine.getCurrentStone() === 'black' && engine.getStatus() === 'active');
    if (whitePlayer) whitePlayer.classList.toggle('is-active', engine.getCurrentStone() === 'white' && engine.getStatus() === 'active');

    if (game) {
      if (blackName) blackName.textContent = game.blackOwnerName || '黑子';
      if (whiteName) whiteName.textContent = game.whiteOwnerName || '白子';
    } else {
      if (blackName) blackName.textContent = '黑子';
      if (whiteName) whiteName.textContent = '白子';
    }

    if (turnIndicator) {
      if (engine.getStatus() !== 'active') {
        turnIndicator.textContent = '▪';
        turnIndicator.style.color = 'var(--gm-text-dim)';
      } else if (engine.getCurrentStone() === 'black') {
        turnIndicator.textContent = '⬤';
        turnIndicator.style.color = 'var(--gm-black-stone)';
      } else {
        turnIndicator.textContent = '◯';
        turnIndicator.style.color = 'var(--gm-white-stone)';
      }
    }
  }

  function syncButtons(game) {
    const undoBtn = $('gm-undo');
    const resignBtn = $('gm-resign');
    const resetBtn = $('gm-reset');

    const isActive = game && engine.getStatus() === 'active';
    const isMyTurnFlag = isActive && isMyTurn();
    const canUndo = isActive && isMyTurnFlag && engine.getUndoCounts()[myStone || 'black'] < engine.getMaxUndo() && engine.getMoveCount() > 0;
    const isEnded = game && engine.getStatus() === 'ended';

    if (undoBtn) undoBtn.disabled = !canUndo || actionPending;
    if (resignBtn) resignBtn.disabled = !isActive || actionPending;
    if (resetBtn) resetBtn.disabled = !isEnded || actionPending;
  }

  function syncUndoBadges() {
    const undoCounts = engine.getUndoCounts();
    const blackBadge = $('gm-black-undo-badge');
    const whiteBadge = $('gm-white-undo-badge');
    if (blackBadge) blackBadge.textContent = `×${engine.getMaxUndo() - (undoCounts.black || 0)}`;
    if (whiteBadge) whiteBadge.textContent = `×${engine.getMaxUndo() - (undoCounts.white || 0)}`;
  }

  /* ─── 计时 ─── */

  function updateTimers() {
    const blackTimer = $('gm-black-timer');
    const whiteTimer = $('gm-white-timer');
    const gameTimerVal = $('gm-game-timer-value');
    const gameTimerWrap = $('gm-game-timer');

    if (engine.getStatus() !== 'active') {
      if (blackTimer) { blackTimer.textContent = '--'; blackTimer.classList.remove('is-warning'); }
      if (whiteTimer) { whiteTimer.textContent = '--'; whiteTimer.classList.remove('is-warning'); }
      if (gameTimerVal) gameTimerVal.textContent = '--:--';
      if (gameTimerWrap) gameTimerWrap.classList.remove('is-warning');
      return;
    }

    const turnRemaining = engine.getTurnRemaining();
    const gameRemaining = engine.getGameRemaining();
    const current = engine.getCurrentStone();

    if (current === 'black') {
      if (blackTimer) {
        blackTimer.textContent = Math.ceil(turnRemaining);
        blackTimer.classList.toggle('is-warning', turnRemaining <= 10);
      }
      if (whiteTimer) { whiteTimer.textContent = '--'; whiteTimer.classList.remove('is-warning'); }
    } else {
      if (whiteTimer) {
        whiteTimer.textContent = Math.ceil(turnRemaining);
        whiteTimer.classList.toggle('is-warning', turnRemaining <= 10);
      }
      if (blackTimer) { blackTimer.textContent = '--'; blackTimer.classList.remove('is-warning'); }
    }

    const mins = Math.floor(gameRemaining / 60);
    const secs = Math.floor(gameRemaining % 60);
    if (gameTimerVal) gameTimerVal.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
    if (gameTimerWrap) gameTimerWrap.classList.toggle('is-warning', gameRemaining <= 60);

    // 超时检测
    const timeout = engine.checkTimeout();
    if (timeout.turnTimeout && timeout.timeoutStone) {
      engine.timeoutLose(timeout.timeoutStone);
      setStatus(`${timeout.timeoutStone === 'black' ? '黑子' : '白子'}超时判负！`, 'is-ended');
      syncUI();
    } else if (timeout.gameTimeout) {
      engine.timeoutDraw();
      setStatus('全局超时，平局！', 'is-ended');
      syncUI();
    }
  }

  function startTimer() {
    stopTimer();
    timerInterval = setInterval(() => updateTimers(), 500);
  }

  function stopTimer() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  }

  /* ─── 回合判定 ─── */

  function isMyTurn() {
    if (soloMode) return engine.getStatus() === 'active';
    if (!myStone) return false;
    return engine.getCurrentStone() === myStone && engine.getStatus() === 'active';
  }

  /* ─── Canvas 交互 ─── */

  function canvasToBoard(clientX, clientY) {
    const canvas = getCanvas();
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_SIZE / rect.width;
    const scaleY = CANVAS_SIZE / rect.height;
    const px = (clientX - rect.left) * scaleX;
    const py = (clientY - rect.top) * scaleY;

    const col = Math.round((px - PADDING) / CELL_SIZE);
    const row = Math.round((py - PADDING) / CELL_SIZE);

    if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) return null;
    return { row, col };
  }

  /* ─── 动作处理 ─── */

  async function handleMove(row, col) {
    if (actionPending) return;

    // Solo 模式：直接落子，不走网络
    if (soloMode) {
      const result = engine.placeStone(row, col);
      if (!result.ok) {
        setStatus(`落子失败：${result.reason}`, 'is-waiting');
        return;
      }
      // 首次落子启动计时
      if (engine.getStatus() === 'active' && !timerInterval) {
        startTimer();
      }
      syncUI();

      // 检查是否结束
      if (engine.getStatus() === 'ended') {
        stopTimer();
        showResult();
      }
      return;
    }

    // 在线模式
    if (!isMyTurn()) {
      setStatus('还没轮到你', 'is-waiting');
      return;
    }

    // 保存快照以便回滚
    const snapshot = engine.exportState();

    // 本地预校验+落子
    const preCheck = engine.placeStone(row, col);
    if (!preCheck.ok) {
      setStatus(`落子失败：${preCheck.reason}`, 'is-waiting');
      return;
    }

    actionPending = true;
    syncUI();

    const res = await SocialActions.playMiniGameMove('gomoku', { row, col, source: 'gomoku-window' });
    actionPending = false;

    if (!res?.success) {
      // 回滚到落子前的快照
      engine.importState(snapshot);
      setStatus(`落子失败：${res?.message || '未知错误'}`, 'is-waiting');
    }

    syncUI();
  }

  async function handleUndo() {
    if (actionPending) return;

    // Solo 模式：直接悔棋，不需要对方确认
    if (soloMode) {
      const currentStone = engine.getCurrentStone();
      const undoCounts = engine.getUndoCounts();
      if (undoCounts[currentStone] >= engine.getMaxUndo()) {
        setStatus('悔棋次数已用完', 'is-waiting');
        return;
      }
      if (engine.getMoveCount() === 0) return;
      engine.executeUndo(currentStone);
      setStatus('悔棋成功', 'is-active');
      syncUI();
      return;
    }

    // 在线模式
    if (!isMyTurn()) return;
    if (!myStone) return;

    const result = engine.requestUndo(myStone);
    if (!result.ok) {
      if (result.reason === 'undo-limit-reached') {
        setStatus('悔棋次数已用完', 'is-waiting');
      } else {
        setStatus('无法悔棋', 'is-waiting');
      }
      return;
    }

    // 发送悔棋请求
    actionPending = true;
    setStatus('悔棋请求已发送，等待对方确认…', 'is-waiting');
    syncUI();

    const res = await SocialActions.sendVisitInteraction('undo-request', {
      source: 'gomoku-window',
      stone: myStone,
      move: result.move,
    });
    actionPending = false;
    if (!res?.success) {
      setStatus(`悔棋请求失败：${res?.message || '未知错误'}`, 'is-waiting');
    }
    syncUI();
  }

  function handleUndoAccept() {
    // 对方同意悔棋，执行
    const undoStone = getPendingUndoStone();
    if (undoStone) {
      engine.executeUndo(undoStone);
    }
    hideModal('gm-undo-modal');
    setStatus('悔棋成功', 'is-active');
    syncUI();
  }

  function handleUndoReject() {
    hideModal('gm-undo-modal');
    setStatus('对方拒绝了悔棋请求', 'is-active');
    syncUI();
  }

  let pendingUndoStone = null;

  function getPendingUndoStone() {
    return pendingUndoStone;
  }

  function showUndoRequest(stone) {
    pendingUndoStone = stone;
    const modal = $('gm-undo-modal');
    const text = $('gm-undo-modal-text');
    if (text) text.textContent = `${stone === 'black' ? '黑子' : '白子'}请求悔棋，是否同意？`;
    if (modal) modal.classList.remove('hidden');
  }

  async function handleResign() {
    if (actionPending || engine.getStatus() !== 'active') return;

    // Solo 模式：当前手的一方认输
    if (soloMode) {
      const currentStone = engine.getCurrentStone();
      engine.resign(currentStone);
      stopTimer();
      syncUI();
      showResult();
      return;
    }

    // 在线模式
    if (!myStone) return;

    actionPending = true;
    engine.resign(myStone);
    syncUI();

    const res = await SocialActions.playMiniGameMove('gomoku', {
      resign: true,
      stone: myStone,
      source: 'gomoku-window',
    });
    actionPending = false;

    if (!res?.success) {
      // 认输失败也结束本地状态
      console.warn('[gomoku] resign failed:', res?.message);
    }
    syncUI();
    showResult();
  }

  /** 关闭窗口：在线模式下先退出游戏并通知对方 */
  async function handleClose() {
    // 在线模式且游戏进行中：先放弃游戏再关闭
    if (!soloMode && engine.getStatus() === 'active' && myStone) {
      console.log('[gomoku] 主动关闭窗口，退出对局');
      try {
        await SocialActions.playMiniGameMove('gomoku', {
          resign: true,
          stone: myStone,
          source: 'gomoku-window',
          reason: 'window-closed',
        });
      } catch (e) {
        console.warn('[gomoku] exit-game on close failed:', e);
      }
    }
    stopTimer();
    window.electronAPI?.closeGomokuWindow?.();
  }

  async function handleReset() {
    if (actionPending) return;
    if (engine.getStatus() !== 'ended') return;

    // Solo 模式：直接重置
    if (soloMode) {
      engine.reset();
      hideModal('gm-result-modal');
      setStatus('新一局开始！黑子先行', 'is-active');
      syncUI();
      startTimer();
      return;
    }

    // 在线模式
    actionPending = true;
    syncUI();

    const res = await SocialActions.resetMiniGame('gomoku', { source: 'gomoku-window' });
    actionPending = false;

    if (res?.success) {
      engine.reset();
      hideModal('gm-result-modal');
      setStatus('新一局开始！黑子先行', 'is-active');
    } else {
      setStatus(`重开失败：${res?.message || '未知错误'}`, 'is-waiting');
    }
    syncUI();
  }

  /* ─── 结果弹窗 ─── */

  function showResult() {
    const winner = engine.getWinner();
    const titleEl = $('gm-result-title');
    const textEl = $('gm-result-text');

    if (winner === 'draw') {
      if (titleEl) titleEl.textContent = '平局！';
      if (textEl) textEl.textContent = '棋逢对手，旗鼓相当。';
    } else {
      const winnerLabel = winner === 'black' ? '黑子' : '白子';
      if (soloMode) {
        if (titleEl) titleEl.textContent = `${winnerLabel}获胜！`;
        if (textEl) textEl.textContent = '五子连珠，胜负已分。';
      } else {
        const isMe = winner === myStone;
        if (titleEl) titleEl.textContent = isMe ? '你赢了！' : `${winnerLabel}获胜`;
        if (textEl) textEl.textContent = isMe ? '恭喜你，五子连珠！' : '下次再接再厉吧。';
      }
    }

    const modal = $('gm-result-modal');
    if (modal) modal.classList.remove('hidden');
  }

  function hideModal(id) {
    const el = $(id);
    if (el) el.classList.add('hidden');
  }

  /* ─── 事件绑定 ─── */

  function bindEvents() {
    // 关闭（先退出游戏再关窗口）
    $('gm-close')?.addEventListener('click', handleClose);

    // Solo 模式开始按钮
    $('gm-solo-start')?.addEventListener('click', () => {
      soloMode = true;
      myStone = 'both'; // Solo 模式特殊标记
      engine.reset();
      hideModal('gm-result-modal');
      setStatus('黑子先行', 'is-active');
      syncUI();
      startTimer();
    });

    // Canvas 点击落子
    const canvas = getCanvas();
    if (canvas) {
      canvas.addEventListener('click', (e) => {
        const pos = canvasToBoard(e.clientX, e.clientY);
        if (pos) handleMove(pos.row, pos.col);
      });

      // 悬浮预览
      canvas.addEventListener('mousemove', (e) => {
        const pos = canvasToBoard(e.clientX, e.clientY);
        if (pos && (!hoverPos || hoverPos.row !== pos.row || hoverPos.col !== pos.col)) {
          hoverPos = pos;
          renderBoard();
        }
      });

      canvas.addEventListener('mouseleave', () => {
        hoverPos = null;
        renderBoard();
      });
    }

    // 按钮
    $('gm-undo')?.addEventListener('click', handleUndo);
    $('gm-resign')?.addEventListener('click', handleResign);
    $('gm-reset')?.addEventListener('click', handleReset);

    // 悔棋弹窗
    $('gm-undo-accept')?.addEventListener('click', handleUndoAccept);
    $('gm-undo-reject')?.addEventListener('click', handleUndoReject);

    // 结果弹窗
    $('gm-result-again')?.addEventListener('click', handleReset);
    $('gm-result-close')?.addEventListener('click', () => hideModal('gm-result-modal'));

    // 状态变化（仅在线模式监听）
    if (typeof SocialState !== 'undefined' && SocialState.on) {
      SocialState.on('change', ({ state, reason } = {}) => {
        // Solo 模式不处理在线状态变化
        if (soloMode) return;

        const next = state || SocialState.getState();
        syncUI();

        // 悔棋请求
        if (reason === 'visit.game.undo-request') {
          const undoStone = next._pendingUndoStone || 'white';
          showUndoRequest(undoStone);
        }

        // 悔棋响应
        if (reason === 'visit.game.undo-response') {
          const accepted = next._undoAccepted;
          if (accepted) {
            const undoStone = next._undoStone || myStone;
            engine.executeUndo(undoStone);
            setStatus('悔棋成功', 'is-active');
          } else {
            setStatus('对方拒绝了悔棋', 'is-active');
          }
          syncUI();
        }

        // 游戏结束弹窗
        const game = next.currentGame;
        const roomId = next.currentRoom?.roomId || null;
        if (game && game.type === 'gomoku' && game.roomId === roomId && game.winner) {
          const resultModal = $('gm-result-modal');
          if (resultModal && resultModal.classList.contains('hidden')) {
            showResult();
          }
        }

        // ★ 对方退出游戏（认输/关闭窗口）
        if (!game && reason === 'visit.game.resigned') {
          const resignInfo = next._gameResignedInfo;
          if (resignInfo) {
            const isWin = resignInfo.winner === myStone;
            stopTimer();
            engine.reset();
            if (isWin) {
              setStatus('对方已退出，你赢了！', 'is-ended');
            } else {
              const msg = resignInfo.reason === 'window-closed' ? '对方关闭了游戏窗口' : '对方已认输';
              setStatus(`${msg}，对局结束`, 'is-ended');
            }
            // 显示结果弹窗
            const titleEl = $('gm-result-title');
            const textEl = $('gm-result-text');
            if (titleEl) titleEl.textContent = isWin ? '你赢了！' : '对局已结束';
            if (textEl) textEl.textContent = isWin ? '对方退出了对局。' : '下次再战吧。';
            const modal = $('gm-result-modal');
            if (modal) modal.classList.remove('hidden');
            renderBoard();
          }
        }
      });
    }
  }

  /* ─── 初始化 ─── */

  async function init() {
    // 设置 Canvas 尺寸
    const canvas = getCanvas();
    if (canvas) {
      canvas.width = CANVAS_SIZE;
      canvas.height = CANVAS_SIZE;
    }

    bindEvents();

    // 初始化社交架构（如果有的话——独立五子棋窗口可能加载不到）
    if (typeof SocialBootstrap !== 'undefined' && SocialBootstrap.init) {
      try {
        await SocialBootstrap.init();
      } catch (err) {
        console.warn('[gomoku-window] social bootstrap failed:', err);
      }
    } else {
      console.log('[gomoku-window] no SocialBootstrap, Solo mode available');
    }

    syncUI();
    // 不立即启动计时器——等待 Solo 开始或在线对局开始后再启动
    console.log('♟ 五子棋窗口就绪');
  }

  return { init };
})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void GomokuWindowApp.init());
} else {
  void GomokuWindowApp.init();
}
