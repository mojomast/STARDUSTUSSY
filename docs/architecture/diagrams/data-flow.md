# Data Flow Diagram

**Description:** Detailed data flow showing how session state synchronizes across devices.

## ASCII Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Data Flow: Session Sync                        │
└─────────────────────────────────────────────────────────────────────┘

┌──────────────┐
│   Device A   │
│  (e.g., Web) │
└──────┬───────┘
       │
       │ 1. Start Session
       │    POST /sessions
       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Session State Service                           │
│                                                                   │
│  ┌─────────────┐                                                │
│  │  Auth Check │──► Verify JWT token                             │
│  └──────┬──────┘                                                │
│         │                                                         │
│         ▼                                                         │
│  ┌─────────────┐                                                │
│  │ Create Sess.│──► Generate session ID                          │
│  └──────┬──────┘                                                │
│         │                                                         │
│         ▼                                                         │
│  ┌─────────────┐                                                │
│  │ Initialize  │──► Create initial state                         │
│  │    State    │                                                │
│  └──────┬──────┘                                                │
└─────────┼──────────────────────────────────────────────────────────┘
          │
          │ 2. Store Initial State
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                      Redis Cluster                          │  │
│  │                                                              │  │
│  │  Key: session:{session_id}:state                             │  │
│  │  Value: {                                                   │  │
│  │    version: 1,                                              │  │
│  │    data: {progress: 0, settings: {...}},                     │  │
│  │    timestamp: "2026-02-12T12:00:00Z"                        │  │
│  │  }                                                          │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    PostgreSQL                                │  │
│  │                                                              │  │
│  │  Table: sessions                                             │  │
│  │  - id (UUID)                                                │  │
│  │  - user_id (UUID)                                            │  │
│  │  - name (VARCHAR)                                            │  │
│  │  - type (ENUM)                                              │  │
│  │  - status (ENUM)                                            │  │
│  │  - created_at (TIMESTAMP)                                   │  │
│  └──────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────┘
          │
          │ 3. Return Session Created
          ▼
┌──────────────┐
│   Device A   │
│  (Session    │
│   Started)   │
└──────┬───────┘
       │
       │ 4. User Makes Progress
       │    (completes module)
       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Session State Service                           │
│                                                                   │
│  ┌─────────────┐                                                │
│  │  Auth Check │──► Verify JWT, device ownership                  │
│  └──────┬──────┘                                                │
│         │                                                         │
│         ▼                                                         │
│  ┌─────────────┐                                                │
│  │ Validate    │──► Check state version (optimistic lock)         │
│  │ Version     │                                                │
│  └──────┬──────┘                                                │
│         │                                                         │
│         ▼                                                         │
│  ┌─────────────┐                                                │
│  │ Apply Delta │──► Update state incrementally                   │
│  │   (JSON     │    {                                           │
│  │   Patch)    │      op: "replace",                             │
│  └──────┬──────┘        path: "/data/progress",                 │
│         │              value: 25                                │
│         ▼      }                                                 │
│  ┌─────────────┐                                                │
│  │ Increment   │──► version++                                   │
│  │   Version   │                                                │
│  └──────┬──────┘                                                │
└─────────┼──────────────────────────────────────────────────────────┘
          │
          │ 5. Update State in Redis
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        Redis Cluster                               │
│                                                                   │
│  Key: session:{session_id}:state                                 │
│  Value: {                                                         │
│    version: 2,                                                    │
│    data: {progress: 25, settings: {...}},                         │
│    lastModified: "2026-02-12T12:05:00Z"                          │
│    modifiedBy: "device-123"                                       │
│  }                                                                │
│                                                                   │
│  Also create snapshot:                                            │
│  Key: session:{session_id}:snapshot:{version}                     │
│  Value: {state snapshot with checksum}                            │
└───────────────────────────────────────────────────────────────────────┘
          │
          │ 6. Publish State Update Event
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      RabbitMQ                                     │
│                                                                   │
│  Exchange: session_updates                                        │
│  Routing Key: session.{session_id}.update                         │
│  Message: {                                                       │
│    sessionId: "...",                                              │
│    version: 2,                                                    │
│    delta: {...},                                                  │
│    deviceId: "device-123",                                         │
│    timestamp: "2026-02-12T12:05:00Z"                              │
│  }                                                                │
└───────────────────────────────────────────────────────────────────────┘
          │
          │ 7. WebSocket Broadcast
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    WebSocket Connections                           │
│                                                                   │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │  Device A    │    │  Device B    │    │  Device C    │      │
│  │  (connected) │    │ (connected)  │    │ (connected)  │      │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘      │
│         │                    │                    │               │
│         │ 8. state_delta msg  │                    │               │
│         │────────────────────►│                    │               │
│         │                    │                    │               │
│         │                    │ 8. state_delta msg │               │
│         │                    │────────────────────►               │
│         │                    │                                    │
└─────────┼────────────────────┼────────────────────┼───────────────┘
          │                    │                    │
          │ 9. Apply Update    │                    │
          ▼                    ▼                    ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  Device A    │    │  Device B    │    │  Device C    │
