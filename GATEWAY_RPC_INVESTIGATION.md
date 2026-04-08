# Gateway WebSocket RPC Connection Failure - Full Investigation Report

**Date**: 2026-04-07  
**Issue**: WebSocket connection to Gateway fails with `origin not allowed` (code 1008) and `connect failed` (code 4008)  
**Historical Success**: April 2nd showed successful connection: `[ws] webchat connected conn=... remote=127.0.0.1 client=QQ宠物 webchat v1.0`

---

## Executive Summary

The root cause is a **missing `allowedOrigins` configuration in the Gateway's `controlUi` settings** combined with **Node.js WebSocket client not sending an Origin header** (unlike browsers). The gateway now enforces stricter origin validation, but the Electron app's WebSocket connection never sends an Origin header, causing the check to fail.

**Two fixes required:**
1. Add `gateway.controlUi.allowedOrigins` to config
2. Optionally add Origin header to WebSocket connection OR enable Host-header fallback

---

## 1. Gateway WebSocket Origin Validation (OpenClaw Gateway)

### File: `/Users/raymond/Documents/git/pet-pc-demo/resources/targets/darwin-arm64/gateway/node_modules/openclaw/dist/server-Cv5hzFG4.js`

**Origin Check Logic (Lines 26630-26660):**

```javascript
// Line 26635: Extract origin from WebSocket upgrade request header
const requestOrigin = headerValue(upgradeReq.headers.origin);

// Line 26630-26642: Perform origin check
if (enforceOriginCheckForAnyClient || isBrowserOperatorUi || isWebchat) {
  const hostHeaderOriginFallbackEnabled = 
    configSnapshot.gateway?.controlUi?.dangerouslyAllowHostHeaderOriginFallback === true;
  
  const originCheck = checkBrowserOrigin({
    requestHost,
    origin: requestOrigin,
    allowedOrigins: configSnapshot.gateway?.controlUi?.allowedOrigins,  // ← KEY: reads from config
    allowHostHeaderOriginFallback: hostHeaderOriginFallbackEnabled,
    isLocalClient
  });
  
  // Line 26644: Send error if origin check fails
  if (!originCheck.ok) {
    const errorMessage = 
      "origin not allowed (open the Control UI from the gateway host or allow it in gateway.controlUi.allowedOrigins)";
    // ... sends 1008 close code
  }
}
```

**WebSocket Header Extraction (Line 27362):**

```javascript
const requestHost = headerValue(upgradeReq.headers.host);
const requestOrigin = headerValue(upgradeReq.headers.origin);  // ← Expects Origin header
const requestUserAgent = headerValue(upgradeReq.headers["user-agent"]);
```

### Key Gateway Config Fields

From `types.gateway.d.ts`:

```typescript
export type GatewayControlUiConfig = {
  enabled?: boolean;
  basePath?: string;
  root?: string;
  allowedOrigins?: string[];  // ← MISSING in current config
  dangerouslyAllowHostHeaderOriginFallback?: boolean;  // ← Can temporarily override
  allowInsecureAuth?: boolean;
  dangerouslyDisableDeviceAuth?: boolean;
};
```

---

## 2. Electron App WebSocket Connection (Missing Origin Header)

### File: `/Users/raymond/Documents/git/pet-pc-demo/electron/backend/gateway-rpc.js`

**WebSocket Connection Code (Lines 128-162):**

```javascript
connect() {
  if (this.closed) return;
  console.log(`${TAG} websocket opening ${this.url}`);

  try {
    // Line 133: Create WebSocket WITHOUT headers
    this.ws = new WebSocket(this.url);
    // ↑ This is the problem: Node.js ws library doesn't send Origin header by default
  } catch (err) {
    console.error(`${TAG} WebSocket constructor error:`, err.message);
    this.scheduleReconnect();
    return;
  }

  this.ws.on('open', () => {
    console.log(`${TAG} websocket opened`);
    this.queueConnect();  // Send connect handshake
  });
  
  // ...
}
```

**Connection Handshake (Lines 190-236):**

