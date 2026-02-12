import { StateManager } from '../src/core/StateManager';
import { SyncStatus } from '../src/types';
import { WebSocketClient } from '../src/core/WebSocketClient';

jest.mock('../src/core/WebSocketClient');

describe('StateManager', () => {
  let manager: StateManager;
  const mockWebSocket = {
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn(),
    sendStateUpdate: jest.fn(),
    subscribe: jest.fn(),
    on: jest.fn().mockReturnValue(() => {}),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    
    (WebSocketClient as jest.Mock).mockImplementation(() => mockWebSocket);

    manager = new StateManager({
      deviceId: 'test-device',
      userId: 'test-user',
      sessionId: 'test-session',
      websocketUrl: 'ws://localhost:8080',
      token: 'test-token',
      autoSync: false,
      debug: false,
    });
  });

  afterEach(async () => {
    jest.useRealTimers();
    await manager.destroy();
  });

  describe('initialization', () => {
    it('should create initial state', () => {
      const state = manager.getState();
      expect(state).toBeDefined();
      expect(state.version).toBe(1);
      expect(state.data).toEqual({});
      expect(state.metadata.syncStatus).toBe(SyncStatus.SYNCED);
    });

    it('should initialize successfully', async () => {
      await expect(manager.initialize()).resolves.not.toThrow();
      expect(mockWebSocket.connect).toHaveBeenCalled();
    });

    it('should not initialize twice', async () => {
      await manager.initialize();
      await manager.initialize();
      
      expect(mockWebSocket.connect).toHaveBeenCalledTimes(1);
    });
  });

  describe('state management', () => {
    it('should set state value', () => {
      manager.setState('user.name', 'John');
      const data = manager.getStateData();
      expect(data.user?.name).toBe('John');
    });

    it('should set nested state value', () => {
      manager.setState('settings.theme.dark', true);
      const data = manager.getStateData();
      expect(data.settings?.theme?.dark).toBe(true);
    });

    it('should not update if value is unchanged', () => {
      manager.setState('value', 123);
      const before = manager.getState();
      manager.setState('value', 123);
      const after = manager.getState();
      expect(after.version).toBe(before.version);
    });

    it('should mark state as pending after modification', () => {
      manager.setState('test', 'value');
      const state = manager.getState();
      expect(state.metadata.syncStatus).toBe(SyncStatus.PENDING);
    });

    it('should get value at path', () => {
      manager.setState('user.profile.age', 30);
      expect(manager.getStateAtPath('user.profile.age')).toBe(30);
      expect(manager.getStateAtPath('user.profile.name')).toBeUndefined();
    });

    it('should delete value at path', () => {
      manager.setState('user.name', 'John');
      manager.deleteState('user.name');
      expect(manager.getStateAtPath('user.name')).toBeUndefined();
    });

    it('should not delete non-existent path', () => {
      const before = manager.getState();
      manager.deleteState('nonexistent.path');
      const after = manager.getState();
      expect(after.version).toBe(before.version);
    });

    it('should batch update multiple values', () => {
      manager.batchUpdate({
        'user.name': 'John',
        'user.age': 30,
        'settings.theme': 'dark',
      });

      const data = manager.getStateData();
      expect(data.user).toEqual({ name: 'John', age: 30 });
      expect(data.settings).toEqual({ theme: 'dark' });
    });

    it('should not batch update unchanged values', () => {
      manager.setState('user.name', 'John');
      const before = manager.getState();
      
      manager.batchUpdate({
        'user.name': 'John',
      });
      
      const after = manager.getState();
      expect(after.version).toBe(before.version);
    });
  });

  describe('subscriptions', () => {
    it('should notify listeners on state change', () => {
      const listener = jest.fn();
      const unsubscribe = manager.subscribe(listener);

      manager.setState('key', 'value');

      expect(listener).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'key',
            newValue: 'value',
          }),
        ])
      );

      unsubscribe();
    });

    it('should stop notifying after unsubscribe', () => {
      const listener = jest.fn();
      const unsubscribe = manager.subscribe(listener);

      unsubscribe();
      manager.setState('key', 'value');

      expect(listener).not.toHaveBeenCalled();
    });

    it('should handle listener errors gracefully', () => {
      const errorListener = jest.fn().mockImplementation(() => {
        throw new Error('Listener error');
      });
      const normalListener = jest.fn();

      manager.subscribe(errorListener);
      manager.subscribe(normalListener);

      manager.setState('key', 'value');

      expect(normalListener).toHaveBeenCalled();
    });
  });

  describe('snapshots', () => {
    it('should create snapshot', () => {
      manager.setState('user.name', 'John');
      const snapshot = manager.createSnapshot({ label: 'test-snapshot' });

      expect(snapshot.id).toBeDefined();
      expect(snapshot.version).toBe(manager.getVersion());
      expect(snapshot.data).toEqual(manager.getStateData());
      expect((snapshot as unknown as { label: string }).label).toBe('test-snapshot');
    });

    it('should restore snapshot', () => {
      manager.setState('user.name', 'John');
      const snapshot = manager.createSnapshot();

      manager.setState('user.name', 'Jane');
      expect(manager.getStateAtPath('user.name')).toBe('Jane');

      const restored = manager.restoreSnapshot(snapshot.id);
      expect(restored).toBe(true);
      expect(manager.getStateAtPath('user.name')).toBe('John');
    });

    it('should not restore non-existent snapshot', () => {
      const restored = manager.restoreSnapshot('non-existent');
      expect(restored).toBe(false);
    });

    it('should skip restore if checksum matches', () => {
      manager.setState('user.name', 'John');
      const snapshot = manager.createSnapshot();

      const listener = jest.fn();
      manager.subscribe(listener);

      manager.restoreSnapshot(snapshot.id);

      expect(listener).not.toHaveBeenCalled();
    });

    it('should list snapshots', () => {
      manager.createSnapshot({ label: 'snapshot-1' });
      jest.advanceTimersByTime(1000);
      manager.createSnapshot({ label: 'snapshot-2' });

      const snapshots = manager.listSnapshots();
      expect(snapshots.length).toBe(2);
      expect((snapshots[0] as unknown as { label: string }).label).toBe('snapshot-2');
    });

    it('should delete snapshot', () => {
      const snapshot = manager.createSnapshot();
      
      expect(manager.deleteSnapshot(snapshot.id)).toBe(true);
      expect(manager.getSnapshot(snapshot.id)).toBeUndefined();
    });

    it('should restore with merge strategy', () => {
      manager.setState('user.name', 'John');
      manager.setState('settings.theme', 'light');
      const snapshot = manager.createSnapshot();

      manager.setState('user.age', 30);
      manager.setState('settings.theme', 'dark');

      manager.restoreSnapshot(snapshot.id, { mergeStrategy: 'merge' });

      expect(manager.getStateAtPath('user.name')).toBe('John');
      expect(manager.getStateAtPath('user.age')).toBe(30);
    });
  });

  describe('delta calculation', () => {
    it('should calculate delta', () => {
      manager.setState('user.name', 'John');
      manager.setState('user.age', 30);

      const delta = manager.calculateDelta(1);

      expect(delta).toBeDefined();
      expect(delta?.baseVersion).toBe(1);
      expect(delta?.targetVersion).toBe(manager.getVersion());
      expect(delta?.operations.length).toBeGreaterThan(0);
    });

    it('should return null if no changes', () => {
      const delta = manager.calculateDelta();
      expect(delta).toBeNull();
    });

    it('should apply delta', () => {
      const delta = {
        baseVersion: 1,
        targetVersion: 2,
        operations: [
          { op: 'add' as const, path: '/user/name', value: 'John' },
          { op: 'add' as const, path: '/user/age', value: 30 },
        ],
        timestamp: Date.now(),
      };

      manager.applyDelta(delta);

      expect(manager.getStateAtPath('user.name')).toBe('John');
      expect(manager.getStateAtPath('user.age')).toBe(30);
    });
  });

  describe('sync', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('should sync state', async () => {
      manager.setState('key', 'value');
      
      await manager.sync();

      expect(mockWebSocket.sendStateUpdate).toHaveBeenCalled();
      expect(manager.getState().metadata.syncStatus).toBe(SyncStatus.SYNCED);
    });

    it('should not sync if already synced', async () => {
      manager.setState('key', 'value');
      await manager.sync();
      
      mockWebSocket.sendStateUpdate.mockClear();
      await manager.sync();

      expect(mockWebSocket.sendStateUpdate).not.toHaveBeenCalled();
    });

    it('should mark error on sync failure', async () => {
      mockWebSocket.sendStateUpdate.mockRejectedValue(new Error('Sync failed'));
      
      manager.setState('key', 'value');
      
      await expect(manager.sync()).rejects.toThrow();
      expect(manager.getState().metadata.syncStatus).toBe(SyncStatus.ERROR);
    });

    it('should throw if not initialized', async () => {
      await manager.destroy();
      
      await expect(manager.sync()).rejects.toThrow('not initialized');
    });
  });

  describe('fingerprints', () => {
    it('should generate fingerprint', () => {
      const fingerprint = manager.getCurrentFingerprint();
      expect(typeof fingerprint).toBe('string');
      expect(fingerprint.length).toBeGreaterThan(0);
    });

    it('should generate different fingerprints for different states', () => {
      const fp1 = manager.getCurrentFingerprint();
      manager.setState('test', 'value');
      const fp2 = manager.getCurrentFingerprint();
      expect(fp1).not.toBe(fp2);
    });
  });

  describe('auto sync', () => {
    it('should start auto sync on initialize', async () => {
      manager = new StateManager({
        deviceId: 'test-device',
        userId: 'test-user',
        sessionId: 'test-session',
        websocketUrl: 'ws://localhost:8080',
        token: 'test-token',
        autoSync: true,
        syncInterval: 30000,
      });
      
      (WebSocketClient as jest.Mock).mockImplementation(() => mockWebSocket);

      await manager.initialize();
      
      manager.setState('key', 'value');
      
      jest.advanceTimersByTime(30000);
      
      expect(mockWebSocket.sendStateUpdate).toHaveBeenCalled();
    });

    it('should throttle sync requests', async () => {
      await manager.initialize();
      
      manager.setState('key1', 'value1');
      manager.setState('key2', 'value2');
      manager.setState('key3', 'value3');

      await new Promise((resolve) => setImmediate(resolve));
      
      expect(mockWebSocket.sendStateUpdate).toHaveBeenCalledTimes(1);
    });
  });

  describe('WebSocket integration', () => {
    it('should subscribe on connect', async () => {
      await manager.initialize();

      const stateChangeHandler = mockWebSocket.on.mock.calls.find(
        (call) => call[0] === 'open'
      )?.[1];

      if (stateChangeHandler) {
        stateChangeHandler();
      }

      expect(mockWebSocket.subscribe).toHaveBeenCalledWith('test-session', 0);
    });

    it('should handle state sync from server', async () => {
      await manager.initialize();

      const stateSyncHandler = mockWebSocket.on.mock.calls.find(
        (call) => call[0] === 'state_sync'
      )?.[1];

      const listener = jest.fn();
      manager.subscribe(listener);

      if (stateSyncHandler) {
        stateSyncHandler({ data: { serverValue: 'test' } }, 5);
      }

      expect(manager.getStateAtPath('serverValue')).toBe('test');
      expect(manager.getServerVersion()).toBe(5);
    });

    it('should handle conflict', async () => {
      manager = new StateManager({
        deviceId: 'test-device',
        userId: 'test-user',
        sessionId: 'test-session',
        websocketUrl: 'ws://localhost:8080',
        token: 'test-token',
        autoSync: false,
        conflictResolution: 'manual',
      });
      
      (WebSocketClient as jest.Mock).mockImplementation(() => mockWebSocket);
      await manager.initialize();

      const errorMessageHandler = mockWebSocket.on.mock.calls.find(
        (call) => call[0] === 'error_message'
      )?.[1];

      if (errorMessageHandler) {
        errorMessageHandler({ code: 'STATE_CONFLICT', message: 'Conflict' });
      }

      expect(manager.getState().metadata.syncStatus).toBe(SyncStatus.CONFLICT);
    });
  });

  describe('version management', () => {
    it('should track local version', () => {
      expect(manager.getVersion()).toBe(1);
      
      manager.setState('key', 'value');
      expect(manager.getVersion()).toBe(2);
      
      manager.setState('key', 'value');
      expect(manager.getVersion()).toBe(2);
    });

    it('should track pending changes', () => {
      manager.setState('key1', 'value1');
      manager.setState('key2', 'value2');
      
      const pending = manager.getPendingChanges();
      expect(pending.length).toBe(2);
    });
  });

  describe('destroy', () => {
    it('should cleanup on destroy', async () => {
      await manager.initialize();
      
      const listener = jest.fn();
      manager.subscribe(listener);
      manager.createSnapshot();
      
      await manager.destroy();
      
      expect(mockWebSocket.disconnect).toHaveBeenCalled();
      
      manager.setState('key', 'value');
      expect(listener).not.toHaveBeenCalled();
    });
  });
});
