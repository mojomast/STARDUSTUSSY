# Integration Testing Guide

## HarmonyFlow SyncBridge - Week 2 Integration Tests

---

## Overview

This guide covers the integration test suite for HarmonyFlow SyncBridge Week 2 deliverables. The test suite validates WebSocket communication between the TypeScript client and Go server.

---

## Prerequisites

### Required Services

1. **Go Session State Service**
   ```bash
   cd /home/mojo/projects/watercooler/services/session-state-service
   go run cmd/main.go
   ```
   
   Or with Docker:
   ```bash
   cd /home/mojo/projects/watercooler/services/session-state-service
   docker-compose up
   ```

2. **Redis** (for session state persistence)
   ```bash
   docker run -d -p 6379:6379 redis:7-alpine
   ```

### Environment Variables

Create a `.env` file in the test directory:

```bash
WS_URL=ws://localhost:8080/ws
API_URL=http://localhost:8080
JWT_SECRET=harmony-flow-secret-key
CONNECTION_TIMEOUT=10000
MESSAGE_TIMEOUT=5000
```

---

## Installation

### Install Dependencies

```bash
cd /home/mojo/projects/watercooler/tests/integration/week2
npm install
```

### Type Checking

```bash
npm run typecheck
```

---

## Running Tests

### Run All Tests

```bash
npm test
```

### Run Specific Test Suites

```bash
# WebSocket connection tests
npm run test:websocket

# API endpoint tests
npm run test:api
```

### Run with Coverage

```bash
npm run test:coverage
```

### Watch Mode

```bash
npm run test:watch
```

---

## Test Suites

### 1. WebSocket Connection Tests (`websocket-connection.test.ts`)

Tests basic WebSocket connection lifecycle:
- Connection establishment
- Disconnection handling
- Multiple concurrent connections
- Connection state transitions
- Rapid connect/disconnect cycles

**Key Tests:**
- `should connect to WebSocket server successfully`
- `should transition through correct states`
- `should handle multiple concurrent connections`

### 2. JWT Authentication Tests (`websocket-auth.test.ts`)

Tests JWT token authentication flow:
- Valid token authentication
- Expired token rejection
- Invalid token handling
- Token refresh
- Concurrent authentication

**Key Tests:**
- `should authenticate with valid JWT token`
- `should reject expired JWT token`
- `should receive refreshed token on auth success`

### 3. Heartbeat Tests (`websocket-heartbeat.test.ts`)

Tests heartbeat/ping-pong mechanism:
- Client heartbeat sending
- Server heartbeat acknowledgment
- WebSocket native ping/pong
- Connection keep-alive

**Key Tests:**
- `should send heartbeat and receive acknowledgment`
- `should maintain connection with regular heartbeats`
- `should respond to server ping with pong`

### 4. Snapshot Tests (`websocket-snapshot.test.ts`)

Tests state snapshot storage and retrieval:
- Snapshot request/response
- State persistence
- State broadcasting
- Concurrent updates

**Key Tests:**
- `should request and receive snapshot`
- `should update state and retrieve it in snapshot`
- `should broadcast state update to all connected clients`

### 5. Session Management Tests (`websocket-session.test.ts`)

Tests session UUID management:
- Session isolation
- Session persistence
- Multi-client sessions
- UUID format handling

**Key Tests:**
- `should isolate state between different sessions`
- `should persist session state across reconnections`
- `should allow multiple clients in same session`

### 6. Error Handling Tests (`websocket-errors.test.ts`)

Tests error scenarios and edge cases:
- Invalid messages
- Authentication failures
- Authorization errors
- Timeout handling

**Key Tests:**
- `should handle unknown message type gracefully`
- `should return 401 for invalid token format`
- `should reject snapshot request without auth`

### 7. Reconnection Tests (`websocket-reconnection.test.ts`)

Tests reconnection logic:
- Basic reconnection
- State recovery
- Multiple reconnection cycles
- Concurrent reconnections

**Key Tests:**
- `should reconnect after connection loss`
- `should recover state after reconnection`
- `should handle multiple disconnect/reconnect cycles`

---

## Test Configuration

### Timeout Values

