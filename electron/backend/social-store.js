'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const SOCIAL_ROOT = path.join(os.homedir(), '.qq-pet', 'social');
const STORE_FILE = path.join(SOCIAL_ROOT, 'social-store.json');

function nowISO() {
  return new Date().toISOString();
}

function createDefaultStore() {
  const now = nowISO();
  return {
    version: 3,
    createdAt: now,
    updatedAt: now,
    identity: null,
    friends: [],
    requests: [],
    presence: {
      userStatus: 'offline',
      sessionStatus: 'idle',
      statusMessage: '',
      updatedAt: now,
    },
    visitRoom: null,
    lastVisitInteraction: null,
    visitRequests: [],
    miniGameRequests: [],
    currentGame: null,
    lastGameEvent: null,
    featureFlags: {},
  };
}

function ensureStoreFile() {
  if (!fs.existsSync(SOCIAL_ROOT)) {
    fs.mkdirSync(SOCIAL_ROOT, { recursive: true });
  }
  if (!fs.existsSync(STORE_FILE)) {
    fs.writeFileSync(STORE_FILE, JSON.stringify(createDefaultStore(), null, 2), 'utf8');
  }
}

function readStore() {
  ensureStoreFile();
  try {
    const raw = fs.readFileSync(STORE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') throw new Error('invalid-store-shape');
    return {
      ...createDefaultStore(),
      ...parsed,
      presence: {
        ...createDefaultStore().presence,
        ...(parsed.presence || {}),
      },
      friends: Array.isArray(parsed.friends) ? parsed.friends : [],
      requests: Array.isArray(parsed.requests) ? parsed.requests : [],
      visitRequests: Array.isArray(parsed.visitRequests) ? parsed.visitRequests : [],
      miniGameRequests: Array.isArray(parsed.miniGameRequests) ? parsed.miniGameRequests : [],
      currentGame: parsed.currentGame && typeof parsed.currentGame === 'object' ? parsed.currentGame : null,
      lastGameEvent: parsed.lastGameEvent && typeof parsed.lastGameEvent === 'object' ? parsed.lastGameEvent : null,
    };
  } catch (err) {
    const fallback = createDefaultStore();
    fs.writeFileSync(STORE_FILE, JSON.stringify(fallback, null, 2), 'utf8');
    return fallback;
  }
}

function writeStore(nextStore) {
  ensureStoreFile();
  const finalStore = {
    ...nextStore,
    updatedAt: nowISO(),
  };
  fs.writeFileSync(STORE_FILE, JSON.stringify(finalStore, null, 2), 'utf8');
  return finalStore;
}

function mutateStore(mutator) {
  const current = readStore();
  const draft = JSON.parse(JSON.stringify(current));
  mutator(draft);
  return writeStore(draft);
}

module.exports = {
  SOCIAL_ROOT,
  STORE_FILE,
  createDefaultStore,
  ensureStoreFile,
  readStore,
  writeStore,
  mutateStore,
};