```javascript
sendConnect() {
  const params = {
    minProtocol: 3,
    maxProtocol: 3,
    client: {
      id: 'gateway-client',
      displayName: 'QQ宠物',
      version: '1.0',
      platform: process.platform,
      mode: 'webchat',  // ← Identifies as 'webchat' client
    },
    auth: { token: this.token },  // ← Token sent in RPC params, not headers
    role: 'operator',
    scopes: ['operator.admin'],
    caps: ['tool-events'],
  };

  this.sendRequest('connect', params)
    .then((hello) => {
      console.log(`${TAG} connect handshake ok`);
      this.isReady = true;
      // ...
    })
    .catch((err) => {
      console.error(`${TAG} connect handshake failed:`, err.message);
      // Closes with 4008
      this.ws.close(4008, 'connect failed');
    });
}
```

**The Problem:**
- Node.js `ws` library doesn't automatically send `Origin` header for server-initiated WebSocket clients
- Gateway extracts `origin` from HTTP headers: `headerValue(upgradeReq.headers.origin)` (line 27362)
- When origin is missing, `checkBrowserOrigin()` returns `{ ok: false, reason: "origin not allowed" }`
- Client is identified as 'webchat' (line 206) → strict origin check is enforced
- Connection fails with **code 1008** before RPC connect is even sent

---

## 3. Current Gateway Configuration

### File: `/Users/raymond/.qq-pet/openclaw.json`

```json
{
  "gateway": {
    "auth": {
      "mode": "token",
      "token": "1ef8e8c2b3388943165ef5486c227ef3"
    },
    "mode": "local"
    // ↑ NO controlUi section!
  }
}
```

**Missing section:**
```json
"gateway": {
  "controlUi": {
    "allowedOrigins": ["null", "ws://127.0.0.1:19790"]
  }
}
```

---

## 4. AIBrain.js (Does NOT Use Gateway RPC for Direct Calls)

### File: `/Users/raymond/Documents/git/pet-pc-demo/renderer/js/ai-brain.js`

**Analysis:**

AIBrain has TWO code paths:

1. **Preferred: Gateway RPC (chat method, lines 633-648)**
   - Calls `window.electronAPI.gatewayChatSend()` → IPC call to backend
   - Backend uses **GatewayRpcClient** (the affected connection)
   - Waits for chat completion via `gateway-chat-event` IPC

2. **Fallback: Direct HTTP fetch to Provider (chatViaFetch method, lines 769-828)**
   - Direct `fetch(API_URL)` to upstream provider
   - Bypasses Gateway entirely if RPC is unavailable
   - Used when `useUpstreamProxy=true` or if RPC fails

**Code (lines 633-648):**
```javascript
async function chat(userText, history = [], options = {}) {
  // ... validation ...
  
  // Prefer Gateway RPC
  const hasRpc = window.electronAPI && window.electronAPI.gatewayChatSend;
  if (hasRpc) {
    try {
      const result = await window.electronAPI.gatewayChatSend(userText);
      if (result && result.success) {
        return awaitChatFinal();  // Wait for streaming response via IPC
      }
    } catch (err) {
      console.warn('🧠 Gateway RPC 异常，回退 fetch:', err.message);
    }
  }
  
  // Fallback to direct provider
  return chatViaFetch(userText, history, options);
}
```

**Status:**
- AIBrain doesn't initiate WebSocket directly
- It relies on **backend/index.js connectGatewayRpc()** (line 105-150)
- The failing connection IS the WebSocket RPC that AIBrain depends on

---

## 5. Backend RPC Connection Setup

### File: `/Users/raymond/Documents/git/pet-pc-demo/electron/backend/index.js`

**Connection initiation (lines 105-150):**

```javascript
function connectGatewayRpc() {
  // Line 107-110: Close old connection
  if (rpcClient) {
    rpcClient.stop();
    rpcClient = null;
  }

  // Line 112: Check gateway is running
  if (!gateway || gateway.getState() !== 'running') return;

  // Lines 114-115: Get port and token from gateway process
  const port = gateway.getPort();  // 19790 (from constants.DEFAULT_PORT)
  const token = gateway.getToken();  // From config or generated

  // Line 117-147: Create RPC client with WebSocket connection
  rpcClient = new GatewayRpcClient({
    url: `ws://127.0.0.1:${port}/`,  // ← NO Origin header will be sent
    token,
    onChatEvent: (payload) => { /* ... */ },
    onAgentEvent: (payload) => { /* ... */ },
    onConnected: () => { /* ... */ },
    onDisconnected: () => { /* ... */ },
  });

  rpcClient.start();  // Begins WebSocket connection
}
```

**Token Source (lines 62, 114-115):**

```javascript
const token = resolveGatewayAuthToken();  // from gateway-auth.js

