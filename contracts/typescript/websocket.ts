/**
 * HarmonyFlow SyncBridge - WebSocket Client Types
 * @version 1.0.0
 */

import {
  WebSocketMessageEnvelope,
  WebSocketMessageType,
  WebSocketConnectionState,
  SubscribeMessage,
  UnsubscribeMessage,
  StateUpdateMessage,
  AckMessage,
  ConnectedMessage,
  StateSyncMessage,
  StateDeltaMessage,
  DeviceJoinedMessage,
  DeviceLeftMessage,
  ErrorMessage,
  PingMessage,
  SessionState,
  StateDelta,
  DeviceInfo,
} from './types';

// ============================================================================
// WebSocket Message Type Mapping
// ============================================================================

export interface WebSocketMessageMap {
  'subscribe': SubscribeMessage;
  'unsubscribe': UnsubscribeMessage;
  'heartbeat': Record<string, never>;
  'state_update': StateUpdateMessage;
  'ack': AckMessage;
  'connected': ConnectedMessage;
  'state_sync': StateSyncMessage;
  'state_delta': StateDeltaMessage;
  'device_joined': DeviceJoinedMessage;
  'device_left': DeviceLeftMessage;
  'error': ErrorMessage;
  'ping': PingMessage;
}

export type WebSocketMessagePayload<T extends WebSocketMessageType> = 
  WebSocketMessageMap[T];

// ============================================================================
// WebSocket Client Options
// ============================================================================

export interface WebSocketClientOptions {
  url: string;
  sessionId: string;
  token: string;
  deviceId: string;
  
  // Reconnection settings
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
  reconnectDelay?: number;
  maxReconnectDelay?: number;
  reconnectDelayMultiplier?: number;
  
  // Heartbeat settings
  enableHeartbeat?: boolean;
  heartbeatInterval?: number;
  heartbeatTimeout?: number;
  
  // Message settings
  maxMessageSize?: number;
  messageQueueLimit?: number;
  
  // Timeouts
  connectionTimeout?: number;
  syncTimeout?: number;
}

export const DEFAULT_WEBSOCKET_OPTIONS: Partial<WebSocketClientOptions> = {
  autoReconnect: true,
  maxReconnectAttempts: 10,
  reconnectDelay: 1000,
  maxReconnectDelay: 30000,
  reconnectDelayMultiplier: 2,
  enableHeartbeat: true,
  heartbeatInterval: 30000,
  heartbeatTimeout: 10000,
  maxMessageSize: 65536,
  messageQueueLimit: 100,
  connectionTimeout: 30000,
  syncTimeout: 10000,
};

// ============================================================================
// WebSocket Event Handlers
// ============================================================================

export interface WebSocketEventHandlers {
  onOpen?: () => void;
  onClose?: (event: CloseEvent) => void;
  onError?: (error: Error) => void;
  onMessage?: <T extends WebSocketMessageType>(
    message: WebSocketMessageEnvelope<WebSocketMessageMap[T]>
  ) => void;
  onStateChange?: (state: WebSocketConnectionState) => void;
  onReconnecting?: (attempt: number, delay: number) => void;
  onReconnected?: () => void;
  onStateSync?: (state: SessionState, version: number) => void;
  onStateDelta?: (delta: StateDelta, version: number) => void;
  onDeviceJoined?: (device: DeviceInfo) => void;
  onDeviceLeft?: (deviceId: string) => void;
  onErrorMessage?: (error: ErrorMessage) => void;
}

// ============================================================================
// WebSocket Client Interface
// ============================================================================

export interface IWebSocketClient {
  // Connection state
  readonly state: WebSocketConnectionState;
  readonly isConnected: boolean;
  readonly isReady: boolean;
  readonly sessionId: string;
  readonly deviceId: string;
  
  // Connection management
  connect(): Promise<void>;
  disconnect(): void;
  reconnect(): Promise<void>;
  
  // Messaging
  send<T extends WebSocketMessageType>(
    type: T, 
    payload: WebSocketMessageMap[T]
  ): void;
  
