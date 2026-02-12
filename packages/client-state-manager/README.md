# Client State Manager

Complete client-side state management library for the HarmonyFlow SyncBridge wellness platform with real-time WebSocket synchronization.

## Features

- **State Management**: Centralized state management with path-based updates
- **WebSocket Sync**: Real-time bidirectional synchronization with Go Session State Service
- **Automatic Reconnection**: Exponential backoff reconnection (1s, 2s, 4s, 8s, max 60s)
- **Heartbeat/Ping-Pong**: Connection health monitoring
- **JWT Token Management**: Automatic token refresh and persistence
- **State Snapshots**: Save and restore state at any point
- **Delta Calculation**: Efficient incremental state updates
- **State Fingerprinting**: Fast change detection
- **Redux Integration**: Seamless Redux store synchronization
- **MobX Integration**: Reactive state synchronization
- **TypeScript**: Full TypeScript support
- **Conflict Resolution**: Multiple strategies (server-wins, client-wins, manual)

## Installation

```bash
npm install @harmonyflow/client-state-manager
```

## Quick Start

```typescript
import { StateManager, TokenManager } from '@harmonyflow/client-state-manager';

// Initialize token manager with auto-refresh
const tokenManager = new TokenManager({
  autoRefresh: true,
  refreshToken: async (refreshToken) => {
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    });
    return response.json();
  },
});

// Create state manager
const stateManager = new StateManager({
  deviceId: 'my-device',
  userId: 'user-123',
  sessionId: 'session-456',
  websocketUrl: 'wss://api.harmonyflow.io/v1/ws',
  token: tokenManager.getAccessToken() || '',
  autoSync: true,
  syncInterval: 30000,
});

// Initialize and connect
await stateManager.initialize();

// Set state values
stateManager.setState('user.name', 'John');
stateManager.setState('settings.theme', 'dark');

// Subscribe to changes
const unsubscribe = stateManager.subscribe((changes) => {
  console.log('State changed:', changes);
});

// Get current state
const state = stateManager.getState();
```

## WebSocket Connection States

The WebSocket client manages the following connection states:

- `CONNECTING`: Initial connection attempt
- `CONNECTED`: Successfully connected
- `SYNCING`: Receiving initial state synchronization
- `ACTIVE`: Normal operation, bidirectional communication
- `RECONNECTING`: Attempting to restore connection
- `CLOSED`: Connection terminated

## Reconnection Strategy

Automatic reconnection uses exponential backoff:

```
delay = min(base_delay * (2 ^ attempt), max_delay)
```

- Base delay: 1 second
- Max delay: 60 seconds
- Max attempts: 10
- Pattern: 1s, 2s, 4s, 8s, 16s, 32s, 60s, 60s...

## State Synchronization

### Auto Sync

```typescript
const stateManager = new StateManager({
  autoSync: true,
  syncInterval: 30000, // Sync every 30 seconds
});
```

### Manual Sync

```typescript
stateManager.setState('key', 'value');
await stateManager.sync(); // Force immediate sync
```

### Conflict Resolution

```typescript
const stateManager = new StateManager({
  conflictResolution: 'server-wins', // or 'client-wins' or 'manual'
});

// Handle manual conflicts
stateManager.subscribe((changes) => {
  const state = stateManager.getState();
  if (state.metadata.syncStatus === 'conflict') {
    // Show conflict resolution UI
  }
});
```

## State Snapshots

```typescript
// Create snapshot
const snapshot = stateManager.createSnapshot({
  label: 'before-major-update',
  metadata: { reason: 'Testing new feature' },
});

// List snapshots
const snapshots = stateManager.listSnapshots();

// Restore snapshot
stateManager.restoreSnapshot(snapshot.id, {
  mergeStrategy: 'merge', // or 'replace'
  preserveLocal: true,
});

// Delete snapshot
stateManager.deleteSnapshot(snapshot.id);
```

## Redux Integration

