import {
  WebSocketConnectionState,
  WebSocketMessageType,
  WebSocketMessageEnvelope,
  WebSocketClientOptions,
  DEFAULT_WEBSOCKET_OPTIONS,
  WebSocketEventMap,
  WebSocketError,
  ConnectionError,
  AuthenticationError,
  StateConflictError,
  RateLimitError,
  SubscribeMessage,
  UnsubscribeMessage,
  StateUpdateMessage,
  AckMessage,
  SessionState,
  StateDelta,
  DeviceInfo,
  ErrorMessage,
} from '../types';
import { generateUUID } from '../utils/uuid';

export type { WebSocketConnectionState };

interface MessageBatch {
  messages: WebSocketMessageEnvelope[];
  timestamp: number;
}

interface ConnectionMetrics {
  latency: number[];
  messageCount: number;
  lastActivity: number;
  reconnectCount: number;
}

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private options: Required<WebSocketClientOptions>;
  private state: WebSocketConnectionState = 'CLOSED';
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private messageQueue: WebSocketMessageEnvelope[] = [];
  private eventListeners: Map<keyof WebSocketEventMap, Set<Function>> = new Map();
  private connectionPromise: Promise<void> | null = null;
  private missedHeartbeats = 0;
  private readonly maxMissedHeartbeats = 3;

  private messageBatch: MessageBatch = { messages: [], timestamp: Date.now() };
  private batchTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly BATCH_SIZE = 10;
  private readonly BATCH_INTERVAL = 50;
  private adaptiveHeartbeatInterval: number;
  private metrics: ConnectionMetrics = {
    latency: [],
    messageCount: 0,
    lastActivity: Date.now(),
    reconnectCount: 0,
  };

  constructor(options: WebSocketClientOptions) {
    this.options = {
      ...DEFAULT_WEBSOCKET_OPTIONS,
      ...options,
    } as Required<WebSocketClientOptions>;
    
    this.adaptiveHeartbeatInterval = this.options.heartbeatInterval;
  }

  get currentState(): WebSocketConnectionState {
    return this.state;
  }

  get isConnected(): boolean {
    return this.state === 'CONNECTED' || this.state === 'ACTIVE' || this.state === 'SYNCING';
  }

  get isReady(): boolean {
    return this.state === 'ACTIVE';
  }

  get sessionId(): string {
    return this.options.sessionId;
  }

  get deviceId(): string {
    return this.options.deviceId;
  }

  get currentHeartbeatInterval(): number {
    return this.adaptiveHeartbeatInterval;
  }

  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = this.doConnect();
    return this.connectionPromise;
  }

  private async doConnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.setState('CONNECTING');

        const url = this.buildConnectionUrl();
        this.ws = new WebSocket(url);

        const connectionTimeout = setTimeout(() => {
          this.ws?.close();
          reject(new ConnectionError('Connection timeout'));
        }, this.options.connectionTimeout);

        this.ws.onopen = () => {
          clearTimeout(connectionTimeout);
          this.reconnectAttempts = 0;
          this.setState('CONNECTED');
          this.emit('open');
          this.startHeartbeat();
          this.flushMessageQueue();
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
          this.metrics.lastActivity = Date.now();
          this.metrics.messageCount++;
        };

        this.ws.onclose = (event) => {
          clearTimeout(connectionTimeout);
          this.setState('CLOSED');
          this.stopHeartbeat();
          this.emit('close', event);
          this.handleDisconnect(event);
        };

        this.ws.onerror = (error) => {
          clearTimeout(connectionTimeout);
          this.handleError(error instanceof Error ? error : new Error(String(error)));
          reject(error);
        };
      } catch (error) {
        this.setState('CLOSED');
        reject(error);
      } finally {
        this.connectionPromise = null;
      }
    });
  }

  disconnect(): void {
    this.stopReconnect();
    this.stopHeartbeat();
    this.flushBatch();
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.setState('CLOSED');
    this.reconnectAttempts = 0;
  }

  async reconnect(): Promise<void> {
    this.disconnect();
    return this.connect();
  }

  send<T extends WebSocketMessageType>(
    type: T,
    payload: unknown,
    options: { batch?: boolean; priority?: boolean } = {}
  ): void {
    const message: WebSocketMessageEnvelope = {
      id: generateUUID(),
      type,
      timestamp: new Date().toISOString(),
      payload,
      compressed: false,
    };

    if (options.batch && !options.priority) {
      this.addToBatch(message);
    } else {
      this.sendImmediate(message);
    }
  }

  private addToBatch(message: WebSocketMessageEnvelope): void {
    this.messageBatch.messages.push(message);

    if (this.messageBatch.messages.length >= this.BATCH_SIZE) {
      this.flushBatch();
    } else if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => {
        this.flushBatch();
      }, this.BATCH_INTERVAL);
    }
  }

  private flushBatch(): void {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    if (this.messageBatch.messages.length === 0) return;

    const batchMessage: WebSocketMessageEnvelope = {
      id: generateUUID(),
      type: 'batch',
      timestamp: new Date().toISOString(),
      payload: { messages: this.messageBatch.messages },
    };

    this.sendImmediate(batchMessage);
    this.messageBatch.messages = [];
    this.messageBatch.timestamp = Date.now();
  }

  private sendImmediate(message: WebSocketMessageEnvelope): void {
    if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) {
      this.sendMessage(message);
    } else {
      this.queueMessage(message);
    }
  }

  subscribe(sessionId: string, lastVersion?: number): void {
    const payload: SubscribeMessage = {
      sessionId,
      lastVersion,
    };
    this.send('subscribe', payload, { priority: true });
  }

  unsubscribe(sessionId: string): void {
    const payload: UnsubscribeMessage = { sessionId };
    this.send('unsubscribe', payload, { priority: true });
  }

  sendHeartbeat(): void {
    const start = Date.now();
    
    this.send('heartbeat', { timestamp: start }, { priority: true });
    this.missedHeartbeats++;

    this.heartbeatTimeoutTimer = setTimeout(() => {
      if (this.missedHeartbeats >= this.maxMissedHeartbeats) {
        this.handleError(new ConnectionError('Heartbeat timeout'));
        this.ws?.close();
      }
    }, this.adaptiveHeartbeatInterval / 2);

    if (this.missedHeartbeats >= this.maxMissedHeartbeats) {
      this.handleError(new ConnectionError('Heartbeat timeout'));
      this.ws?.close();
    }
  }

  sendStateUpdate(state: SessionState): void {
    const payload: StateUpdateMessage = { state };
    this.send('state_update', payload, { batch: true });
  }

  sendDelta(delta: StateDelta): void {
    this.send('state_delta', { delta }, { batch: true });
  }

  acknowledge(messageId: string): void {
    const payload: AckMessage = { messageId };
    this.send('ack', payload, { batch: true });
  }

  on<T extends keyof WebSocketEventMap>(
    event: T,
    handler: WebSocketEventMap[T]
  ): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(handler);

    return () => this.off(event, handler);
  }

  off<T extends keyof WebSocketEventMap>(
    event: T,
    handler: WebSocketEventMap[T]
  ): void {
    this.eventListeners.get(event)?.delete(handler);
  }

  private setState(newState: WebSocketConnectionState): void {
    if (this.state !== newState) {
      this.state = newState;
      this.emit('state_change', newState);
    }
  }

  private buildConnectionUrl(): string {
    const url = new URL(this.options.url);
    url.searchParams.set('token', this.options.token);
    url.searchParams.set('deviceId', this.options.deviceId);
    url.searchParams.set('protocol', 'v2');
    return url.toString();
  }

  private sendMessage(message: WebSocketMessageEnvelope): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.queueMessage(message);
      return;
    }

    try {
      const data = this.serializeMessage(message);
      
      if (data.length > this.options.maxMessageSize) {
        throw new Error(`Message size ${data.length} exceeds maximum ${this.options.maxMessageSize}`);
      }
      
      this.ws.send(data);
    } catch (error) {
      this.queueMessage(message);
      throw error;
    }
  }

  private serializeMessage(message: WebSocketMessageEnvelope): string {
    const serialized = JSON.stringify(message);
    
    if (serialized.length > 1000 && this.shouldCompress(message)) {
      return JSON.stringify({
        ...message,
        payload: this.compressPayload(message.payload),
        compressed: true,
      });
    }
    
    return serialized;
  }

  private shouldCompress(message: WebSocketMessageEnvelope): boolean {
    const compressibleTypes: WebSocketMessageType[] = ['state_update', 'state_delta', 'batch'];
    return compressibleTypes.includes(message.type);
  }

  private compressPayload(payload: unknown): string {
    const json = JSON.stringify(payload);
    return btoa(json);
  }

  private decompressPayload(compressed: string): unknown {
    return JSON.parse(atob(compressed));
  }

  private queueMessage(message: WebSocketMessageEnvelope): void {
    if (this.messageQueue.length >= this.options.messageQueueLimit) {
      const dropped = this.messageQueue.shift();
      console.warn(`[WebSocketClient] Dropped message due to queue limit:`, dropped?.id);
    }
    this.messageQueue.push(message);
  }

  private flushMessageQueue(): void {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      if (message) {
        this.sendMessage(message);
      }
    }
  }

  private handleMessage(data: string): void {
    try {
      const message: WebSocketMessageEnvelope = JSON.parse(data);
      
      if (message.compressed) {
        message.payload = this.decompressPayload(message.payload as string);
      }
      
      if (!this.isValidMessage(message)) {
        console.warn('Received invalid message:', message);
        return;
      }

      this.emit('message', message);
      this.processMessage(message);
    } catch (error) {
      console.error('Failed to parse message:', error);
    }
  }

  private isValidMessage(message: unknown): message is WebSocketMessageEnvelope {
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

  private processMessage(message: WebSocketMessageEnvelope): void {
    switch (message.type) {
      case 'connected':
        this.setState('SYNCING');
        break;
      case 'state_sync':
        this.setState('ACTIVE');
        this.emit('state_sync', (message.payload as { state: SessionState }).state, (message.payload as { version: number }).version);
        break;
      case 'state_delta':
        this.emit('state_delta', (message.payload as { delta: StateDelta }).delta, (message.payload as { version: number }).version);
        break;
      case 'device_joined':
        this.emit('device_joined', (message.payload as { device: DeviceInfo }).device);
        break;
      case 'device_left':
        this.emit('device_left', (message.payload as { deviceId: string }).deviceId);
        break;
      case 'error':
        this.handleErrorMessage(message.payload as ErrorMessage);
        break;
      case 'ping':
        this.handlePing(message.payload as { timestamp: string; latency?: number });
        break;
      case 'pong':
        this.handlePong(message.payload as { timestamp: string });
        break;
      case 'batch':
        this.handleBatch(message.payload as { messages: WebSocketMessageEnvelope[] });
        break;
    }
  }

  private handleBatch(batch: { messages: WebSocketMessageEnvelope[] }): void {
    for (const message of batch.messages) {
      this.processMessage(message);
    }
  }

  private handlePing(payload: { timestamp: string; latency?: number }): void {
    this.missedHeartbeats = 0;
    
    if (payload.latency) {
      this.updateAdaptiveHeartbeat(payload.latency);
    }
    
    this.send('pong', { timestamp: payload.timestamp });
  }

  private handlePong(payload: { timestamp: string }): void {
    this.missedHeartbeats = 0;
    
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
    }

    const latency = Date.now() - parseInt(payload.timestamp, 10);
    this.metrics.latency.push(latency);
    
    if (this.metrics.latency.length > 10) {
      this.metrics.latency.shift();
    }

    this.updateAdaptiveHeartbeat(latency);
  }

  private updateAdaptiveHeartbeat(latency: number): void {
    const avgLatency = this.metrics.latency.reduce((a, b) => a + b, 0) / this.metrics.latency.length;
    
    if (avgLatency < 50) {
      this.adaptiveHeartbeatInterval = Math.max(10000, this.options.heartbeatInterval / 2);
    } else if (avgLatency > 200) {
      this.adaptiveHeartbeatInterval = Math.min(60000, this.options.heartbeatInterval * 2);
    } else {
      this.adaptiveHeartbeatInterval = this.options.heartbeatInterval;
    }

    this.restartHeartbeat();
  }

  private handleErrorMessage(error: ErrorMessage): void {
    this.emit('error_message', error);

    switch (error.code) {
      case 'AUTH_ERROR':
        throw new AuthenticationError(error.message);
      case 'STATE_CONFLICT':
        throw new StateConflictError(
          error.message,
          error.details?.expectedVersion as number,
          error.details?.receivedVersion as number
        );
      case 'RATE_LIMITED':
        throw new RateLimitError(error.message);
      default:
        throw new WebSocketError(error.message, error.code, error.recoverable);
    }
  }

  private handleError(error: Error): void {
    this.emit('error', error);
  }

  private handleDisconnect(event: CloseEvent): void {
    this.metrics.reconnectCount++;
    
    if (this.options.autoReconnect && this.shouldReconnect(event.code)) {
      this.scheduleReconnect();
    }
  }

  private shouldReconnect(closeCode: number): boolean {
    const dontReconnectCodes = [1000, 1001, 1005, 4000, 4001];
    return !dontReconnectCodes.includes(closeCode);
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      this.emit('error', new Error('Max reconnection attempts reached'));
      return;
    }

    this.setState('RECONNECTING');
    this.reconnectAttempts++;

    const delay = this.calculateReconnectDelay();
    this.emit('reconnecting', this.reconnectAttempts, delay);

    this.reconnectTimer = setTimeout(() => {
      this.connect()
        .then(() => {
          this.emit('reconnected');
        })
        .catch(() => {
          // Reconnection failed, will try again
        });
    }, delay);
  }

  private calculateReconnectDelay(): number {
    const baseDelay = this.options.reconnectDelay;
    const multiplier = this.options.reconnectDelayMultiplier;
    const attempt = this.reconnectAttempts;
    
    const jitter = Math.random() * 1000;
    const delay = baseDelay * Math.pow(multiplier, attempt - 1) + jitter;
    
    return Math.min(delay, this.options.maxReconnectDelay);
  }

  private stopReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private startHeartbeat(): void {
    if (!this.options.enableHeartbeat) return;

    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, this.adaptiveHeartbeatInterval);
  }

  private restartHeartbeat(): void {
    this.stopHeartbeat();
    this.startHeartbeat();
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
    }
    this.missedHeartbeats = 0;
  }

  private emit<T extends keyof WebSocketEventMap>(
    event: T,
    ...args: Parameters<WebSocketEventMap[T]>
  ): void {
    this.eventListeners.get(event)?.forEach((handler) => {
      try {
        handler(...args);
      } catch (error) {
        console.error(`Error in ${event} handler:`, error);
      }
    });
  }

  getMetrics(): ConnectionMetrics {
    return {
      ...this.metrics,
      latency: [...this.metrics.latency],
    };
  }

  resetMetrics(): void {
    this.metrics = {
      latency: [],
      messageCount: 0,
      lastActivity: Date.now(),
      reconnectCount: 0,
    };
  }
}
