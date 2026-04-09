'use strict';

/**
 * 拜访路由
 * POST /api/visits/request               { targetUserId, intent, message }
 * POST /api/visits/respond               { visitRequestId, action }
 * POST /api/visits/leave                 { reason }
 * GET  /api/visits/current
 * GET  /api/visits/requests/pending
 * POST /api/visits/game-request          { gameType }
 * POST /api/visits/game-respond          { gameRequestId, action }
 * GET  /api/visits/game-requests/pending
 * GET  /api/visits/game/current
 */

const express = require('express');
const { getDb } = require('../lib/db');
const { makeId, nowISO } = require('../lib/id-gen');
const wsConn = require('../ws/connection');

const router = express.Router();
const GOMOKU_SIZE = 15;

function createEmptyGomokuBoard() {
  return Array.from({ length: GOMOKU_SIZE }, () => Array.from({ length: GOMOKU_SIZE }, () => ''));
}

function createGomokuGameRecord(roomId, now) {
  return {
    gameId: makeId('game'),
    roomId,
    type: 'gomoku',
    status: 'active',
    board: JSON.stringify(createEmptyGomokuBoard()),
    nextStone: 'black',
    winner: '',
    moveCount: 0,
    lastMove: null,
    createdAt: now,
    updatedAt: now,
    finishedAt: null,
  };
}

function getActiveRoom(db, userId) {
  return db.prepare("SELECT * FROM rooms WHERE (hostUserId = ? OR guestUserId = ?) AND roomState = 'active'").get(userId, userId);
}

// 发送拜访申请 / 取消拜访申请
router.post('/request', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.json({ success: false, message: 'auth-required' });

  const { targetUserId, intent, message, action } = req.body || {};

  // ── 取消 pending 的拜访申请 ──
  if (action === 'cancel') {
    const db = getDb();
    const targetId = String(targetUserId || '').trim();
    let where, params;

    if (targetId) {
      // 按 from+target 精确取消（发起方调用）
      where = "fromUserId = ? AND targetUserId = ? AND state = 'pending'";
      params = [userId, targetId];
    } else {
      // 按 fromUserId 批量取消该用户所有发出的 pending 请求
      where = "fromUserId = ? AND state = 'pending'";
      params = [userId];
    }

    const pending = db.prepare(`SELECT * FROM visit_requests WHERE ${where}`).get(...params);
    if (!pending) return res.json({ success: false, message: 'no-pending-request' });

    db.prepare("UPDATE visit_requests SET state = 'cancelled', updatedAt = ? WHERE visitRequestId = ?").run(nowISO(), pending.visitRequestId);

    // 通知对方
    wsConn.sendToUser(pending.targetUserId, {
      type: 'visit.request.updated',
      payload: { visitRequestId: pending.visitRequestId, state: 'cancelled', updatedAt: nowISO() },
    });

    return res.json({ success: true, data: { visitRequestId: pending.visitRequestId, state: 'cancelled' } });
  }

  // ── 创建新的拜访申请 ──
  const targetId = String(targetUserId || '').trim();
  if (!targetId) return res.json({ success: false, message: 'target-required' });

  const db = getDb();
  const target = db.prepare('SELECT * FROM users WHERE userId = ?').get(targetId);
  if (!target) return res.json({ success: false, message: 'user-not-found' });
  if (!wsConn.isOnline(targetId)) return res.json({ success: false, message: 'user-offline' });

  // 检查自己是否已在拜访
  const existingRoom = db.prepare("SELECT * FROM rooms WHERE (hostUserId = ? OR guestUserId = ?) AND roomState = 'active'").get(userId, userId);
  if (existingRoom) return res.json({ success: false, message: 'already-in-visit' });

  // 检查是否有 pending 的申请
  const pending = db.prepare("SELECT * FROM visit_requests WHERE fromUserId = ? AND targetUserId = ? AND state = 'pending'").get(userId, targetId);
  if (pending) return res.json({ success: false, message: 'request-already-pending' });

  const now = nowISO();
  const visitRequestId = makeId('vr');
  // 拜访请求有效期 5 分钟（给对方足够时间看到通知并操作）
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const fromUser = db.prepare('SELECT * FROM users WHERE userId = ?').get(userId);

  db.prepare(`
    INSERT INTO visit_requests (visitRequestId, fromUserId, targetUserId, intent, message, state, createdAt, expiresAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)
  `).run(visitRequestId, userId, targetId, String(intent || 'say-hi').trim(), String(message || '').trim().slice(0, 100), now, expiresAt, now);

  // 推送给对方
  wsConn.sendToUser(targetId, {
    type: 'visit.request.created',
    payload: {
      visitRequestId,
      direction: 'inbound',
      state: 'pending',
      fromUserId: userId,
      fromOwnerName: fromUser?.ownerName || '',
      fromPetName: fromUser?.petName || '',
      targetUserId: targetId,
      intent: String(intent || 'say-hi').trim(),
      message: String(message || '').trim(),
      createdAt: now,
      expiresAt,
    },
  });

  res.json({ success: true, data: { visitRequestId } });
});

