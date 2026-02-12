/**
 * HarmonyFlow SyncBridge - TypeScript Type Definitions
 * @version 1.0.0
 * @module harmonyflow-types
 */

// ============================================================================
// Session Types
// ============================================================================

export type SessionType = 
  | 'meditation' 
  | 'breathing' 
  | 'yoga' 
  | 'mindfulness' 
  | 'custom';

export type SessionStatus = 
  | 'active' 
  | 'paused' 
  | 'completed' 
  | 'archived';

export interface SessionSettings {
  duration?: number;
  audioEnabled?: boolean;
  hapticEnabled?: boolean;
  autoSave?: boolean;
  customProperties?: Record<string, unknown>;
}

export interface SessionState {
  version: number;
  lastModified: string;
  modifiedBy?: string;
  data: Record<string, unknown>;
  checksum?: string;
}

export interface Session {
  id: string;
  userId: string;
  name: string;
  type: SessionType;
  status: SessionStatus;
  settings?: SessionSettings;
  state?: SessionState;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  version: number;
}

// ============================================================================
// Delta Types
// ============================================================================

export type DeltaOperationType = 
  | 'add' 
  | 'remove' 
  | 'replace' 
  | 'move' 
  | 'copy' 
  | 'test';

export interface DeltaOperation {
  op: DeltaOperationType;
  path: string;
  value?: unknown;
  from?: string;
}

export interface StateDelta {
  baseVersion: number;
  operations: DeltaOperation[];
  checksum?: string;
}

// ============================================================================
// Snapshot Types
// ============================================================================

export interface Snapshot {
  id: string;
  sessionId: string;
  version: number;
  label?: string;
  state: SessionState;
  createdAt: string;
  createdBy?: string;
}

// ============================================================================
// Device Types
// ============================================================================

export type DeviceType = 
  | 'web' 
  | 'ios' 
  | 'android' 
  | 'wearable' 
  | 'desktop';

export type ConnectionStatus = 
  | 'connected' 
  | 'disconnected' 
  | 'reconnecting' 
  | 'error';

export interface DeviceInfo {
  id: string;
  type: DeviceType;
  name?: string;
  userAgent?: string;
  connectedAt: string;
  lastSeen?: string;
  capabilities?: string[];
  connectionStatus?: ConnectionStatus;
}

// ============================================================================
// WebSocket Message Types
// ============================================================================

export type WebSocketMessageType =
  // Client -> Server
  | 'subscribe'
  | 'unsubscribe'
  | 'heartbeat'
  | 'state_update'
  | 'ack'
  // Server -> Client
  | 'connected'
  | 'state_sync'
  | 'state_delta'
  | 'device_joined'
  | 'device_left'
  | 'error'
  | 'ping';

export interface WebSocketMessageEnvelope<T = unknown> {
  id: string;
  type: WebSocketMessageType;
  timestamp: string;
  payload: T;
}

// Client -> Server Messages
export interface SubscribeMessage {
  sessionId: string;
  lastVersion?: number;
  clientState?: SessionState;
}

export interface UnsubscribeMessage {
  sessionId: string;
}

export interface StateUpdateMessage {
  state: SessionState;
}

export interface AckMessage {
  messageId: string;
}

// Server -> Client Messages
export interface ConnectedMessage {
  sessionId: string;
  serverTime: string;
}

export interface StateSyncMessage {
  state: SessionState;
  version: number;
}

export interface StateDeltaMessage {
  delta: StateDelta;
  version: number;
}

export interface DeviceJoinedMessage {
  device: DeviceInfo;
}

export interface DeviceLeftMessage {
  deviceId: string;
}

export interface ErrorMessage {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  recoverable: boolean;
}

export interface PingMessage {
  timestamp: string;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface CreateSessionRequest {
  name: string;
  type: SessionType;
  settings?: SessionSettings;
}

export interface UpdateSessionRequest {
  name?: string;
  status?: SessionStatus;
  settings?: SessionSettings;
}

export interface SessionListResponse {
  sessions: Session[];
  total: number;
  limit: number;
  offset: number;
}

export interface SnapshotListResponse {
  snapshots: Snapshot[];
  total: number;
}

export interface DeviceListResponse {
  devices: DeviceInfo[];
}

// ============================================================================
// Error Types
// ============================================================================

export type ErrorCode =
  | 'AUTH_ERROR'
  | 'SESSION_NOT_FOUND'
  | 'INVALID_MESSAGE'
  | 'RATE_LIMITED'
  | 'STATE_CONFLICT'
  | 'SERVER_ERROR'
  | 'INVALID_REQUEST'
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'VERSION_CONFLICT';

export interface APIError {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
  requestId?: string;
}

// ============================================================================
// Health Types
// ============================================================================

export type HealthStatus = 'healthy' | 'unhealthy' | 'degraded';
export type ServiceHealthStatus = 'connected' | 'disconnected' | 'unknown';

export interface ServiceHealth {
  status: ServiceHealthStatus;
  message?: string;
  latency?: number;
  lastCheck?: string;
}

export interface HealthResponse {
  status: HealthStatus;
  timestamp: string;
  version: string;
  services?: Record<string, ServiceHealthStatus>;
  uptime?: number;
}

// ============================================================================
// Authentication Types
// ============================================================================

export type GrantType = 'password' | 'refresh_token';

export interface TokenRequest {
  grant_type: GrantType;
  username?: string;
  password?: string;
  refresh_token?: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

// ============================================================================
// Pagination Types
// ============================================================================

export interface PaginationParams {
  limit?: number;
  offset?: number;
  cursor?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
  nextCursor?: string;
  hasMore: boolean;
}

// ============================================================================
// WebSocket Connection Types
// ============================================================================

export type WebSocketConnectionState =
  | 'CONNECTING'
  | 'CONNECTED'
  | 'SYNCING'
  | 'ACTIVE'
  | 'RECONNECTING'
  | 'CLOSED';

export interface WebSocketConnectionOptions {
  sessionId: string;
  token: string;
  deviceId: string;
  autoReconnect?: boolean;
  reconnectAttempts?: number;
  heartbeatInterval?: number;
}

// ============================================================================
// Utility Types
// ============================================================================

export type Nullable<T> = T | null;

export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: APIError;
  requestId: string;
  timestamp: string;
}

export type SortOrder = 'asc' | 'desc';

export interface SortField {
  field: string;
  order: SortOrder;
}

// ============================================================================
// Event Types
// ============================================================================

export interface SessionEvent {
  type: string;
  sessionId: string;
  timestamp: string;
  payload: unknown;
}

export type SessionEventHandler = (event: SessionEvent) => void;

export interface SessionEventMap {
  'session.created': Session;
  'session.updated': Session;
  'session.deleted': { id: string };
  'state.changed': { sessionId: string; state: SessionState };
  'device.joined': { sessionId: string; device: DeviceInfo };
  'device.left': { sessionId: string; deviceId: string };
  'error': APIError;
}
