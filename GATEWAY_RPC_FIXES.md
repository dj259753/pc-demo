# Gateway WebSocket RPC Connection - Fixes Applied

**Date**: April 7, 2026
**Issue**: WebSocket RPC connection failing with "origin not allowed" (code 1008) and "connect failed" (code 4008) errors
**Root Cause**: Three-factor failure:
1. Node.js `ws` library doesn't send `Origin` header by default
2. OpenClaw gateway now enforces strict origin validation
3. Configuration missing `gateway.controlUi.allowedOrigins` section

## Fixes Applied

### Fix 1: Add Origin Header to WebSocket Client

**File**: `electron/backend/gateway-rpc.js`  
**Line**: 133  
**Change**: 

```javascript
// BEFORE
this.ws = new WebSocket(this.url);

// AFTER
this.ws = new WebSocket(this.url, undefined, {
  headers: {
    'Origin': 'http://127.0.0.1'
  }
});
```

**Explanation**:
- The `ws` library accepts an options object as the third parameter
- Adding `Origin: http://127.0.0.1` header allows the gateway to recognize the request as coming from localhost
- This matches how browsers send the `Origin` header for WebSocket connections
- Without this, the gateway sees `origin: undefined` in the upgrade request

**Impact**: Allows gateway origin validation to succeed with local loopback check

---

### Fix 2: Integrate ensureControlUiAllowedOriginsInConfig into Startup

**File**: `electron/backend/index.js`  
**Changes**:

#### 2a. Import the configuration helper (line 17)
```javascript
// BEFORE
const { resolveGatewayAuthToken, ensureGatewayAuthTokenInConfig } = require('./gateway-auth');

// AFTER
const { resolveGatewayAuthToken, ensureGatewayAuthTokenInConfig, ensureControlUiAllowedOriginsInConfig } = require('./gateway-auth');
```

#### 2b. Call ensureControlUiAllowedOriginsInConfig in startGateway() (lines 56-68)
```javascript
async function startGateway() {
  if (gateway && gateway.getState() === 'running') {
    console.log('[backend] Gateway 已在运行');
    return 'running';
  }

  // FIX: Ensure controlUi.allowedOrigins is configured for Electron file:// origin
  // This allows the WebSocket RPC client to connect without "origin not allowed" errors
  let config = readUserConfig();
  const before = JSON.stringify(config);
  ensureControlUiAllowedOriginsInConfig(config);
  const after = JSON.stringify(config);
  if (before !== after) {
    writeUserConfig(config);
    console.log('[backend] 已补全 gateway.controlUi.allowedOrigins 配置');
  }

  // ... rest of function
}
```

#### 2c. Also call in backend-save-provider handler (lines 224-227)
```javascript
ipcMain.handle('backend-save-provider', async (_event, { apiKey, baseURL, modelID }) => {
  try {
    const config = saveProviderConfig(apiKey, baseURL, modelID);
    ensureGatewayAuthTokenInConfig(config);
    // FIX: Ensure controlUi.allowedOrigins is configured
    ensureControlUiAllowedOriginsInConfig(config);
    writeUserConfig(config);
    // ...
  } catch (err) {
    return { success: false, message: err.message };
  }
});
```

**Explanation**:
- The helper function `ensureControlUiAllowedOriginsInConfig()` already existed but wasn't being called during startup
- This function ensures the `gateway.controlUi.allowedOrigins` array includes `"null"` for Electron `file://` protocol
- By integrating it into both startup and setup wizard paths, we guarantee the config is always correct
- The function idempotently updates the config and persists it if changed

**Impact**: Ensures `gateway.controlUi.allowedOrigins` contains `"null"` for Electron file:// origin validation

---

### Fix 3: Update Configuration File

**File**: `~/.qq-pet/openclaw.json`  
**Change**: Added `gateway.controlUi.allowedOrigins` section

```json
{
  "gateway": {
    "auth": {
      "mode": "token",
      "token": "1ef8e8c2b3388943165ef5486c227ef3"
    },
    "mode": "local",
    "controlUi": {
      "allowedOrigins": [
        "null"
      ]
    }
  },
  // ... rest of config
}
```

**Explanation**:
- Electron loads the UI with `file://` protocol, which results in `origin: null` in WebSocket upgrade headers
- The gateway's origin validation checks if the connection's origin is in `allowedOrigins`
- By explicitly including `"null"`, we tell the gateway to accept connections from `file://` origins
- This is the configuration fix recommended by the gateway's own error message

**Impact**: Gateway accepts WebSocket connections from Electron app with `origin: null`

---

## How The Fixes Work Together

### Before (Failure Scenario)
```
Electron App (index.js:96)
  ↓
startGateway() 
  ↓
connectGatewayRpc()
  ↓
new WebSocket(url)  // NO Origin header sent
  ↓
Gateway receives WebSocket upgrade request
  ↓
Extracts headers: origin = undefined (not sent by ws library)
  ↓
Checks allowedOrigins in config: undefined (not in config)
  ↓
Validation fails: "origin not allowed"
  ↓
close(1008, "origin not allowed")
  ↓
WebSocket client error handler
  ↓
scheduleReconnect() with exponential backoff
  ↓
Reconnect fails again after 800ms, 1360ms, etc.
  ✗ RPC connection never established
```

