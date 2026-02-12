# HarmonyFlow SyncBridge API Reference

**Version:** 1.0.0  
**Last Updated:** February 12, 2026  
**Base URL:** https://api.harmonyflow.io/v1

---

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [API Endpoints](#api-endpoints)
4. [WebSocket Protocol](#websocket-protocol)
5. [Error Handling](#error-handling)
6. [Rate Limiting](#rate-limiting)
7. [CORS Configuration](#cors-configuration)
8. [Examples](#examples)

---

## Overview

The HarmonyFlow SyncBridge API provides REST endpoints and WebSocket connections for managing wellness sessions, state synchronization, and cross-device handoff.

### Key Features

- **Session Management:** Create, update, and delete wellness sessions
- **State Synchronization:** Real-time state sync via WebSocket
- **Multi-Device Support:** Connect up to 5 devices per session
- **Authentication:** JWT-based authentication with refresh tokens
- **Error Handling:** Consistent error responses with request IDs

### API Versioning

API version is specified in the URL path: `/v1/...`

---

## Authentication

### Overview

All endpoints except `/health*` require JWT Bearer token authentication.

### Token Types

| Token Type | Purpose | Lifetime | Issued By |
|------------|---------|----------|-----------|
| Access Token | API authentication | 15 minutes | `/auth/token` |
| Refresh Token | Obtain new access token | 7 days | `/auth/token` |

### Authentication Flow

```
┌─────────────┐                    ┌──────────────────┐
│   Client    │                    │  Auth Service    │
└──────┬──────┘                    └────────┬─────────┘
       │                                    │
       │  POST /auth/token                  │
       │  {username, password}               │
       │───────────────────────────────────>│
       │                                    │
       │  {access_token, refresh_token}    │
       │<───────────────────────────────────│
       │                                    │
       │  Use access_token                 │
       │  Authorization: Bearer <token>     │
       │───────────────────────────────────>│
       │                                    │
       │  Token expired                     │
       │<───────────────────────────────────│
       │                                    │
       │  POST /auth/token/refresh          │
       │  {refresh_token}                   │
       │───────────────────────────────────>│
       │                                    │
       │  {access_token, refresh_token}    │
       │<───────────────────────────────────│
```

### Obtain Access Token

**Endpoint:** `POST /auth/token`

**Request Body:**
```json
{
  "grant_type": "password",
  "username": "user@example.com",
  "password": "secure_password123"
}
```

**Response (200 OK):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 900,
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "scope": "read write"
}
```

**Refresh Token Request:**
```json
{
  "grant_type": "refresh_token",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Using Access Tokens

Include the access token in the `Authorization` header:

```bash
curl -H "Authorization: Bearer <access_token>" \
  https://api.harmonyflow.io/v1/sessions
```

### Revoke Token

**Endpoint:** `POST /auth/token/revoke`

**Request Body:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type_hint": "access_token"
}
```

---

## API Endpoints

### Health Endpoints

#### GET /health

Health check endpoint that returns service status and dependency health.

**Authentication:** None required

**Response (200 OK):**
```json
{
  "status": "healthy",
  "timestamp": "2026-02-12T12:00:00Z",
  "version": "1.0.0",
  "services": {
    "database": "connected",
    "cache": "connected",
    "messageQueue": "connected"
  },
  "uptime": 86400
}
```

#### GET /health/ready

Kubernetes readiness probe.

**Authentication:** None required

**Response (200 OK):**
```json
{
  "ready": true
}
```

#### GET /health/live

Kubernetes liveness probe.

**Authentication:** None required

**Response (200 OK):**
```json
{
  "alive": true
}
```

---

### Session Endpoints

#### POST /sessions

Create a new wellness session.

**Authentication:** Required

**Request Body:**
```json
{
  "name": "Morning Meditation",
  "type": "meditation",
  "settings": {
    "duration": 600,
    "audioEnabled": true,
    "hapticEnabled": false,
    "autoSave": true
  }
}
```

**Response (201 Created):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "userId": "user-123",
  "name": "Morning Meditation",
  "type": "meditation",
  "status": "active",
  "settings": {
    "duration": 600,
    "audioEnabled": true,
    "hapticEnabled": false,
    "autoSave": true
  },
  "createdAt": "2026-02-12T12:00:00Z",
  "updatedAt": "2026-02-12T12:00:00Z",
  "version": 1
}
```

---

#### GET /sessions

List all sessions for the authenticated user.

**Authentication:** Required

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| status | string | all | Filter by status: `active`, `paused`, `completed`, `archived` |
| type | string | all | Filter by session type |
| limit | integer | 20 | Number of results (1-100) |
| offset | integer | 0 | Pagination offset |

**Response (200 OK):**
```json
{
  "sessions": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "userId": "user-123",
      "name": "Morning Meditation",
      "type": "meditation",
      "status": "active",
      "createdAt": "2026-02-12T12:00:00Z",
      "version": 1
    }
  ],
  "total": 1,
  "limit": 20,
  "offset": 0
}
```

---

#### GET /sessions/{sessionId}

Get session details by ID.

**Authentication:** Required

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| sessionId | UUID | Session ID |

**Response (200 OK):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "userId": "user-123",
  "name": "Morning Meditation",
  "type": "meditation",
  "status": "active",
  "state": {
    "version": 42,
    "lastModified": "2026-02-12T12:30:00Z",
    "data": {
      "progress": 75,
      "currentModule": "breathing_exercise"
    }
  },
  "settings": {
    "duration": 600,
    "audioEnabled": true
  },
  "createdAt": "2026-02-12T12:00:00Z",
  "updatedAt": "2026-02-12T12:30:00Z",
  "version": 42
}
```

---

#### PATCH /sessions/{sessionId}

Update session properties.

**Authentication:** Required

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| sessionId | UUID | Session ID |

**Request Body:**
```json
{
  "name": "Updated Session Name",
  "status": "paused",
  "settings": {
    "duration": 900
  }
}
```

**Response (200 OK):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Updated Session Name",
  "status": "paused",
  "updatedAt": "2026-02-12T12:35:00Z",
  "version": 43
}
```

---

#### DELETE /sessions/{sessionId}

Delete a session permanently.

**Authentication:** Required

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| sessionId | UUID | Session ID |

**Response:** 204 No Content

---

### Session State Endpoints

#### GET /sessions/{sessionId}/state

Get the current state of a session.

**Authentication:** Required

**Response (200 OK):**
```json
{
  "version": 42,
  "lastModified": "2026-02-12T12:30:00Z",
  "modifiedBy": "device-abc-123",
  "data": {
    "progress": 75,
    "currentModule": "breathing_exercise",
    "userPreferences": {
      "theme": "dark",
      "textSize": "medium"
    }
  },
  "checksum": "a1b2c3d4e5f6..."
}
```

---

#### PUT /sessions/{sessionId}/state

Replace entire session state.

**Authentication:** Required

**Request Body:**
```json
{
  "version": 43,
  "lastModified": "2026-02-12T12:40:00Z",
  "modifiedBy": "device-xyz-789",
  "data": {
    "progress": 80,
    "currentModule": "meditation_complete"
  },
  "checksum": "z9y8x7w6v5u..."
}
```

**Response (200 OK):** Updated state

---

#### PATCH /sessions/{sessionId}/state/delta

Apply incremental state changes (optimistic updates).

**Authentication:** Required

**Request Body:**
```json
{
  "baseVersion": 42,
  "operations": [
    {
      "op": "replace",
      "path": "/data/progress",
      "value": 80
    },
    {
      "op": "add",
      "path": "/data/notes/-",
      "value": "Feeling better today"
    }
  ],
  "checksum": "checksum123"
}
```

**Response (200 OK):** Updated state

---

### Snapshot Endpoints

#### GET /sessions/{sessionId}/snapshots

List all state snapshots for a session.

**Authentication:** Required

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| limit | integer | 50 | Number of snapshots |
| before | datetime | now | Get snapshots before this time |

**Response (200 OK):**
```json
{
  "snapshots": [
    {
      "id": "snap-001",
      "sessionId": "550e8400-e29b-41d4-a716-446655440000",
      "version": 40,
      "label": "Before meditation",
      "createdAt": "2026-02-12T12:00:00Z",
      "createdBy": "device-abc-123"
    }
  ],
  "total": 1
}
```

---

#### POST /sessions/{sessionId}/snapshots

Create a manual state snapshot.

**Authentication:** Required

**Request Body:**
```json
{
  "label": "Checkpoint before break"
}
```

**Response (201 Created):**
```json
{
  "id": "snap-002",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "version": 42,
  "label": "Checkpoint before break",
  "state": { /* current state */ },
  "createdAt": "2026-02-12T12:30:00Z"
}
```

---

### Device Endpoints

#### GET /sessions/{sessionId}/devices

List all devices connected to a session.

**Authentication:** Required

**Response (200 OK):**
```json
{
  "devices": [
    {
      "id": "device-abc-123",
      "type": "web",
      "name": "Chrome on MacBook Pro",
      "userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X...)",
      "connectedAt": "2026-02-12T12:00:00Z",
      "lastSeen": "2026-02-12T12:30:00Z",
      "capabilities": ["audio", "haptic", "camera"]
    },
    {
      "id": "device-xyz-789",
      "type": "ios",
      "name": "iPhone 15 Pro",
      "userAgent": "HarmonyFlow/1.0 (iOS 17.2)...",
      "connectedAt": "2026-02-12T12:15:00Z",
      "lastSeen": "2026-02-12T12:29:00Z",
      "capabilities": ["audio", "haptic"]
    }
  ]
}
```

---

## WebSocket Protocol

### Connection URL

```
wss://api.harmonyflow.io/v1/ws/sessions/{sessionId}?token={jwt_token}&deviceId={deviceId}
```

### Connection Flow

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
└─────────┘                 └─────────┘
```

### Message Format

All messages use JSON envelope:

```json
{
  "id": "uuid-v4",
  "type": "message_type",
  "timestamp": "2026-02-12T12:00:00Z",
  "payload": {}
}
```

### Client → Server Messages

| Type | Description | Payload |
|------|-------------|---------|
| `subscribe` | Subscribe to session updates | `{ "sessionId": "string", "lastVersion": 42 }` |
| `unsubscribe` | Unsubscribe from session | `{ "sessionId": "string" }` |
| `heartbeat` | Keep connection alive | `{}` |
| `state_update` | Push local state changes | `{ "state": SessionState }` |
| `ack` | Acknowledge received message | `{ "messageId": "string" }` |

### Server → Client Messages

| Type | Description | Payload |
|------|-------------|---------|
| `connected` | Connection established | `{ "sessionId": "string", "serverTime": "ISO8601" }` |
| `state_sync` | Full state synchronization | `{ "state": SessionState, "version": number }` |
| `state_delta` | Incremental state update | `{ "delta": StateDelta, "version": number }` |
| `device_joined` | New device connected | `{ "device": DeviceInfo }` |
| `device_left` | Device disconnected | `{ "deviceId": "string" }` |
| `error` | Error notification | `{ "code": "string", "message": "string" }` |
| `ping` | Server heartbeat | `{ "timestamp": "ISO8601" }` |

### Heartbeat Protocol

- Client sends `heartbeat` every 30 seconds
- Server responds with `ping` acknowledgment
- Missing 3 consecutive heartbeats = connection timeout

### Connection Example

```javascript
const ws = new WebSocket(
  'wss://api.harmonyflow.io/v1/ws/sessions/550e8400-e29b-41d4-a716-446655440000?token=jwt_here&deviceId=device-123'
);

ws.onopen = () => {
  console.log('Connected');
  
  // Subscribe to session updates
  ws.send(JSON.stringify({
    id: generateUUID(),
    type: 'subscribe',
    timestamp: new Date().toISOString(),
    payload: {
      sessionId: '550e8400-e29b-41d4-a716-446655440000',
      lastVersion: 42
    }
  }));
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log('Received:', message.type, message.payload);
};

// Send heartbeat every 30 seconds
setInterval(() => {
  ws.send(JSON.stringify({
    id: generateUUID(),
    type: 'heartbeat',
    timestamp: new Date().toISOString(),
    payload: {}
  }));
}, 30000);
```

---

## Error Handling

### Error Response Format

All error responses follow this format:

```json
{
  "code": "ERROR_CODE",
  "message": "Human-readable error message",
  "details": {
    "field": "additional context"
  },
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

### HTTP Status Codes

| Status | Description | Example Codes |
|--------|-------------|---------------|
| 200 | Success | - |
| 201 | Created | - |
| 204 | No Content | - |
| 400 | Bad Request | `INVALID_REQUEST`, `VALIDATION_ERROR` |
| 401 | Unauthorized | `UNAUTHORIZED`, `TOKEN_EXPIRED`, `INVALID_TOKEN` |
| 403 | Forbidden | `FORBIDDEN`, `INSUFFICIENT_PERMISSIONS` |
| 404 | Not Found | `NOT_FOUND`, `SESSION_NOT_FOUND` |
| 409 | Conflict | `VERSION_CONFLICT`, `DUPLICATE_RESOURCE` |
| 422 | Unprocessable Entity | `INVALID_STATE`, `OPERATION_NOT_ALLOWED` |
| 429 | Rate Limited | `RATE_LIMITED` |
| 500 | Internal Server Error | `INTERNAL_ERROR`, `DATABASE_ERROR` |
| 503 | Service Unavailable | `SERVICE_UNAVAILABLE`, `DEPENDENCY_DOWN` |

### Error Codes

#### Authentication Errors

| Code | Message | Resolution |
|------|---------|------------|
| `UNAUTHORIZED` | Authentication required | Provide valid JWT token |
| `TOKEN_EXPIRED` | Access token expired | Refresh token using `/auth/token/refresh` |
| `INVALID_TOKEN` | Invalid token format | Check token structure |
| `REFRESH_TOKEN_INVALID` | Refresh token invalid | Re-authenticate |

#### Session Errors

| Code | Message | Resolution |
|------|---------|------------|
| `SESSION_NOT_FOUND` | Session does not exist | Verify session ID |
| `SESSION_EXPIRED` | Session has expired | Create new session |
| `SESSION_LOCKED` | Session is locked | Contact support |

#### State Errors

| Code | Message | Resolution |
|------|---------|------------|
| `VERSION_CONFLICT` | State version mismatch | Fetch latest state and retry |
| `INVALID_STATE` | Invalid state data | Validate state structure |
| `STATE_TOO_LARGE` | State exceeds size limit | Reduce state size |

#### Rate Limiting

| Code | Message | Resolution |
|------|---------|------------|
| `RATE_LIMITED` | Too many requests | Wait and retry |

#### Request Headers for Rate Limiting

| Header | Description |
|--------|-------------|
| `X-RateLimit-Limit` | Request limit per window |
| `X-RateLimit-Remaining` | Remaining requests |
| `X-RateLimit-Reset` | Unix timestamp of reset |

---

## Rate Limiting

### Overview

The API enforces rate limits to prevent abuse and ensure fair usage.

### Rate Limit Tiers

| Tier | Requests/Hour | Description |
|------|---------------|-------------|
| Unauthenticated | 100 | Public endpoints |
| Authenticated User | 1,000 | Regular users |
| Premium User | 5,000 | Premium subscribers |
| Service Account | 10,000 | Internal services |

### WebSocket Limits

| Limit | Value |
|-------|-------|
| Connections per IP | 10 |
| Messages per minute per connection | 100 |
| Max message size | 64KB |
| Connection timeout | 120 seconds (no heartbeat) |

### Rate Limit Headers

Rate limit information is included in response headers:

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 950
X-RateLimit-Reset: 1707734400
```

### Handling Rate Limits

When rate limited (HTTP 429):

```javascript
try {
  const response = await fetch('/api/v1/sessions');
  if (response.status === 429) {
    const resetTime = parseInt(response.headers.get('X-RateLimit-Reset'));
    const waitTime = resetTime - Math.floor(Date.now() / 1000);
    await sleep(waitTime * 1000);
    return fetch('/api/v1/sessions');
  }
} catch (error) {
  console.error('Request failed:', error);
}
```

---

## CORS Configuration

### Allowed Origins

Requests are accepted from the following origins:

- `https://app.harmonyflow.io`
- `https://www.harmonyflow.io`
- `https://staging.harmonyflow.io` (staging only)

### CORS Headers

The API includes the following CORS headers:

```
Access-Control-Allow-Origin: <request-origin>
Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type, X-Requested-With
Access-Control-Allow-Credentials: true
Access-Control-Max-Age: 86400
```

### Preflight Requests

For non-simple requests, the browser sends a preflight OPTIONS request:

```bash
curl -X OPTIONS https://api.harmonyflow.io/v1/sessions \
  -H "Origin: https://app.harmonyflow.io" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Authorization, Content-Type"
```

---

## Examples

### Complete Session Lifecycle

```javascript
// 1. Authenticate
const authResponse = await fetch('https://api.harmonyflow.io/v1/auth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    grant_type: 'password',
    username: 'user@example.com',
    password: 'password123'
  })
});
const { access_token, refresh_token } = await authResponse.json();

// 2. Create session
const sessionResponse = await fetch('https://api.harmonyflow.io/v1/sessions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${access_token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'Morning Meditation',
    type: 'meditation',
    settings: { duration: 600, audioEnabled: true }
  })
});
const session = await sessionResponse.json();

// 3. Connect via WebSocket
const ws = new WebSocket(
  `wss://api.harmonyflow.io/v1/ws/sessions/${session.id}?token=${access_token}&deviceId=${deviceId}`
);

ws.onopen = () => {
  ws.send(JSON.stringify({
    id: generateUUID(),
    type: 'subscribe',
    timestamp: new Date().toISOString(),
    payload: { sessionId: session.id }
  }));
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.type === 'state_sync') {
    console.log('State synced:', message.payload.state);
  }
};

// 4. Update state
await fetch(`https://api.harmonyflow.io/v1/sessions/${session.id}/state/delta`, {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${access_token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    baseVersion: session.version,
    operations: [
      { op: 'replace', path: '/data/progress', value: 75 }
    ]
  })
});

// 5. Handoff to another device
// (See multi-device handoff documentation)
```

---

### Error Handling Example

```javascript
async function makeAPIRequest(url, options) {
  try {
    const response = await fetch(url, options);
    
    // Handle rate limiting
    if (response.status === 429) {
      const resetTime = parseInt(response.headers.get('X-RateLimit-Reset'));
      const waitTime = resetTime - Math.floor(Date.now() / 1000);
      console.log(`Rate limited. Waiting ${waitTime} seconds...`);
      await sleep(waitTime * 1000);
      return makeAPIRequest(url, options);
    }
    
    // Handle token expiration
    if (response.status === 401) {
      const error = await response.json();
      if (error.code === 'TOKEN_EXPIRED') {
        const newToken = await refreshToken();
        options.headers.Authorization = `Bearer ${newToken}`;
        return makeAPIRequest(url, options);
      }
    }
    
    // Handle other errors
    if (!response.ok) {
      const error = await response.json();
      throw new APIError(error.code, error.message, error.requestId);
    }
    
    return await response.json();
  } catch (error) {
    console.error('API request failed:', error);
    throw error;
  }
}

class APIError extends Error {
  constructor(code, message, requestId) {
    super(message);
    this.code = code;
    this.requestId = requestId;
  }
}
```

---

## SDKs and Libraries

Official SDKs are available:

- **JavaScript/TypeScript:** `@harmonyflow/syncbridge-sdk`
- **iOS Swift:** `HarmonyFlowSyncBridge`
- **Android Kotlin:** `com.harmonyflow.syncbridge`

See SDK documentation for language-specific usage.

---

## Support

- **Documentation:** https://docs.harmonyflow.io
- **API Status:** https://status.harmonyflow.io
- **Support Email:** api@harmonyflow.io
- **GitHub Issues:** https://github.com/harmonyflow/syncbridge/issues

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-02-12 | Initial release |

---

**Document Version:** 1.0.0  
**Last Updated:** 2026-02-12  
**Next Review:** 2026-05-12
