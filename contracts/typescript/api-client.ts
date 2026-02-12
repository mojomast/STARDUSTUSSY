/**
 * HarmonyFlow SyncBridge - API Client Types
 * @version 1.0.0
 */

import {
  Session,
  CreateSessionRequest,
  UpdateSessionRequest,
  SessionListResponse,
  Snapshot,
  SnapshotListResponse,
  DeviceInfo,
  DeviceListResponse,
  SessionState,
  StateDelta,
  HealthResponse,
  TokenRequest,
  TokenResponse,
  APIError,
  PaginationParams,
} from './types';

// ============================================================================
// API Client Configuration
// ============================================================================

export interface APIClientConfig {
  baseURL: string;
  version?: string;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  
  // Authentication
  getToken?: () => string | null | Promise<string | null>;
  onTokenRefresh?: () => Promise<string>;
  onUnauthorized?: () => void;
  
  // Headers
  headers?: Record<string, string>;
  
  // Request/Response interceptors
  requestInterceptor?: (config: RequestConfig) => RequestConfig | Promise<RequestConfig>;
  responseInterceptor?: <T>(response: T) => T | Promise<T>;
  errorInterceptor?: (error: APIError) => APIError | Promise<APIError>;
}

export const DEFAULT_API_CONFIG: Partial<APIClientConfig> = {
  version: 'v1',
  timeout: 30000,
  retries: 3,
  retryDelay: 1000,
};

// ============================================================================
// Request Configuration
// ============================================================================

export interface RequestConfig {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  data?: unknown;
  params?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

// ============================================================================
// API Response Wrapper
// ============================================================================

export interface APIResponseWrapper<T> {
  data: T;
  status: number;
  headers: Record<string, string>;
  requestId: string;
}

export interface PaginatedAPIResponse<T> extends APIResponseWrapper<T> {
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

// ============================================================================
// Session API Interfaces
// ============================================================================

export interface ISessionAPI {
  // Session CRUD
  create(request: CreateSessionRequest): Promise<APIResponseWrapper<Session>>;
  get(sessionId: string): Promise<APIResponseWrapper<Session>>;
  list(params?: ListSessionsParams): Promise<PaginatedAPIResponse<SessionListResponse>>;
  update(sessionId: string, request: UpdateSessionRequest): Promise<APIResponseWrapper<Session>>;
  delete(sessionId: string): Promise<APIResponseWrapper<void>>;
  
  // Session State
  getState(sessionId: string): Promise<APIResponseWrapper<SessionState>>;
  setState(sessionId: string, state: SessionState): Promise<APIResponseWrapper<SessionState>>;
  applyDelta(sessionId: string, delta: StateDelta): Promise<APIResponseWrapper<SessionState>>;
  
  // Session Snapshots
  listSnapshots(sessionId: string, params?: ListSnapshotsParams): Promise<PaginatedAPIResponse<SnapshotListResponse>>;
  createSnapshot(sessionId: string, label?: string): Promise<APIResponseWrapper<Snapshot>>;
  
  // Session Devices
  listDevices(sessionId: string): Promise<APIResponseWrapper<DeviceListResponse>>;
}

// ============================================================================
// Request Parameters
// ============================================================================

export interface ListSessionsParams extends PaginationParams {
  status?: string;
  type?: string;
}

export interface ListSnapshotsParams extends PaginationParams {
  before?: string;
}

// ============================================================================
// Health API Interface
// ============================================================================

export interface IHealthAPI {
  check(): Promise<APIResponseWrapper<HealthResponse>>;
  ready(): Promise<APIResponseWrapper<{ ready: boolean }>>;
  live(): Promise<APIResponseWrapper<{ alive: boolean }>>;
}

// ============================================================================
// Authentication API Interface
// ============================================================================

export interface IAuthAPI {
  getToken(request: TokenRequest): Promise<APIResponseWrapper<TokenResponse>>;
  refreshToken(refreshToken: string): Promise<APIResponseWrapper<TokenResponse>>;
  revokeToken(token: string, tokenTypeHint?: 'access_token' | 'refresh_token'): Promise<APIResponseWrapper<void>>;
}

// ============================================================================
// Main API Client Interface
// ============================================================================

export interface IAPIClient {
  // Sub-clients
  sessions: ISessionAPI;
  health: IHealthAPI;
  auth: IAuthAPI;
  
  // Configuration
  config: APIClientConfig;
  
  // Utility methods
  setToken(token: string): void;
  clearToken(): void;
  setBaseURL(url: string): void;
  
  // Raw request method
  request<T>(config: RequestConfig): Promise<APIResponseWrapper<T>>;
}

// ============================================================================
// Error Response Types
// ============================================================================

export interface ErrorResponse {
  error: APIError;
  status: number;
  headers: Record<string, string>;
}

// ============================================================================
// Rate Limit Types
// ============================================================================

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetTime: Date;
  window: string;
}

export interface RateLimitedResponse extends ErrorResponse {
  rateLimit: RateLimitInfo;
}

// ============================================================================
// Retry Configuration
// ============================================================================

export interface RetryConfig {
  maxRetries: number;
  retryDelay: number;
  retryDelayMultiplier: number;
  maxRetryDelay: number;
  retryCondition?: (error: APIError) => boolean;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  retryDelay: 1000,
  retryDelayMultiplier: 2,
  maxRetryDelay: 10000,
  retryCondition: (error: APIError) => {
    // Retry on network errors or 5xx responses
    return error.code === 'SERVER_ERROR' || 
           error.code === 'RATE_LIMITED' ||
           error.code === 'TIMEOUT';
  },
};

// ============================================================================
// Event Types for API Client
// ============================================================================

export interface APIClientEventMap {
  'request': (config: RequestConfig) => void;
  'response': <T>(response: APIResponseWrapper<T>) => void;
  'error': (error: APIError) => void;
  'token_expired': () => void;
  'rate_limited': (info: RateLimitInfo) => void;
}

// ============================================================================
// Cache Types
// ============================================================================

export interface CacheConfig {
  enabled: boolean;
  ttl: number;
  maxSize: number;
}

export interface CachedResponse<T> {
  data: T;
  timestamp: number;
  etag?: string;
}
