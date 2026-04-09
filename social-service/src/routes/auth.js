'use strict';

/**
 * 认证路由：注册/登录
 * POST /api/auth/register  { ownerName, petName }
 * POST /api/auth/login     { userId, token }  (简易 token 认证)
 */

const express = require('express');
const { getDb } = require('../lib/db');
const { makeId, makeFriendCode, nowISO } = require('../lib/id-gen');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// 注册
router.post('/register', (req, res) => {
  const { ownerName, petName } = req.body || {};
  const owner = String(ownerName || '').trim();
  const pet = String(petName || '').trim();

  if (owner.length < 2 || owner.length > 12) {
    return res.json({ success: false, message: 'owner-name-invalid' });
  }
  if (pet.length < 1 || pet.length > 12) {
    return res.json({ success: false, message: 'pet-name-invalid' });
  }

  const db = getDb();
  const now = nowISO();
  const userId = makeId('user');
  const friendCode = makeFriendCode();
  const token = uuidv4();

  try {
    db.prepare(`
      INSERT INTO users (userId, ownerName, petName, friendCode, displayCode, token, status, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, 'online', ?, ?)
    `).run(userId, owner, pet, friendCode, friendCode, token, now, now);

    res.json({
      success: true,
      data: {
        userId,
        ownerName: owner,
        petName: pet,
        friendCode,
        displayCode: friendCode,
        token,
      },
    });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// 登录（用 userId + token）
router.post('/login', (req, res) => {
  const { userId, token } = req.body || {};
  if (!userId || !token) {
    return res.json({ success: false, message: 'credentials-required' });
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE userId = ? AND token = ?').get(userId, token);
  if (!user) {
    return res.json({ success: false, message: 'invalid-credentials' });
  }

  // 更新状态为 online
  const now = nowISO();
  db.prepare('UPDATE users SET status = ?, updatedAt = ? WHERE userId = ?').run('online', now, userId);

  res.json({
    success: true,
    data: {
      userId: user.userId,
      ownerName: user.ownerName,
      petName: user.petName,
      friendCode: user.friendCode,
      displayCode: user.displayCode,
      token: user.token,
    },
  });
});

// 更新资料
router.post('/profile', (req, res) => {
  const userId = req.userId; // 从中间件获取
  if (!userId) return res.json({ success: false, message: 'auth-required' });

  const { ownerName, petName } = req.body || {};
  const db = getDb();
  const now = nowISO();
  const updates = {};

  if (ownerName !== undefined) {
    const v = String(ownerName).trim();
    if (v.length >= 2 && v.length <= 12) updates.ownerName = v;
  }
  if (petName !== undefined) {
    const v = String(petName).trim();
    if (v.length >= 1 && v.length <= 12) updates.petName = v;
  }

  if (Object.keys(updates).length === 0) {
    return res.json({ success: false, message: 'nothing-to-update' });
  }

  const sets = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  const vals = [...Object.values(updates), now, userId];
  db.prepare(`UPDATE users SET ${sets}, updatedAt = ? WHERE userId = ?`).run(...vals);

  const user = db.prepare('SELECT * FROM users WHERE userId = ?').get(userId);
  res.json({ success: true, data: sanitizeUser(user) });
});

function sanitizeUser(user) {
  if (!user) return null;
  return {
    userId: user.userId,
    ownerName: user.ownerName,
    petName: user.petName,
    friendCode: user.friendCode,
    displayCode: user.displayCode,
    status: user.status,
  };
}

module.exports = router;
module.exports.sanitizeUser = sanitizeUser;
