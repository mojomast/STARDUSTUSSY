# Performance Tuning Guide

## Overview

The Client State Manager has been optimized for high-performance state synchronization with the following targets:

- **State Serialization**: <50ms for large states
- **Bundle Size**: <100KB initial bundle
- **Memory Footprint**: 20% reduction from baseline
- **State Changes**: >1000 operations/sec

## Performance Features

### 1. Delta Compression

The library uses intelligent delta compression to minimize data transfer:

```typescript
import { DeltaCalculator } from '@harmonyflow/client-state-manager';

const calculator = new DeltaCalculator();

// Calculate delta with automatic compression for large objects
const result = calculator.calculateDelta(
  oldState,
  newState,
  baseVersion,
  targetVersion,
  { compress: true, threshold: 1000 }
);
```

**Features:**
- Automatic similarity detection for large objects
- LZW compression for string values
- Operation batching and optimization
- Cache for frequently calculated deltas

### 2. Request Batching

WebSocket messages are automatically batched to reduce network overhead:

```typescript
import { WebSocketClient } from '@harmonyflow/client-state-manager';

const ws = new WebSocketClient({
  url: 'wss://api.harmonyflow.io',
  batchMessages: true,
  batchInterval: 50,  // ms
  batchSize: 10,
});

// Messages are automatically batched
ws.send('state_update', data);  // Batched
ws.send('ack', { id }, { priority: true });  // Sent immediately
```

**Configuration:**
- `batchInterval`: Maximum time to wait before sending batch (default: 50ms)
- `batchSize`: Maximum number of messages per batch (default: 10)
- Priority messages bypass batching

### 3. Adaptive Heartbeat

Heartbeat interval automatically adjusts based on network conditions:

```typescript
const ws = new WebSocketClient({
  enableHeartbeat: true,
  heartbeatInterval: 30000,  // Base interval
});

// Heartbeat automatically adjusts:
// - Low latency (<50ms): 10s interval
// - Normal latency: 30s interval  
// - High latency (>200ms): 60s interval
```

### 4. Debounced State Changes

Rapid state changes are debounced to reduce sync frequency:

```typescript
import { StateManager } from '@harmonyflow/client-state-manager';

const stateManager = new StateManager({
  autoSync: true,
  debounceMs: 50,  // Debounce rapid changes
});

// Rapid changes are debounced
stateManager.setState('counter', 1);
stateManager.setState('counter', 2);
stateManager.setState('counter', 3);
// Only syncs once after debounce period
```

### 5. Memory Management

Automatic garbage collection prevents memory leaks:

```typescript
const stateManager = new StateManager({
  maxSnapshots: 10,      // Limit snapshot storage
  gcInterval: 60000,     // GC interval in ms
});

// Cleanup old snapshots and caches
stateManager.destroy();  // Cleanup on unmount
```

## Optimization Strategies

### Serialization Speed

**Optimized Serializers:**

```typescript
import { StateSerializer } from '@harmonyflow/client-state-manager';

const serializer = new StateSerializer();

// Use fast serializer for simple objects
const fast = serializer.serializeFast(state);

// Use standard serializer for complex objects
const standard = serializer.serialize(state);

// Clone without deep recursion for shallow objects
const shallow = serializer.shallowClone(state);
```

**Best Practices:**
- Keep state objects flat when possible
- Avoid deeply nested structures
- Use primitive types for frequently accessed values

### Delta Calculation

**Optimize Delta Operations:**

```typescript
// Batch related changes
stateManager.batchUpdate({
  'user.name': 'John',
  'user.email': 'john@example.com',
  'user.updatedAt': Date.now(),
});

// Instead of individual setState calls
```

### Memory Usage

**Reduce Memory Footprint:**

```typescript
// Limit snapshot history
const stateManager = new StateManager({
  maxSnapshots: 5,  // Keep only recent snapshots
});

// Periodic cleanup
stateManager.performGarbageCollection();
```

## Bundle Size Optimization

### Code Splitting

The library supports code splitting for optimal loading:

```typescript
// Core only (minimal bundle)
import { StateManager, WebSocketClient } from '@harmonyflow/client-state-manager';

// Lazy load handoff features
const { HandoffManager } = await import('@harmonyflow/client-state-manager/handoff');

// Lazy load adapters
const { createReduxMiddleware } = await import('@harmonyflow/client-state-manager/adapters');
```

### Tree Shaking

The library is tree-shakeable - only import what you need:

```typescript
// ✅ Good - imports only what you need
import { StateManager } from '@harmonyflow/client-state-manager';

// ❌ Avoid - imports entire library
import * as CSM from '@harmonyflow/client-state-manager';
```

## Performance Metrics

Access runtime performance metrics:

```typescript
const metrics = stateManager.getMetrics();

console.log({
  serializationTime: metrics.serializationTime,    // ms
  deltaCalculationTime: metrics.deltaCalculationTime, // ms
  memoryUsage: metrics.memoryUsage,                // bytes
  syncCount: metrics.syncCount,
  changeCount: metrics.changeCount,
});
```

## Benchmarks

Run performance benchmarks:

```bash
npm run test:performance
```

Expected results:
- Small state (1KB): ~0.1ms
- Medium state (50KB): ~2ms
- Large state (500KB): ~20ms
- Delta calculation: <10ms
- State changes: >1000 ops/sec

## Troubleshooting

### Slow Serialization

**Problem**: Serialization taking >50ms

**Solutions**:
1. Reduce state size
2. Use `serializeFast()` for simple objects
3. Enable compression only for large states
4. Use shallow cloning where possible

### High Memory Usage

**Problem**: Memory usage increasing over time

**Solutions**:
1. Reduce `maxSnapshots` limit
2. Call `destroy()` on component unmount
3. Enable automatic GC with shorter intervals
4. Check for circular references in state

### Slow Delta Calculation

**Problem**: Delta calculation taking >20ms

**Solutions**:
1. Batch related changes
2. Reduce state object depth
3. Use `batchUpdate()` instead of multiple `setState()` calls
4. Enable delta caching

## Advanced Configuration

### Custom Serializer

```typescript
class CustomSerializer extends StateSerializer {
  serialize(state) {
    // Custom serialization logic
    return optimizedSerialize(state);
  }
}
```

### Custom Compression

```typescript
const calculator = new DeltaCalculator();

// Configure compression threshold
calculator.calculateDelta(oldState, newState, baseVersion, targetVersion, {
  compress: true,
  threshold: 500,  // Compress objects >500 bytes
});
```

## Monitoring

Enable performance monitoring in production:

```typescript
const stateManager = new StateManager({
  debug: process.env.NODE_ENV === 'development',
});

// Monitor slow operations
stateManager.subscribe((changes) => {
  if (changes.length > 100) {
    console.warn('Large batch of changes:', changes.length);
  }
});
```

## References

- [API Reference](./api-reference.md)
- [Common Patterns](./common-patterns.md)
- [Migration Guide](./migration-guide.md)