// 响应拜访申请
router.post('/respond', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.json({ success: false, message: 'auth-required' });

  const { visitRequestId, action } = req.body || {};
  if (!['accept', 'reject'].includes(action)) {
    return res.json({ success: false, message: 'invalid-action' });
  }

  const db = getDb();
  const request = db.prepare("SELECT * FROM visit_requests WHERE visitRequestId = ? AND targetUserId = ? AND state = 'pending'").get(visitRequestId, userId);
  if (!request) return res.json({ success: false, message: 'request-not-found' });

  // 检查是否超时
  if (new Date(request.expiresAt).getTime() < Date.now()) {
    db.prepare("UPDATE visit_requests SET state = 'expired', updatedAt = ? WHERE visitRequestId = ?").run(nowISO(), visitRequestId);
    return res.json({ success: false, message: 'request-expired' });
  }

  const now = nowISO();
  const newState = action === 'accept' ? 'accepted' : 'rejected';
  db.prepare('UPDATE visit_requests SET state = ?, updatedAt = ? WHERE visitRequestId = ?').run(newState, now, visitRequestId);

  let room = null;
  if (action === 'accept') {
    const roomId = makeId('room');
    const fromUser = db.prepare('SELECT * FROM users WHERE userId = ?').get(request.fromUserId);
    const hostUser = db.prepare('SELECT * FROM users WHERE userId = ?').get(userId);

    db.prepare(`
      INSERT INTO rooms (roomId, hostUserId, guestUserId, sourceRequestId, intent, roomState, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
    `).run(roomId, userId, request.fromUserId, visitRequestId, request.intent, now, now);

    room = {
      roomId,
      hostUserId: userId,
      guestUserId: request.fromUserId,
      guestPetName: fromUser?.petName || '',
      guestOwnerName: fromUser?.ownerName || '',
      hostPetName: hostUser?.petName || '',
      hostOwnerName: hostUser?.ownerName || '',
      sourceRequestId: visitRequestId,
      intent: request.intent,
      roomState: 'active',
      createdAt: now,
    };

    // 推送给双方
    wsConn.sendToUser(request.fromUserId, { type: 'visit.room.updated', payload: { ...room, guestPetName: hostUser?.petName, guestOwnerName: hostUser?.ownerName } });
    wsConn.sendToUser(userId, { type: 'visit.room.updated', payload: room });
  }

  // 通知申请方
  wsConn.sendToUser(request.fromUserId, {
    type: 'visit.request.updated',
    payload: { visitRequestId, state: newState, room, updatedAt: now },
  });

  res.json({ success: true, data: { visitRequestId, state: newState, room } });
});

