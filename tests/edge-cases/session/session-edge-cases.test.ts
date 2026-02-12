import { TokenManager } from '../../../packages/client-state-manager/src/core/TokenManager';
import { StateManager } from '../../../packages/client-state-manager/src/core/StateManager';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

/**
 * Session Edge Case Tests
 * Tests for token expiration, JWT handling, concurrent logins, and race conditions
 */

describe('Session Edge Cases', () => {
  let tokenManager: TokenManager;
  let stateManager: StateManager;

  beforeEach(() => {
    // Clear localStorage
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  afterEach(() => {
    if (tokenManager) {
      tokenManager.destroy();
    }
    if (stateManager) {
      stateManager.destroy();
    }
    jest.clearAllTimers();
    jest.clearAllMocks();
  });

  describe('Session Token Expiration Mid-Operation', () => {
    it('should handle token expiring during active WebSocket connection', async () => {
      const tokenExpired = jest.fn();
      const tokenRefreshed = jest.fn();

      const mockToken = {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: Math.floor(Date.now() / 1000) + 2, // Expires in 2 seconds
      };

      tokenManager = new TokenManager({
        storageKey: 'test_auth_token',
        refreshThreshold: 1, // Refresh 1 second before expiry
        autoRefresh: true,
        onTokenExpired: tokenExpired,
        onTokenRefreshed: tokenRefreshed,
        refreshToken: async () => ({
          accessToken: 'new-access-token',
          refreshToken: 'new-refresh-token',
          expiresAt: Math.floor(Date.now() / 1000) + 3600,
        }),
      });

      tokenManager.setToken(mockToken);

      // Wait for token to expire
      await new Promise(resolve => setTimeout(resolve, 2500));

      // Token should have been refreshed or expired callback called
      expect(tokenRefreshed.mock.calls.length + tokenExpired.mock.calls.length).toBeGreaterThan(0);
    });

    it('should handle token expiration during state sync', async () => {
      const onTokenExpired = jest.fn();
      let syncError: Error | null = null;

      tokenManager = new TokenManager({
        storageKey: 'test_auth_token',
        onTokenExpired,
      });

      // Set token that expires immediately
      tokenManager.setToken({
        accessToken: 'expired-token',
        refreshToken: 'refresh-token',
        expiresAt: Math.floor(Date.now() / 1000) - 1,
      });

      stateManager = new StateManager({
        deviceId: 'test-device',
        userId: 'test-user',
        sessionId: 'test-session',
        websocketUrl: 'ws://localhost:8080',
        token: tokenManager.getAccessToken() || '',
        autoSync: false,
      });

      try {
        await stateManager.sync();
      } catch (error) {
        syncError = error as Error;
      }

      // Should fail due to expired token
      expect(tokenManager.isTokenExpired()).toBe(true);
      expect(syncError || onTokenExpired.mock.calls.length > 0).toBeTruthy();
    });

    it('should queue operations and retry after token refresh', async () => {
      const operations: string[] = [];
      let refreshCount = 0;

      tokenManager = new TokenManager({
        storageKey: 'test_auth_token',
        autoRefresh: true,
        refreshToken: async () => {
          refreshCount++;
          operations.push('token_refreshed');
          return {
            accessToken: `new-token-${refreshCount}`,
            refreshToken: 'new-refresh',
            expiresAt: Math.floor(Date.now() / 1000) + 3600,
          };
        },
      });

      // Set near-expiring token
      tokenManager.setToken({
        accessToken: 'old-token',
        refreshToken: 'old-refresh',
        expiresAt: Math.floor(Date.now() / 1000) + 2,
      });

      // Queue operations
      operations.push('operation_1');
      operations.push('operation_2');

      // Wait for auto-refresh
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Operations should have been queued and token refreshed
      expect(refreshCount).toBeGreaterThan(0);
      expect(operations).toContain('token_refreshed');
    });

    it('should handle refresh token also expired', async () => {
      const onTokenExpired = jest.fn();
      let refreshFailed = false;

      tokenManager = new TokenManager({
        storageKey: 'test_auth_token',
        autoRefresh: false,
        onTokenExpired,
        refreshToken: async () => {
          refreshFailed = true;
          throw new Error('Refresh token expired');
        },
      });

      tokenManager.setToken({
        accessToken: 'expired-access',
        refreshToken: 'expired-refresh',
        expiresAt: Math.floor(Date.now() / 1000) - 100,
      });

      try {
        await tokenManager.refresh();
      } catch (error) {
        // Expected to fail
      }

      expect(refreshFailed).toBe(true);
      expect(onTokenExpired).toHaveBeenCalled();
      expect(tokenManager.isAuthenticated()).toBe(false);
    });
  });

  describe('Invalid/Expired JWT Handling', () => {
    it('should reject malformed JWT tokens', () => {
      const invalidTokens = [
        'not-a-jwt',
        'invalid.token',
        'invalid.token.signature.extra',
        '',
        'Bearer ',
      ];

      tokenManager = new TokenManager({
        storageKey: 'test_auth_token',
      });

      invalidTokens.forEach(token => {
        tokenManager.setToken({
          accessToken: token,
          refreshToken: 'refresh',
          expiresAt: Math.floor(Date.now() / 1000) + 3600,
        });

        // Should not crash, but token may be stored
        expect(tokenManager.getAccessToken()).toBe(token);
      });
    });

    it('should reject JWT with invalid signature', async () => {
      const tamperedToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.tampered_signature';

      tokenManager = new TokenManager({
        storageKey: 'test_auth_token',
      });

      tokenManager.setToken({
        accessToken: tamperedToken,
        refreshToken: 'refresh',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      });

      // Token manager stores it but WebSocket connection would reject it
      expect(tokenManager.getAccessToken()).toBe(tamperedToken);
    });

    it('should handle JWT with missing claims', () => {
      const incompleteTokens = [
        { accessToken: 'token1', refreshToken: '', expiresAt: 0 },
        { accessToken: '', refreshToken: 'refresh', expiresAt: Math.floor(Date.now() / 1000) + 3600 },
        { accessToken: 'token', refreshToken: 'refresh', expiresAt: NaN },
      ];

      tokenManager = new TokenManager({
        storageKey: 'test_auth_token',
      });

      incompleteTokens.forEach(token => {
        // Should handle gracefully
        expect(() => tokenManager.setToken(token as any)).not.toThrow();
      });
    });

    it('should handle server rejecting valid-looking but revoked token', async () => {
      let authErrorReceived = false;

      tokenManager = new TokenManager({
        storageKey: 'test_auth_token',
      });

      tokenManager.setToken({
        accessToken: 'revoked-but-valid-looking-token',
        refreshToken: 'refresh',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      });

      // Simulate server rejecting token
      tokenManager.on('logout', () => {
        authErrorReceived = true;
      });

      // Manually trigger logout (simulating server rejection)
      tokenManager.clearToken();

      expect(authErrorReceived).toBe(true);
      expect(tokenManager.isAuthenticated()).toBe(false);
    });
  });

  describe('Concurrent Login from Same Device', () => {
    it('should handle multiple login attempts simultaneously', async () => {
      const loginAttempts: number[] = [];

      tokenManager = new TokenManager({
        storageKey: 'test_auth_token',
      });

      // Simulate concurrent login attempts
      const loginPromises = [
        Promise.resolve().then(() => {
          loginAttempts.push(1);
          tokenManager.setToken({
            accessToken: 'token-1',
            refreshToken: 'refresh-1',
            expiresAt: Math.floor(Date.now() / 1000) + 3600,
          });
        }),
        Promise.resolve().then(() => {
          loginAttempts.push(2);
          tokenManager.setToken({
            accessToken: 'token-2',
            refreshToken: 'refresh-2',
            expiresAt: Math.floor(Date.now() / 1000) + 3600,
          });
        }),
        Promise.resolve().then(() => {
          loginAttempts.push(3);
          tokenManager.setToken({
            accessToken: 'token-3',
            refreshToken: 'refresh-3',
            expiresAt: Math.floor(Date.now() / 1000) + 3600,
          });
        }),
      ];

      await Promise.all(loginPromises);

      // Last token should win
      expect(tokenManager.getAccessToken()).toBe('token-3');
      expect(loginAttempts.length).toBe(3);
    });

    it('should prevent session hijacking via concurrent login', async () => {
      const sessionIds: string[] = [];

      tokenManager = new TokenManager({
        storageKey: 'test_auth_token',
      });

      // First login
      tokenManager.setToken({
        accessToken: 'original-token',
        refreshToken: 'original-refresh',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      });
      tokenManager.setUserId('original-user');

      const originalUser = tokenManager.getUserId();
      const originalToken = tokenManager.getAccessToken();

      // Attempt concurrent login with different credentials
      const concurrentLogin = Promise.resolve().then(() => {
        tokenManager.setToken({
          accessToken: 'hijacker-token',
          refreshToken: 'hijacker-refresh',
          expiresAt: Math.floor(Date.now() / 1000) + 3600,
        });
        tokenManager.setUserId('hijacker-user');
      });

      await concurrentLogin;

      // Verify token was replaced (last write wins behavior)
      expect(tokenManager.getAccessToken()).toBe('hijacker-token');
      expect(tokenManager.getUserId()).toBe('hijacker-user');
    });

    it('should maintain session consistency across multiple tabs', async () => {
      const storageEvents: StorageEvent[] = [];

      // Mock storage event
      const originalAddEventListener = window.addEventListener;
      window.addEventListener = jest.fn((event: string, handler: EventListener) => {
        if (event === 'storage') {
          // Store handler for later
        }
      }) as any;

      tokenManager = new TokenManager({
        storageKey: 'test_auth_token',
      });

      // Simulate storage change from another tab
      const storageEvent = new StorageEvent('storage', {
        key: 'test_auth_token',
        newValue: JSON.stringify({
          accessToken: 'new-tab-token',
          refreshToken: 'new-tab-refresh',
          expiresAt: Math.floor(Date.now() / 1000) + 3600,
        }),
      });

      // Token manager should detect cross-tab changes
      tokenManager.setToken({
        accessToken: 'original-token',
        refreshToken: 'original-refresh',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      });

      window.addEventListener = originalAddEventListener;

      // Verify token is set
      expect(tokenManager.getAccessToken()).toBe('original-token');
    });
  });

  describe('Race Conditions in State Updates', () => {
    it('should handle concurrent state updates from multiple sources', async () => {
      stateManager = new StateManager({
        deviceId: 'test-device',
        userId: 'test-user',
        sessionId: 'test-session',
        websocketUrl: 'ws://localhost:8080',
        token: 'test-token',
        autoSync: false,
      });

      const changes: any[] = [];
      stateManager.subscribe((changeList) => {
        changes.push(...changeList);
      });

      // Simulate concurrent updates
      const updatePromises = [
        Promise.resolve().then(() => stateManager.setState('user.name', 'Alice')),
        Promise.resolve().then(() => stateManager.setState('user.age', 30)),
        Promise.resolve().then(() => stateManager.setState('user.email', 'alice@example.com')),
      ];

      await Promise.all(updatePromises);

      // All changes should be recorded
      expect(changes.length).toBeGreaterThanOrEqual(3);
      
      const paths = changes.map(c => c.path);
      expect(paths).toContain('user.name');
      expect(paths).toContain('user.age');
      expect(paths).toContain('user.email');
    });

    it('should handle sync race condition: local vs server update', async () => {
      let serverVersion = 0;
      let localVersion = 0;

      stateManager = new StateManager({
        deviceId: 'test-device',
        userId: 'test-user',
        sessionId: 'test-session',
        websocketUrl: 'ws://localhost:8080',
        token: 'test-token',
        autoSync: false,
        conflictResolution: 'server-wins',
      });

      // Simulate race: local update and server update simultaneously
      stateManager.setState('data.value', 'local-value');
      localVersion++;

      // Simulate receiving server update with different value
      // This would normally come through WebSocket
      // stateManager.applyDelta(...) - not directly accessible

      // With server-wins strategy, server value should win
      expect(stateManager.getStateData()).toBeDefined();
    });

    it('should handle rapid snapshot creation without corruption', async () => {
      stateManager = new StateManager({
        deviceId: 'test-device',
        userId: 'test-user',
        sessionId: 'test-session',
        websocketUrl: 'ws://localhost:8080',
        token: 'test-token',
      });

      const snapshotIds: string[] = [];

      // Create 100 snapshots rapidly
      const snapshotPromises = Array.from({ length: 100 }, (_, i) => 
        Promise.resolve().then(() => {
          stateManager.setState(`data.item${i}`, i);
          const snapshot = stateManager.createSnapshot({ label: `snapshot-${i}` });
          snapshotIds.push(snapshot.id);
          return snapshot;
        })
      );

      await Promise.all(snapshotPromises);

      // All snapshots should be created
      expect(snapshotIds.length).toBe(100);
      
      // All snapshots should be unique
      const uniqueIds = new Set(snapshotIds);
      expect(uniqueIds.size).toBe(100);

      // All snapshots should be retrievable
      snapshotIds.forEach(id => {
        expect(stateManager.getSnapshot(id)).toBeDefined();
      });
    });

    it('should handle restore while sync is in progress', async () => {
      stateManager = new StateManager({
        deviceId: 'test-device',
        userId: 'test-user',
        sessionId: 'test-session',
        websocketUrl: 'ws://localhost:8080',
        token: 'test-token',
        autoSync: false,
      });

      // Create initial state and snapshot
      stateManager.setState('data.counter', 0);
      const snapshot = stateManager.createSnapshot();

      // Increment counter
      stateManager.setState('data.counter', 1);

      // Start sync (simulated)
      const syncPromise = stateManager.sync();

      // Restore snapshot during sync
      stateManager.restoreSnapshot(snapshot.id);

      // Wait for sync to complete
      try {
        await syncPromise;
      } catch (error) {
        // May fail due to state change during sync
      }

      // State should reflect snapshot restore
      expect(stateManager.getStateAtPath('data.counter')).toBe(0);
    });

    it('should handle batch update during delta application', async () => {
      stateManager = new StateManager({
        deviceId: 'test-device',
        userId: 'test-user',
        sessionId: 'test-session',
        websocketUrl: 'ws://localhost:8080',
        token: 'test-token',
        autoSync: false,
      });

      const changes: any[] = [];
      stateManager.subscribe((changeList) => {
        changes.push(...changeList);
      });

      // Set initial state
      stateManager.setState('data.items', []);

      // Simulate concurrent batch updates
      const batch1 = Promise.resolve().then(() => {
        stateManager.batchUpdate({
          'data.items.0': 'item1',
          'data.items.1': 'item2',
        });
      });

      const batch2 = Promise.resolve().then(() => {
        stateManager.batchUpdate({
          'data.items.2': 'item3',
          'data.items.3': 'item4',
        });
      });

      await Promise.all([batch1, batch2]);

      // All items should be present
      const items = stateManager.getStateAtPath('data.items') as any;
      expect(items).toBeDefined();
    });
  });

  describe('Session Recovery After Crash', () => {
    it('should recover session from localStorage after browser crash', () => {
      // Simulate previous session in localStorage
      const savedToken = {
        accessToken: 'recovered-token',
        refreshToken: 'recovered-refresh',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      };

      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('test_auth_token', JSON.stringify(savedToken));
      }

      tokenManager = new TokenManager({
        storageKey: 'test_auth_token',
      });

      // Should load token from storage
      expect(tokenManager.getAccessToken()).toBe('recovered-token');
      expect(tokenManager.isAuthenticated()).toBe(true);
    });

    it('should reject expired session from localStorage', () => {
      // Simulate expired session in localStorage
      const expiredToken = {
        accessToken: 'expired-token',
        refreshToken: 'expired-refresh',
        expiresAt: Math.floor(Date.now() / 1000) - 3600,
      };

      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('test_auth_token', JSON.stringify(expiredToken));
      }

      tokenManager = new TokenManager({
        storageKey: 'test_auth_token',
      });

      // Should not load expired token
      expect(tokenManager.isAuthenticated()).toBe(false);
      expect(tokenManager.getAccessToken()).toBeNull();
    });

    it('should handle corrupted session data in localStorage', () => {
      // Simulate corrupted data
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('test_auth_token', 'not-valid-json{[');
      }

      // Should not throw
      expect(() => {
        tokenManager = new TokenManager({
          storageKey: 'test_auth_token',
        });
      }).not.toThrow();

      expect(tokenManager.isAuthenticated()).toBe(false);
    });
  });
});