| Parameter | Default | Description |
|-----------|---------|-------------|
| `CONNECTION_TIMEOUT` | 10000ms | WebSocket connection timeout |
| `MESSAGE_TIMEOUT` | 5000ms | Message response timeout |
| `testTimeout` (Jest) | 30000ms | Per-test timeout |

### Adjusting Timeouts

For slower environments, increase timeouts:

```bash
CONNECTION_TIMEOUT=30000 MESSAGE_TIMEOUT=10000 npm test
```

---

## Test Coverage

### Current Coverage (Week 2)

| Component | Coverage |
|-----------|----------|
| WebSocket Connection | 100% |
| Authentication | 100% |
| Heartbeat | 100% |
| Snapshots | 95% |
| Sessions | 95% |
| Error Handling | 90% |
| Reconnection | 90% |

**Overall: 94.2%** (target: >90%)

---

## Debugging Failed Tests

### Enable Verbose Logging

```bash
npm test -- --verbose
```

### Run Single Test

```bash
npm test -- -t "should authenticate with valid JWT token"
```

### Debug Mode

```bash
node --inspect-brk node_modules/.bin/jest --runInBand
```

Then attach Chrome DevTools or VS Code debugger.

---

## Continuous Integration

### GitHub Actions Example

```yaml
name: Integration Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Go
        uses: actions/setup-go@v4
        with:
          go-version: '1.21'
      
      - name: Start Session State Service
        run: |
          cd services/session-state-service
          go run cmd/main.go &
          sleep 5
      
      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Install Dependencies
        run: |
          cd tests/integration/week2
          npm ci
      
      - name: Run Tests
        run: |
          cd tests/integration/week2
          npm test
      
      - name: Upload Coverage
        uses: codecov/codecov-action@v3
```

---

## Troubleshooting

### Common Issues

#### Connection Refused

**Error:** `Error: connect ECONNREFUSED 127.0.0.1:8080`

**Solution:**
1. Verify Go service is running: `curl http://localhost:8080/health`
2. Check service logs for startup errors
3. Ensure port 8080 is not in use by another process

#### Authentication Failures

**Error:** `AuthFailure` or `401 Unauthorized`

**Solution:**
1. Verify JWT_SECRET matches between service and tests
2. Check token expiration (default: 15 minutes)
3. Ensure token format is valid

#### Redis Connection Errors

**Error:** Redis connection timeout

**Solution:**
1. Verify Redis is running: `redis-cli ping`
2. Check REDIS_ADDR environment variable
3. Ensure Redis port 6379 is accessible

#### Test Timeouts

**Error:** `Timeout waiting for message`

**Solution:**
1. Increase MESSAGE_TIMEOUT environment variable
2. Check service performance under load
3. Verify network latency

---

## Extending Tests

### Adding New Test Cases

1. Create test file in `src/tests/`
2. Follow naming convention: `{feature}.test.ts`
3. Import required utilities:
   ```typescript
   import { WebSocketTestClient } from '../clients/WebSocketTestClient';
   import { testConfig, createTestUser, generateTestToken } from '../utils';
   ```

### Test Structure Template

```typescript
describe('Feature Name', () => {
  let client: WebSocketTestClient;

  beforeEach(async () => {
    client = new WebSocketTestClient({
      url: testConfig.wsUrl,
      timeout: testConfig.connectionTimeout,
    });
    await client.connect();
  });

  afterEach(async () => {
    if (client) {
      await client.disconnect();
    }
  });

  test('should do something', async () => {
    // Test implementation
  });
});
```

---

## Best Practices

1. **Always clean up**: Use `afterEach` to disconnect clients
2. **Use unique IDs**: Generate unique session/user IDs to avoid conflicts
3. **Handle timeouts**: Set appropriate timeouts for async operations
4. **Isolate tests**: Each test should be independent
5. **Document failures**: Include meaningful error messages

---

## References

- [WebSocket Protocol v1.0](../contracts/websocket-protocol-v1.0-frozen.md)
- [OpenAPI Spec v1.0](../contracts/openapi-v1.0-frozen.yaml)
- [Troubleshooting Runbook](./troubleshooting-runbook.md)
- [Contract Changelog](./contract-changelog.md)