// 离开拜访
router.post('/leave', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.json({ success: false, message: 'auth-required' });

  const db = getDb();
  const room = db.prepare("SELECT * FROM rooms WHERE (hostUserId = ? OR guestUserId = ?) AND roomState = 'active'").get(userId, userId);
  if (!room) return res.json({ success: false, message: 'not-in-visit' });

  const now = nowISO();
  db.prepare("UPDATE rooms SET roomState = 'closed', closedAt = ?, updatedAt = ? WHERE roomId = ?").run(now, now, room.roomId);
  db.prepare("UPDATE games SET status = 'finished', updatedAt = ?, finishedAt = ? WHERE roomId = ? AND status = 'active'").run(now, now, room.roomId);
  db.prepare("UPDATE game_requests SET state = 'rejected', updatedAt = ? WHERE roomId = ? AND state = 'pending'").run(now, room.roomId);

  // 通知双方
  const otherUserId = room.hostUserId === userId ? room.guestUserId : room.hostUserId;
  wsConn.sendToUser(otherUserId, { type: 'visit.room.updated', payload: null });
  wsConn.sendToUser(userId, { type: 'visit.room.updated', payload: null });
  wsConn.sendToUser(otherUserId, { type: 'visit.game.updated', payload: null });
  wsConn.sendToUser(userId, { type: 'visit.game.updated', payload: null });
  wsConn.sendToUser(otherUserId, { type: 'visit.game.requests.updated', payload: [] });
  wsConn.sendToUser(userId, { type: 'visit.game.requests.updated', payload: [] });

  res.json({ success: true });
});

// 当前房间
router.get('/current', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.json({ success: false, message: 'auth-required' });

  const db = getDb();
  const room = db.prepare("SELECT * FROM rooms WHERE (hostUserId = ? OR guestUserId = ?) AND roomState = 'active'").get(userId, userId);
  if (!room) return res.json({ success: true, data: null });

  const otherUserId = room.hostUserId === userId ? room.guestUserId : room.hostUserId;
  const otherUser = db.prepare('SELECT * FROM users WHERE userId = ?').get(otherUserId);
  const selfUser = db.prepare('SELECT * FROM users WHERE userId = ?').get(userId);

  res.json({
    success: true,
    data: {
      roomId: room.roomId,
      hostUserId: userId,
      guestUserId: otherUserId,
      guestPetName: otherUser?.petName || '',
      guestOwnerName: otherUser?.ownerName || '',
      hostPetName: selfUser?.petName || '',
      hostOwnerName: selfUser?.ownerName || '',
      sourceRequestId: room.sourceRequestId,
      intent: room.intent,
      roomState: room.roomState,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
    },
  });
});

// 待处理的拜访申请（inbound: 收到的 + outbound: 发出的）
router.get('/requests/pending', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.json({ success: false, message: 'auth-required' });

  const db = getDb();

  // inbound：别人发给我的
  const inbound = db.prepare("SELECT * FROM visit_requests WHERE targetUserId = ? AND state = 'pending' ORDER BY createdAt DESC").all(userId).map(r => ({ ...r, direction: 'inbound' }));

  // outbound：我发出的
  const outbound = db.prepare("SELECT * FROM visit_requests WHERE fromUserId = ? AND state = 'pending' ORDER BY createdAt DESC").all(userId).map(r => ({ ...r, direction: 'outbound' }));

  res.json({ success: true, data: [...inbound, ...outbound] });
});

// 查询当前所有活跃的拜访会话（用于判断好友是否在「拜访中」）
router.get('/active-visits', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.json({ success: false, message: 'auth-required' });

  const db = getDb();

  // 自己是否在拜访中
  const myRoom = db.prepare("SELECT * FROM rooms WHERE (hostUserId = ? OR guestUserId = ?) AND roomState = 'active'")
    .get(userId, userId);

  const myVisitStatus = myRoom ? {
    roomId: myRoom.roomId,
    role: myRoom.hostUserId === userId ? 'host' : 'guest',
    otherUserId: myRoom.hostUserId === userId ? myRoom.guestUserId : myRoom.hostUserId,
    since: myRoom.createdAt,
  } : null;

  // 查询我的好友中有谁正在拜访中
  const friendVisits = db.prepare(`
    SELECT r.roomId,
           CASE WHEN r.hostUserId = ? THEN r.guestUserId ELSE r.hostUserId END AS otherUserId,
           CASE WHEN r.hostUserId = ? THEN 'host' ELSE 'guest' END AS myRole,
           r.createdAt AS since
    FROM rooms r
    WHERE r.roomState = 'active'
      AND (r.hostUserId = ? OR r.guestUserId = ?)
  `).all(userId, userId, userId, userId);

  res.json({
    success: true,
    data: {
      myself: myVisitStatus,
      friendsInVisit: friendVisits.map(r => ({
        userId: r.otherUserId,
        role: r.myRole,        // 我是 host 还是 guest
        since: r.since,
      })),
    },
  });
});

