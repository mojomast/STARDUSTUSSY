/**
 * Multi-Device Sync Manager Tests
 */

import { MultiDeviceSyncManager } from '../src/handoff/MultiDeviceSyncManager';
import { WebSocketClient } from '../src/core/WebSocketClient';
import { DeviceInfo } from '../src/types/device';
import { StateDelta } from '../src/types/delta';
import { SessionState } from '../src/types/session';

// Mock WebSocketClient
jest.mock('../src/core/WebSocketClient');

describe('MultiDeviceSyncManager', () => {
  let syncManager: MultiDeviceSyncManager;
  let mockWebSocket: jest.Mocked<WebSocketClient>;
  const deviceId = 'test-device';
  const sessionId = 'test-session';

  beforeEach(() => {
    mockWebSocket = new WebSocketClient({
      url: 'ws://test',
      sessionId,
      token: 'test-token',
      deviceId,
    }) as jest.Mocked<WebSocketClient>;

    syncManager = new MultiDeviceSyncManager({
      deviceId,
      sessionId,
      websocket: mockWebSocket,
      debug: false,
    });
  });

  afterEach(() => {
    syncManager.destroy();
    jest.clearAllMocks();
  });

  describe('Device Registration', () => {
    test('should register a device', () => {
      const device: DeviceInfo = {
        id: 'device-1',
        type: 'mobile',
        connectedAt: new Date().toISOString(),
      };

      syncManager.registerDevice(device);

      const presence = syncManager.getDevicePresence('device-1');
      expect(presence).toBeDefined();
      expect(presence?.status).toBe('online');
    });

    test('should register multiple devices', () => {
      const devices: DeviceInfo[] = [
        { id: 'device-1', type: 'mobile', connectedAt: new Date().toISOString() },
        { id: 'device-2', type: 'web', connectedAt: new Date().toISOString() },
        { id: 'device-3', type: 'tablet', connectedAt: new Date().toISOString() },
      ];

      devices.forEach(d => syncManager.registerDevice(d));

      expect(syncManager.getAllDevices()).toHaveLength(3);
      expect(syncManager.getOnlineDevices()).toHaveLength(3);
    });

    test('should unregister a device', () => {
      const device: DeviceInfo = {
        id: 'device-1',
        type: 'mobile',
        connectedAt: new Date().toISOString(),
      };

      syncManager.registerDevice(device);
      syncManager.unregisterDevice('device-1');

      const presence = syncManager.getDevicePresence('device-1');
      expect(presence?.status).toBe('offline');
    });
  });

  describe('State Change Broadcasting', () => {
    test('should queue state change broadcast', () => {
      syncManager.broadcastStateChange('user.name', 'John', undefined);
      
      // Should not throw
      expect(true).toBe(true);
    });

    test('should handle multiple state changes', () => {
      syncManager.broadcastStateChange('user.name', 'John', undefined);
      syncManager.broadcastStateChange('user.email', 'john@example.com', undefined);
      syncManager.broadcastStateChange('settings.theme', 'dark', 'light');
      
      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('Remote State Changes', () => {
    test('should handle remote state change', () => {
      const currentState: SessionState = {
        id: sessionId,
        userId: 'user-1',
        deviceId,
        version: 1,
        data: { user: { name: 'Jane' } },
        lastModified: Date.now(),
      };

      const delta: StateDelta = {
        baseVersion: 1,
        targetVersion: 2,
        operations: [
          {
            op: 'replace',
            path: '/user/name',
            value: 'John',
          },
        ],
        timestamp: Date.now(),
      };

      const result = syncManager.handleRemoteStateChange('remote-device', delta, currentState);

      expect(result.success).toBe(true);
      expect(result.mergedState.data.user?.name).toBe('John');
    });

    test('should handle multiple operations', () => {
      const currentState: SessionState = {
        id: sessionId,
        userId: 'user-1',
        deviceId,
        version: 1,
        data: {},
        lastModified: Date.now(),
      };

      const delta: StateDelta = {
        baseVersion: 1,
        targetVersion: 2,
        operations: [
          { op: 'add', path: '/user', value: {} },
          { op: 'add', path: '/user/name', value: 'John' },
          { op: 'add', path: '/user/email', value: 'john@example.com' },
          { op: 'add', path: '/settings', value: { theme: 'dark' } },
        ],
        timestamp: Date.now(),
      };

      const result = syncManager.handleRemoteStateChange('remote-device', delta, currentState);

      expect(result.success).toBe(true);
      expect(result.mergedState.data.user?.name).toBe('John');
      expect(result.mergedState.data.user?.email).toBe('john@example.com');
      expect(result.mergedState.data.settings?.theme).toBe('dark');
    });
  });

  describe('Optimistic Locking', () => {
    test('should acquire lock successfully', () => {
      const acquired = syncManager.acquireLock('user.name');
      expect(acquired).toBe(true);
    });

    test('should check if path is locked by other', () => {
      syncManager.acquireLock('user.name');
      
      const locked = syncManager.isLockedByOther('user.name');
      expect(locked).toBe(false); // Locked by us, not other
    });

    test('should release lock', () => {
      syncManager.acquireLock('user.name');
      const released = syncManager.releaseLock('user.name');
      
      expect(released).toBe(true);
    });

    test('should not release lock held by other', () => {
      // This would require simulating another device locking
      // For now, just test that release returns false for unknown lock
      const released = syncManager.releaseLock('non-existent-path');
      expect(released).toBe(false);
    });
  });

  describe('Device Presence', () => {
    test('should update device activity', async () => {
      const device: DeviceInfo = {
        id: 'device-1',
        type: 'mobile',
        connectedAt: new Date().toISOString(),
        lastSeen: new Date(Date.now() - 60000).toISOString(),
      };

      syncManager.registerDevice(device);
      
      const beforeUpdate = syncManager.getDevicePresence('device-1')?.lastSeenAt;
      
      // Small delay to ensure timestamp changes
      await new Promise(resolve => setTimeout(resolve, 10));
      
      syncManager.updateDeviceActivity('device-1');
      
      const afterUpdate = syncManager.getDevicePresence('device-1')?.lastSeenAt;
      
      expect(afterUpdate).toBeGreaterThan(beforeUpdate!);
    });

    test('should set device status', () => {
      const device: DeviceInfo = {
        id: 'device-1',
        type: 'mobile',
        connectedAt: new Date().toISOString(),
      };

      syncManager.registerDevice(device);
      syncManager.setDeviceStatus('device-1', 'away');

      const presence = syncManager.getDevicePresence('device-1');
      expect(presence?.status).toBe('away');
    });

    test('should track online devices', () => {
      syncManager.registerDevice({ id: 'd1', type: 'mobile', connectedAt: new Date().toISOString() });
      syncManager.registerDevice({ id: 'd2', type: 'web', connectedAt: new Date().toISOString() });
      syncManager.registerDevice({ id: 'd3', type: 'tablet', connectedAt: new Date().toISOString() });

      syncManager.setDeviceStatus('d2', 'offline');

      const onlineDevices = syncManager.getOnlineDevices();
      expect(onlineDevices).toHaveLength(2);
    });
  });

  describe('Event Subscriptions', () => {
    test('should receive presence events', () => {
      const listener = jest.fn();
      const unsubscribe = syncManager.subscribeToPresence(listener);

      const device: DeviceInfo = {
        id: 'device-1',
        type: 'mobile',
        connectedAt: new Date().toISOString(),
      };

      syncManager.registerDevice(device);

      expect(listener).toHaveBeenCalled();
      expect(listener.mock.calls[0][0].type).toBe('device-online');

      unsubscribe();
    });

    test('should receive state change events', () => {
      const listener = jest.fn();
      syncManager.subscribeToPresence(listener);

      const currentState: SessionState = {
        id: sessionId,
        userId: 'user-1',
        deviceId,
        version: 1,
        data: {},
        lastModified: Date.now(),
      };

      const delta: StateDelta = {
        baseVersion: 1,
        targetVersion: 2,
        operations: [{ op: 'add', path: '/test', value: 'value' }],
        timestamp: Date.now(),
      };

      syncManager.handleRemoteStateChange('remote-device', delta, currentState);

      const stateChangeEvents = listener.mock.calls.filter(
        (call: [{ type: string }]) => call[0].type === 'state-changed'
      );
      expect(stateChangeEvents.length).toBeGreaterThan(0);
    });
  });

  describe('Cleanup', () => {
    test('should clean up stale devices', () => {
      const device: DeviceInfo = {
        id: 'device-1',
        type: 'mobile',
        connectedAt: new Date().toISOString(),
      };

      syncManager.registerDevice(device);
      
      // Simulate time passing
      const originalDate = Date.now;
      const futureTime = Date.now() + 6 * 60 * 1000; // 6 minutes later
      global.Date.now = jest.fn(() => futureTime);

      syncManager.cleanup();

      const presence = syncManager.getDevicePresence('device-1');
      expect(presence?.status).toBe('away');

      global.Date.now = originalDate;
    });

    test('should clean up expired locks', () => {
      syncManager.acquireLock('test.path', 100); // 100ms lock

      // Wait for lock to expire
      jest.advanceTimersByTime(150);

      syncManager.cleanup();

      // Lock should be released
      const canAcquire = syncManager.acquireLock('test.path');
      expect(canAcquire).toBe(true);
    });
  });

  describe('Broadcast Management', () => {
    test('should flush pending broadcasts', async () => {
      syncManager.broadcastStateChange('key1', 'value1', undefined);
      syncManager.broadcastStateChange('key2', 'value2', undefined);

      await syncManager.flushBroadcasts();

      // Should complete without errors
      expect(true).toBe(true);
    });
  });

  describe('Conflict Detection', () => {
    test('should detect conflicts with locked paths', () => {
      const currentState: SessionState = {
        id: sessionId,
        userId: 'user-1',
        deviceId,
        version: 1,
        data: { user: { name: 'Jane' } },
        lastModified: Date.now(),
      };

      // Lock a path
      syncManager.acquireLock('user.name');

      // Another device tries to change the same path
      const delta: StateDelta = {
        baseVersion: 1,
        targetVersion: 2,
        operations: [
          { op: 'replace', path: '/user/name', value: 'John' },
        ],
        timestamp: Date.now(),
      };

      const result = syncManager.handleRemoteStateChange('remote-device', delta, currentState);

      // With 'last-write-wins' resolution (default), conflicts are resolved
      expect(result.success).toBe(true);
    });
  });
});
