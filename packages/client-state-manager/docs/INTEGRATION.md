# Integration Guide

This guide covers integrating the Client State Manager library with web and mobile applications.

## Quick Start

### 1. Installation

```bash
npm install @harmonyflow/client-state-manager
```

### 2. Basic Setup

```typescript
import { StateManager, TokenManager } from '@harmonyflow/client-state-manager';

// Initialize token manager
const tokenManager = new TokenManager({
  autoRefresh: true,
  refreshThreshold: 300, // Refresh 5 minutes before expiry
  refreshToken: async (refreshToken) => {
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    
    if (!response.ok) {
      throw new Error('Failed to refresh token');
    }
    
    return response.json();
  },
  onTokenExpired: () => {
    // Redirect to login
    window.location.href = '/login';
  },
});

// Initialize state manager
const stateManager = new StateManager({
  deviceId: 'web-' + navigator.userAgent.slice(0, 20),
  userId: 'user-123',
  sessionId: 'session-456',
  websocketUrl: 'wss://api.harmonyflow.io/v1/ws',
  token: tokenManager.getAccessToken() || '',
  autoSync: true,
  syncInterval: 30000,
  debug: process.env.NODE_ENV === 'development',
  conflictResolution: 'server-wins',
});

// Connect to WebSocket
await stateManager.initialize();
```

### 3. State Management

```typescript
// Set state values
stateManager.setState('user.name', 'John');
stateManager.setState('user.profile.age', 30);
stateManager.setState('settings.theme', 'dark');

// Get state values
const name = stateManager.getStateAtPath('user.name');
const allData = stateManager.getStateData();

// Delete state values
stateManager.deleteState('user.tempData');

// Batch updates
stateManager.batchUpdate({
  'user.name': 'Jane',
  'user.profile.location': 'NYC',
  'settings.notifications.enabled': true,
});
```

### 4. Subscribe to Changes

```typescript
const unsubscribe = stateManager.subscribe((changes) => {
  changes.forEach((change) => {
    console.log(`Path: ${change.path}`);
    console.log(`Previous: ${change.previousValue}`);
    console.log(`New: ${change.newValue}`);
  });
});

// Later, unsubscribe
unsubscribe();
```

## Web Application Integration

### React Example

```tsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import { StateManager } from '@harmonyflow/client-state-manager';

const StateContext = createContext<StateManager | null>(null);

export const StateProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [manager] = useState(() =>
    new StateManager({
      deviceId: 'web-' + Math.random().toString(36).substr(2, 9),
      userId: 'user-123',
      sessionId: 'session-456',
      websocketUrl: 'wss://api.harmonyflow.io/v1/ws',
      token: localStorage.getItem('token') || '',
      autoSync: true,
    })
  );

  useEffect(() => {
    manager.initialize();

    return () => {
      manager.destroy();
    };
  }, [manager]);

  return (
    <StateContext.Provider value={manager}>
      {children}
    </StateContext.Provider>
  );
};

export const useStateSync = () => {
  const manager = useContext(StateContext);
  if (!manager) {
    throw new Error('useStateSync must be used within StateProvider');
  }
  return manager;
};

export const useSyncedState = <T>(path: string): [T, (value: T) => void] => {
  const manager = useStateSync();
  const [value, setValue] = useState<T>(() =>
    manager.getStateAtPath(path) as T
  );

  useEffect(() => {
    const unsubscribe = manager.subscribe((changes) => {
      const relevantChange = changes.find((c) => c.path === path);
      if (relevantChange) {
        setValue(relevantChange.newValue as T);
      }
    });

    return unsubscribe;
  }, [manager, path]);

  const updateValue = (newValue: T) => {
    manager.setState(path, newValue);
  };

  return [value, updateValue];
};

// Usage in component
const UserProfile: React.FC = () => {
  const [name, setName] = useSyncedState<string>('user.name');
  const [age, setAge] = useSyncedState<number>('user.age');

  return (
    <div>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name"
      />
      <input
        type="number"
        value={age}
        onChange={(e) => setAge(Number(e.target.value))}
        placeholder="Age"
      />
    </div>
  );
};
```

### Vue 3 Example

