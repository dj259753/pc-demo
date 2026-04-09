'use strict';

/**
 * 状态路由
 * POST /api/presence/status  { userStatus, sessionStatus, statusMessage }
 * GET  /api/presence/status
 */

const express = require('express');
const { getDb } = require('../lib/db');
const { nowISO } = require('../lib/id-gen');
const wsConn = require('../ws/connection');

const router = express.Router();

const ALLOWED_USER_STATUS = new Set(['online', 'busy', 'focus', 'away']);
const ALLOWED_SESSION_STATUS = new Set(['idle', 'visiting', 'in-game']);

// 更新当前用户在线状态
router.post('/status', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.json({ success: false, message: 'auth-required' });

  const { userStatus, sessionStatus, statusMessage } = req.body || {};
  const db = getDb();
  const now = nowISO();

  // 验证并构建更新字段
  let targetUserStatus;
  if (userStatus !== undefined && userStatus !== null) {
    const raw = String(userStatus).trim();
    if (!ALLOWED_USER_STATUS.has(raw)) {
      return res.json({ success: false, message: 'invalid-user-status' });
    }
    targetUserStatus = raw;
  }

  let targetSessionStatus;
  if (sessionStatus !== undefined && sessionStatus !== null) {
    const raw = String(sessionStatus).trim();
    if (!ALLOWED_SESSION_STATUS.has(raw)) {
      return res.json({ success: false, message: 'invalid-session-status' });
    }
    targetSessionStatus = raw;
  } else {
    targetSessionStatus = 'idle';
  }

  // 如果没有传有效状态，直接返回当前状态
  if (!targetUserStatus) {
    const user = db.prepare('SELECT status FROM users WHERE userId = ?').get(userId);
    return res.json({
      success: true,
      data: {
        userStatus: user?.status || 'offline',
        sessionStatus: 'idle',
        statusMessage: String(statusMessage || '').slice(0, 60),
        updatedAt: now,
      },
    });
  }

  // 更新数据库中的用户状态
  db.prepare('UPDATE users SET status = ?, updatedAt = ? WHERE userId = ?').run(targetUserStatus, now, userId);

  const result = {
    userStatus: targetUserStatus,
    sessionStatus: targetSessionStatus || 'idle',
    statusMessage: String(statusMessage || '').slice(0, 60),
    updatedAt: now,
  };

  // 通过 WebSocket 推送状态变更给所有好友
  const { getFriendList } = require('./friends');
  const friends = getFriendList(userId);
  for (const f of friends) {
    wsConn.sendToUser(f.friendUserId, {
      type: 'friend.presence.updated',
      payload: { friendUserId: userId, status: targetUserStatus },
    });
  }

  res.json({ success: true, data: result });
});

// 查询当前用户的在线状态
router.get('/status', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.json({ success: false, message: 'auth-required' });

  const db = getDb();
  const user = db.prepare('SELECT status, updatedAt FROM users WHERE userId = ?').get(userId);

  res.json({
    success: true,
    data: {
      userStatus: user?.status || 'offline',
      sessionStatus: 'idle',
      statusMessage: '',
      updatedAt: user?.updatedAt || new Date().toISOString(),
    },
  });
});

module.exports = router;
