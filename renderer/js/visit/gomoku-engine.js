/* ═══════════════════════════════════════════
   GomokuEngine — 五子棋纯逻辑引擎
   - 不依赖 DOM / Electron / 任何外部库
   - 支持落子校验、五连判定、悔棋、超时
   - 15×15 标准棋盘
   ═══════════════════════════════════════════ */

class GomokuEngine {
  /**
   * @param {number} size - 棋盘边长，默认 15
   */
  constructor(size = 15) {
    this.size = size;
    this.reset();
  }

  /* ─── 重置 ─── */
  reset() {
    this._board = Array.from({ length: this.size }, () =>
      Array(this.size).fill(null)
    );
    this._currentStone = 'black'; // 黑先
    this._status = 'idle';        // 'idle' | 'active' | 'ended'
    this._winner = null;           // null | 'black' | 'white' | 'draw'
    this._moveHistory = [];        // { row, col, stone, timestamp }
    this._undoCounts = { black: 0, white: 0 }; // 每方悔棋次数
    this._maxUndo = 3;             // 每方最多悔棋次数
    this._turnStartTime = Date.now();
    this._turnTimeLimit = 60;      // 每步限时 60s
    this._gameStartTime = Date.now();
    this._gameTimeLimit = 600;     // 全局 10 分钟
    this._winLine = null;          // 获胜连线坐标 [{row,col},...]
  }

  /* ─── 只读属性 ─── */

  getBoard()         { return this._board.map(row => [...row]); }
  getCurrentStone()  { return this._currentStone; }
  getMoveCount()     { return this._moveHistory.length; }
  getStatus()        { return this._status; }
  getWinner()        { return this._winner; }
  getWinLine()       { return this._winLine ? [...this._winLine] : null; }
  getUndoCounts()    { return { ...this._undoCounts }; }
  getMaxUndo()       { return this._maxUndo; }
  getTurnTimeLimit() { return this._turnTimeLimit; }
  getGameTimeLimit() { return this._gameTimeLimit; }

  getLastMove() {
    if (this._moveHistory.length === 0) return null;
    return { ...this._moveHistory[this._moveHistory.length - 1] };
  }

  getMoveHistory() {
    return this._moveHistory.map(m => ({ ...m }));
  }

  /** 获取当前步剩余时间（秒），-1 表示不限时 */
  getTurnRemaining() {
    if (this._status !== 'active') return 0;
    const elapsed = (Date.now() - this._turnStartTime) / 1000;
    return Math.max(0, this._turnTimeLimit - elapsed);
  }

  /** 获取全局剩余时间（秒） */
  getGameRemaining() {
    if (this._status !== 'active') return 0;
    const elapsed = (Date.now() - this._gameStartTime) / 1000;
    return Math.max(0, this._gameTimeLimit - elapsed);
  }

