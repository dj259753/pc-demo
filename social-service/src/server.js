'use strict';

/**
 * QQ Pet Social Service — 入口
 * Express REST + WebSocket
 */

const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');
const { getDb } = require('./lib/db');
const wsConn = require('./ws/connection');

const authRouter = require('./routes/auth');
const friendsRouter = require('./routes/friends');
const visitsRouter = require('./routes/visits');
const presenceRouter = require('./routes/presence');
const usersRouter = require('./routes/users');

const PORT = process.env.PORT || 3210;
const app = express();
const server = http.createServer(app);

// ─── 中间件 ───
app.use(express.json({ limit: '1mb' }));

// CORS（允许所有来源，先不上域名限制）
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-User-Id, X-Token');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// 简易认证中间件：从 header 提取 userId
app.use((req, res, next) => {
  const userId = req.headers['x-user-id'] || '';
  const token = req.headers['x-token'] || '';
  if (userId && token) {
    const db = getDb();
    const user = db.prepare('SELECT userId FROM users WHERE userId = ? AND token = ?').get(userId, token);
    if (user) {
      req.userId = user.userId;
    }
  }
  next();
});

// ─── REST 路由 ───
app.use('/api/auth', authRouter);
app.use('/api/friends', friendsRouter);
app.use('/api/visits', visitsRouter);
app.use('/api/presence', presenceRouter);
app.use('/api/users', usersRouter);

// 健康检查
app.get('/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString(), online: wsConn.getOnlineUserIds().length });
});

const GOMOKU_SIZE = 15;

function createEmptyGomokuBoard() {
  return Array.from({ length: GOMOKU_SIZE }, () => Array.from({ length: GOMOKU_SIZE }, () => ''));
}

function countDirection(board, row, col, deltaRow, deltaCol, stone) {
  let total = 0;
  let r = row + deltaRow;
  let c = col + deltaCol;
  while (r >= 0 && r < GOMOKU_SIZE && c >= 0 && c < GOMOKU_SIZE && board[r]?.[c] === stone) {
    total += 1;
    r += deltaRow;
    c += deltaCol;
  }
  return total;
}

function resolveWinner(board, row, col, stone) {
  const directions = [
    [[0, -1], [0, 1]],
    [[-1, 0], [1, 0]],
    [[-1, -1], [1, 1]],
    [[-1, 1], [1, -1]],
  ];
  return directions.some((pair) => {
    const total = 1 + pair.reduce((sum, [dr, dc]) => sum + countDirection(board, row, col, dr, dc, stone), 0);
    return total >= 5;
  });
}

function broadcastRoomGameState(room, game, event) {
  if (!room) return;
  const users = [room.hostUserId, room.guestUserId].filter(Boolean);
  users.forEach((userId) => {
    wsConn.sendToUser(userId, { type: 'visit.game.updated', payload: game || null });
    if (event) wsConn.sendToUser(userId, { type: 'visit.game.event', payload: event });
  });
}

