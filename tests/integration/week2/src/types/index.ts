/**
 * HarmonyFlow SyncBridge - Integration Test Types
 * @version 1.0.0
 */

// WebSocket Message Types (aligned with Go implementation)
export enum MessageType {
  Unknown = 0,
  Heartbeat = 1,
  HeartbeatAck = 2,
  SnapshotRequest = 3,
  SnapshotResponse = 4,
  StateUpdate = 5,
  Error = 6,
  Auth = 7,
  AuthSuccess = 8,
  AuthFailure = 9,
}

// WebSocket Message Structure
export interface WebSocketMessage {
  type: MessageType;
  session_id?: string;
  user_id?: string;
  timestamp: number;
  payload: Record<string, unknown>;
  correlation_id?: string;
}

// Connection State
export enum ConnectionState {
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  AUTHENTICATING = 'AUTHENTICATING',
  ACTIVE = 'ACTIVE',
  RECONNECTING = 'RECONNECTING',
  CLOSED = 'CLOSED',
}

// Test Configuration
export interface TestConfig {
  wsUrl: string;
  apiUrl: string;
  jwtSecret: string;
  connectionTimeout: number;
  messageTimeout: number;
}

// Test User
export interface TestUser {
  userId: string;
  email: string;
  deviceId: string;
  sessionId: string;
}

// Test Results
export interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
  details?: Record<string, unknown>;
}

// JWT Claims
export interface JWTClaims {
  user_id: string;
  email: string;
  device_id: string;
  session_id: string;
  exp: number;
  iat: number;
}

// Snapshot Data
export interface SnapshotData {
  session_id: string;
  state_data: Record<string, unknown>;
  created_at: number | null;
}

// Error Response
export interface ErrorResponse {
  code: number;
  message: string;
  details: string;
}
