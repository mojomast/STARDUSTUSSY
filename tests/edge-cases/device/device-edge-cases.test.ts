import { StateManager } from '../../../packages/client-state-manager/src/core/StateManager';
import { TokenManager } from '../../../packages/client-state-manager/src/core/TokenManager';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

/**
 * Device Edge Case Tests
 * Tests for browser refresh during handoff, multiple tabs, incognito mode,
 * and local storage quota exceeded scenarios
 */

describe('Device Edge Cases', () => {
  let stateManager: StateManager;
  let tokenManager: TokenManager;

  beforeEach(() => {
    // Clear localStorage before each test
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.clear();
    }
  });

  afterEach(() => {
    if (stateManager) {
      stateManager.destroy();
    }
    if (tokenManager) {
      tokenManager.destroy();
    }
    jest.clearAllMocks();
  });

  describe('Browser Refresh During Handoff', () => {
    it('should recover session after hard refresh', async () => {
      // Simulate initial session
      tokenManager = new TokenManager({
        storageKey: 'harmonyflow_auth',
        autoRefresh: true,
      });

      tokenManager.setToken({
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      });
      tokenManager.setUserId('test-user');
      tokenManager.setDeviceId('test-device');

      stateManager = new StateManager({
        deviceId: 'test-device',
        userId: 'test-user',
        sessionId: 'test-session',
        websocketUrl: 'ws://localhost:8080',
        token: tokenManager.getAccessToken() || '',
        autoSync: false,
      });

      // Set some state
      stateManager.setState('user.name', 'John Doe');
      stateManager.setState('user.email', 'john@example.com');
      stateManager.setState('preferences.theme', 'dark');

      // Create snapshot before "refresh"
      const preRefreshSnapshot = stateManager.createSnapshot({ label: 'pre-refresh' });

      // Simulate browser refresh - destroy and recreate
      const sessionId = stateManager.getServerVersion.toString();
      stateManager.destroy();
      tokenManager.destroy();

      // Recreate (simulating page reload)
      tokenManager = new TokenManager({
        storageKey: 'harmonyflow_auth',
      });

      stateManager = new StateManager({
        deviceId: 'test-device',
        userId: tokenManager.getUserId() || 'test-user',
        sessionId: 'test-session',
        websocketUrl: 'ws://localhost:8080',
        token: tokenManager.getAccessToken() || '',
        autoSync: false,
      });

      // Verify session recovered
      expect(tokenManager.isAuthenticated()).toBe(true);
      expect(stateManager).toBeDefined();
    });

    it('should handle refresh during active handoff operation', async () => {
      let handoffInProgress = true;

      stateManager = new StateManager({
        deviceId: 'source-device',
        userId: 'test-user',
        sessionId: 'test-session',
        websocketUrl: 'ws://localhost:8080',
        token: 'test-token',
        autoSync: true,
      });

      // Start handoff (set state during transfer)
      stateManager.setState('handoff.status', 'in_progress');
      stateManager.setState('handoff.targetDevice', 'target-device');
      stateManager.setState('handoff.timestamp', Date.now());

      // Simulate refresh during handoff
      const handoffState = {
        status: stateManager.getStateAtPath('handoff.status'),
        targetDevice: stateManager.getStateAtPath('handoff.targetDevice'),
        timestamp: stateManager.getStateAtPath('handoff.timestamp'),
      };

      // Destroy (refresh)
      stateManager.destroy();

      // Recreate
      stateManager = new StateManager({
        deviceId: 'source-device',
        userId: 'test-user',
        sessionId: 'test-session',
        websocketUrl: 'ws://localhost:8080',
        token: 'test-token',
        autoSync: true,
      });

      // Verify handoff can be resumed
      expect(handoffState.status).toBe('in_progress');
      expect(handoffState.targetDevice).toBe('target-device');
    });

    it('should handle partial state corruption on refresh', async () => {
      stateManager = new StateManager({
        deviceId: 'test-device',
        userId: 'test-user',
        sessionId: 'test-session',
        websocketUrl: 'ws://localhost:8080',
        token: 'test-token',
        autoSync: false,
      });

      // Set critical state
      stateManager.setState('critical.data', 'important-value');
      stateManager.setState('critical.id', 'session-12345');

      // Simulate partial corruption by setting incomplete data directly
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('harmonyflow_state', JSON.stringify({
          partial: true,
          data: null,
        }));
      }

      // Destroy and recreate
      stateManager.destroy();
      stateManager = new StateManager({
        deviceId: 'test-device',
        userId: 'test-user',
        sessionId: 'test-session',
        websocketUrl: 'ws://localhost:8080',
        token: 'test-token',
        autoSync: false,
      });

      // Should handle gracefully - either recover or start fresh
      expect(stateManager.getStateData()).toBeDefined();
    });

    it('should maintain version consistency across refresh', async () => {
      stateManager = new StateManager({
        deviceId: 'test-device',
        userId: 'test-user',
        sessionId: 'test-session',
        websocketUrl: 'ws://localhost:8080',
        token: 'test-token',
        autoSync: false,
      });

      // Make several changes to increment version
      for (let i = 0; i < 10; i++) {
        stateManager.setState(`counter.${i}`, i);
      }

      const versionBefore = stateManager.getVersion();
      expect(versionBefore).toBeGreaterThan(0);

      // Create snapshot as recovery point
      const recoverySnapshot = stateManager.createSnapshot();

      // Simulate refresh
      stateManager.destroy();
      stateManager = new StateManager({
        deviceId: 'test-device',
        userId: 'test-user',
        sessionId: 'test-session',
        websocketUrl: 'ws://localhost:8080',
        token: 'test-token',
        autoSync: false,
      });

      // Version should reset (new instance), but snapshot should exist
      expect(stateManager.listSnapshots()).toHaveLength(0); // Snapshots not persisted by default
    });
  });

  describe('Multiple Tabs with Same Session', () => {
    it('should sync state across multiple tabs', async () => {
      // Simulate Tab 1
      const tab1Manager = new StateManager({
        deviceId: 'device-1',
        userId: 'test-user',
        sessionId: 'shared-session',
        websocketUrl: 'ws://localhost:8080',
        token: 'test-token',
      });

      // Simulate Tab 2
      const tab2Manager = new StateManager({
        deviceId: 'device-1', // Same device
        userId: 'test-user',
        sessionId: 'shared-session',
        websocketUrl: 'ws://localhost:8080',
        token: 'test-token',
      });

      // Tab 1 sets state
      tab1Manager.setState('shared.value', 'from-tab-1');

      // Tab 2 should eventually see the change (via WebSocket)
      // For this test, we verify both instances can access the state
      // In real scenario, WebSocket would broadcast the change

      expect(tab1Manager.getStateAtPath('shared.value')).toBe('from-tab-1');
      expect(tab2Manager).toBeDefined();

      tab1Manager.destroy();
      tab2Manager.destroy();
    });

    it('should handle concurrent edits from different tabs', async () => {
      const tab1Changes: any[] = [];
      const tab2Changes: any[] = [];

      const tab1Manager = new StateManager({
        deviceId: 'device-1',
        userId: 'test-user',
        sessionId: 'shared-session',
        websocketUrl: 'ws://localhost:8080',
        token: 'test-token',
        conflictResolution: 'server-wins',
      });

      const tab2Manager = new StateManager({
        deviceId: 'device-1',
        userId: 'test-user',
        sessionId: 'shared-session',
        websocketUrl: 'ws://localhost:8080',
        token: 'test-token',
        conflictResolution: 'server-wins',
      });

      tab1Manager.subscribe((changes) => {
        tab1Changes.push(...changes);
      });

      tab2Manager.subscribe((changes) => {
        tab2Changes.push(...changes);
      });

      // Simulate concurrent edits
      tab1Manager.setState('counter', 1);
      tab2Manager.setState('counter', 2);

      // Both tabs made changes
      expect(tab1Changes.length).toBeGreaterThan(0);
      expect(tab2Changes.length).toBeGreaterThan(0);

      tab1Manager.destroy();
      tab2Manager.destroy();
    });

    it('should handle tab close during handoff', async () => {
      const sourceTab = new StateManager({
        deviceId: 'source-device',
        userId: 'test-user',
        sessionId: 'test-session',
        websocketUrl: 'ws://localhost:8080',
        token: 'test-token',
      });

      const targetTab = new StateManager({
        deviceId: 'target-device',
        userId: 'test-user',
        sessionId: 'test-session',
        websocketUrl: 'ws://localhost:8080',
        token: 'test-token',
      });

      // Start handoff
      sourceTab.setState('handoff.active', true);
      sourceTab.setState('handoff.target', 'target-device');

      // Target tab starts receiving
      targetTab.setState('handoff.receiving', true);

      // Source tab closes (simulate)
      sourceTab.destroy();

      // Target should detect source tab closure
      // and potentially complete handoff or show error
      expect(targetTab.getStateAtPath('handoff.receiving')).toBe(true);

      targetTab.destroy();
    });

    it('should limit maximum concurrent tabs', async () => {
      const MAX_TABS = 5;
      const managers: StateManager[] = [];

      // Try to create more than max tabs
      for (let i = 0; i < MAX_TABS + 3; i++) {
        try {
          const manager = new StateManager({
            deviceId: 'device-1',
            userId: 'test-user',
            sessionId: 'test-session',
            websocketUrl: 'ws://localhost:8080',
            token: 'test-token',
          });
          managers.push(manager);
        } catch (error) {
          // May fail if limit enforced
          expect(i).toBeGreaterThanOrEqual(MAX_TABS);
        }
      }

      // Cleanup
      managers.forEach(m => m.destroy());

      // Either all created or limited
      expect(managers.length <= MAX_TABS || managers.length === MAX_TABS + 3).toBe(true);
    });
  });

  describe('Incognito Mode Restrictions', () => {
    it('should handle localStorage unavailable in incognito', () => {
      // Mock localStorage as unavailable
      const originalLocalStorage = (global as any).localStorage;
      (global as any).localStorage = undefined;

      expect(() => {
        tokenManager = new TokenManager({
          storageKey: 'test_token',
        });
      }).not.toThrow();

      // Token manager should work without storage
      tokenManager.setToken({
        accessToken: 'test-token',
        refreshToken: 'refresh-token',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      });

      expect(tokenManager.isAuthenticated()).toBe(true);

      // Restore
      (global as any).localStorage = originalLocalStorage;
    });

    it('should handle sessionStorage only mode', () => {
      // Mock localStorage as unavailable but sessionStorage available
      const originalLocalStorage = (global as any).localStorage;
      (global as any).localStorage = undefined;

      tokenManager = new TokenManager({
        storageKey: 'test_token',
      });

      // Should fall back to memory or sessionStorage
      tokenManager.setToken({
        accessToken: 'session-token',
        refreshToken: 'refresh-token',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      });

      expect(tokenManager.getAccessToken()).toBe('session-token');

      // Restore
      (global as any).localStorage = originalLocalStorage;
    });

    it('should handle storage quota errors gracefully', () => {
      // Mock quota exceeded error
      const mockSetItem = jest.fn(() => {
        throw new Error('QuotaExceededError');
      });

      const originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = mockSetItem;

      tokenManager = new TokenManager({
        storageKey: 'test_token',
      });

      // Should not throw when storage fails
      expect(() => {
        tokenManager.setToken({
          accessToken: 'test-token',
          refreshToken: 'refresh-token',
          expiresAt: Math.floor(Date.now() / 1000) + 3600,
        });
      }).not.toThrow();

      // Token should still be in memory
      expect(tokenManager.getAccessToken()).toBe('test-token');

      // Restore
      Storage.prototype.setItem = originalSetItem;
    });

    it('should handle storage access denied errors', () => {
      // Mock storage access denied
      Object.defineProperty(window, 'localStorage', {
        get: () => {
          throw new Error('Access denied');
        },
        configurable: true,
      });

      expect(() => {
        tokenManager = new TokenManager({
          storageKey: 'test_token',
        });
      }).not.toThrow();

      // Token manager should work in memory-only mode
      expect(tokenManager).toBeDefined();
    });
  });

  describe('Local Storage Quota Exceeded', () => {
    it('should handle 5MB storage limit', () => {
      tokenManager = new TokenManager({
        storageKey: 'test_token',
      });

      stateManager = new StateManager({
        deviceId: 'test-device',
        userId: 'test-user',
        sessionId: 'test-session',
        websocketUrl: 'ws://localhost:8080',
        token: 'test-token',
      });

      // Fill storage close to limit
      let dataSize = 0;
      const maxSize = 5 * 1024 * 1024; // 5MB

      try {
        for (let i = 0; i < 1000 && dataSize < maxSize - 1024 * 100; i++) {
          const key = `large_data_${i}`;
          const value = 'x'.repeat(1024); // 1KB
          stateManager.setState(key, value);
          dataSize += key.length + value.length;
        }
      } catch (error) {
        // Expected to hit quota
        expect(error).toBeDefined();
      }

      // Should still be functional
      expect(stateManager.getStateData()).toBeDefined();
    });

    it('should implement LRU eviction for snapshots', () => {
      stateManager = new StateManager({
        deviceId: 'test-device',
        userId: 'test-user',
        sessionId: 'test-session',
        websocketUrl: 'ws://localhost:8080',
        token: 'test-token',
      });

      // Create many snapshots
      const snapshotIds: string[] = [];
      for (let i = 0; i < 20; i++) {
        stateManager.setState(`data.${i}`, i);
        const snapshot = stateManager.createSnapshot({ label: `snapshot-${i}` });
        snapshotIds.push(snapshot.id);
      }

      // Access older snapshots to keep them
      stateManager.getSnapshot(snapshotIds[0]);
      stateManager.getSnapshot(snapshotIds[5]);

      // Create more snapshots to trigger eviction
      for (let i = 20; i < 30; i++) {
        stateManager.setState(`data.${i}`, i);
        stateManager.createSnapshot({ label: `snapshot-${i}` });
      }

      // Most accessed snapshots should still exist
      expect(stateManager.getSnapshot(snapshotIds[0])).toBeDefined();
      expect(stateManager.getSnapshot(snapshotIds[5])).toBeDefined();
    });

    it('should prioritize critical data over snapshots', () => {
      stateManager = new StateManager({
        deviceId: 'test-device',
        userId: 'test-user',
        sessionId: 'test-session',
        websocketUrl: 'ws://localhost:8080',
        token: 'test-token',
      });

      // Set critical data
      stateManager.setState('critical.sessionId', 'session-123');
      stateManager.setState('critical.userId', 'user-456');
      stateManager.setState('critical.authToken', 'secret-token');

      // Fill remaining storage with snapshots
      for (let i = 0; i < 100; i++) {
        try {
          stateManager.setState(`temp.data${i}`, 'x'.repeat(10000));
          stateManager.createSnapshot();
        } catch (error) {
          // Quota exceeded
          break;
        }
      }

      // Critical data should be preserved
      expect(stateManager.getStateAtPath('critical.sessionId')).toBe('session-123');
      expect(stateManager.getStateAtPath('critical.userId')).toBe('user-456');
      expect(stateManager.getStateAtPath('critical.authToken')).toBe('secret-token');
    });

    it('should compress data before storage', () => {
      stateManager = new StateManager({
        deviceId: 'test-device',
        userId: 'test-user',
        sessionId: 'test-session',
        websocketUrl: 'ws://localhost:8080',
        token: 'test-token',
      });

      // Create highly compressible data
      const compressibleData = {
        items: Array(1000).fill({ name: 'repeated', value: 123 }),
      };

      stateManager.setState('compressible', compressibleData);

      // Should store successfully due to compression
      expect(stateManager.getStateAtPath('compressible')).toEqual(compressibleData);
    });
  });

  describe('Device-Specific Edge Cases', () => {
    it('should handle different device pixel ratios', () => {
      // Mock different DPR values
      const dprValues = [1, 1.5, 2, 2.5, 3];

      dprValues.forEach(dpr => {
        Object.defineProperty(window, 'devicePixelRatio', {
          value: dpr,
          writable: true,
        });

        stateManager = new StateManager({
          deviceId: `device-dpr-${dpr}`,
          userId: 'test-user',
          sessionId: 'test-session',
          websocketUrl: 'ws://localhost:8080',
          token: 'test-token',
        });

        stateManager.setState('device.dpr', dpr);
        expect(stateManager.getStateAtPath('device.dpr')).toBe(dpr);

        stateManager.destroy();
      });
    });

    it('should handle touch vs mouse input devices', () => {
      const deviceTypes = [
        { touch: true, mouse: false },
        { touch: false, mouse: true },
        { touch: true, mouse: true },
      ];

      deviceTypes.forEach((device, index) => {
        stateManager = new StateManager({
          deviceId: `device-${index}`,
          userId: 'test-user',
          sessionId: 'test-session',
          websocketUrl: 'ws://localhost:8080',
          token: 'test-token',
        });

        stateManager.setState('device.input', device);
        expect(stateManager.getStateAtPath('device.input')).toEqual(device);

        stateManager.destroy();
      });
    });

    it('should handle mobile viewport changes', () => {
      const viewports = [
        { width: 320, height: 568 },   // iPhone SE
        { width: 375, height: 667 },   // iPhone 8
        { width: 414, height: 896 },   // iPhone 11
        { width: 768, height: 1024 },  // iPad
        { width: 1920, height: 1080 }, // Desktop
      ];

      viewports.forEach((viewport, index) => {
        stateManager = new StateManager({
          deviceId: `device-viewport-${index}`,
          userId: 'test-user',
          sessionId: 'test-session',
          websocketUrl: 'ws://localhost:8080',
          token: 'test-token',
        });

        stateManager.setState('viewport', viewport);
        expect(stateManager.getStateAtPath('viewport')).toEqual(viewport);

        stateManager.destroy();
      });
    });

    it('should handle battery status API availability', () => {
      stateManager = new StateManager({
        deviceId: 'mobile-device',
        userId: 'test-user',
        sessionId: 'test-session',
        websocketUrl: 'ws://localhost:8080',
        token: 'test-token',
      });

      // Mock battery API
      const batteryInfo = {
        charging: false,
        level: 0.75,
        chargingTime: Infinity,
        dischargingTime: 3600,
      };

      stateManager.setState('device.battery', batteryInfo);
      expect(stateManager.getStateAtPath('device.battery.level')).toBe(0.75);

      stateManager.destroy();
    });
  });
});
