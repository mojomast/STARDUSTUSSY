import { TokenManager } from '../src/core/TokenManager';
import { AuthToken } from '../src/types';

describe('TokenManager', () => {
  let tokenManager: TokenManager;
  const mockToken: AuthToken = {
    accessToken: 'access-token-123',
    refreshToken: 'refresh-token-456',
    tokenType: 'Bearer',
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    scope: 'read write',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    
    const localStorageMock = {
      getItem: jest.fn(),
      setItem: jest.fn(),
      removeItem: jest.fn(),
    };
    Object.defineProperty(global, 'localStorage', { value: localStorageMock });
    
    tokenManager = new TokenManager();
  });

  afterEach(() => {
    jest.useRealTimers();
    tokenManager.destroy();
  });

  describe('token management', () => {
    it('should set token', () => {
      tokenManager.setToken(mockToken);

      expect(tokenManager.getToken()).toEqual(mockToken);
      expect(tokenManager.getAccessToken()).toBe(mockToken.accessToken);
      expect(tokenManager.getRefreshToken()).toBe(mockToken.refreshToken);
    });

    it('should clear token', () => {
      tokenManager.setToken(mockToken);
      tokenManager.clearToken();

      expect(tokenManager.getToken()).toBeNull();
      expect(tokenManager.isAuthenticated()).toBe(false);
    });

    it('should check authentication status', () => {
      expect(tokenManager.isAuthenticated()).toBe(false);

      tokenManager.setToken(mockToken);
      expect(tokenManager.isAuthenticated()).toBe(true);

      tokenManager.clearToken();
      expect(tokenManager.isAuthenticated()).toBe(false);
    });

    it('should detect expired token', () => {
      const expiredToken = {
        ...mockToken,
        expiresAt: Math.floor(Date.now() / 1000) - 3600,
      };

      tokenManager.setToken(expiredToken);
      expect(tokenManager.isTokenExpired()).toBe(true);
      expect(tokenManager.isAuthenticated()).toBe(false);
    });

    it('should detect token expiring soon', () => {
      const expiringToken = {
        ...mockToken,
        expiresAt: Math.floor(Date.now() / 1000) + 200,
      };

      tokenManager.setToken(expiringToken);
      expect(tokenManager.isTokenExpiringSoon()).toBe(true);
    });
  });

  describe('persistence', () => {
    it('should save token to storage', () => {
      tokenManager.setToken(mockToken);

      expect(localStorage.setItem).toHaveBeenCalledWith(
        'harmonyflow_auth_token',
        JSON.stringify(mockToken)
      );
    });

    it('should load token from storage on init', () => {
      (localStorage.getItem as jest.Mock).mockReturnValue(JSON.stringify(mockToken));

      const newManager = new TokenManager();

      expect(newManager.getToken()).toEqual(mockToken);
    });

    it('should not load expired token from storage', () => {
      const expiredToken = {
        ...mockToken,
        expiresAt: Math.floor(Date.now() / 1000) - 3600,
      };
      (localStorage.getItem as jest.Mock).mockReturnValue(JSON.stringify(expiredToken));

      const newManager = new TokenManager();

      expect(newManager.getToken()).toBeNull();
      expect(localStorage.removeItem).toHaveBeenCalledWith('harmonyflow_auth_token');
    });

    it('should handle storage errors gracefully', () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation();
      (localStorage.setItem as jest.Mock).mockImplementation(() => {
        throw new Error('Storage full');
      });

      tokenManager.setToken(mockToken);

      expect(consoleError).toHaveBeenCalled();
      consoleError.mockRestore();
    });
  });

  describe('token refresh', () => {
    it('should refresh token successfully', async () => {
      const newToken: AuthToken = {
        ...mockToken,
        accessToken: 'new-access-token',
      };

      const refreshFn = jest.fn().mockResolvedValue(newToken);
      tokenManager = new TokenManager({
        refreshToken: refreshFn,
      });
      tokenManager.setToken(mockToken);

      const result = await tokenManager.refresh();

      expect(refreshFn).toHaveBeenCalledWith(mockToken.refreshToken);
      expect(result).toEqual(newToken);
      expect(tokenManager.getToken()).toEqual(newToken);
    });

    it('should throw if no refresh token', async () => {
      const tokenWithoutRefresh = { ...mockToken, refreshToken: '' };
      tokenManager.setToken(tokenWithoutRefresh);

      await expect(tokenManager.refresh()).rejects.toThrow('No refresh token available');
    });

    it('should handle refresh failure', async () => {
      const refreshFn = jest.fn().mockRejectedValue(new Error('Refresh failed'));
      const onTokenExpired = jest.fn();
      
      tokenManager = new TokenManager({
        refreshToken: refreshFn,
        onTokenExpired,
      });
      tokenManager.setToken(mockToken);

      await expect(tokenManager.refresh()).rejects.toThrow('Refresh failed');
      expect(tokenManager.getToken()).toBeNull();
      expect(onTokenExpired).toHaveBeenCalled();
    });

    it('should auto-refresh token', () => {
      const expiringToken = {
        ...mockToken,
        expiresAt: Math.floor(Date.now() / 1000) + 350,
      };
      
      const newToken: AuthToken = {
        ...mockToken,
        accessToken: 'new-token',
      };
      
      const refreshFn = jest.fn().mockResolvedValue(newToken);
      
      tokenManager = new TokenManager({
        refreshToken: refreshFn,
        refreshThreshold: 300,
        autoRefresh: true,
      });

      tokenManager.setToken(expiringToken);

      jest.advanceTimersByTime(51000);

      expect(refreshFn).toHaveBeenCalled();
    });

    it('should not auto-refresh if disabled', () => {
      const expiringToken = {
        ...mockToken,
        expiresAt: Math.floor(Date.now() / 1000) + 350,
      };
      
      const refreshFn = jest.fn().mockResolvedValue(mockToken);
      
      tokenManager = new TokenManager({
        refreshToken: refreshFn,
        refreshThreshold: 300,
        autoRefresh: false,
      });

      tokenManager.setToken(expiringToken);

      jest.advanceTimersByTime(60000);

      expect(refreshFn).not.toHaveBeenCalled();
    });
  });

  describe('user and device management', () => {
    it('should set and get userId', () => {
      tokenManager.setUserId('user-123');
      expect(tokenManager.getUserId()).toBe('user-123');
    });

    it('should set and get deviceId', () => {
      tokenManager.setDeviceId('device-456');
      expect(tokenManager.getDeviceId()).toBe('device-456');
    });
  });

  describe('events', () => {
    it('should emit token_refreshed event', () => {
      const handler = jest.fn();
      tokenManager.on('token_refreshed', handler);

      tokenManager.setToken(mockToken);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'token_refreshed',
          data: { token: mockToken },
        })
      );
    });

    it('should emit logout event', () => {
      const handler = jest.fn();
      tokenManager.on('logout', handler);

      tokenManager.setToken(mockToken);
      tokenManager.clearToken();

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'logout',
        })
      );
    });

    it('should emit token_expired event', async () => {
      const handler = jest.fn();
      tokenManager.on('token_expired', handler);

      tokenManager.setToken(mockToken);
      
      const refreshFn = jest.fn().mockRejectedValue(new Error('Refresh failed'));
      tokenManager = new TokenManager({
        refreshToken: refreshFn,
      });
      tokenManager.setToken(mockToken);
      tokenManager.on('token_expired', handler);

      try {
        await tokenManager.refresh();
      } catch {
        // Expected
      }

      expect(handler).toHaveBeenCalled();
    });

    it('should allow unsubscribing from events', () => {
      const handler = jest.fn();
      const unsubscribe = tokenManager.on('token_refreshed', handler);

      unsubscribe();
      tokenManager.setToken(mockToken);

      expect(handler).not.toHaveBeenCalled();
    });

    it('should handle event handler errors gracefully', () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation();
      const errorHandler = jest.fn().mockImplementation(() => {
        throw new Error('Handler error');
      });
      const normalHandler = jest.fn();

      tokenManager.on('token_refreshed', errorHandler);
      tokenManager.on('token_refreshed', normalHandler);

      tokenManager.setToken(mockToken);

      expect(normalHandler).toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalled();

      consoleError.mockRestore();
    });
  });

  describe('callbacks', () => {
    it('should call onTokenRefreshed callback', () => {
      const onTokenRefreshed = jest.fn();
      tokenManager = new TokenManager({ onTokenRefreshed });

      tokenManager.setToken(mockToken);

      expect(onTokenRefreshed).toHaveBeenCalledWith(mockToken);
    });

    it('should call onTokenExpired callback', async () => {
      const onTokenExpired = jest.fn();
      tokenManager = new TokenManager({
        onTokenExpired,
        refreshToken: jest.fn().mockRejectedValue(new Error('Refresh failed')),
      });

      tokenManager.setToken(mockToken);

      try {
        await tokenManager.refresh();
      } catch {
        // Expected
      }

      expect(onTokenExpired).toHaveBeenCalled();
    });
  });

  describe('destroy', () => {
    it('should clear timers on destroy', () => {
      tokenManager.setToken(mockToken);
      
      tokenManager.destroy();

      jest.advanceTimersByTime(60000);
    });

    it('should clear event listeners on destroy', () => {
      const handler = jest.fn();
      tokenManager.on('token_refreshed', handler);

      tokenManager.destroy();

      tokenManager.setToken(mockToken);

      expect(handler).not.toHaveBeenCalled();
    });
  });
});
