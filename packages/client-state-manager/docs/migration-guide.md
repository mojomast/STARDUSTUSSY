# Migration Guide: v0 to v1

## Overview

This guide helps you migrate from Client State Manager v0 to the optimized v1 release.

## Breaking Changes

### 1. Import Paths

**v0:**
```typescript
import { StateManager } from '@harmonyflow/client-state-manager';
import { HandoffManager } from '@harmonyflow/client-state-manager/lib/handoff';
```

**v1:**
```typescript
import { StateManager } from '@harmonyflow/client-state-manager';
import { HandoffManager } from '@harmonyflow/client-state-manager/handoff';
```

### 2. Configuration Options

**v0:**
```typescript
const stateManager = new StateManager({
  deviceId: 'device-123',
  userId: 'user-456',
  sessionId: 'session-789',
  websocketUrl: 'wss://api.harmonyflow.io/ws',
  token: 'token',
  autoSync: true,
  syncInterval: 30000,
});
```

**v1:**
```typescript
const stateManager = new StateManager({
  deviceId: 'device-123',
  userId: 'user-456',
  sessionId: 'session-789',
  websocketUrl: 'wss://api.harmonyflow.io/ws',
  token: 'token',
  autoSync: true,
  syncInterval: 30000,
  // New options
  debounceMs: 50,           // Debounce rapid changes
  maxSnapshots: 10,         // Limit snapshot storage
  enableCompression: true,  // Enable delta compression
  gcInterval: 60000,        // Garbage collection interval
});
```

### 3. Method Signatures

#### StateManager.getState()

**v0:**
```typescript
const state = stateManager.getState();
// Returns deep clone
```

**v1:**
```typescript
const state = stateManager.getState();
// Returns shallow clone (faster)

const deepState = stateManager.getStateData();
// Use getStateData() for deep clone when needed
```

#### StateManager.sync()

**v0:**
```typescript
await stateManager.sync();
```

**v1:**
```typescript
await stateManager.sync();
// Now returns metrics
const metrics = stateManager.getMetrics();
console.log(metrics.serializationTime); // ms
```

### 4. WebSocket Options

**v0:**
```typescript
const ws = new WebSocketClient({
  url: 'wss://api.harmonyflow.io/ws',
  sessionId: 'session-123',
  token: 'token',
  deviceId: 'device-123',
  autoReconnect: true,
  enableHeartbeat: true,
});
```

**v1:**
```typescript
const ws = new WebSocketClient({
  url: 'wss://api.harmonyflow.io/ws',
  sessionId: 'session-123',
  token: 'token',
  deviceId: 'device-123',
  autoReconnect: true,
  enableHeartbeat: true,
  // New options
  enableCompression: true,  // Compress large messages
  batchMessages: true,      // Batch small messages
  batchInterval: 50,        // ms
  batchSize: 10,
});

// New method for sending with options
ws.send('state_update', data, { 
  batch: true,      // Enable batching
  priority: false,  // Allow batching
});
```

## New Features

### 1. Performance Metrics

**New in v1:**
```typescript
const metrics = stateManager.getMetrics();

console.log({
  serializationTime: metrics.serializationTime,
  deltaCalculationTime: metrics.deltaCalculationTime,
  memoryUsage: metrics.memoryUsage,
  syncCount: metrics.syncCount,
  changeCount: metrics.changeCount,
});

// Reset metrics
stateManager.resetMetrics();
```

### 2. Debounced Updates

**New in v1:**
```typescript
const stateManager = new StateManager({
  debounceMs: 50,  // Debounce rapid changes
});

// Rapid changes are automatically debounced
stateManager.setState('counter', 1);
stateManager.setState('counter', 2);
stateManager.setState('counter', 3);
// Only syncs once after 50ms
```

### 3. Adaptive Heartbeat

