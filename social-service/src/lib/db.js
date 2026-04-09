'use strict';

/**
 * SQLite 数据库初始化
 */
const Database = require('better-sqlite3');
const path = require('path');

let db = null;

function getDb() {
  if (db) return db;
  const dbPath = path.join(__dirname, '..', '..', 'data', 'social.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  initTables();
  return db;
}

function initTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      userId TEXT PRIMARY KEY,
      ownerName TEXT NOT NULL,
      petName TEXT NOT NULL,
      friendCode TEXT UNIQUE NOT NULL,
      displayCode TEXT NOT NULL,
      token TEXT,
      status TEXT DEFAULT 'offline',
      statusMessage TEXT DEFAULT '',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS friends (
      relationId TEXT PRIMARY KEY,
      userIdA TEXT NOT NULL,
      userIdB TEXT NOT NULL,
      alias TEXT DEFAULT '',
      isBlocked INTEGER DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      UNIQUE(userIdA, userIdB)
    );

    CREATE TABLE IF NOT EXISTS friend_requests (
      requestId TEXT PRIMARY KEY,
      fromUserId TEXT NOT NULL,
      toUserId TEXT,
      toFriendCode TEXT,
      message TEXT DEFAULT '',
      state TEXT DEFAULT 'pending',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS visit_requests (
      visitRequestId TEXT PRIMARY KEY,
      fromUserId TEXT NOT NULL,
      targetUserId TEXT NOT NULL,
      intent TEXT DEFAULT 'say-hi',
      message TEXT DEFAULT '',
      state TEXT DEFAULT 'pending',
      createdAt TEXT NOT NULL,
      expiresAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rooms (
      roomId TEXT PRIMARY KEY,
      hostUserId TEXT NOT NULL,
      guestUserId TEXT NOT NULL,
      sourceRequestId TEXT,
      intent TEXT DEFAULT 'say-hi',
      roomState TEXT DEFAULT 'active',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      closedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS games (
      gameId TEXT PRIMARY KEY,
      roomId TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'gomoku',
      status TEXT DEFAULT 'active',
      board TEXT DEFAULT '[]',
      nextStone TEXT DEFAULT 'black',
      winner TEXT DEFAULT '',
      moveCount INTEGER DEFAULT 0,
      lastMove TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      finishedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS game_requests (
      gameRequestId TEXT PRIMARY KEY,
      roomId TEXT NOT NULL,
      fromUserId TEXT NOT NULL,
      targetUserId TEXT NOT NULL,
      gameType TEXT NOT NULL DEFAULT 'gomoku',
      state TEXT DEFAULT 'pending',
      createdAt TEXT NOT NULL,
      expiresAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_friends_userA ON friends(userIdA);
    CREATE INDEX IF NOT EXISTS idx_friends_userB ON friends(userIdB);
    CREATE INDEX IF NOT EXISTS idx_friend_requests_to ON friend_requests(toFriendCode);
    CREATE INDEX IF NOT EXISTS idx_visit_requests_target ON visit_requests(targetUserId, state);
    CREATE INDEX IF NOT EXISTS idx_rooms_host ON rooms(hostUserId, roomState);
    CREATE INDEX IF NOT EXISTS idx_rooms_guest ON rooms(guestUserId, roomState);
    CREATE INDEX IF NOT EXISTS idx_game_requests_target ON game_requests(targetUserId, state);
    CREATE INDEX IF NOT EXISTS idx_game_requests_room ON game_requests(roomId, state);
  `);
}

function close() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { getDb, close };
