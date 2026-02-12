# HarmonyFlow Client State Manager Documentation

## Overview

Welcome to the Client State Manager documentation. This library provides high-performance state synchronization for the HarmonyFlow wellness platform.

## Quick Start

```typescript
import { StateManager } from '@harmonyflow/client-state-manager';

const stateManager = new StateManager({
  deviceId: 'device-123',
  userId: 'user-456',
  sessionId: 'session-789',
  websocketUrl: 'wss://api.harmonyflow.io/ws',
  token: 'your-auth-token',
});

await stateManager.initialize();
stateManager.setState('user.name', 'John Doe');
```

## Documentation Structure

- **[Performance Tuning Guide](./performance-tuning.md)** - Optimization strategies and benchmarks
- **[Common Patterns Cookbook](./common-patterns.md)** - Code examples and best practices
- **[Migration Guide](./migration-guide.md)** - Upgrading from v0 to v1

## Performance Targets

- State Serialization: <50ms
- Bundle Size: <100KB
- Memory Footprint: 20% reduction
- State Changes: >1000 ops/sec

## Features

- **Delta Compression** - Minimize data transfer with intelligent diffing
- **Request Batching** - Reduce WebSocket message volume
- **Adaptive Heartbeat** - Network-aware connection management
- **Memory Management** - Automatic garbage collection
- **Code Splitting** - Load only what you need

## Browser Support

- Chrome/Edge 80+
- Firefox 75+
- Safari 13.1+
- Node.js 18+

## License

MIT © HarmonyFlow Team