**New in v1:**
```typescript
const ws = new WebSocketClient({
  enableHeartbeat: true,
  heartbeatInterval: 30000,  // Base interval
});

// Heartbeat automatically adjusts based on latency
// Low latency (<50ms): 10s interval
// Normal latency: 30s interval
// High latency (>200ms): 60s interval

// Access current interval
console.log(ws.currentHeartbeatInterval);
```

### 4. Delta Compression

**New in v1:**
```typescript
import { DeltaCalculator } from '@harmonyflow/client-state-manager';

const calculator = new DeltaCalculator();

const result = calculator.calculateDelta(
  oldState,
  newState,
  baseVersion,
  targetVersion,
  { 
    compress: true,     // Enable compression
    threshold: 1000,    // Compress objects >1000 bytes
  }
);
```

### 5. Code Splitting

**New in v1:**
```typescript
// Import only core functionality (smaller bundle)
import { StateManager, WebSocketClient } from '@harmonyflow/client-state-manager';

// Lazy load handoff features
const { HandoffManager } = await import('@harmonyflow/client-state-manager/handoff');

// Lazy load adapters
const { createReduxMiddleware } = await import('@harmonyflow/client-state-manager/adapters');
```

## Deprecations

### Removed Methods

| v0 Method | v1 Replacement | Reason |
|-----------|---------------|---------|
| `StateSerializer.deepClone()` | `StateSerializer.clone()` | Renamed for clarity |
| `WebSocketClient.sendRaw()` | `WebSocketClient.send()` | Unified API |
| `StateManager.forceSync()` | `StateManager.sync()` | Merged with sync |

### Deprecated Options

| v0 Option | v1 Status | Migration |
|-----------|-----------|-----------|
| `WebSocketClientOptions.compression` | Renamed | Use `enableCompression` |
| `StateManagerOptions.syncThrottle` | Replaced | Use `debounceMs` |

## Migration Checklist

- [ ] Update import paths for handoff and adapters
- [ ] Review and update configuration options
- [ ] Test `getState()` behavior (now shallow clone)
- [ ] Add debounce configuration if needed
- [ ] Enable compression options for better performance
- [ ] Update WebSocket send calls to use new options
- [ ] Remove deprecated method calls
- [ ] Test delta calculation with new compression
- [ ] Verify bundle size after code splitting
- [ ] Run performance benchmarks

## Performance Improvements

### Before (v0)

```
Bundle Size: ~180KB
Serialization: ~80ms (large states)
Memory Usage: Baseline
```

### After (v1)

```
Bundle Size: ~95KB (-47%)
Serialization: ~20ms (-75%)
Memory Usage: -20%
```

## Troubleshooting

### Issue: Type Errors After Upgrade

**Solution:**
```typescript
// Install updated type definitions
npm install @harmonyflow/client-state-manager@latest

// Update tsconfig.json if needed
{
  "compilerOptions": {
    "moduleResolution": "node",
    "esModuleInterop": true
  }
}
```

### Issue: Bundle Size Increased

**Solution:**
```typescript
// Use code splitting
import { StateManager } from '@harmonyflow/client-state-manager';

// Instead of importing everything
import * as CSM from '@harmonyflow/client-state-manager'; // ❌

// Lazy load optional features
const handoff = await import('@harmonyflow/client-state-manager/handoff');
```

### Issue: Sync Delayed

**Solution:**
```typescript
// Adjust debounce if needed
const stateManager = new StateManager({
  debounceMs: 0,  // Disable debouncing
});

// Or flush immediately
stateManager.sync();  // Force immediate sync
```

## Rollback Plan

If you need to rollback to v0:

```bash
npm install @harmonyflow/client-state-manager@0.x
```

Revert any code changes using the v0 syntax shown above.

## Getting Help

- [Performance Tuning Guide](./performance-tuning.md)
- [Common Patterns](./common-patterns.md)
- [API Reference](./api-reference.md)
- GitHub Issues: https://github.com/harmonyflow/client-state-manager/issues

## Changelog

See [CHANGELOG.md](../CHANGELOG.md) for detailed version history.
