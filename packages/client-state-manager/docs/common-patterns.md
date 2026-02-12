# Common Patterns Cookbook

## Table of Contents

1. [Basic State Management](#basic-state-management)
2. [Batch Updates](#batch-updates)
3. [Cross-Tab Synchronization](#cross-tab-synchronization)
4. [Optimistic Updates](#optimistic-updates)
5. [Conflict Resolution](#conflict-resolution)
6. [Offline Support](#offline-support)
7. [Performance Optimization](#performance-optimization)
8. [React Integration](#react-integration)
9. [Vue Integration](#vue-integration)
10. [Angular Integration](#angular-integration)

## Basic State Management

### Initialize State Manager

```typescript
import { StateManager } from '@harmonyflow/client-state-manager';

const stateManager = new StateManager({
  deviceId: 'device-123',
  userId: 'user-456',
  sessionId: 'session-789',
  websocketUrl: 'wss://api.harmonyflow.io/ws',
  token: 'your-auth-token',
  autoSync: true,
  syncInterval: 30000,
});

await stateManager.initialize();
```

### Subscribe to Changes

```typescript
// Subscribe to all state changes
const unsubscribe = stateManager.subscribe((changes) => {
  changes.forEach(change => {
    console.log(`${change.path}: ${change.previousValue} → ${change.newValue}`);
  });
});

// Unsubscribe when done
unsubscribe();
```

### Get and Set State

```typescript
// Get entire state
const state = stateManager.getState();

// Get specific path
const userName = stateManager.getStateAtPath('user.name');

// Set state at path
stateManager.setState('user.name', 'John Doe');

// Delete state at path
stateManager.deleteState('user.temporary');
```

## Batch Updates

### Batch Multiple Changes

```typescript
// Update multiple paths in a single operation
stateManager.batchUpdate({
  'user.firstName': 'John',
  'user.lastName': 'Doe',
  'user.lastModified': Date.now(),
  'preferences.theme': 'dark',
});

// More efficient than individual setState calls
```

### Batch with Validation

```typescript
function updateUserProfile(updates: UserProfile) {
  const validatedUpdates: Record<string, unknown> = {};
  
  if (updates.email?.includes('@')) {
    validatedUpdates['user.email'] = updates.email;
  }
  
  if (updates.name?.length >= 2) {
    validatedUpdates['user.name'] = updates.name;
  }
  
  if (Object.keys(validatedUpdates).length > 0) {
    stateManager.batchUpdate(validatedUpdates);
  }
}
```

## Cross-Tab Synchronization

### Multi-Device Handoff

```typescript
import { HandoffManager } from '@harmonyflow/client-state-manager/handoff';

const handoff = new HandoffManager(stateManager);

// Initialize QR code for device pairing
const qrData = await handoff.initiateHandoff({
  targetDevice: 'mobile',
  mode: 'qr-code',
});

// Display QR code
showQRCode(qrData.qrCode);

// Listen for device connection
handoff.on('device_connected', (device) => {
  console.log(`Device ${device.id} connected`);
});
```

### Session Transfer

```typescript
// On source device
const handoffData = await handoff.createHandoffToken({
  sessionId: stateManager.sessionId,
  expiration: 5 * 60 * 1000, // 5 minutes
});

// Transfer token to target device (via QR, link, etc.)
// ...

// On target device
await handoff.acceptHandoff(handoffData.token);
```

## Optimistic Updates

### Implement Optimistic UI

```typescript
class OptimisticStateManager {
  private pendingUpdates = new Map<string, unknown>();
  
  async optimisticUpdate(
    path: string,
    value: unknown,
    operation: () => Promise<void>
  ) {
    const previousValue = this.stateManager.getStateAtPath(path);
    
    // Apply optimistically
    this.pendingUpdates.set(path, previousValue);
    this.stateManager.setState(path, value);
    
    try {
      await operation();
      this.pendingUpdates.delete(path);
    } catch (error) {
      // Rollback on failure
      this.stateManager.setState(path, previousValue);
      this.pendingUpdates.delete(path);
      throw error;
    }
  }
}

// Usage
const optimistic = new OptimisticStateManager(stateManager);

await optimistic.optimisticUpdate(
  'cart.items',
  [...cartItems, newItem],
  async () => {
    await api.addToCart(newItem);
  }
);
```

## Conflict Resolution

### Custom Conflict Handler

```typescript
const stateManager = new StateManager({
  conflictResolution: 'manual',
});

stateManager.subscribe((changes) => {
  if (stateManager.getState().metadata.syncStatus === 'CONFLICT') {
    handleConflict(stateManager);
  }
});

function handleConflict(sm: StateManager) {
  const serverState = sm.getServerState();
  const localState = sm.getState();
  
  // Custom merge logic
  const merged = customMerge(serverState, localState);
  
  sm.batchUpdate({
    'data': merged,
    'metadata.conflictResolution': {
      strategy: 'merged',
      resolvedAt: Date.now(),
    },
  });
}
```

### Three-Way Merge

```typescript
function threeWayMerge(
  base: Record<string, unknown>,
  local: Record<string, unknown>,
  remote: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...base };
  const allKeys = new Set([
    ...Object.keys(local),
    ...Object.keys(remote),
  ]);
  
  for (const key of allKeys) {
    const baseVal = base[key];
    const localVal = local[key];
    const remoteVal = remote[key];
    
    if (JSON.stringify(localVal) === JSON.stringify(remoteVal)) {
      result[key] = localVal;
    } else if (JSON.stringify(baseVal) === JSON.stringify(localVal)) {
      result[key] = remoteVal;
    } else if (JSON.stringify(baseVal) === JSON.stringify(remoteVal)) {
      result[key] = localVal;
    } else {
      // Conflict - use timestamp or custom logic
      result[key] = resolveConflict(key, localVal, remoteVal);
    }
  }
  
  return result;
}
```

## Offline Support

### Queue Offline Changes

```typescript
class OfflineStateManager {
  private offlineQueue: StateChange[] = [];
  private isOnline = navigator.onLine;
  
  constructor(private stateManager: StateManager) {
    window.addEventListener('online', () => this.syncOfflineQueue());
    window.addEventListener('offline', () => this.isOnline = false);
    
    this.stateManager.subscribe((changes) => {
      if (!this.isOnline) {
        this.offlineQueue.push(...changes);
      }
    });
  }
  
  private async syncOfflineQueue() {
    this.isOnline = true;
    
    while (this.offlineQueue.length > 0) {
      const change = this.offlineQueue.shift();
      try {
        await this.stateManager.sync();
      } catch (error) {
        this.offlineQueue.unshift(change!);
        break;
      }
    }
  }
}
```

### Persist State Locally

```typescript
// Save state to localStorage
function persistState(stateManager: StateManager) {
  const state = stateManager.getState();
  localStorage.setItem('harmonyflow_state', JSON.stringify(state));
}

// Restore state from localStorage
function restoreState(): AppState | null {
  const saved = localStorage.getItem('harmonyflow_state');
  return saved ? JSON.parse(saved) : null;
}

// Auto-save every 5 seconds
setInterval(() => persistState(stateManager), 5000);
```

## Performance Optimization

### Memoized Selectors

```typescript
import { createSelector } from 'reselect';

// Create memoized selectors
const selectUser = createSelector(
  [(state) => stateManager.getStateAtPath('user')],
  (user) => user
);

const selectFullName = createSelector(
  [selectUser],
  (user) => `${user.firstName} ${user.lastName}`
);

// Usage - only recomputes when user changes
const fullName = selectFullName(stateManager.getState());
```

### Debounced Updates

```typescript
import { debounce } from '@harmonyflow/client-state-manager/utils';

// Debounce expensive operations
const debouncedSearch = debounce((query: string) => {
  stateManager.setState('search.query', query);
  performSearch(query);
}, 300);

// Usage
searchInput.addEventListener('input', (e) => {
  debouncedSearch(e.target.value);
});
```

### Virtual Scrolling

```typescript
// Efficiently handle large lists
function useVirtualList(itemCount: number, itemHeight: number) {
  const [scrollTop, setScrollTop] = useState(0);
  
  const visibleRange = useMemo(() => {
    const start = Math.floor(scrollTop / itemHeight);
    const visibleCount = Math.ceil(window.innerHeight / itemHeight);
    return {
      start,
      end: Math.min(start + visibleCount + 1, itemCount),
    };
  }, [scrollTop, itemCount, itemHeight]);
  
  return {
    visibleRange,
    onScroll: (e) => setScrollTop(e.currentTarget.scrollTop),
  };
}
```

## React Integration

### Hook

```typescript
import { useState, useEffect, useCallback } from 'react';
import { StateManager } from '@harmonyflow/client-state-manager';

export function useStateManager(path?: string) {
  const [value, setValue] = useState(() => 
    path ? stateManager.getStateAtPath(path) : stateManager.getState()
  );
  
  useEffect(() => {
    return stateManager.subscribe((changes) => {
      if (!path) {
        setValue(stateManager.getState());
      } else {
        const change = changes.find(c => c.path === path);
        if (change) {
          setValue(change.newValue);
        }
      }
    });
  }, [path]);
  
  const update = useCallback((newValue: unknown) => {
    if (path) {
      stateManager.setState(path, newValue);
    } else {
      console.warn('Cannot update without path');
    }
  }, [path]);
  
  return [value, update] as const;
}

// Usage
function UserProfile() {
  const [name, setName] = useStateManager('user.name');
  const [email, setEmail] = useStateManager('user.email');
  
  return (
    <div>
      <input value={name} onChange={e => setName(e.target.value)} />
      <input value={email} onChange={e => setEmail(e.target.value)} />
    </div>
  );
}
```

### With Redux

```typescript
import { createReduxMiddleware, createReduxEnhancer } from '@harmonyflow/client-state-manager/adapters';

const stateManager = new StateManager({ /* config */ });

const middleware = createReduxMiddleware({
  stateManager,
  actionType: '@@STATE_SYNC/UPDATE',
});

const enhancer = createReduxEnhancer({
  stateManager,
  selectState: (state) => state.sync,
});

const store = createStore(
  reducer,
  compose(enhancer, applyMiddleware(middleware))
);
```

## Vue Integration

### Composition API

```typescript
import { ref, onMounted, onUnmounted } from 'vue';
import { StateManager } from '@harmonyflow/client-state-manager';

export function useStateManager(path?: string) {
  const value = ref(path 
    ? stateManager.getStateAtPath(path) 
    : stateManager.getState()
  );
  
  let unsubscribe: (() => void) | null = null;
  
  onMounted(() => {
    unsubscribe = stateManager.subscribe((changes) => {
      if (!path) {
        value.value = stateManager.getState();
      } else {
        const change = changes.find(c => c.path === path);
        if (change) {
          value.value = change.newValue;
        }
      }
    });
  });
  
  onUnmounted(() => {
    unsubscribe?.();
  });
  
  const update = (newValue: unknown) => {
    if (path) {
      stateManager.setState(path, newValue);
    }
  };
  
  return { value, update };
}

// Usage
export default {
  setup() {
    const { value: name, update: setName } = useStateManager('user.name');
    
    return { name, setName };
  },
};
```

## Angular Integration

### Service

```typescript
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { StateManager, StateChange } from '@harmonyflow/client-state-manager';

@Injectable({ providedIn: 'root' })
export class StateManagerService {
  private stateSubject = new BehaviorSubject(this.stateManager.getState());
  
  state$ = this.stateSubject.asObservable();
  
  constructor(private stateManager: StateManager) {
    this.stateManager.subscribe((changes) => {
      this.stateSubject.next(this.stateManager.getState());
    });
  }
  
  select<T>(path: string): Observable<T> {
    return new Observable(subscriber => {
      const unsubscribe = this.stateManager.subscribe((changes) => {
        const change = changes.find(c => c.path === path);
        if (change) {
          subscriber.next(change.newValue as T);
        }
      });
      
      // Initial value
      subscriber.next(this.stateManager.getStateAtPath(path) as T);
      
      return unsubscribe;
    });
  }
  
  setState(path: string, value: unknown): void {
    this.stateManager.setState(path, value);
  }
  
  batchUpdate(updates: Record<string, unknown>): void {
    this.stateManager.batchUpdate(updates);
  }
}
```

## Best Practices

### 1. Keep State Normalized

```typescript
// ✅ Good
const state = {
  users: {
    byId: { '1': { id: '1', name: 'John' } },
    allIds: ['1'],
  },
};

// ❌ Avoid
const state = {
  users: [
    { id: '1', name: 'John' },
  ],
};
```

### 2. Use Batch Updates

```typescript
// ✅ Good
stateManager.batchUpdate({
  'user.name': 'John',
  'user.email': 'john@example.com',
});

// ❌ Avoid
stateManager.setState('user.name', 'John');
stateManager.setState('user.email', 'john@example.com');
```

### 3. Handle Errors

```typescript
try {
  await stateManager.sync();
} catch (error) {
  if (error.code === 'STATE_CONFLICT') {
    // Handle conflict
  } else if (error.code === 'AUTH_ERROR') {
    // Re-authenticate
  }
}
```

### 4. Clean Up Resources

```typescript
useEffect(() => {
  const unsubscribe = stateManager.subscribe(handler);
  
  return () => {
    unsubscribe();
  };
}, []);

// On app unmount
await stateManager.destroy();
```

## See Also

- [Performance Tuning Guide](./performance-tuning.md)
- [Migration Guide](./migration-guide.md)
- [API Reference](./api-reference.md)