```typescript
import { configureStore } from '@reduxjs/toolkit';
import { createReduxEnhancer } from '@harmonyflow/client-state-manager';

const stateManager = new StateManager({
  deviceId: 'web',
  userId: 'user-123',
  sessionId: 'session-456',
  websocketUrl: 'wss://api.harmonyflow.io/v1/ws',
  token: 'jwt-token',
  autoSync: true,
});

const store = configureStore({
  reducer: rootReducer,
  enhancers: [createReduxEnhancer({ stateManager })],
});

await stateManager.initialize();
```

## MobX Integration

```typescript
import { createMobXAdapter } from '@harmonyflow/client-state-manager';

const stateManager = new StateManager({
  deviceId: 'web',
  userId: 'user-123',
  sessionId: 'session-456',
  websocketUrl: 'wss://api.harmonyflow.io/v1/ws',
  token: 'jwt-token',
});

const { store, observePath, destroy } = createMobXAdapter({
  stateManager,
  syncToMobX: true,
  syncFromMobX: true,
});

// Observe specific path
const name = observePath<string>('user.name');
console.log(name.get()); // Get value
name.set('Jane'); // Set value

// Cleanup
destroy();
```

## API Reference

### StateManager

Main orchestrator for state management.

#### Constructor Options

- `deviceId` (required): Unique device identifier
- `userId` (required): User identifier
- `sessionId` (required): Session identifier
- `websocketUrl` (required): WebSocket server URL
- `token` (required): JWT token for authentication
- `autoSync` (optional): Enable auto-sync (default: true)
- `syncInterval` (optional): Sync interval in ms (default: 30000)
- `debug` (optional): Enable debug logging (default: false)
- `conflictResolution` (optional): Resolution strategy (default: 'server-wins')

#### Methods

- `initialize()`: Initialize manager and connect to WebSocket
- `getState()`: Get current state
- `getStateData()`: Get current state data
- `setState(path, value)`: Set value at path
- `getStateAtPath(path)`: Get value at path
- `deleteState(path)`: Delete value at path
- `batchUpdate(updates)`: Update multiple values
- `subscribe(listener)`: Subscribe to state changes
- `createSnapshot(options)`: Create state snapshot
- `restoreSnapshot(id, options)`: Restore from snapshot
- `calculateDelta(fromVersion)`: Calculate state delta
- `sync()`: Manually trigger sync
- `destroy()`: Cleanup and disconnect

See [API Documentation](./docs/API.md) for complete reference.

## Configuration

### WebSocket Client Options

```typescript
const client = new WebSocketClient({
  url: 'wss://api.harmonyflow.io/v1/ws',
  sessionId: 'session-123',
  token: 'jwt-token',
  deviceId: 'device-456',
  
  // Reconnection
  autoReconnect: true,
  maxReconnectAttempts: 10,
  reconnectDelay: 1000,
  maxReconnectDelay: 60000,
  reconnectDelayMultiplier: 2,
  
  // Heartbeat
  enableHeartbeat: true,
  heartbeatInterval: 30000,
  heartbeatTimeout: 10000,
  
  // Message limits
  maxMessageSize: 65536,
  messageQueueLimit: 100,
  
  // Timeouts
  connectionTimeout: 30000,
  syncTimeout: 10000,
});
```

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Type check
npm run typecheck

# Build
npm run build

# Watch mode
npm run dev
```

## Testing

### Unit Tests

```bash
npm test
```

Coverage target: 80%+

### Integration Tests

```bash
npm run test:integration
```

Requires running WebSocket server.

### Mock Server

For offline testing, use the included mock WebSocket server:

```typescript
import { MockWebSocketServer } from '@harmonyflow/client-state-manager/testing';

const server = new MockWebSocketServer('ws://localhost:8080');
server.start();
```

## Documentation

- [API Documentation](./docs/API.md)
- [Integration Guide](./docs/INTEGRATION.md)
- [Examples](./examples/)

## Browser Support

- Chrome/Edge 80+
- Firefox 75+
- Safari 13+
- iOS Safari 13+
- Chrome for Android 80+

## License

MIT

## Contributing

Please read [CONTRIBUTING.md](./CONTRIBUTING.md) for details.

## Support

- GitHub Issues: [github.com/harmonyflow/syncbridge/issues](https://github.com/harmonyflow/syncbridge/issues)
- Documentation: [docs.harmonyflow.io](https://docs.harmonyflow.io)
