'use strict';

/**
 * ID 生成工具
 */
const { v4: uuidv4 } = require('uuid');

function makeId(prefix = 'id') {
  return `${prefix}_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
}

function makeFriendCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const pick = () => chars[Math.floor(Math.random() * chars.length)];
  return `QP-${pick()}${pick()}${pick()}${pick()}-${pick()}${pick()}`;
}

function nowISO() {
  return new Date().toISOString();
}

module.exports = { makeId, makeFriendCode, nowISO };
