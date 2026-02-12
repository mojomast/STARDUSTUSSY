# Client State Manager - API Documentation

## Overview

The Client State Manager library provides comprehensive state management and real-time synchronization capabilities for the HarmonyFlow SyncBridge wellness platform.

## Core Classes

### StateManager

Central orchestrator for state management with WebSocket synchronization.

#### Constructor

```typescript
const manager = new StateManager({
  deviceId: 'unique-device-id',
  userId: 'user-123',
  sessionId: 'session-456',
  websocketUrl: 'wss://api.harmonyflow.io/ws',
  token: 'jwt-token',
  autoSync: true,
  syncInterval: 30000,
  debug: false,
  conflictResolution: 'server-wins',
});
```

**Options:**
- `deviceId` (required): Unique device identifier
- `userId` (required): User identifier
- `sessionId` (required): Session identifier
- `websocketUrl` (required): WebSocket server URL
- `token` (required): JWT authentication token
- `autoSync` (optional): Enable automatic synchronization (default: true)
- `syncInterval` (optional): Sync interval in ms (default: 30000)
- `debug` (optional): Enable debug logging (default: false)
- `conflictResolution` (optional): Conflict resolution strategy (default: 'server-wins')

#### Methods

##### `initialize(): Promise<void>`
Initializes the manager and connects to WebSocket.

##### `getState(): AppState`
Returns a deep clone of the current state.

##### `getStateData(): StateData`
Returns a deep clone of the state data.

##### `setState(path: string, value: unknown): void`
Sets a value at the specified path.

```typescript
manager.setState('user.name', 'John');
manager.setState('settings.theme.dark', true);
```

##### `getStateAtPath(path: string): unknown`
Gets a value at the specified path.

##### `deleteState(path: string): void`
Deletes a value at the specified path.

##### `batchUpdate(updates: Record<string, unknown>): void`
Updates multiple values in a single operation.

```typescript
manager.batchUpdate({
  'user.name': 'John',
  'user.age': 30,
  'settings.theme': 'dark',
});
```

##### `subscribe(listener: StateChangeListener): () => void`
Subscribes to state changes. Returns unsubscribe function.

```typescript
const unsubscribe = manager.subscribe((changes) => {
  console.log('State changed:', changes);
});

// Later...
unsubscribe();
```

##### `createSnapshot(options?: SnapshotOptions): StateSnapshot`
Creates a state snapshot for later restoration.

```typescript
const snapshot = manager.createSnapshot({
  label: 'before-major-update',
  metadata: { reason: 'Testing new feature' },
});
```

##### `restoreSnapshot(snapshotId: string, options?: RestoreOptions): boolean`
Restores state from a snapshot.

```typescript
manager.restoreSnapshot(snapshotId, {
  mergeStrategy: 'merge',
  preserveLocal: true,
});
```

##### `calculateDelta(fromVersion?: number): StateDelta | null`
Calculates delta between versions.

##### `applyDelta(delta: StateDelta): void`
Applies a delta to the current state.

##### `sync(): Promise<void>`
Manually triggers state synchronization.

##### `getCurrentFingerprint(): string`
Returns current state fingerprint.

##### `getVersion(): number`
Returns local version number.

##### `getServerVersion(): number`
Returns server version number.

##### `getPendingChanges(): StateChange[]`
Returns list of pending changes.

##### `destroy(): Promise<void>`
Cleans up resources and disconnects.

---

### WebSocketClient

Manages WebSocket connections with automatic reconnection.

#### Constructor

```typescript
const client = new WebSocketClient({
  url: 'wss://api.harmonyflow.io/ws',
  sessionId: 'session-123',
  token: 'jwt-token',
  deviceId: 'device-456',
  autoReconnect: true,
  maxReconnectAttempts: 10,
  reconnectDelay: 1000,
  maxReconnectDelay: 60000,
  reconnectDelayMultiplier: 2,
  enableHeartbeat: true,
  heartbeatInterval: 30000,
  heartbeatTimeout: 10000,
  maxMessageSize: 65536,
  messageQueueLimit: 100,
  connectionTimeout: 30000,
  syncTimeout: 10000,
});
```

#### Methods

##### `connect(): Promise<void>`
Establishes WebSocket connection.

##### `disconnect(): void`
Closes WebSocket connection.

##### `reconnect(): Promise<void>`
Reconnects to the server.