```typescript
import { inject, provide, ref, watch, onUnmounted } from 'vue';
import { StateManager } from '@harmonyflow/client-state-manager';

const StateManagerKey = Symbol('stateManager');

export const createStateManager = () => {
  const manager = new StateManager({
    deviceId: 'web-' + Math.random().toString(36).substr(2, 9),
    userId: 'user-123',
    sessionId: 'session-456',
    websocketUrl: 'wss://api.harmonyflow.io/v1/ws',
    token: localStorage.getItem('token') || '',
    autoSync: true,
  });

  manager.initialize();

  return manager;
};

export const provideStateManager = (manager: StateManager) => {
  provide(StateManagerKey, manager);
};

export const useStateManager = () => {
  const manager = inject<StateManager>(StateManagerKey);
  if (!manager) {
    throw new Error('StateManager not provided');
  }
  return manager;
};

export const useSyncedState = <T>(path: string) => {
  const manager = useStateManager();
  const value = ref<T>(manager.getStateAtPath(path) as T);

  const unsubscribe = manager.subscribe((changes) => {
    const relevantChange = changes.find((c) => c.path === path);
    if (relevantChange) {
      value.value = relevantChange.newValue as T;
    }
  });

  onUnmounted(() => {
    unsubscribe();
  });

  watch(value, (newValue) => {
    manager.setState(path, newValue);
  });

  return value;
};

// In main.ts
import { createApp } from 'vue';
import App from './App.vue';
import { provideStateManager, createStateManager } from './state';

const app = createApp(App);
provideStateManager(createStateManager());
app.mount('#app');

// In component
const name = useSyncedState<string>('user.name');
```

## Mobile Application Integration

### React Native Example

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StateManager, TokenManager } from '@harmonyflow/client-state-manager';
import DeviceInfo from 'react-native-device-info';

class StateService {
  private stateManager: StateManager | null = null;
  private tokenManager: TokenManager;

  constructor() {
    this.tokenManager = new TokenManager({
      storageKey: '@harmonyflow/token',
      autoRefresh: true,
      refreshToken: this.refreshToken.bind(this),
      onTokenExpired: this.handleTokenExpired.bind(this),
    });
  }

  async initialize() {
    const deviceId = await DeviceInfo.getUniqueId();
    const token = this.tokenManager.getAccessToken();

    this.stateManager = new StateManager({
      deviceId: `mobile-${deviceId}`,
      userId: await this.getUserId(),
      sessionId: await this.getSessionId(),
      websocketUrl: 'wss://api.harmonyflow.io/v1/ws',
      token: token || '',
      autoSync: true,
      syncInterval: 30000,
      conflictResolution: 'server-wins',
    });

    await this.stateManager.initialize();

    // Handle app state changes
    // (Pause/resume sync when app goes to background/foreground)
  }

  async setState(path: string, value: unknown) {
    this.stateManager?.setState(path, value);
  }

  getStateAtPath(path: string): unknown {
    return this.stateManager?.getStateAtPath(path);
  }

  subscribe(callback: (changes: StateChange[]) => void) {
    return this.stateManager?.subscribe(callback) || (() => {});
  }

  async createSnapshot(label?: string) {
    return this.stateManager?.createSnapshot({ label });
  }

  async destroy() {
    await this.stateManager?.destroy();
  }

  private async refreshToken(refreshToken: string): Promise<AuthToken> {
    const response = await fetch('https://api.harmonyflow.io/v1/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      throw new Error('Token refresh failed');
    }

    return response.json();
  }

  private handleTokenExpired() {
    // Navigate to login screen
  }

  private async getUserId(): Promise<string> {
    return (await AsyncStorage.getItem('@harmonyflow/userId')) || 'anonymous';
  }

  private async getSessionId(): Promise<string> {
    let sessionId = await AsyncStorage.getItem('@harmonyflow/sessionId');
    if (!sessionId) {
      sessionId = generateUUID();
      await AsyncStorage.setItem('@harmonyflow/sessionId', sessionId);
    }
    return sessionId;
  }
}

export const stateService = new StateService();
```

## Redux Integration

### Setup

```typescript
import { configureStore } from '@reduxjs/toolkit';
import { createReduxEnhancer, StateManager } from '@harmonyflow/client-state-manager';

