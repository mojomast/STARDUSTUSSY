export interface AuthToken {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresAt: number;
  scope?: string;
}

export interface AuthCredentials {
  username: string;
  password: string;
}

export interface TokenRefreshRequest {
  refreshToken: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  token: AuthToken | null;
  userId: string | null;
  deviceId: string | null;
}

export type AuthEventType = 
  | 'token_refreshed' 
  | 'token_expired' 
  | 'auth_error' 
  | 'logout';

export interface AuthEvent {
  type: AuthEventType;
  timestamp: number;
  data?: unknown;
}