  /** 获取当前棋盘总子数 */
  getStoneCount() {
    let count = 0;
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (this._board[r][c]) count++;
      }
    }
    return count;
  }

  /* ─── 落子 ─── */

  /**
   * 在 (row, col) 位置落子
   * @returns {{ ok: boolean, reason?: string }}
   */
  placeStone(row, col) {
    if (this._status === 'ended') {
      return { ok: false, reason: 'game-ended' };
    }

    // idle → active：首次落子激活游戏
    if (this._status === 'idle') {
      this._status = 'active';
      this._gameStartTime = Date.now();
      this._turnStartTime = Date.now();
    }

    // 边界校验
    if (!Number.isInteger(row) || !Number.isInteger(col) ||
        row < 0 || row >= this.size || col < 0 || col >= this.size) {
      return { ok: false, reason: 'out-of-bounds' };
    }

    // 已有子
    if (this._board[row][col] !== null) {
      return { ok: false, reason: 'cell-occupied' };
    }

    // 落子
    const stone = this._currentStone;
    this._board[row][col] = stone;
    this._moveHistory.push({ row, col, stone, timestamp: Date.now() });

    // 五连判定
    const winLine = GomokuEngine.checkWin(this._board, row, col, this.size);
    if (winLine) {
      this._status = 'ended';
      this._winner = stone;
      this._winLine = winLine;
      return { ok: true };
    }

    // 棋盘满 → 平局
    if (this.getStoneCount() >= this.size * this.size) {
      this._status = 'ended';
      this._winner = 'draw';
      return { ok: true };
    }

    // 换手
    this._currentStone = stone === 'black' ? 'white' : 'black';
    this._turnStartTime = Date.now();

    return { ok: true };
  }

  /* ─── 悔棋 ─── */

  /**
   * 请求悔棋：撤回指定颜色的最后一手
   * @param {'black'|'white'} stone - 请求悔棋的玩家颜色
   * @returns {{ ok: boolean, reason?: string, move?: object }}
   */
  requestUndo(stone) {
    if (this._status !== 'active') {
      return { ok: false, reason: 'game-ended' };
    }

    if (this._undoCounts[stone] >= this._maxUndo) {
      return { ok: false, reason: 'undo-limit-reached' };
    }

    // 找到该颜色的最后一手
    const moveIndex = this._findLastMoveOf(stone);
    if (moveIndex === -1) {
      return { ok: false, reason: 'no-move-to-undo' };
    }

    return { ok: true, move: { ...this._moveHistory[moveIndex] } };
  }

  /**
   * 执行悔棋（对方已同意）
   * @param {'black'|'white'} stone - 被撤回手的玩家颜色
   * @returns {{ ok: boolean, reason?: string }}
   */
  executeUndo(stone) {
    if (this._status !== 'active') {
      return { ok: false, reason: this._status === 'ended' ? 'game-ended' : 'game-not-started' };
    }

    const moveIndex = this._findLastMoveOf(stone);
    if (moveIndex === -1) {
      return { ok: false, reason: 'no-move-to-undo' };
    }

    // 如果游戏因该手结束，恢复为 active
    if (this._status === 'ended' && this._winner === stone) {
      this._status = 'active';
      this._winner = null;
      this._winLine = null;
    }

    // 撤回该手及之后的所有手（理论上只会撤回最后一手或对方的最后一手）
    const removedMoves = this._moveHistory.splice(moveIndex);
    for (const m of removedMoves) {
      this._board[m.row][m.col] = null;
    }

    this._undoCounts[stone]++;

    // 恢复轮次：如果撤回的是当前玩家的上一手，轮次需要回退
    // 简单策略：悔棋后轮次归被悔棋方的对手
    const lastRemaining = this._moveHistory[this._moveHistory.length - 1];
    if (lastRemaining) {
      this._currentStone = lastRemaining.stone === 'black' ? 'white' : 'black';
    } else {
      this._currentStone = 'black';
    }

    this._turnStartTime = Date.now();
    return { ok: true };
  }

  /** 找到指定颜色的最后一手的索引 */
  _findLastMoveOf(stone) {
    for (let i = this._moveHistory.length - 1; i >= 0; i--) {
      if (this._moveHistory[i].stone === stone) return i;
    }
    return -1;
  }

  /* ─── 认输 ─── */

  /**
   * 指定颜色认输
   * @param {'black'|'white'} stone
   */
  resign(stone) {
    if (this._status !== 'active') return;
    this._status = 'ended';
    this._winner = stone === 'black' ? 'white' : 'black';
    this._winLine = null;
  }

  /* ─── 超时检测 ─── */

  /**
   * 检查是否超时，返回需要判定的结果
   * @returns {{ turnTimeout: boolean, timeoutStone?: string, gameTimeout: boolean }}
   */
  checkTimeout() {
    if (this._status !== 'active') {
      return { turnTimeout: false, gameTimeout: false };
    }

    const turnRemaining = this.getTurnRemaining();
    if (turnRemaining <= 0) {
      return { turnTimeout: true, timeoutStone: this._currentStone, gameTimeout: false };
    }

    const gameRemaining = this.getGameRemaining();
    if (gameRemaining <= 0) {
      return { turnTimeout: false, gameTimeout: true };
    }

    return { turnTimeout: false, gameTimeout: false };
  }

  /**
   * 执行超时判负
   * @param {'black'|'white'} stone - 超时判负的颜色
   */
  timeoutLose(stone) {
    if (this._status !== 'active') return;
    this._status = 'ended';
    this._winner = stone === 'black' ? 'white' : 'black';
  }

  /**
   * 执行全局超时判平
   */
  timeoutDraw() {
    if (this._status !== 'active') return;
    this._status = 'ended';
    this._winner = 'draw';
  }

  /* ─── 导出/导入 ─── */

  /** 导出完整状态（用于网络同步、持久化） */
  exportState() {
    return {
      size: this.size,
      board: this.getBoard(),
      currentStone: this._currentStone,
      status: this._status,
      winner: this._winner,
      moveHistory: this.getMoveHistory(),
      undoCounts: { ...this._undoCounts },
      turnStartTime: this._turnStartTime,
      gameStartTime: this._gameStartTime,
      winLine: this._winLine ? [...this._winLine] : null,
    };
  }

  /** 从导出状态恢复 */
  importState(state) {
    if (!state || state.size !== this.size) return false;
    this._board = state.board.map(row => [...row]);
    this._currentStone = state.currentStone || 'black';
    this._status = state.status || 'active';
    this._winner = state.winner || null;
    this._moveHistory = Array.isArray(state.moveHistory) ? state.moveHistory.map(m => ({ ...m })) : [];
    this._undoCounts = state.undoCounts ? { ...state.undoCounts } : { black: 0, white: 0 };
    this._turnStartTime = state.turnStartTime || Date.now();
    this._gameStartTime = state.gameStartTime || Date.now();
    this._winLine = state.winLine ? [...state.winLine] : null;
    return true;
  }

  /* ─── 静态方法：五连判定 ─── */

  /**
   * 检测 (row, col) 位置是否形成五连
   * @param {Array<Array<null|string>>} board
   * @param {number} row
   * @param {number} col
   * @param {number} size
   * @returns {Array<{row:number,col:number}>|null} 获胜连线坐标，null 表示未连五
   */
  static checkWin(board, row, col, size) {
    const stone = board[row][col];
    if (!stone) return null;

    // 四个方向：水平、垂直、左上→右下、右上→左下
    const directions = [
      { dr: 0, dc: 1 },  // 水平
      { dr: 1, dc: 0 },  // 垂直
      { dr: 1, dc: 1 },  // ↘
      { dr: 1, dc: -1 }, // ↙
    ];

    for (const { dr, dc } of directions) {
      const line = [{ row, col }];

      // 正向延伸
      for (let i = 1; i < 5; i++) {
        const r = row + dr * i;
        const c = col + dc * i;
        if (r < 0 || r >= size || c < 0 || c >= size) break;
        if (board[r][c] !== stone) break;
        line.push({ row: r, col: c });
      }

      // 反向延伸
      for (let i = 1; i < 5; i++) {
        const r = row - dr * i;
        const c = col - dc * i;
        if (r < 0 || r >= size || c < 0 || c >= size) break;
        if (board[r][c] !== stone) break;
        line.unshift({ row: r, col: c });
      }

      if (line.length >= 5) {
        return line;
      }
    }

    return null;
  }
}

// 支持 Node.js 和浏览器环境
if (typeof module !== 'undefined' && module.exports) {
  module.exports = GomokuEngine;
}