##### `send(type: WebSocketMessageType, payload: unknown): void`
Sends a message to the server.

##### `subscribe(sessionId: string, lastVersion?: number): void`
Subscribes to session updates.

##### `unsubscribe(sessionId: string): void`
Unsubscribes from session updates.

##### `sendHeartbeat(): void`
Sends a heartbeat message.

##### `sendStateUpdate(state: SessionState): void`
Sends state update to the server.

##### `acknowledge(messageId: string): void`
Acknowledges receipt of a message.

##### `on<T extends keyof WebSocketEventMap>(event: T, handler: WebSocketEventMap[T]): () => void`
Subscribes to events.

**Events:**
- `open`: Connection opened
- `close`: Connection closed
- `error`: Error occurred
- `state_change`: Connection state changed
- `reconnecting`: Reconnection attempt started
- `reconnected`: Successfully reconnected
- `state_sync`: Received full state sync
- `state_delta`: Received state delta
- `device_joined`: New device joined session
- `device_left`: Device left session
- `error_message`: Error message received

```typescript
const unsubscribe = client.on('state_sync', (state, version) => {
  console.log('State synced:', state, version);
});
```

##### `off<T extends keyof WebSocketEventMap>(event: T, handler: WebSocketEventMap[T]): void`
Unsubscribes from events.

---

### TokenManager

Manages JWT authentication tokens with automatic refresh.

#### Constructor

```typescript
const tokenManager = new TokenManager({
  storageKey: 'harmonyflow_auth_token',
  refreshThreshold: 300,
  autoRefresh: true,
  onTokenExpired: () => {
    console.log('Token expired');
    // Redirect to login
  },
  onTokenRefreshed: (token) => {
    console.log('Token refreshed:', token);
  },
  refreshToken: async (refreshToken) => {
    // Call your auth API
    const response = await fetch('/api/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    });
    return response.json();
  },
});
```

#### Methods

##### `getToken(): AuthToken | null`
Returns current token.

##### `getAccessToken(): string | null`
Returns access token.

##### `getRefreshToken(): string | null`
Returns refresh token.

##### `isAuthenticated(): boolean`
Checks if user is authenticated.

##### `isTokenExpired(): boolean`
Checks if token is expired.

##### `isTokenExpiringSoon(): boolean`
Checks if token is expiring within threshold.

##### `setToken(token: AuthToken): void`
Sets a new token.

##### `clearToken(): void`
Clears the current token.

##### `refresh(): Promise<AuthToken>`
Refreshes the token.

##### `setUserId(userId: string): void`
Sets the user ID.

##### `setDeviceId(deviceId: string): void`
Sets the device ID.

##### `getUserId(): string | null`
Gets the user ID.

##### `getDeviceId(): string | null`
Gets the device ID.

##### `on(event: AuthEventType, handler: (event: AuthEvent) => void): () => void`
Subscribes to auth events.

**Events:**
- `token_refreshed`: Token was refreshed
- `token_expired`: Token expired
- `auth_error`: Authentication error occurred
- `logout`: User logged out

---

### DeltaCalculator

Calculates and applies state deltas.

#### Methods

##### `calculateDelta(oldState, newState, baseVersion, targetVersion): DeltaResult`
Calculates delta between two states.

```typescript
const result = calculator.calculateDelta(
  { name: 'John' },
  { name: 'Jane', age: 30 },
  1,
  2
);

if (result.hasChanges) {
  console.log('Operations:', result.delta.operations);
}
```

##### `applyDelta(state, delta): StateChange[]`
Applies delta to a state.

---

### StateFingerprint

Generates fingerprints for change detection.

#### Methods

##### `generate(state, options?): string`
Generates a fingerprint for the state.

```typescript
const fingerprint = fingerprint.generate(state, {
  algorithm: 'full',
  includeMetadata: true,
  includeTimestamp: false,
});
```

##### `compare(state1, state2, options?): boolean`
Compares two states.

##### `hasChanged(state, previousFingerprint, options?): boolean`
Checks if state has changed.

##### `generateSegmented(state): Record<string, string>`
Generates segmented fingerprints.

##### `compareSegments(state, previousSegments): SegmentComparison`
Compares segments between states.

---

### StateSerializer

Handles state serialization and deserialization.

#### Methods

##### `serialize(state): string`
Serializes state to JSON string.

##### `deserialize(serialized): AppState`
Deserializes JSON string to state.

##### `clone<T>(obj): T`
Creates a deep clone.