  subscribe(sessionId: string, lastVersion?: number): void;
  unsubscribe(sessionId: string): void;
  sendHeartbeat(): void;
  sendStateUpdate(state: SessionState): void;
  acknowledge(messageId: string): void;
  
  // Event handling
  on<T extends keyof WebSocketEventMap>(
    event: T, 
    handler: WebSocketEventMap[T]
  ): () => void;
  off<T extends keyof WebSocketEventMap>(
    event: T, 
    handler: WebSocketEventMap[T]
  ): void;
}

export interface WebSocketEventMap {
  'open': () => void;
  'close': (event: CloseEvent) => void;
  'error': (error: Error) => void;
  'state_change': (state: WebSocketConnectionState) => void;
  'reconnecting': (attempt: number, delay: number) => void;
  'reconnected': () => void;
  'state_sync': (state: SessionState, version: number) => void;
  'state_delta': (delta: StateDelta, version: number) => void;
  'device_joined': (device: DeviceInfo) => void;
  'device_left': (deviceId: string) => void;
  'error_message': (error: ErrorMessage) => void;
}

// ============================================================================
// WebSocket Message Utilities
// ============================================================================

export function createMessage<T extends WebSocketMessageType>(
  type: T,
  payload: WebSocketMessageMap[T]
): WebSocketMessageEnvelope<WebSocketMessageMap[T]> {
  return {
    id: generateUUID(),
    type,
    timestamp: new Date().toISOString(),
    payload,
  };
}

export function isValidMessage(message: unknown): message is WebSocketMessageEnvelope {
  if (typeof message !== 'object' || message === null) {
    return false;
  }
  
  const msg = message as Partial<WebSocketMessageEnvelope>;
  return (
    typeof msg.id === 'string' &&
    typeof msg.type === 'string' &&
    typeof msg.timestamp === 'string' &&
    typeof msg.payload === 'object'
  );
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ============================================================================
// WebSocket Error Types
// ============================================================================

export class WebSocketError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly recoverable: boolean = false
  ) {
    super(message);
    this.name = 'WebSocketError';
  }
}

export class ConnectionError extends WebSocketError {
  constructor(message: string, recoverable: boolean = true) {
    super(message, 'CONNECTION_ERROR', recoverable);
    this.name = 'ConnectionError';
  }
}

export class AuthenticationError extends WebSocketError {
  constructor(message: string = 'Authentication failed') {
    super(message, 'AUTH_ERROR', false);
    this.name = 'AuthenticationError';
  }
}

export class StateConflictError extends WebSocketError {
  constructor(
    message: string,
    public readonly expectedVersion: number,
    public readonly receivedVersion: number
  ) {
    super(message, 'STATE_CONFLICT', true);
    this.name = 'StateConflictError';
  }
}

export class RateLimitError extends WebSocketError {
  constructor(message: string = 'Rate limit exceeded') {
    super(message, 'RATE_LIMITED', true);
    this.name = 'RateLimitError';
  }
}

// ============================================================================
// Reconnection Strategy
// ============================================================================

export interface ReconnectionStrategy {
  getDelay(attempt: number): number;
  shouldRetry(attempt: number, error: Error): boolean;
}

export class ExponentialBackoffStrategy implements ReconnectionStrategy {
  constructor(
    private baseDelay: number = 1000,
    private maxDelay: number = 30000,
    private maxAttempts: number = 10,
    private multiplier: number = 2
  ) {}
  
  getDelay(attempt: number): number {
    const delay = this.baseDelay * Math.pow(this.multiplier, attempt);
    return Math.min(delay, this.maxDelay);
  }
  
  shouldRetry(attempt: number, error: Error): boolean {
    if (attempt >= this.maxAttempts) {
      return false;
    }
    
    // Don't retry authentication errors
    if (error instanceof AuthenticationError) {
      return false;
    }
    
    // Don't retry if explicitly not recoverable
    if (error instanceof WebSocketError && !error.recoverable) {
      return false;
    }
    
    return true;
  }
}
