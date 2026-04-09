'use strict';

const http = require('http');
const crypto = require('crypto');
const { URL } = require('url');
const { socialEvents } = require('./social-events');

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 0;
const DEFAULT_POLL_INTERVAL = 1500;
const MAX_EVENT_BUFFER = 1000;

function randomToken() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '');
  }
  return crypto.randomBytes(16).toString('hex');
}

function nowISO() {
  return new Date().toISOString();
}

function toInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.floor(n));
}

class SocialRemoteMockServer {
  constructor({ socialClient, host = DEFAULT_HOST, port = DEFAULT_PORT, pollIntervalMs = DEFAULT_POLL_INTERVAL } = {}) {
    if (!socialClient) {
      throw new Error('social-client-required');
    }

    this.socialClient = socialClient;
    this.host = host;
    this.port = port;
    this.pollIntervalMs = Math.max(500, Number(pollIntervalMs) || DEFAULT_POLL_INTERVAL);
    this.token = randomToken();

    this.server = null;
    this.running = false;
    this.baseURL = '';

    this.cursor = 0;
    this.events = [];

    this.onSocialEvent = this.onSocialEvent.bind(this);
    this.requestHandler = this.requestHandler.bind(this);
  }

  async start() {
    if (this.running && this.server) {
      return this.getInfo();
    }

    this.server = http.createServer(this.requestHandler);

    await new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.port, this.host, () => {
        this.server.removeListener('error', reject);
        resolve();
      });
    });

    const addr = this.server.address();
    const listenPort = addr && typeof addr === 'object' ? addr.port : this.port;
    this.baseURL = `http://${this.host}:${listenPort}/v1`;
    this.running = true;

    socialEvents.on('social-event', this.onSocialEvent);

    return this.getInfo();
  }

  async stop() {
    if (!this.server) {
      this.running = false;
      return;
    }

    socialEvents.off('social-event', this.onSocialEvent);

    const activeServer = this.server;
    this.server = null;

    await new Promise((resolve) => {
      try {
        activeServer.close(() => resolve());
      } catch (_err) {
        resolve();
      }
    });

    this.running = false;
    this.baseURL = '';
  }

  getInfo() {
    return {
      running: this.running,
      baseURL: this.baseURL,
      token: this.token,
      pollIntervalMs: this.pollIntervalMs,
      serverTime: nowISO(),
    };
  }

  onSocialEvent(evt = {}) {
    this.cursor += 1;
    this.events.push({
      cursor: this.cursor,
      event: {
        type: evt.type,
        payload: evt.payload,
        at: evt.at || nowISO(),
      },
    });

    if (this.events.length > MAX_EVENT_BUFFER) {
      this.events.splice(0, this.events.length - MAX_EVENT_BUFFER);
    }
  }

  setCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Social-Mock-Token');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  }

  sendJson(res, statusCode, payload) {
    this.setCorsHeaders(res);
    res.writeHead(statusCode, {
      'Content-Type': 'application/json; charset=utf-8',
    });
    res.end(JSON.stringify(payload));
  }

  unauthorized(res) {
    this.sendJson(res, 401, {
      success: false,
      message: 'unauthorized-social-mock-token',
    });
  }

  notFound(res) {
    this.sendJson(res, 404, {
      success: false,
      message: 'social-mock-route-not-found',
    });
  }

  async parseBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        if (chunks.length === 0) {
          resolve({});
          return;
        }

        try {
          const raw = Buffer.concat(chunks).toString('utf8');
          if (!raw.trim()) {
            resolve({});
            return;
          }
          resolve(JSON.parse(raw));
        } catch (err) {
          reject(new Error('invalid-json-body'));
        }
      });
      req.on('error', reject);
    });
  }

  async withHandler(res, handler) {
    try {
      const data = await handler();
      this.sendJson(res, 200, {
        success: true,
        data,
      });
    } catch (err) {
      this.sendJson(res, 200, {
        success: false,
        message: err && err.message ? err.message : String(err),
      });
    }
  }

  checkAuth(req) {
    const token = String(req.headers['x-social-mock-token'] || '').trim();
    return token && token === this.token;
  }

  async requestHandler(req, res) {
    this.setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const requestURL = new URL(req.url, `${this.baseURL || 'http://127.0.0.1'}`);
    const pathname = requestURL.pathname;
    const method = String(req.method || 'GET').toUpperCase();

    if (pathname === '/health') {
      this.sendJson(res, 200, {
        success: true,
        data: {
          service: 'social-remote-mock',
          running: this.running,
          serverTime: nowISO(),
        },
      });
      return;
    }

    if (!pathname.startsWith('/v1/')) {
      this.notFound(res);
      return;
    }

    if (!this.checkAuth(req)) {
      this.unauthorized(res);
      return;
    }

    if (method === 'POST' && pathname === '/v1/bootstrap') {
      await this.withHandler(res, async () => this.socialClient.bootstrap());
      return;
    }

    if (method === 'GET' && pathname === '/v1/profile') {
      await this.withHandler(res, async () => this.socialClient.getProfile());
      return;
    }

    if (method === 'PUT' && pathname === '/v1/profile') {
      await this.withHandler(res, async () => {
        const body = await this.parseBody(req);
        return this.socialClient.ensureIdentity(body || {});
      });
      return;
    }

    if (method === 'GET' && pathname === '/v1/friends') {
      await this.withHandler(res, async () => this.socialClient.getFriends());
      return;
    }

    if (method === 'POST' && pathname === '/v1/friends/requests') {
      await this.withHandler(res, async () => {
        const body = await this.parseBody(req);
        return this.socialClient.sendFriendRequest(body || {});
      });
      return;
    }

    if (method === 'POST' && pathname === '/v1/friends/requests/respond') {
      await this.withHandler(res, async () => {
        const body = await this.parseBody(req);
        return this.socialClient.respondFriendRequest(body || {});
      });
      return;
    }

    if (method === 'GET' && pathname === '/v1/presence') {
      await this.withHandler(res, async () => this.socialClient.getPresence());
      return;
    }

    if (method === 'PUT' && pathname === '/v1/presence') {
      await this.withHandler(res, async () => {
        const body = await this.parseBody(req);
        return this.socialClient.setPresence(body || {});
      });
      return;
    }

    if (method === 'POST' && pathname === '/v1/presence/heartbeat') {
      await this.withHandler(res, async () => {
        const body = await this.parseBody(req);
        return this.socialClient.heartbeat(body || {});
      });
      return;
    }

    if (method === 'POST' && pathname === '/v1/friends/presence') {
      await this.withHandler(res, async () => {
        const body = await this.parseBody(req);
        return this.socialClient.setFriendPresence(body || {});
      });
      return;
    }

    if (method === 'POST' && pathname === '/v1/visit/rooms') {
      await this.withHandler(res, async () => {
        const body = await this.parseBody(req);
        return this.socialClient.createVisitRoom(body || {});
      });
      return;
    }

    if (method === 'POST' && pathname === '/v1/visit/rooms/leave') {
      await this.withHandler(res, async () => {
        const body = await this.parseBody(req);
        return this.socialClient.leaveVisitRoom(body || {});
      });
      return;
    }

    if (method === 'GET' && pathname === '/v1/visit/current-room') {
      await this.withHandler(res, async () => this.socialClient.getCurrentRoom());
      return;
    }

    if (method === 'POST' && pathname === '/v1/visit/interactions') {
      await this.withHandler(res, async () => {
        const body = await this.parseBody(req);
        return this.socialClient.sendVisitInteraction(body || {});
      });
      return;
    }

    if (method === 'POST' && pathname === '/v1/visit/requests') {
      await this.withHandler(res, async () => {
        const body = await this.parseBody(req);
        return this.socialClient.sendVisitRequest(body || {});
      });
      return;
    }

    if (method === 'POST' && pathname === '/v1/visit/requests/respond') {
      await this.withHandler(res, async () => {
        const body = await this.parseBody(req);
        return this.socialClient.respondVisitRequest(body || {});
      });
      return;
    }

    if (method === 'GET' && pathname === '/v1/visit/requests/pending') {
      await this.withHandler(res, async () => {
        return this.socialClient.getPendingVisitRequests();
      });
      return;
    }

    if (method === 'POST' && pathname === '/v1/mini-games/start') {
      await this.withHandler(res, async () => {
        const body = await this.parseBody(req);
        return this.socialClient.startMiniGame(body || {});
      });
      return;
    }

    if (method === 'POST' && pathname === '/v1/mini-games/move') {
      await this.withHandler(res, async () => {
        const body = await this.parseBody(req);
        return this.socialClient.playMiniGameMove(body || {});
      });
      return;
    }

    if (method === 'POST' && pathname === '/v1/mini-games/reset') {
      await this.withHandler(res, async () => {
        const body = await this.parseBody(req);
        return this.socialClient.resetMiniGame(body || {});
      });
      return;
    }

    if (method === 'GET' && pathname === '/v1/feature-flags') {
      await this.withHandler(res, async () => this.socialClient.getFeatureFlags());
      return;
    }

    if (method === 'PUT' && pathname === '/v1/feature-flags') {
      await this.withHandler(res, async () => {
        const body = await this.parseBody(req);
        return this.socialClient.updateFeatureFlags(body || {});
      });
      return;
    }

    if (method === 'GET' && pathname === '/v1/events') {
      await this.withHandler(res, async () => {
        const cursor = toInt(requestURL.searchParams.get('cursor'), 0);
        const matched = this.events.filter((item) => item.cursor > cursor).map((item) => item.event);
        return {
          cursor,
          nextCursor: this.cursor,
          events: matched,
          serverTime: nowISO(),
        };
      });
      return;
    }

    this.notFound(res);
  }
}

module.exports = {
  SocialRemoteMockServer,
};
