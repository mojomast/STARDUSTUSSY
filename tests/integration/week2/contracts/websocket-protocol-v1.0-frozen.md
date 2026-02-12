# WebSocket Protocol Specification
## HarmonyFlow SyncBridge - v1.0.0 FROZEN

**Status:** FROZEN  
**Version:** 1.0.0  
**Last Updated:** 2026-02-11  
**Contract Freeze Date:** Week 2

---

## Overview

The WebSocket protocol provides real-time bidirectional communication between clients and the Session State Service.

**Connection Endpoint:**
```
ws://localhost:8080/ws
```

**Authentication:** After connection, send an `auth` message with JWT token.

---

## Message Format

All messages use JSON format with the following envelope structure:

```json
{
  "type": <MessageType>,
  "session_id": "string",
  "user_id": "string",
  "timestamp": 1707657600,
  "payload": {},
  "correlation_id": "string"
}
```

### Field Descriptions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | integer | Yes | Message type identifier (see Message Types) |
| `session_id` | string | No | Session UUID for context |
| `user_id` | string | No | User UUID (set after authentication) |
| `timestamp` | integer | Yes | Unix timestamp in seconds |
| `payload` | object | No | Message-specific data |
| `correlation_id` | string | No | For request-response correlation |

---

## Message Types

### Client → Server

| Type | Value | Description | Payload |
|------|-------|-------------|---------|
| `Heartbeat` | 1 | Keep connection alive | `{ "client_time": <timestamp> }` |
| `Auth` | 7 | Authenticate connection | `{ "token": "<jwt_token>" }` |
| `SnapshotRequest` | 3 | Request session snapshot | `{}` |
| `StateUpdate` | 5 | Push state changes | `{ "key": "string", "value": any, "operation": "SET\|DELETE" }` |

### Server → Client

| Type | Value | Description | Payload |
|------|-------|-------------|---------|
| `HeartbeatAck` | 2 | Heartbeat acknowledgment | `{ "server_time": <timestamp>, "client_time": <timestamp> }` |
| `SnapshotResponse` | 4 | Snapshot data | `{ "session_id": "string", "state_data": {}, "created_at": <timestamp>\|null }` |
| `StateUpdate` | 5 | Broadcast state update | `{ "key": "string", "value": any }` |
| `AuthSuccess` | 8 | Authentication successful | `{ "new_token": "string", "expires_at": <timestamp> }` |
| `AuthFailure` | 9 | Authentication failed | `{ "code": 401, "message": "string" }` |
| `Error` | 6 | Error notification | `{ "code": <int>, "message": "string", "details": "string" }` |

---

## Connection Lifecycle

```
┌─────────┐     CONNECT       ┌─────────┐
│  Client │ ─────────────────>│  Server │
│         │                   │         │
│         │<─────────────────│         │
│         │    WS Connected   │         │
│         │                   │         │
│         │ ─────────────────>│         │
│         │   auth message    │         │
│         │   with JWT token  │         │
│         │                   │         │
│         │<─────────────────│         │
│         │   auth_success    │         │
│         │                   │         │
│         │<────────────────>│         │
│         │  bidirectional    │         │
│         │    messaging      │         │
│         │                   │         │
│         │   DISCONNECT      │         │
│         │ <────────────────>│         │
└─────────┘                   └─────────┘
```

---

## Connection States

1. **CONNECTING** - Initial WebSocket connection attempt
2. **CONNECTED** - WebSocket connected, not yet authenticated
3. **AUTHENTICATING** - Authentication in progress
4. **ACTIVE** - Authenticated and ready for messaging
5. **RECONNECTING** - Attempting to restore connection
6. **CLOSED** - Connection terminated

---

## Heartbeat Protocol

**Server-Initiated Heartbeat:**
- Server sends WebSocket `ping` frame every **30 seconds**
- Client must respond with WebSocket `pong` frame
- No `pong` response within **60 seconds** = connection timeout

**Client Heartbeat (optional):**
- Client can send `Heartbeat` message (type: 1)
- Server responds with `HeartbeatAck` (type: 2)

---

## Authentication Flow