gateway = new GatewayProcess({
  port: constants.DEFAULT_PORT,  // 19790
  token,  // From config
  // ...
});
```

**Gateway Process Env Vars (gateway-process.js, lines 158-172):**

```javascript
this.proc = spawn(nodeBin, args, {
  cwd,
  env: {
    ...process.env,
    NODE_ENV: 'production',
    OPENCLAW_NO_RESPAWN: '1',
    OPENCLAW_LENIENT_CONFIG: '1',
    OPENCLAW_GATEWAY_PORT: String(this.port),
    OPENCLAW_GATEWAY_TOKEN: this.token,  // ← Token passed to gateway
    OPENCLAW_DISABLE_BONJOUR: '1',
    OPENCLAW_NPM_BIN: resolveNpmBin(),
    OPENCLAW_STATE_DIR: resolveUserStateDir(),  // ~/.qq-pet
    OPENCLAW_HOME: resolveUserStateDir(),
    PATH: envPath,
    ...this.extraEnv,
  },
  // ...
});
```

---

## 6. Root Cause Chain

1. **April 2 → Now:** OpenClaw gateway version updated with stricter WebSocket origin validation
2. **New behavior:** Gateway now checks `gateway.controlUi.allowedOrigins` for 'webchat' clients
3. **Missing config:** User's `openclaw.json` has NO `gateway.controlUi` section
4. **Missing header:** Node.js `ws` client doesn't send `Origin` header by default
5. **Validation fails:** `checkBrowserOrigin({ origin: undefined, allowedOrigins: undefined })` → `{ ok: false }`
6. **Connection rejected:** WebSocket closes with **1008** before any RPC communication
7. **Secondary error:** RPC client tries to send connect, fails with **4008** because socket is already closed

**Log Sequence:**
```
[ws] websocket opening ws://127.0.0.1:19790/
[ws] websocket opened
[ws] closed before connect ... code=1008 reason=origin not allowed (open the Control UI from the gateway host or allow it in gateway.controlUi.allowedOrigins)
[ws] closed before connect ... code=4008 reason=connect failed  ← retry with backoff
```

---

## 7. Solutions (Ranked by Recommended Order)

### **Solution 1: Add allowedOrigins to config (RECOMMENDED)**

**File:** `/Users/raymond/.qq-pet/openclaw.json`

```json
{
  "models": { /* ... */ },
  "agents": { /* ... */ },
  "gateway": {
    "auth": {
      "mode": "token",
      "token": "1ef8e8c2b3388943165ef5486c227ef3"
    },
    "mode": "local",
    "controlUi": {
      "allowedOrigins": [
        "null",  // Electron file:// pages
        "ws://127.0.0.1:19790",
        "http://127.0.0.1:19790",
        "http://127.0.0.1:18789"  // if different port used
      ]
    }
  },
  "plugins": { /* ... */ }
}
```

**Why:**
- No code changes required
- Secure: explicitly allows only local connections
- Matches error message guidance
- Will be set automatically by `ensureControlUiAllowedOriginsInConfig()` in gateway-auth.js

**Implementation:** Already implemented in `electron/backend/gateway-auth.js` lines 16-31, but **NOT called during startGateway()** in index.js

---

### **Solution 2: Add Origin header to WebSocket (OPTIONAL, complementary)**

**File:** `/Users/raymond/Documents/git/pet-pc-demo/electron/backend/gateway-rpc.js`

Modify line 133:

```javascript
// BEFORE:
this.ws = new WebSocket(this.url);

