import { SessionState } from './session';
import { StateDelta } from './delta';
import { DeviceInfo } from './device';

export type WebSocketConnectionState =
  | 'CONNECTING'
  | 'CONNECTED'
  | 'SYNCING'
  | 'ACTIVE'
  | 'RECONNECTING'
  | 'CLOSED';

export type WebSocketMessageType =
  | 'subscribe'
  | 'unsubscribe'
  | 'heartbeat'
  | 'state_update'
  | 'state_delta'
  | 'ack'
  | 'connected'
  | 'state_sync'
  | 'device_joined'
  | 'device_left'
  | 'error'
  | 'ping'
  | 'pong'
  | 'batch';

export interface WebSocketMessageEnvelope<T = unknown> {
  id: string;
  type: WebSocketMessageType;
  timestamp: string;
  payload: T;
  compressed?: boolean;
}

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

export interface PongMessage {
  timestamp: string;
}

export interface BatchMessage {
  messages: WebSocketMessageEnvelope[];
}

export interface WebSocketClientOptions {
  url: string;
  sessionId: string;
  token: string;
  deviceId: string;
  
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
  reconnectDelay?: number;
  maxReconnectDelay?: number;
  reconnectDelayMultiplier?: number;
  
  enableHeartbeat?: boolean;
  heartbeatInterval?: number;
  heartbeatTimeout?: number;
  
  maxMessageSize?: number;
  messageQueueLimit?: number;
  
  connectionTimeout?: number;
  syncTimeout?: number;
  
  enableCompression?: boolean;
  batchMessages?: boolean;
  batchInterval?: number;
  batchSize?: number;
}

export const DEFAULT_WEBSOCKET_OPTIONS: Partial<WebSocketClientOptions> = {
  autoReconnect: true,
  maxReconnectAttempts: 10,
  reconnectDelay: 1000,
  maxReconnectDelay: 60000,
  reconnectDelayMultiplier: 2,
  enableHeartbeat: true,
  heartbeatInterval: 30000,
  heartbeatTimeout: 10000,
  maxMessageSize: 65536,
  messageQueueLimit: 100,
  connectionTimeout: 30000,
  syncTimeout: 10000,
  enableCompression: true,
  batchMessages: true,
  batchInterval: 50,
  batchSize: 10,
};

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
  'message': (message: WebSocketMessageEnvelope) => void;
}

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

export interface SerializedState {
  data: string;
  checksum: string;
  timestamp: number;
  version: number;
}
