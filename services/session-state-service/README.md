# Session State Service

The Session State Service is a critical component of the HarmonyFlow SyncBridge wellness platform, managing WebSocket connections and user session state for cross-device continuity.

## Overview

This service provides:
- WebSocket connection management (10,000+ concurrent connections)
- Redis-backed session snapshot storage with 7-day TTL
- JWT authentication and token refresh
- Real-time state synchronization across devices
- Protocol buffer message serialization
- HTTP REST API for snapshot management
- **Multi-device session tracking and handoff** (NEW in v1.1.0)
- **Device presence monitoring** (NEW in v1.1.0)
- **Incremental snapshot updates** (NEW in v1.1.0)
- **Conflict resolution** (NEW in v1.1.0)
- **Admin dashboard endpoints** (NEW in v1.1.0)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Session State Service                    │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   WebSocket  │  │  HTTP API    │  │   Auth       │      │
│  │   Handler    │  │  Handler     │  │ Middleware   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│         │                  │                  │             │
│  ┌──────▼──────────────────▼──────────────────▼──────┐      │
│  │              Protocol Manager                      │      │
│  │  (Connection Pool, Broadcasting, Device Tracking)  │      │
│  └──────────────────────┬─────────────────────────────┘      │
│                         │                                   │
│  ┌──────────────────────▼─────────────────────────────┐      │
│  │               Redis Client                         │      │
│  │  (Snapshots, User Sessions, Device Registry, TTL)  │      │
│  └────────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

## Features

### 1. WebSocket Server Core
- Gorilla WebSocket implementation
- Connection pool management (handles 10k+ connections)
- Per-connection goroutines with proper lifecycle
- Heartbeat/ping-pong protocol
- Automatic reconnection support

### 2. Multi-Device Support (NEW)
- Track multiple connections per user session
- Device identification and metadata storage
- Real-time presence tracking (online/offline status)
- Device handoff between sessions
- Cross-device state synchronization

### 3. Enhanced Snapshot Management (NEW)
- Snapshot versioning for conflict detection
- Incremental snapshot updates
- Snapshot compression for large states
- Conflict resolution with multiple strategies

### 4. Redis Integration
- go-redis client with connection pooling
- Snapshot storage and retrieval (<50ms)
- User session indexing
- Device registry management
- TTL management (7 days default)
- Pipeline operations for performance

### 5. Authentication
- JWT token validation
- Token refresh logic (15min access, 7 day refresh)
- Role-based authorization
- Device identification
- Admin privileges

### 6. Protocol Implementation
- Message serialization (JSON)
- Heartbeat/ping-pong mechanism
- Error handling and propagation
- State update broadcasting
- Device join/leave notifications
- Admin update channel

### 7. Admin Dashboard (NEW)
- Real-time metrics endpoints
- Session statistics
- Connection metrics
- Snapshot volume data
- WebSocket admin channel for real-time updates

## HTTP Endpoints

### Session Management
- `POST /session/snapshot` - Create/update session snapshot
- `GET /session/:uuid` - Retrieve session snapshot
- `POST /session/incremental` - Apply incremental update (NEW)
- `POST /session/conflict/resolve` - Resolve state conflicts (NEW)

### Multi-Device APIs (NEW)
- `GET /session/:uuid/devices` - List all connected devices
- `POST /session/:uuid/handoff` - Initiate device handoff
- `GET /session/:uuid/handoff/:token` - Validate handoff token
- `DELETE /session/:uuid/device/:device_id` - Disconnect device

### Admin Dashboard (NEW)
- `GET /admin/metrics/sessions` - Active sessions stats
- `GET /admin/metrics/connections` - Connection metrics
- `GET /admin/metrics/snapshots` - Snapshot volume data
- `GET /admin/metrics/all` - All metrics combined
- `GET /admin/sessions` - List active sessions
- `GET /admin/connections` - List active connections
- `POST /admin/broadcast` - Broadcast message to admin channel

### WebSocket
- `GET /ws` - WebSocket upgrade endpoint

## API Examples

### Create Snapshot
```bash
curl -X POST http://localhost:8080/session/snapshot \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "550e8400-e29b-41d4-a716-446655440000",
    "user_id": "user-123",
    "state_data": {
      "meditation_progress": 75,
      "current_mood": "calm",
      "streak_days": 12
    },
    "device_id": "device-456",
    "app_version": "2.1.0",
    "version": 1
  }'
```

### Get Snapshot
```bash
curl http://localhost:8080/session/550e8400-e29b-41d4-a716-446655440000
```

### Apply Incremental Update (NEW)
```bash
curl -X POST http://localhost:8080/session/incremental \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "550e8400-e29b-41d4-a716-446655440000",
    "user_id": "user-123",
    "device_id": "device-789",
    "base_version": 1,
    "changes": {
      "meditation_progress": 80
    },
    "deleted_keys": []
  }'
```

### Resolve Conflict (NEW)
```bash
curl -X POST http://localhost:8080/session/conflict/resolve \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "550e8400-e29b-41d4-a716-446655440000",
    "client_version": 2,
    "client_state": {
      "meditation_progress": 85
    },
    "resolution_strategy": "server_wins"
  }'
```

### List Session Devices (NEW)
```bash
curl http://localhost:8080/session/550e8400-e29b-41d4-a716-446655440000/devices
```

### Initiate Device Handoff (NEW)
```bash
curl -X POST http://localhost:8080/session/550e8400-e29b-41d4-a716-446655440000/handoff \
  -H "Content-Type: application/json" \
  -d '{
    "source_device": "device-phone",
    "target_device": "device-tablet"
  }'
```

