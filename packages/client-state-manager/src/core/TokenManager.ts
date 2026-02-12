import {
  AuthToken,
  AuthState,
  AuthEvent,
  AuthEventType,
} from '../types';

export interface TokenManagerOptions {
  storageKey?: string;
  refreshThreshold?: number;
  autoRefresh?: boolean;
  onTokenExpired?: () => void;
  onTokenRefreshed?: (token: AuthToken) => void;
  refreshToken?: (refreshToken: string) => Promise<AuthToken>;
}

export class TokenManager {
  private state: AuthState;
  private options: Required<TokenManagerOptions>;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private eventListeners: Map<AuthEventType, Set<(event: AuthEvent) => void>> = new Map();

  constructor(options: TokenManagerOptions = {}) {
    this.options = {
      storageKey: 'harmonyflow_auth_token',
      refreshThreshold: 300,
      autoRefresh: true,
      onTokenExpired: () => {},
      onTokenRefreshed: () => {},
      refreshToken: async () => {
        throw new Error('Token refresh not implemented');
      },
      ...options,
    };

    this.state = {
      isAuthenticated: false,
      token: null,
      userId: null,
      deviceId: null,
    };

    this.loadFromStorage();
  }

  getToken(): AuthToken | null {
    return this.state.token;
  }

  getAccessToken(): string | null {
    return this.state.token?.accessToken || null;
  }

  getRefreshToken(): string | null {
    return this.state.token?.refreshToken || null;
  }

  isAuthenticated(): boolean {
    return this.state.isAuthenticated && !this.isTokenExpired();
  }

  isTokenExpired(): boolean {
    if (!this.state.token) return true;
    return Date.now() >= this.state.token.expiresAt * 1000;
  }

  isTokenExpiringSoon(): boolean {
    if (!this.state.token) return true;
    const thresholdMs = this.options.refreshThreshold * 1000;
    return Date.now() >= this.state.token.expiresAt * 1000 - thresholdMs;
  }

  setToken(token: AuthToken): void {
    this.state.token = token;
    this.state.isAuthenticated = true;
    this.saveToStorage();
    this.scheduleRefresh();
    this.emit('token_refreshed', { token });
    this.options.onTokenRefreshed(token);
  }

  clearToken(): void {
    this.state.token = null;
    this.state.isAuthenticated = false;
    this.state.userId = null;
    this.state.deviceId = null;
    this.saveToStorage();
    this.clearRefreshTimer();
    this.emit('logout', {});
  }

  async refresh(): Promise<AuthToken> {
    const refreshToken = this.getRefreshToken();
    
    if (!refreshToken) {
      this.handleTokenExpired();
      throw new Error('No refresh token available');
    }

    try {
      const newToken = await this.options.refreshToken(refreshToken);
      this.setToken(newToken);
      return newToken;
    } catch (error) {
      this.handleTokenExpired();
      throw error;
    }
  }

  setUserId(userId: string): void {
    this.state.userId = userId;
  }

  setDeviceId(deviceId: string): void {
    this.state.deviceId = deviceId;
  }

  getUserId(): string | null {
    return this.state.userId;
  }

  getDeviceId(): string | null {
    return this.state.deviceId;
  }

  on(event: AuthEventType, handler: (event: AuthEvent) => void): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(handler);

    return () => {
      this.eventListeners.get(event)?.delete(handler);
    };
  }

  off(event: AuthEventType, handler: (event: AuthEvent) => void): void {
    this.eventListeners.get(event)?.delete(handler);
  }

  private scheduleRefresh(): void {
    if (!this.options.autoRefresh || !this.state.token) return;

    this.clearRefreshTimer();

    const expiresAt = this.state.token.expiresAt * 1000;
    const thresholdMs = this.options.refreshThreshold * 1000;
    const refreshAt = expiresAt - thresholdMs;
    const delay = refreshAt - Date.now();

    if (delay > 0) {
      this.refreshTimer = setTimeout(() => {
        this.refresh().catch(() => {
          // Refresh failed, will be handled by error handler
        });
      }, delay);
    }
  }

  private clearRefreshTimer(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  private handleTokenExpired(): void {
    this.clearToken();
    this.emit('token_expired', {});
    this.options.onTokenExpired();
  }

  private saveToStorage(): void {
    if (typeof localStorage === 'undefined') return;

    try {
      localStorage.setItem(
        this.options.storageKey,
        JSON.stringify(this.state.token)
      );
    } catch (error) {
      console.error('Failed to save token to storage:', error);
    }
  }

  private loadFromStorage(): void {
    if (typeof localStorage === 'undefined') return;

    try {
      const stored = localStorage.getItem(this.options.storageKey);
      if (stored) {
        const token: AuthToken = JSON.parse(stored);
        if (token.expiresAt > Date.now() / 1000) {
          this.state.token = token;
          this.state.isAuthenticated = true;
          this.scheduleRefresh();
        } else {
          localStorage.removeItem(this.options.storageKey);
        }
      }
    } catch (error) {
      console.error('Failed to load token from storage:', error);
    }
  }

  private emit(eventType: AuthEventType, data: unknown): void {
    const event: AuthEvent = {
      type: eventType,
      timestamp: Date.now(),
      data,
    };

    this.eventListeners.get(eventType)?.forEach((handler) => {
      try {
        handler(event);
      } catch (error) {
        console.error(`Error in auth event handler:`, error);
      }
    });
  }

  destroy(): void {
    this.clearRefreshTimer();
    this.eventListeners.clear();
  }
}
