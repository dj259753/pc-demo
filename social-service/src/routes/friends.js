'use strict';

/**
 * 好友路由
 * POST /api/friends/request       { targetCode, message }
 * POST /api/friends/respond        { requestId, action }
 * GET  /api/friends/list
 * GET  /api/friends/requests
 */

const express = require('express');
const { getDb } = require('../lib/db');
const { makeId, nowISO } = require('../lib/id-gen');
const { sanitizeUser } = require('./auth');
const wsConn = require('../ws/connection');

const router = express.Router();

// 发送好友申请
router.post('/request', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.json({ success: false, message: 'auth-required' });

  const { targetCode, message } = req.body || {};
  const code = String(targetCode || '').trim().toUpperCase();
  if (!/^QP-[A-Z2-9]{4}-[A-Z2-9]{2}$/.test(code)) {
    return res.json({ success: false, message: 'invalid-friend-code' });
  }

  const db = getDb();
  const targetUser = db.prepare('SELECT * FROM users WHERE friendCode = ?').get(code);
  if (!targetUser) {
    return res.json({ success: false, message: 'user-not-found' });
  }
  if (targetUser.userId === userId) {
    return res.json({ success: false, message: 'cannot-add-self' });
  }

  // 检查是否已是好友
  const existing = db.prepare(
    'SELECT * FROM friends WHERE (userIdA = ? AND userIdB = ?) OR (userIdA = ? AND userIdB = ?)'
  ).get(userId, targetUser.userId, targetUser.userId, userId);
  if (existing) {
    return res.json({ success: false, message: 'already-friends' });
  }

  // 检查是否有 pending 申请
  const pendingReq = db.prepare(
    "SELECT * FROM friend_requests WHERE fromUserId = ? AND toFriendCode = ? AND state = 'pending'"
  ).get(userId, code);
  if (pendingReq) {
    return res.json({ success: false, message: 'request-already-pending' });
  }

  const now = nowISO();
  const requestId = makeId('fr');
  db.prepare(`
    INSERT INTO friend_requests (requestId, fromUserId, toUserId, toFriendCode, message, state, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
  `).run(requestId, userId, targetUser.userId, code, String(message || '').trim().slice(0, 100), now, now);

  const fromUser = db.prepare('SELECT * FROM users WHERE userId = ?').get(userId);

  // 推送给对方
  wsConn.sendToUser(targetUser.userId, {
    type: 'friends.request.created',
    payload: {
      requestId,
      direction: 'inbound',
      fromUserId: userId,
      fromOwnerName: fromUser?.ownerName || '',
      fromPetName: fromUser?.petName || '',
      fromFriendCode: fromUser?.friendCode || '',
      message: String(message || '').trim(),
      state: 'pending',
      createdAt: now,
    },
  });

  res.json({ success: true, data: { requestId } });
});

// 响应好友申请
router.post('/respond', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.json({ success: false, message: 'auth-required' });

  const { requestId, action } = req.body || {};
  if (!['accept', 'reject'].includes(action)) {
    return res.json({ success: false, message: 'invalid-action' });
  }

  const db = getDb();
  const request = db.prepare("SELECT * FROM friend_requests WHERE requestId = ? AND toUserId = ? AND state = 'pending'").get(requestId, userId);
  if (!request) {
    return res.json({ success: false, message: 'request-not-found' });
  }

  const now = nowISO();
  const newState = action === 'accept' ? 'accepted' : 'rejected';
  db.prepare('UPDATE friend_requests SET state = ?, updatedAt = ? WHERE requestId = ?').run(newState, now, requestId);

  if (action === 'accept') {
    const relationId = makeId('rel');
    try {
      db.prepare(`
        INSERT INTO friends (relationId, userIdA, userIdB, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?)
      `).run(relationId, request.fromUserId, userId, now, now);
    } catch (e) {
      // 已存在，忽略
    }

    // 通知双方好友列表更新
    const friendsA = getFriendList(request.fromUserId);
    const friendsB = getFriendList(userId);
    wsConn.sendToUser(request.fromUserId, { type: 'friends.list.updated', payload: friendsA });
    wsConn.sendToUser(userId, { type: 'friends.list.updated', payload: friendsB });
  }

  // 通知申请方
  wsConn.sendToUser(request.fromUserId, {
    type: 'friends.request.updated',
    payload: { requestId, state: newState, updatedAt: now },
  });

  res.json({ success: true, data: { requestId, state: newState } });
});

// 获取好友列表
router.get('/list', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.json({ success: false, message: 'auth-required' });

  res.json({ success: true, data: { friends: getFriendList(userId) } });
});

// 获取好友申请
router.get('/requests', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.json({ success: false, message: 'auth-required' });

  const db = getDb();
  const requests = db.prepare(
    "SELECT * FROM friend_requests WHERE (fromUserId = ? OR toUserId = ?) AND state = 'pending' ORDER BY createdAt DESC"
  ).all(userId, userId);

  const result = requests.map(r => ({
    requestId: r.requestId,
    direction: r.fromUserId === userId ? 'outbound' : 'inbound',
    state: r.state,
    fromUserId: r.fromUserId,
    toUserId: r.toUserId,
    toFriendCode: r.toFriendCode,
    message: r.message,
    createdAt: r.createdAt,
  }));

  res.json({ success: true, data: result });
});

function getFriendList(userId) {
  const db = getDb();
  const rows = db.prepare(`
    SELECT f.*, u.userId as fUserId, u.ownerName, u.petName, u.friendCode, u.status
    FROM friends f
    JOIN users u ON (u.userId = CASE WHEN f.userIdA = ? THEN f.userIdB ELSE f.userIdA END)
    WHERE f.userIdA = ? OR f.userIdB = ?
  `).all(userId, userId, userId);

  return rows.map(r => ({
    relationId: r.relationId,
    friendUserId: r.fUserId,
    ownerName: r.ownerName,
    petName: r.petName,
    friendCode: r.friendCode,
    status: wsConn.isOnline(r.fUserId) ? (r.status || 'online') : 'offline',
    isBlocked: !!r.isBlocked,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

module.exports = router;
module.exports.getFriendList = getFriendList;