const stateManager = new StateManager({
  deviceId: 'web-redux',
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

// Initialize
stateManager.initialize();
```

### Usage

```typescript
import { createSlice } from '@reduxjs/toolkit';

const appSlice = createSlice({
  name: 'app',
  initialState: {
    user: null,
    settings: {},
  },
  reducers: {
    updateUser: (state, action) => {
      state.user = action.payload;
    },
    updateSettings: (state, action) => {
      state.settings = { ...state.settings, ...action.payload };
    },
  },
});

export const { updateUser, updateSettings } = appSlice.actions;
export default appSlice.reducer;
```

## MobX Integration

### Setup

```typescript
import { makeAutoObservable } from 'mobx';
import { createMobXAdapter, StateManager } from '@harmonyflow/client-state-manager';

class AppStore {
  stateManager: StateManager;
  syncStore: StateSyncStore;
  
  constructor() {
    this.stateManager = new StateManager({
      deviceId: 'web-mobx',
      userId: 'user-123',
      sessionId: 'session-456',
      websocketUrl: 'wss://api.harmonyflow.io/v1/ws',
      token: 'jwt-token',
      autoSync: true,
    });

    const adapter = createMobXAdapter({
      stateManager: this.stateManager,
      syncToMobX: true,
      syncFromMobX: true,
    });

    this.syncStore = adapter.store;
    makeAutoObservable(this);
    
    this.stateManager.initialize();
  }

  get userName() {
    return this.syncStore.data.user?.name;
  }

  set userName(value: string) {
    this.syncStore.setData('user.name', value);
  }
}

export const appStore = new AppStore();
```

## Error Handling

```typescript
stateManager.subscribe((changes) => {
  const state = stateManager.getState();
  
  if (state.metadata.syncStatus === 'conflict') {
    // Show conflict resolution UI
    showConflictDialog({
      local: state.data,
      server: fetchServerState(),
      onResolve: (resolution) => {
        if (resolution === 'server') {
          stateManager.requestFullSync();
        } else {
          stateManager.sync();
        }
      },
    });
  }

  if (state.metadata.syncStatus === 'error') {
    showErrorNotification('Sync failed. Will retry automatically.');
  }
});
```

## Offline Support

```typescript
class OfflineStateManager {
  private stateManager: StateManager;
  private isOnline = navigator.onLine;

  constructor(stateManager: StateManager) {
    this.stateManager = stateManager;
    this.setupEventListeners();
  }

  private setupEventListeners() {
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.stateManager.sync();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
    });

    // Queue changes when offline
    this.stateManager.subscribe((changes) => {
      if (!this.isOnline) {
        this.queueChanges(changes);
      }
    });
  }

  private queueChanges(changes: StateChange[]) {
    const queue = JSON.parse(localStorage.getItem('stateQueue') || '[]');
    queue.push(...changes);
    localStorage.setItem('stateQueue', JSON.stringify(queue));
  }

  async syncWhenOnline() {
    if (this.isOnline) {
      const queue = JSON.parse(localStorage.getItem('stateQueue') || '[]');
      for (const change of queue) {
        this.stateManager.setState(change.path, change.newValue);
      }
      localStorage.removeItem('stateQueue');
      await this.stateManager.sync();
    }
  }
}
```

## Testing

### Mocking

```typescript
import { StateManager } from '@harmonyflow/client-state-manager';

jest.mock('@harmonyflow/client-state-manager');

const createMockStateManager = () => ({
  initialize: jest.fn(),
  getState: jest.fn().mockReturnValue({ version: 1, data: {} }),
  setState: jest.fn(),
  subscribe: jest.fn().mockReturnValue(jest.fn()),
  sync: jest.fn(),
  destroy: jest.fn(),
});

(StateManager as jest.Mock).mockImplementation(createMockStateManager);
```

### Component Testing

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { StateProvider, useSyncedState } from './StateContext';

test('state updates propagate to components', () => {
  const TestComponent = () => {
    const [value, setValue] = useSyncedState('test');
    return (
      <div>
        <span data-testid="value">{value}</span>
        <button onClick={() => setValue('updated')}>Update</button>
      </div>
    );
  };

  render(
    <StateProvider>
      <TestComponent />
    </StateProvider>
  );

  fireEvent.click(screen.getByText('Update'));
  
  expect(screen.getByTestId('value')).toHaveTextContent('updated');
});
```