// AFTER: Add Origin header for better compatibility
this.ws = new WebSocket(this.url, {
  headers: {
    'Origin': 'http://127.0.0.1',  // or read from this.url
  }
});
```

**Why:**
- Helps gateway identify request as local
- Makes origin check deterministic
- Follows WebSocket best practices

**Note:** This is **optional** if solution 1 is applied with proper allowedOrigins

---

### **Solution 3: Enable Host-Header Fallback (TEMPORARY WORKAROUND, NOT RECOMMENDED)**

```json
"gateway": {
  "controlUi": {
    "dangerouslyAllowHostHeaderOriginFallback": true
  }
}
```

**Why NOT:**
- Security risk: host header is user-controlled
- Logs warnings about bypassed origin check
- Temporary workaround only

---

## 8. Code Path Summary

```
Electron App (main process)
  ↓
backend/index.js::startGateway()
  ├→ spawns gateway subprocess (env: OPENCLAW_GATEWAY_TOKEN, STATE_DIR)
  └→ connectGatewayRpc()
       ↓
       backend/gateway-rpc.js::GatewayRpcClient
         ├→ new WebSocket(ws://127.0.0.1:19790/)  [LINE 133]
         │   ↓
         │   OpenClaw Gateway (subprocess)
         │   └→ server-Cv5hzFG4.js::originCheck()
         │        ├→ Extract: headerValue(upgradeReq.headers.origin)  [LINE 27362]
         │        ├→ Check: checkBrowserOrigin({
         │        │    origin: undefined,  ← Problem!
         │        │    allowedOrigins: undefined,  ← Not in config!
         │        │  })  [LINE 26639]
         │        └→ Result: { ok: false, reason: "origin not allowed" }
         │            ↓
         │            Close with 1008
         │
         └→ Retry with backoff
             
AIBrain.js::chat()
  ├→ Try: window.electronAPI.gatewayChatSend()
  │   └→ RPC fails because WebSocket connection failed
  └→ Fallback: Direct fetch to provider API (if available)
```

---

## 9. Verification Steps

After applying fixes:

1. **Check config applied:**
   ```bash
   cat ~/.qq-pet/openclaw.json | jq '.gateway.controlUi'
   ```
   Should output:
   ```json
   {
     "allowedOrigins": ["null", "ws://127.0.0.1:19790", ...]
   }
   ```

2. **Check connection log:**
   ```bash
   tail -f ~/.qq-pet/logs/gateway.log
   ```
   Should show:
   ```
   [ws] websocket opening ws://127.0.0.1:19790/
   [ws] websocket opened
   [gateway-rpc] connect handshake ok
   [gateway-rpc] sessionKey from snapshot: agent:main:main
   ```

3. **Check RPC status from renderer:**
   ```javascript
   const status = await electronAPI.invoke('gateway-rpc-status');
   console.log(status);  // { connected: true, sessionKey: "agent:main:main" }
   ```

---

## 10. Why This Broke on April 2

**Hypothesis:**

1. OpenClaw dependency updated → stricter origin validation
2. Gateway now requires explicit `allowedOrigins` configuration
3. Electron app was never sending Origin header (Node.js ws limitation)
4. Config wasn't populated with allowedOrigins during setup
5. Result: connection fails immediately after WebSocket open, before RPC connect can be sent

**Historical Success (April 2):**
- Older OpenClaw allowed undefined origin
- Or default allowedOrigins included "127.0.0.1"
- Or Host-header fallback was enabled by default

---

## Files Involved

| File | Lines | Role |
|------|-------|------|
| `gateway-rpc.js` | 133, 190-236 | WebSocket connection, sends RPC connect params |
| `index.js` | 105-150 | Initiates RPC connection, passes token |
| `gateway-process.js` | 158-172 | Spawns gateway with OPENCLAW_GATEWAY_TOKEN env var |
| `gateway-auth.js` | 16-31, 34-50 | Manages auth token & allowedOrigins (NOT CALLED) |
| `~/.qq-pet/openclaw.json` | N/A | Missing controlUi config |
| `server-Cv5hzFG4.js` | 26630-26660, 27362 | Origin validation logic in OpenClaw |
| `ai-brain.js` | 633-648, 769-828 | Chat method that depends on RPC, has fallback |

---

## Recommended Action Plan

1. **Immediate:** Add `gateway.controlUi.allowedOrigins` to config (Solution 1)
2. **Follow-up:** Call `ensureControlUiAllowedOriginsInConfig()` during Gateway startup
3. **Optional:** Add Origin header to WebSocket (Solution 2) for robustness
4. **Monitor:** Check logs to confirm connection establishes

---