│  (state      │    │ (state       │    │ (state       │
│   updated)   │    │   synced)    │    │   synced)    │
└──────────────┘    └──────────────┘    └──────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                    Multi-Device Handoff Flow                        │
└─────────────────────────────────────────────────────────────────────┘

┌──────────────┐                    ┌──────────────┐
│  Device A    │                    │  Device B    │
│  (Phone)     │                    │ (Laptop)     │
└──────┬───────┘                    └──────┬───────┘
       │                                   │
       │ 1. Pause Session                   │
       │    POST /sessions/{id}?status=paused│
       ▼                                   │
┌─────────────────────────────────────────────────────────────────────┐
│                     Session State Service                           │
│  • Mark session as paused                                        │
│  • Create final state snapshot                                    │
│  • Notify all connected devices                                    │
└─────────┬──────────────────────────────────────────────────────────┘
          │
          │ 2. Device B Connects
          ▼
┌──────────────┐
│  Device B    │
│  • Opens app  │
│  • Scans QR   │
│  • Or logs in │
└──────┬───────┘
       │
       │ 3. GET /sessions/{id}
       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Session State Service                           │
│  • Fetch session metadata from PostgreSQL                           │
│  • Fetch latest state from Redis                                    │
│  • Verify device authorization                                       │
└─────────┬──────────────────────────────────────────────────────────┘
          │
          │ 4. Return Session + State
          ▼
┌──────────────┐
│  Device B    │
│  • Display session UI
│  • Reconstruct state
│  • Show "Continue" button
└──────┬───────┘
       │
       │ 5. Tap "Continue"
       │    POST /sessions/{id}?status=active
       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Session State Service                           │
│  • Update session status to active                                  │
│  • Associate new device with session                                │
│  • Broadcast device_joined to other devices                         │
└─────────┬──────────────────────────────────────────────────────────┘
          │
          │ 6. WebSocket Connection
          ▼
┌──────────────┐
│  Device B    │
│  • Connects WebSocket
│  • Receives full state sync
│  • Session active
└──────────────┘

Latency Breakdown:
- API Request (Device A → Service): 10ms
- State Update (Redis): 5ms
- Event Publish (RabbitMQ): 5ms
- WebSocket Broadcast (Service → Device B): 20ms
- State Apply (Device B): 5ms
- ─────────────────────────────────────────────
- Total Handoff Latency: ~45ms
```

## Key Data Flow Patterns

### 1. State Update Flow
1. Client sends state delta
2. Service validates version (optimistic locking)
3. Service updates Redis atomically
4. Service publishes update event
5. WebSocket broadcasts to all connected devices
6. Clients apply update locally

### 2. Multi-Device Handoff Flow
1. Source device pauses session
2. Service creates final snapshot
3. Target device requests session
4. Service returns metadata + state
5. User resumes on target device
6. Service switches active device
7. All devices notified of change

### 3. Conflict Resolution
- Optimistic locking via version numbers
- Last-write-wins with version validation
- Delta operations (JSON Patch) for granular updates
- Automatic rollback on version conflict

## Data Structures

### Session State (Redis)
```json
{
  "version": 42,
  "lastModified": "2026-02-12T12:05:00Z",
  "modifiedBy": "device-123",
  "data": {
    "progress": 75,
    "currentModule": "meditation_3",
    "userNotes": "Feeling better today",
    "preferences": {
      "theme": "dark",
      "audioEnabled": true
    }
  },
  "checksum": "sha256_hash"
}
```

### State Delta (WebSocket)
```json
{
  "baseVersion": 41,
  "operations": [
    {
      "op": "replace",
      "path": "/data/progress",
      "value": 75
    },
    {
      "op": "add",
      "path": "/data/userNotes/-",
      "value": "New note"
    }
  ],
  "checksum": "sha256_hash"
}
```

### Session Metadata (PostgreSQL)
```sql
CREATE TABLE sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP,
  version INTEGER NOT NULL DEFAULT 1
);
```

---

**File:** data-flow.diagram  
**Format:** ASCII  
**Last Updated:** 2026-02-12