// 发送小游戏邀请（当前先支持五子棋）
router.post('/game-request', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.json({ success: false, message: 'auth-required' });

  const gameType = String(req.body?.gameType || 'gomoku').trim().toLowerCase();
  if (gameType !== 'gomoku') return res.json({ success: false, message: 'unsupported-mini-game-type' });

  const db = getDb();
  const room = getActiveRoom(db, userId);
  if (!room) return res.json({ success: false, message: 'visit-room-not-found' });

  const otherUserId = room.hostUserId === userId ? room.guestUserId : room.hostUserId;
  if (!wsConn.isOnline(otherUserId)) return res.json({ success: false, message: 'friend-not-available' });

  const existingGame = db.prepare("SELECT * FROM games WHERE roomId = ? AND status = 'active'").get(room.roomId);
  if (existingGame) return res.json({ success: false, message: 'mini-game-already-active' });

  const existingPending = db.prepare("SELECT * FROM game_requests WHERE roomId = ? AND state = 'pending'").get(room.roomId);
  if (existingPending) return res.json({ success: false, message: 'mini-game-request-already-pending' });

  const now = nowISO();
  const expiresAt = new Date(Date.now() + 60000).toISOString();
  const gameRequestId = makeId('mgr');
  const fromUser = db.prepare('SELECT * FROM users WHERE userId = ?').get(userId);

  db.prepare(`
    INSERT INTO game_requests (gameRequestId, roomId, fromUserId, targetUserId, gameType, state, createdAt, expiresAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)
  `).run(gameRequestId, room.roomId, userId, otherUserId, gameType, now, expiresAt, now);

  const payload = {
    gameRequestId,
    roomId: room.roomId,
    direction: 'inbound',
    state: 'pending',
    gameType,
    fromUserId: userId,
    fromOwnerName: fromUser?.ownerName || '',
    fromPetName: fromUser?.petName || '',
    targetUserId: otherUserId,
    createdAt: now,
    expiresAt,
    updatedAt: now,
  };

  wsConn.sendToUser(otherUserId, { type: 'visit.game.request.created', payload });
  res.json({
    success: true,
    data: {
      gameRequestId,
      roomId: room.roomId,
      gameType,
      request: {
        ...payload,
        direction: 'outbound',
      },
    },
  });
});

