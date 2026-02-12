/**
 * HarmonyFlow SyncBridge - Index
 * @version 1.0.0
 * 
 * Main entry point for all TypeScript type definitions.
 * Import from this file to get all types.
 * 
 * @example
 * ```typescript
 * import { Session, WebSocketClient, APIClient } from '@harmonyflow/syncbridge-types';
 * ```
 */

// Core Types
export * from './types';

// WebSocket Types
export * from './websocket';

// API Client Types
export * from './api-client';

// ============================================================================
// Package Information
// ============================================================================

export const PACKAGE_VERSION = '1.0.0';
export const PACKAGE_NAME = '@harmonyflow/syncbridge-types';
export const PROTOCOL_VERSION = '1.0.0';
export const API_VERSION = 'v1';

// ============================================================================
// Re-exports for convenience
// ============================================================================

// Re-export commonly used types at top level
export type {
  Session,
  SessionType,
  SessionStatus,
  SessionSettings,
  SessionState,
  StateDelta,
  DeltaOperation,
  Snapshot,
  DeviceInfo,
  DeviceType,
  ConnectionStatus,
  WebSocketMessageEnvelope,
  WebSocketMessageType,
  WebSocketConnectionState,
  WebSocketClientOptions,
  WebSocketEventHandlers,
  APIClientConfig,
  RequestConfig,
  APIResponseWrapper,
  PaginatedAPIResponse,
  HealthResponse,
  TokenResponse,
  APIError,
  ErrorCode,
} from './types';