##### `toBlob(state): Blob`
Converts state to Blob.

##### `fromBlob(blob): Promise<AppState>`
Converts Blob to state.

##### `toBase64(state): string`
Converts state to Base64.

##### `fromBase64(base64): AppState`
Converts Base64 to state.

##### `computeChecksum(state): string`
Computes state checksum.

##### `validateChecksum(state, checksum): boolean`
Validates state checksum.

---

## Redux Integration

### Middleware

```typescript
import { createStore, applyMiddleware } from 'redux';
import { createReduxMiddleware, StateManager } from '@harmonyflow/client-state-manager';

const stateManager = new StateManager({
  deviceId: 'device-1',
  userId: 'user-1',
  sessionId: 'session-1',
  websocketUrl: 'wss://api.harmonyflow.io/ws',
  token: 'jwt-token',
});

const store = createStore(
  reducer,
  applyMiddleware(createReduxMiddleware({ stateManager }))
);
```

### Enhancer

```typescript
import { createStore } from 'redux';
import { createReduxEnhancer } from '@harmonyflow/client-state-manager';

const store = createStore(
  reducer,
  createReduxEnhancer({
    stateManager,
    selectState: (state) => state.app,
  })
);
```

---

## MobX Integration

```typescript
import { createMobXAdapter, StateSyncStore } from '@harmonyflow/client-state-manager';
import { makeAutoObservable } from 'mobx';

const stateManager = new StateManager({
  deviceId: 'device-1',
  userId: 'user-1',
  sessionId: 'session-1',
  websocketUrl: 'wss://api.harmonyflow.io/ws',
  token: 'jwt-token',
});

const { store, observePath, destroy } = createMobXAdapter({
  stateManager,
  syncToMobX: true,
  syncFromMobX: true,
});

// Use in your component
const name = observePath<string>('user.name');
console.log(name.get()); // Get value
name.set('Jane'); // Set value

// Cleanup
destroy();
```

---

## Types

### AppState

```typescript
interface AppState {
  version: number;
  timestamp: number;
  data: Record<string, unknown>;
  metadata: StateMetadata;
}
```

### StateChange

```typescript
interface StateChange {
  path: string;
  previousValue: unknown;
  newValue: unknown;
  timestamp: number;
}
```

### StateDelta

```typescript
interface StateDelta {
  baseVersion: number;
  targetVersion: number;
  operations: DeltaOperation[];
  checksum?: string;
  timestamp: number;
}
```

### DeltaOperation

```typescript
interface DeltaOperation {
  op: 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test';
  path: string;
  value?: unknown;
  from?: string;
}
```

### WebSocketMessageEnvelope

```typescript
interface WebSocketMessageEnvelope<T = unknown> {
  id: string;
  type: WebSocketMessageType;
  timestamp: string;
  payload: T;
}
```

### AuthToken

```typescript
interface AuthToken {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresAt: number;
  scope?: string;
}
```

---

## Error Handling

### WebSocket Errors

```typescript
import { WebSocketError, ConnectionError, AuthenticationError } from '@harmonyflow/client-state-manager';

client.on('error', (error) => {
  if (error instanceof AuthenticationError) {
    // Handle auth error
  } else if (error instanceof ConnectionError) {
    // Handle connection error
  }
});
```

### State Conflicts

```typescript
const manager = new StateManager({
  // ...
  conflictResolution: 'manual',
});

manager.subscribe((changes) => {
  const state = manager.getState();
  if (state.metadata.syncStatus === 'conflict') {
    // Handle conflict manually
  }
});
```

---

## Configuration

### Reconnection Strategy

```typescript
const client = new WebSocketClient({
  url: 'wss://api.harmonyflow.io/ws',
  sessionId: 'session-1',
  token: 'jwt-token',
  deviceId: 'device-1',
  autoReconnect: true,
  reconnectDelay: 1000,      // Initial delay: 1s
  maxReconnectDelay: 60000,  // Max delay: 60s
  reconnectDelayMultiplier: 2, // Exponential backoff: 1s, 2s, 4s, 8s...
  maxReconnectAttempts: 10,
});
```

### Heartbeat Configuration

```typescript
const client = new WebSocketClient({
  // ...
  enableHeartbeat: true,
  heartbeatInterval: 30000,  // Send heartbeat every 30s
  heartbeatTimeout: 10000,   // Expect response within 10s
});
```
