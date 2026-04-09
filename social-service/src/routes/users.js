'use strict';

/**
 * 用户发现路由
 * GET /api/users/online  — 获取所有在线用户（含好友关系标注）
 */

const express = require('express');
const { getDb } = require('../lib/db');
const wsConn = require('../ws/connection');

const router = express.Router();

// 在线用户池：返回当前所有在线用户，标注与请求方的好友关系
router.get('/online', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.json({ success: false, message: 'auth-required' });

  const db = getDb();
  const onlineIds = wsConn.getOnlineUserIds();

  // 查自己的好友集合（O(1) 查询用）
  const friendRows = db.prepare(`
    SELECT CASE WHEN userIdA = ? THEN userIdB ELSE userIdA END as fId
    FROM friends WHERE userIdA = ? OR userIdB = ?
  `).all(userId, userId, userId);
  const friendSet = new Set(friendRows.map(r => r.fId));

  // 查待处理的好友申请（我发出的）
  const pendingOut = db.prepare(
    "SELECT toUserId FROM friend_requests WHERE fromUserId = ? AND state = 'pending'"
  ).all(userId);
  const pendingOutSet = new Set(pendingOut.map(r => r.toUserId));

  // 查待处理的好友申请（发给我的）
  const pendingIn = db.prepare(
    "SELECT fromUserId FROM friend_requests WHERE toUserId = ? AND state = 'pending'"
  ).all(userId);
  const pendingInSet = new Set(pendingIn.map(r => r.fromUserId));

  // 批量查用户信息
  if (onlineIds.length === 0) {
    return res.json({ success: true, data: { users: [] } });
  }

  const placeholders = onlineIds.map(() => '?').join(',');
  const users = db.prepare(
    `SELECT userId, ownerName, petName, friendCode, displayCode, status FROM users WHERE userId IN (${placeholders})`
  ).all(...onlineIds);

  const result = users
    .filter(u => u.userId !== userId) // 排除自己
    .map(u => ({
      userId: u.userId,
      ownerName: u.ownerName,
      petName: u.petName,
      friendCode: u.friendCode,
      displayCode: u.displayCode,
      status: u.status || 'online',
      relation: friendSet.has(u.userId)
        ? 'friend'
        : pendingOutSet.has(u.userId)
        ? 'pending-out'
        : pendingInSet.has(u.userId)
        ? 'pending-in'
        : 'stranger',
    }));

  res.json({ success: true, data: { users: result } });
});

module.exports = router;