### After (Success Scenario)
```
Electron App (index.js:56-68)
  ↓
startGateway() 
  ↓
ensureControlUiAllowedOriginsInConfig() ensures "null" in config
  ↓
connectGatewayRpc()
  ↓
new WebSocket(url, undefined, { headers: { Origin: 'http://127.0.0.1' } })
  ↓
Origin header sent to gateway
  ↓
Gateway receives WebSocket upgrade request
  ↓
Extracts headers: origin = 'http://127.0.0.1'
  ↓
Checks allowedOrigins in config: ['null']  ✓ present in config
  ↓
Calls checkBrowserOrigin() → checks for local-loopback match
  ↓
connection accepted
  ↓
sendConnect() → Challenge-Response handshake
  ↓
gateway-rpc-connected event sent to renderer
  ✓ RPC connection established and ready for chat
```

## Verification Steps

### 1. Verify Code Changes
```bash
# Check gateway-rpc.js has Origin header
grep -n "headers:" electron/backend/gateway-rpc.js

# Check index.js imports ensureControlUiAllowedOriginsInConfig
grep -n "ensureControlUiAllowedOriginsInConfig" electron/backend/index.js

# Check index.js calls the function in startGateway
grep -A5 "startGateway()" electron/backend/index.js | grep -n "ensureControlUiAllowedOriginsInConfig"
```

### 2. Verify Configuration
```bash
# Check openclaw.json has allowedOrigins
cat ~/.qq-pet/openclaw.json | jq '.gateway.controlUi.allowedOrigins'
# Should output: ["null"]
```

### 3. Test Connection
1. Start the Electron app
2. Open DevTools → check backend console for:
   - `[backend] 已补全 gateway.controlUi.allowedOrigins 配置` (first run)
   - `[gateway-rpc] websocket opened`
   - `[gateway-rpc] connect handshake ok`
   - `[backend] Gateway RPC 已连接`

3. Try sending a chat message - should work without "gateway RPC 未连接" error

### 4. Check Gateway Logs
```bash
# Monitor gateway subprocess output
tail -f ~/.qq-pet/logs/gateway.log 2>/dev/null || \
  grep -i "gateway" ~/.qq-pet/logs/*.log | tail -20
```

---

## Technical Details

### Origin Header Flow in WebSocket

**Browser WebSocket** (automatic):
```
GET / HTTP/1.1
Host: 127.0.0.1:19790
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: ...
Sec-WebSocket-Version: 13
Origin: http://127.0.0.1  ← Browser automatically adds this
```

**Node.js ws library** (without fix):
```
GET / HTTP/1.1
Host: 127.0.0.1:19790
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: ...
Sec-WebSocket-Version: 13
(no Origin header)  ← ws library omits this by default
```

**Node.js ws library with fix** (after applying patch):
```
GET / HTTP/1.1
Host: 127.0.0.1:19790
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: ...
Sec-WebSocket-Version: 13
Origin: http://127.0.0.1  ← Explicitly added via options.headers
```

### Gateway Origin Validation Logic

From `openclaw/.../server-Cv5hzFG4.js` line 26630-26660:

```javascript
// 1. Extract origin header from upgrade request
const requestOrigin = headerValue(upgradeReq.headers.origin);

// 2. Get allowed origins from config
const allowedOrigins = gateway.config?.controlUi?.allowedOrigins;

// 3. Call OpenClaw's checkBrowserOrigin() utility
const originCheck = checkBrowserOrigin({
  requestHost: upgradeReq.headers.host,
  origin: requestOrigin,
  allowedOrigins,
  allowHostHeaderOriginFallback: gateway.config?.controlUi?.dangerouslyAllowHostHeaderOriginFallback,
  isLocalClient: isLocalClient, // true if connecting from 127.0.0.1
});

// 4. If validation fails, close with code 1008
if (!originCheck.ok) {
  const errorMessage = `origin not allowed (open the Control UI from the gateway host or allow it in gateway.controlUi.allowedOrigins)`;
  ws.close(1008, truncateCloseReason(errorMessage));
  return;
}
```

The `checkBrowserOrigin()` function checks three conditions:
1. **allowlist match**: Does `origin` exist in `allowedOrigins`? 
2. **host-header fallback**: If enabled, does `Host` header match `origin` domain?
3. **local-loopback**: Is the connection from `127.0.0.1` (localhost)?

With our fixes:
- `origin` = `http://127.0.0.1` (sent by our code)
- `allowedOrigins` = `["null"]` (in config)
- Connection is from `127.0.0.1` (Electron subprocess)
- → Passes **local-loopback** check ✓

---

## Backward Compatibility

These changes are fully backward compatible:

1. **gateway-rpc.js**: Adding Origin header won't break anything. Gateways that don't validate origin will ignore it. Gateways that do validate will now pass.

2. **index.js**: Calling `ensureControlUiAllowedOriginsInConfig()` is idempotent - if allowedOrigins already exists and contains "null", the function makes no changes.

3. **openclaw.json**: Adding this config section tells the gateway to accept Electron's null origin. Existing gateways without this section will reject the connection (which was the problem we're fixing).

---

## Related Code References

- `electron/backend/gateway-auth.js` lines 15-31: `ensureControlUiAllowedOriginsInConfig()` implementation
- `electron/backend/gateway-auth.js` lines 96-105: `mergePetGatewayDefaultsForBundledApp()` (similar pattern for bundled apps)
- `resources/.../gateway/.../types.gateway.d.ts` lines 69-91: Gateway config TypeScript definitions
- `resources/.../gateway/.../origin-check.d.ts`: OpenClaw origin validation utility types

---

## Next Steps

1. ✅ Applied Fix 1: Added Origin header to WebSocket client
2. ✅ Applied Fix 2: Integrated ensureControlUiAllowedOriginsInConfig into startup
3. ✅ Applied Fix 3: Updated configuration file
4. → Ready to test: Start Electron app and verify connection

If issues persist, check:
- Gateway process logs for "origin" related messages
- Network tab in DevTools to confirm Origin header is sent
- Console for connection state messages