// 响应小游戏邀请
router.post('/game-respond', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.json({ success: false, message: 'auth-required' });

  const gameRequestId = String(req.body?.gameRequestId || '').trim();
  const action = String(req.body?.action || '').trim();
  if (!gameRequestId) return res.json({ success: false, message: 'mini-game-request-id-required' });
  if (!['accept', 'reject'].includes(action)) return res.json({ success: false, message: 'invalid-mini-game-request-action' });

  const db = getDb();
  const request = db.prepare("SELECT * FROM game_requests WHERE gameRequestId = ? AND targetUserId = ? AND state = 'pending'").get(gameRequestId, userId);
  if (!request) return res.json({ success: false, message: 'mini-game-request-not-found' });

  if (request.expiresAt && new Date(request.expiresAt).getTime() < Date.now()) {
    db.prepare("UPDATE game_requests SET state = 'expired', updatedAt = ? WHERE gameRequestId = ?").run(nowISO(), gameRequestId);
    return res.json({ success: false, message: 'mini-game-request-expired' });
  }

  const now = nowISO();
  const state = action === 'accept' ? 'accepted' : 'rejected';
  db.prepare('UPDATE game_requests SET state = ?, updatedAt = ? WHERE gameRequestId = ?').run(state, now, gameRequestId);

  const fromUser = db.prepare('SELECT * FROM users WHERE userId = ?').get(request.fromUserId);
  const toUser = db.prepare('SELECT * FROM users WHERE userId = ?').get(userId);

  const requestPayloadForCaller = {
    gameRequestId,
    roomId: request.roomId,
    direction: 'inbound',
    state,
    gameType: request.gameType,
    fromUserId: request.fromUserId,
    fromOwnerName: fromUser?.ownerName || '',
    fromPetName: fromUser?.petName || '',
    targetUserId: userId,
    updatedAt: now,
  };
  const requestPayloadForRequester = {
    gameRequestId,
    roomId: request.roomId,
    direction: 'outbound',
    state,
    gameType: request.gameType,
    fromUserId: request.fromUserId,
    fromOwnerName: fromUser?.ownerName || '',
    fromPetName: fromUser?.petName || '',
    targetUserId: userId,
    targetOwnerName: toUser?.ownerName || '',
    targetPetName: toUser?.petName || '',
    updatedAt: now,
  };

  let game = null;
  let event = null;
  if (action === 'accept') {
    const gameRow = createGomokuGameRecord(request.roomId, now);
    db.prepare(`
      INSERT INTO games (gameId, roomId, type, status, board, nextStone, winner, moveCount, lastMove, createdAt, updatedAt, finishedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(gameRow.gameId, gameRow.roomId, gameRow.type, gameRow.status, gameRow.board, gameRow.nextStone, gameRow.winner, gameRow.moveCount, gameRow.lastMove, gameRow.createdAt, gameRow.updatedAt, gameRow.finishedAt);

    game = {
      gameId: gameRow.gameId,
      roomId: gameRow.roomId,
      type: gameRow.type,
      status: gameRow.status,
      board: JSON.parse(gameRow.board),
      nextStone: gameRow.nextStone,
      winner: '',
      moveCount: 0,
      lastMove: null,
      createdAt: gameRow.createdAt,
      updatedAt: gameRow.updatedAt,
      finishedAt: null,
    };

    event = {
      eventId: makeId('ge'),
      roomId: request.roomId,
      gameId: game.gameId,
      gameType: request.gameType,
      kind: 'started',
      actorUserId: userId,
      createdAt: now,
      payload: { nextStone: game.nextStone },
    };

    wsConn.sendToUser(request.fromUserId, { type: 'visit.game.updated', payload: game });
    wsConn.sendToUser(userId, { type: 'visit.game.updated', payload: game });
    wsConn.sendToUser(request.fromUserId, { type: 'visit.game.event', payload: event });
    wsConn.sendToUser(userId, { type: 'visit.game.event', payload: event });
  }

  wsConn.sendToUser(request.fromUserId, { type: 'visit.game.request.updated', payload: requestPayloadForRequester });
  wsConn.sendToUser(userId, { type: 'visit.game.request.updated', payload: requestPayloadForCaller });

  res.json({ success: true, data: { request: requestPayloadForCaller, game, event } });
});

// 待处理的小游戏邀请
router.get('/game-requests/pending', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.json({ success: false, message: 'auth-required' });

  const db = getDb();
  const requests = db.prepare(`
    SELECT gr.*, u.ownerName AS fromOwnerName, u.petName AS fromPetName
    FROM game_requests gr
    LEFT JOIN users u ON u.userId = gr.fromUserId
    WHERE gr.targetUserId = ? AND gr.state = 'pending'
    ORDER BY gr.createdAt DESC
  `).all(userId).map((item) => ({
    ...item,
    direction: 'inbound',
  }));

  res.json({ success: true, data: requests });
});

// 当前棋局
router.get('/game/current', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.json({ success: false, message: 'auth-required' });

  const db = getDb();
  const room = getActiveRoom(db, userId);
  if (!room) return res.json({ success: true, data: null });

  const game = db.prepare("SELECT * FROM games WHERE roomId = ? AND status = 'active'").get(room.roomId);
  if (!game) return res.json({ success: true, data: null });

  res.json({
    success: true,
    data: {
      gameId: game.gameId,
      roomId: game.roomId,
      type: game.type,
      status: game.status,
      board: JSON.parse(game.board || '[]'),
      nextStone: game.nextStone,
      winner: game.winner || '',
      moveCount: Number(game.moveCount || 0),
      lastMove: game.lastMove ? JSON.parse(game.lastMove) : null,
      createdAt: game.createdAt,
      updatedAt: game.updatedAt,
      finishedAt: game.finishedAt || null,
    },
  });
});

module.exports = router;
