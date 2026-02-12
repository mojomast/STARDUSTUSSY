# WebSocket Protocol Specification
## HarmonyFlow SyncBridge - v1.0.0

### Overview
The WebSocket protocol provides real-time bidirectional communication between clients and the Session State Service.

### Connection URL
```
wss://api.harmonyflow.io/v1/ws/sessions/{sessionId}?token={jwt_token}&deviceId={deviceId}
```

### Message Format
All messages use JSON format with the following envelope structure:

```json
{
  "id": "uuid-v4",
  "type": "message_type",
  "timestamp": "2026-02-11T12:00:00Z",
  "payload": {}
}
```

### Message Types

#### Client → Server

| Type | Description | Payload |
|------|-------------|---------|
| `subscribe` | Subscribe to session updates | `{ "sessionId": "string" }` |
| `unsubscribe` | Unsubscribe from session | `{ "sessionId": "string" }` |
| `heartbeat` | Keep connection alive | `{}` |
| `state_update` | Push local state changes | `{ "state": SessionState }` |
| `ack` | Acknowledge received message | `{ "messageId": "string" }` |

#### Server → Client

| Type | Description | Payload |
|------|-------------|---------|
| `connected` | Connection established | `{ "sessionId": "string", "serverTime": "ISO8601" }` |
| `state_sync` | Full state synchronization | `{ "state": SessionState, "version": number }` |
| `state_delta` | Incremental state update | `{ "delta": StateDelta, "version": number }` |
| `device_joined` | New device connected | `{ "device": DeviceInfo }` |
| `device_left` | Device disconnected | `{ "deviceId": "string" }` |
| `error` | Error notification | `{ "code": "string", "message": "string" }` |
| `ping` | Server heartbeat | `{ "timestamp": "ISO8601" }` |

### Connection Lifecycle

```
┌─────────┐     CONNECT     ┌─────────┐
│  Client │ ───────────────>│  Server │
│         │                 │         │
│         │<────────────────│         │
│         │  connected msg  │         │
│         │                 │         │
│         │<───────────────>│         │
│         │   state_sync    │         │
│         │                 │         │
│         │<───────────────>│         │
│         │  bidirectional  │         │
│         │    messaging    │         │
│         │                 │         │
│         │   DISCONNECT    │         │
│         │ <──────────────>│         │
└─────────┘                 └─────────┘
```

### Connection States

1. **CONNECTING** - Initial connection attempt
2. **CONNECTED** - Successfully authenticated and ready
3. **SYNCING** - Receiving initial state sync
4. **ACTIVE** - Normal operation, bidirectional communication
5. **RECONNECTING** - Attempting to restore connection
6. **CLOSED** - Connection terminated

### Heartbeat Protocol

**Client Heartbeat:**
- Send `heartbeat` every 30 seconds
- Server responds with `ping` acknowledgment
- Missing 3 consecutive heartbeats = connection timeout

**Server Heartbeat:**
- Server sends `ping` every 60 seconds
- Client must respond with `ack` within 10 seconds
- No response = server closes connection

### Error Handling

#### Error Codes

| Code | Description | Action |
|------|-------------|--------|
| `AUTH_ERROR` | Authentication failed | Close connection, re-authenticate |
| `SESSION_NOT_FOUND` | Session doesn't exist | Create new session or error |
| `INVALID_MESSAGE` | Malformed message | Log and ignore |
| `RATE_LIMITED` | Too many messages | Wait and retry |
| `STATE_CONFLICT` | State version mismatch | Request full sync |
| `SERVER_ERROR` | Internal server error | Retry with backoff |

#### Error Message Format

```json
{
  "id": "uuid-v4",
  "type": "error",
  "timestamp": "2026-02-11T12:00:00Z",
  "payload": {
    "code": "STATE_CONFLICT",
    "message": "State version mismatch. Expected v45, received v42",
    "details": {
      "expectedVersion": 45,
      "receivedVersion": 42
    },
    "recoverable": true
  }
}
```

### Reconnection Protocol

#### Reconnection Strategy

**Exponential Backoff:**
```
delay = min(base_delay * (2 ^ attempt), max_delay)
```
- base_delay: 1000ms
- max_delay: 30000ms
- max_attempts: 10

#### Reconnection Process

1. **Detect disconnect** (connection close/error)
2. **Wait** using exponential backoff
3. **Reconnect** with same session ID
4. **Re-authenticate** with fresh JWT if expired
5. **Request state sync** with last known version
6. **Resume normal operation**

#### State Recovery

On reconnection, client sends:
```json
{
  "id": "uuid-v4",
  "type": "subscribe",
  "timestamp": "2026-02-11T12:00:00Z",
  "payload": {
    "sessionId": "session-uuid",
    "lastVersion": 42,
    "clientState": { /* optional current state */ }
  }
}
```

Server responds with:
- `state_sync` if version gap > threshold (10 versions)
- `state_delta` if incremental updates available

### Security

- All connections use WSS (WebSocket Secure)
- JWT token must be valid and not expired
- Rate limiting: 100 messages/minute per connection
- Max message size: 64KB
- Connection timeout: 120 seconds without heartbeat

### Versioning

Protocol version specified in connection URL:
```
wss://api.harmonyflow.io/v1/ws/...
```

Breaking changes require protocol version increment.