### Validate Handoff Token (NEW)
```bash
curl http://localhost:8080/session/550e8400-e29b-41d4-a716-446655440000/handoff/{token}
```

### Disconnect Device (NEW)
```bash
curl -X DELETE http://localhost:8080/session/550e8400-e29b-41d4-a716-446655440000/device/device-456
```

### Admin: Get All Metrics (NEW)
```bash
curl http://localhost:8080/admin/metrics/all
```

### Admin: Broadcast Message (NEW)
```bash
curl -X POST http://localhost:8080/admin/broadcast \
  -H "Content-Type: application/json" \
  -d '{
    "message": "System maintenance scheduled",
    "type": "notification"
  }'
```

### WebSocket Connection
```javascript
const ws = new WebSocket('ws://localhost:8080/ws');

// Authenticate
ws.send(JSON.stringify({
  type: 7, // AUTH
  payload: {
    token: 'eyJhbGciOiJIUzI1NiIs...',
    device_id: 'device-456',
    device_type: 'mobile',
    device_name: 'iPhone 13'
  }
}));

// Heartbeat
ws.send(JSON.stringify({
  type: 1, // HEARTBEAT
  payload: {
    client_time: Date.now()
  }
}));

// Update state
ws.send(JSON.stringify({
  type: 5, // STATE_UPDATE
  payload: {
    key: 'meditation_progress',
    value: 80,
    operation: 'SET'
  }
}));

// Request device list (NEW)
ws.send(JSON.stringify({
  type: 12, // DEVICE_LIST
  payload: {}
}));
```

## Configuration

Environment variables:

```env
# Server
SERVER_ADDR=:8080

# Redis
REDIS_ADDR=localhost:6379
REDIS_PASSWORD=
REDIS_DB=0

# JWT
JWT_SECRET=harmony-flow-secret-key
JWT_REFRESH_SECRET=harmony-flow-refresh-secret-key
```

## Running Locally

```bash
# Install dependencies
go mod tidy

# Run tests
go test -v ./...

# Run with coverage
go test -coverprofile=coverage.out ./...
go tool cover -html=coverage.out

# Run integration tests
go test -v -run TestMultiDevice ./internal/handlers/

# Start server
go run cmd/main.go
```

## Docker

```bash
# Build
docker build -t session-state-service .

# Run
docker run -p 8080:8080 \
  -e REDIS_ADDR=redis:6379 \
  -e JWT_SECRET=my-secret \
  session-state-service
```

## Testing

The service includes comprehensive tests with 80%+ coverage:

- **Unit Tests**: Component isolation testing
- **Integration Tests**: End-to-end flow testing including multi-device scenarios
- **Benchmark Tests**: Performance validation

```bash
# Run all tests
go test ./...

# Run with race detection
go test -race ./...

# Run benchmarks
go test -bench=. ./...

# Run multi-device integration tests
go test -v -run TestMultiDevice ./internal/handlers/

# Run admin dashboard tests
go test -v -run TestAdmin ./internal/handlers/

# Run device handoff tests
go test -v -run TestDevice ./internal/handlers/

# Load testing (10k connections)
go test -run=TestLoad10kConnections -v
```

## Performance Metrics

- **Concurrent Connections**: 10,000+
- **Snapshot Storage**: <50ms
- **Snapshot Retrieval**: <50ms
- **Message Latency**: <10ms
- **Memory per Connection**: ~2KB
- **Device Handoff**: <100ms
- **Conflict Resolution**: <50ms

## Message Protocol

### Message Types
```go
const (
    MessageTypeUnknown = iota
    MessageTypeHeartbeat
    MessageTypeHeartbeatAck
    MessageTypeSnapshotRequest
    MessageTypeSnapshotResponse
    MessageTypeStateUpdate
    MessageTypeError
    MessageTypeAuth
    MessageTypeAuthSuccess
    MessageTypeAuthFailure
    MessageTypeDeviceJoined      // NEW
    MessageTypeDeviceLeft        // NEW
    MessageTypeDeviceList        // NEW
    MessageTypeBroadcast         // NEW
    MessageTypeAdminUpdate       // NEW
)
```

### Message Structure
```json
{
  "type": 1,
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "user_id": "user-123",
  "device_id": "device-456",
  "timestamp": 1699999999,
  "payload": {},
  "correlation_id": "uuid"
}
```

## Multi-Device Features

### Device Tracking
- Each device maintains a unique device ID
- Device metadata includes type, name, OS version
- Presence tracking with automatic timeout (2 minutes)
- Device registry in Redis with TTL

### Handoff Flow
1. Source device initiates handoff request
2. Server generates handoff token (valid for 5 minutes)
3. Token includes current session state
4. Target device validates token and receives state
5. Source device is notified of successful handoff

### Conflict Resolution
Three resolution strategies supported:
- **server_wins**: Server state takes precedence
- **client_wins**: Client state takes precedence
- **merge**: Both states are merged (client wins on conflicts)

## Deployment

### Kubernetes
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: session-state-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: session-state-service
  template:
    metadata:
      labels:
        app: session-state-service
    spec:
      containers:
      - name: session-state-service
        image: session-state-service:latest
        ports:
        - containerPort: 8080
        env:
        - name: REDIS_ADDR
          value: "redis-cluster:6379"
```

## Monitoring

Health endpoint returns:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z",
  "version": "1.1.0",
  "uptime": "72h15m30s",
  "active_connections": 5432,
  "metrics": {
    "snapshot_ttl_hours": 168,
    "multi_device_enabled": true,
    "versioning_enabled": true
  }
}
```

## License

Copyright (c) 2024 HarmonyFlow SyncBridge. All rights reserved.