// ─── WebSocket ───
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  let authenticatedUserId = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    // 第一条消息必须是认证
    if (msg.type === 'auth') {
      const { userId, token } = msg;
      if (!userId || !token) {
        ws.send(JSON.stringify({ type: 'auth.error', message: 'credentials-required' }));
        return;
      }
      const db = getDb();
      const user = db.prepare('SELECT userId FROM users WHERE userId = ? AND token = ?').get(userId, token);
      if (!user) {
        ws.send(JSON.stringify({ type: 'auth.error', message: 'invalid-credentials' }));
        return;
      }
      authenticatedUserId = userId;
      wsConn.addConnection(userId, ws);
      ws.send(JSON.stringify({ type: 'auth.ok', userId }));

      // 更新用户在线状态
      db.prepare("UPDATE users SET status = 'online', updatedAt = ? WHERE userId = ?").run(new Date().toISOString(), userId);

      // 通知好友上线
      const { getFriendList } = require('./routes/friends');
      const friends = getFriendList(userId);
      for (const f of friends) {
        wsConn.sendToUser(f.friendUserId, {
          type: 'friend.presence.updated',
          payload: { friendUserId: userId, status: 'online' },
        });
      }

      // 广播在线用户池变更（让所有在线客户端刷新大厅）
      wsConn.broadcast({ type: 'users.online.updated' });
      return;
    }

    // 心跳
    if (msg.type === 'ping') {
      ws.send(JSON.stringify({ type: 'pong', time: new Date().toISOString() }));
      return;
    }

    // 拜访互动事件转发
    if (msg.type === 'visit.interaction' && authenticatedUserId) {
      const db = getDb();
      const room = db.prepare("SELECT * FROM rooms WHERE (hostUserId = ? OR guestUserId = ?) AND roomState = 'active'").get(authenticatedUserId, authenticatedUserId);
      if (room) {
        const otherUserId = room.hostUserId === authenticatedUserId ? room.guestUserId : room.hostUserId;
        wsConn.sendToUser(otherUserId, {
          type: 'visit.interaction',
          payload: {
            ...msg.payload,
            actorUserId: authenticatedUserId,
            roomId: room.roomId,
          },
        });
      }
      return;
    }

    // 五子棋状态同步：start / move / reset
    if (msg.type === 'visit.game.event' && authenticatedUserId) {
      const db = getDb();
      const room = db.prepare("SELECT * FROM rooms WHERE (hostUserId = ? OR guestUserId = ?) AND roomState = 'active'").get(authenticatedUserId, authenticatedUserId);
      if (!room) return;

      const kind = String(msg.payload?.kind || '').trim();
      const now = new Date().toISOString();
      let gameRow = db.prepare("SELECT * FROM games WHERE roomId = ? AND status = 'active'").get(room.roomId);
      let game = null;
      let event = null;

      if (kind === 'start') {
        if (!gameRow) {
          const gameId = `game_${Date.now().toString(16)}_${Math.random().toString(16).slice(2, 8)}`;
          const board = JSON.stringify(createEmptyGomokuBoard());
          db.prepare(`
            INSERT INTO games (gameId, roomId, type, status, board, nextStone, winner, moveCount, lastMove, createdAt, updatedAt, finishedAt)
            VALUES (?, ?, 'gomoku', 'active', ?, 'black', '', 0, NULL, ?, ?, NULL)
          `).run(gameId, room.roomId, board, now, now);
          gameRow = db.prepare("SELECT * FROM games WHERE gameId = ?").get(gameId);
        }

        game = {
          gameId: gameRow.gameId,
          roomId: gameRow.roomId,
          type: gameRow.type,
          status: gameRow.status,
          board: JSON.parse(gameRow.board || '[]'),
          nextStone: gameRow.nextStone,
          winner: gameRow.winner || '',
          moveCount: Number(gameRow.moveCount || 0),
          lastMove: gameRow.lastMove ? JSON.parse(gameRow.lastMove) : null,
          createdAt: gameRow.createdAt,
          updatedAt: gameRow.updatedAt,
          finishedAt: gameRow.finishedAt || null,
        };

        event = {
          eventId: `ge_${Date.now().toString(16)}_${Math.random().toString(16).slice(2, 8)}`,
          roomId: room.roomId,
          gameId: game.gameId,
          gameType: 'gomoku',
          kind: 'started',
          actorUserId: authenticatedUserId,
          createdAt: now,
          payload: { nextStone: game.nextStone },
        };
        broadcastRoomGameState(room, game, event);
      }

      if (kind === 'move') {
        if (!gameRow) return;
        const row = Number(msg.payload?.row);
        const col = Number(msg.payload?.col);
        if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row >= GOMOKU_SIZE || col < 0 || col >= GOMOKU_SIZE) return;

        const board = JSON.parse(gameRow.board || '[]');
        if (!board[row] || board[row][col]) return;

        const stone = gameRow.nextStone === 'white' ? 'white' : 'black';
        board[row][col] = stone;
        const moveCount = Number(gameRow.moveCount || 0) + 1;
        const winner = resolveWinner(board, row, col, stone) ? stone : (moveCount >= GOMOKU_SIZE * GOMOKU_SIZE ? 'draw' : '');
        const nextStone = winner ? '' : (stone === 'black' ? 'white' : 'black');
        const status = winner ? 'finished' : 'active';
        const lastMove = JSON.stringify({ row, col, stone, at: now });
        db.prepare(`
          UPDATE games
          SET board = ?, moveCount = ?, winner = ?, nextStone = ?, status = ?, lastMove = ?, updatedAt = ?, finishedAt = ?
          WHERE gameId = ?
        `).run(JSON.stringify(board), moveCount, winner, nextStone, status, lastMove, now, winner ? now : null, gameRow.gameId);

        const updated = db.prepare("SELECT * FROM games WHERE gameId = ?").get(gameRow.gameId);
        game = {
          gameId: updated.gameId,
          roomId: updated.roomId,
          type: updated.type,
          status: updated.status,
          board: JSON.parse(updated.board || '[]'),
          nextStone: updated.nextStone,
          winner: updated.winner || '',
          moveCount: Number(updated.moveCount || 0),
          lastMove: updated.lastMove ? JSON.parse(updated.lastMove) : null,
          createdAt: updated.createdAt,
          updatedAt: updated.updatedAt,
          finishedAt: updated.finishedAt || null,
        };
        event = {
          eventId: `ge_${Date.now().toString(16)}_${Math.random().toString(16).slice(2, 8)}`,
          roomId: room.roomId,
          gameId: updated.gameId,
          gameType: 'gomoku',
          kind: winner ? 'finished' : 'move',
          actorUserId: authenticatedUserId,
          createdAt: now,
          payload: { row, col, stone, nextStone, winner, moveCount },
        };
        broadcastRoomGameState(room, game, event);
      }

      if (kind === 'reset') {
        if (!gameRow) return;
        const board = JSON.stringify(createEmptyGomokuBoard());
        db.prepare(`
          UPDATE games
          SET status = 'active', board = ?, nextStone = 'black', winner = '', moveCount = 0, lastMove = NULL, updatedAt = ?, finishedAt = NULL
          WHERE gameId = ?
        `).run(board, now, gameRow.gameId);
        const updated = db.prepare("SELECT * FROM games WHERE gameId = ?").get(gameRow.gameId);
        game = {
          gameId: updated.gameId,
          roomId: updated.roomId,
          type: updated.type,
          status: updated.status,
          board: JSON.parse(updated.board || '[]'),
          nextStone: updated.nextStone,
          winner: updated.winner || '',
          moveCount: Number(updated.moveCount || 0),
          lastMove: null,
          createdAt: updated.createdAt,
          updatedAt: updated.updatedAt,
          finishedAt: null,
        };
        event = {
          eventId: `ge_${Date.now().toString(16)}_${Math.random().toString(16).slice(2, 8)}`,
          roomId: room.roomId,
          gameId: updated.gameId,
          gameType: 'gomoku',
          kind: 'reset',
          actorUserId: authenticatedUserId,
          createdAt: now,
          payload: { nextStone: 'black' },
        };
        broadcastRoomGameState(room, game, event);
      }
      return;
    }
  });

  ws.on('close', () => {
    if (authenticatedUserId) {
      wsConn.removeConnection(authenticatedUserId, ws);

      // 如果该用户没有其他连接了，标记离线
      if (!wsConn.isOnline(authenticatedUserId)) {
        const db = getDb();
        db.prepare("UPDATE users SET status = 'offline', updatedAt = ? WHERE userId = ?").run(new Date().toISOString(), authenticatedUserId);

        // 通知好友下线
        const { getFriendList } = require('./routes/friends');
        const friends = getFriendList(authenticatedUserId);
        for (const f of friends) {
          wsConn.sendToUser(f.friendUserId, {
            type: 'friend.presence.updated',
            payload: { friendUserId: authenticatedUserId, status: 'offline' },
          });
        }

        // 广播在线用户池变更
        wsConn.broadcast({ type: 'users.online.updated' });
      }
    }
  });

  ws.on('error', (err) => {
    console.warn('[ws] error:', err.message);
  });
});

// ─── 启动 ───
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🐾 QQ Pet Social Service running on port ${PORT}`);
  console.log(`   REST: http://0.0.0.0:${PORT}/api`);
  console.log(`   WS:   ws://0.0.0.0:${PORT}/ws`);
  console.log(`   Health: http://0.0.0.0:${PORT}/health`);
});

process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...');
  const { close } = require('./lib/db');
  close();
  server.close();
  process.exit(0);
});