### Step 1: Connect WebSocket
```javascript
const ws = new WebSocket('ws://localhost:8080/ws');
```

### Step 2: Send Auth Message
```json
{
  "type": 7,
  "timestamp": 1707657600,
  "payload": {
    "token": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

### Step 3: Receive Auth Response
**Success:**
```json
{
  "type": 8,
  "timestamp": 1707657601,
  "payload": {
    "new_token": "eyJhbGciOiJIUzI1NiIs...",
    "expires_at": 1707658500
  }
}
```

**Failure:**
```json
{
  "type": 9,
  "timestamp": 1707657601,
  "payload": {
    "code": 401,
    "message": "Invalid token"
  }
}
```

---

## State Management

### Requesting Snapshot
```json
{
  "type": 3,
  "timestamp": 1707657600,
  "payload": {}
}
```

### Snapshot Response
```json
{
  "type": 4,
  "timestamp": 1707657600,
  "payload": {
    "session_id": "550e8400-e29b-41d4-a716-446655440000",
    "state_data": {
      "meditation_progress": 45,
      "breathing_phase": "inhale"
    },
    "created_at": 1707657600
  }
}
```

### State Update
```json
{
  "type": 5,
  "timestamp": 1707657600,
  "payload": {
    "key": "meditation_progress",
    "value": 50
  }
}
```

### Delete State Key
```json
{
  "type": 5,
  "timestamp": 1707657600,
  "payload": {
    "key": "temporary_data",
    "operation": "DELETE"
  }
}
```

---

## Error Handling

### Error Codes

| Code | Description | Action |
|------|-------------|--------|
| 400 | Bad Request | Check message format |
| 401 | Unauthorized | Re-authenticate |
| 403 | Forbidden | Not authenticated |
| 404 | Not Found | Resource doesn't exist |
| 429 | Rate Limited | Wait and retry |
| 500 | Server Error | Retry with backoff |

### Error Message Format
```json
{
  "type": 6,
  "timestamp": 1707657600,
  "payload": {
    "code": 401,
    "message": "Invalid or expired token",
    "details": ""
  }
}
```

---

## Reconnection Protocol

### Reconnection Strategy

**Exponential Backoff:**
```
delay = min(1000 * (2 ^ attempt), 30000)
```
- base_delay: 1000ms
- max_delay: 30000ms
- max_attempts: 10

### Reconnection Process

1. **Detect disconnect** (connection close/error)
2. **Wait** using exponential backoff
3. **Reconnect** to WebSocket endpoint
4. **Re-authenticate** with JWT token
5. **Request snapshot** to sync state
6. **Resume normal operation**

---

## Security

- WebSocket connections should use WSS in production
- JWT token required for all operations except heartbeat
- Rate limiting: 100 messages/minute per connection
- Max message size: 512KB
- Connection timeout: 60 seconds without pong response

---

## Versioning

Protocol version is implicit in the connection URL:
```
ws://api.harmonyflow.io/ws
```

Breaking changes require protocol version increment and new endpoint.

---

## Implementation Notes

### Go Server Implementation
- Uses `gorilla/websocket` library
- Connection managed by `protocol.Manager`
- Messages processed by `WebSocketHandler`
- State stored in Redis via `redis.Client`

### TypeScript Client Implementation
- Uses native browser WebSocket API
- Reconnection logic with exponential backoff
- Event-based message handling
- State synchronization with fingerprinting

---

## Contract Discrepancies (Week 1 → Week 2)

The following changes were made to align contract with implementation:

1. **Message Format:** Changed from `id/type/timestamp/payload` to `type/session_id/user_id/timestamp/payload/correlation_id`
2. **Message Types:** Renamed from string-based to integer-based enum
3. **Authentication:** Changed from URL query param to post-connection message
4. **Heartbeat:** Changed from application-level to WebSocket ping/pong frames
5. **Message Content:** Aligned specific message payloads with Go implementation

---

## Changelog

### v1.0.0-frozen (2026-02-11)
- Initial frozen contract
- Aligned with Go service implementation
- Documented all message types
- Specified authentication flow
- Added implementation notes
