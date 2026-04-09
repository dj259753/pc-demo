'use strict';

/**
 * WebSocket 连接管理器
 * 维护 userId -> ws 映射，负责推送事件给指定用户
 */

const connections = new Map(); // userId -> Set<ws>

function addConnection(userId, ws) {
  if (!connections.has(userId)) {
    connections.set(userId, new Set());
  }
  connections.get(userId).add(ws);
  console.log(`[ws] ${userId} connected (total: ${connections.get(userId).size})`);
}

function removeConnection(userId, ws) {
  const set = connections.get(userId);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) connections.delete(userId);
  console.log(`[ws] ${userId} disconnected (remaining: ${set?.size || 0})`);
}

function sendToUser(userId, event) {
  const set = connections.get(userId);
  if (!set || set.size === 0) return false;
  const data = JSON.stringify(event);
  for (const ws of set) {
    try {
      if (ws.readyState === 1) ws.send(data);
    } catch (e) {
      console.warn(`[ws] send error to ${userId}:`, e.message);
    }
  }
  return true;
}

function sendToUsers(userIds, event) {
  for (const uid of userIds) {
    sendToUser(uid, event);
  }
}

function broadcast(event) {
  const data = JSON.stringify(event);
  for (const [, set] of connections) {
    for (const ws of set) {
      try {
        if (ws.readyState === 1) ws.send(data);
      } catch (e) { /* noop */ }
    }
  }
}

function isOnline(userId) {
  const set = connections.get(userId);
  return !!(set && set.size > 0);
}

function getOnlineUserIds() {
  return [...connections.keys()];
}

module.exports = {
  addConnection,
  removeConnection,
  sendToUser,
  sendToUsers,
  broadcast,
  isOnline,
  getOnlineUserIds,
};
