/**
 * WebSocket Test Client for HarmonyFlow Integration Tests
 */

import WebSocket from 'ws';
import {
  WebSocketMessage,
  MessageType,
  ConnectionState,
  TestConfig,
} from '../types';

export interface WebSocketClientOptions {
  url: string;
  timeout?: number;
  autoReconnect?: boolean;
}

export class WebSocketTestClient {
  private ws: WebSocket | null = null;
  private state: ConnectionState = ConnectionState.CLOSED;
  private messageHandlers: Array<(msg: WebSocketMessage) => void> = [];
  private stateHandlers: Array<(state: ConnectionState) => void> = [];
  private messageQueue: WebSocketMessage[] = [];
  private options: WebSocketClientOptions;

  constructor(options: WebSocketClientOptions) {
    this.options = {
      timeout: 10000,
      autoReconnect: false,
      ...options,
    };
  }

  /**
   * Connect to WebSocket server
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, this.options.timeout);

      this.state = ConnectionState.CONNECTING;
      this.notifyStateChange();

      this.ws = new WebSocket(this.options.url);

      this.ws.on('open', () => {
        clearTimeout(timeout);
        this.state = ConnectionState.CONNECTED;
        this.notifyStateChange();
        resolve();
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString()) as WebSocketMessage;
          this.handleMessage(message);
        } catch (error) {
          console.error('Failed to parse message:', error);
        }
      });

      this.ws.on('close', () => {
        this.state = ConnectionState.CLOSED;
        this.notifyStateChange();
      });

      this.ws.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      // Handle native ping/pong
      this.ws.on('ping', () => {
        this.ws?.pong();
      });
    });
  }

  /**
   * Disconnect from server
   */
  async disconnect(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.state = ConnectionState.CLOSED;
      this.notifyStateChange();
    }
  }

  /**
   * Send a message
   */
  send(message: WebSocketMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }

    this.ws.send(JSON.stringify(message));
  }

  /**
   * Send authentication message
   */
  authenticate(token: string): void {
    this.state = ConnectionState.AUTHENTICATING;
    this.notifyStateChange();

    this.send({
      type: MessageType.Auth,
      timestamp: Math.floor(Date.now() / 1000),
      payload: { token },
    });
  }

  /**
   * Send heartbeat message
   */
  sendHeartbeat(): void {
    this.send({
      type: MessageType.Heartbeat,
      timestamp: Math.floor(Date.now() / 1000),
      payload: {
        client_time: Math.floor(Date.now() / 1000),
      },
    });
  }

  /**
   * Request snapshot
   */
  requestSnapshot(): void {
    this.send({
      type: MessageType.SnapshotRequest,
      timestamp: Math.floor(Date.now() / 1000),
      payload: {},
    });
  }

  /**
   * Send state update
   */
  sendStateUpdate(key: string, value: unknown): void {
    this.send({
      type: MessageType.StateUpdate,
      timestamp: Math.floor(Date.now() / 1000),
      payload: { key, value },
    });
  }

  /**
   * Wait for a specific message type
   */
  async waitForMessage(
    type: MessageType,
    timeoutMs: number = 5000
  ): Promise<WebSocketMessage> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timeout waiting for message type ${type}`));
      }, timeoutMs);

      const handler = (msg: WebSocketMessage) => {
        if (msg.type === type) {
          clearTimeout(timeout);
          this.offMessage(handler);
          resolve(msg);
        }
      };

      this.onMessage(handler);
    });
  }

  /**
   * Wait for authentication response
   */
  async waitForAuthResponse(timeoutMs: number = 5000): Promise<WebSocketMessage> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout waiting for auth response'));
      }, timeoutMs);

      const handler = (msg: WebSocketMessage) => {
        if (msg.type === MessageType.AuthSuccess || msg.type === MessageType.AuthFailure) {
          clearTimeout(timeout);
          this.offMessage(handler);
          
          if (msg.type === MessageType.AuthSuccess) {
            this.state = ConnectionState.ACTIVE;
            this.notifyStateChange();
          }
          
          resolve(msg);
        }
      };

      this.onMessage(handler);
    });
  }

  /**
   * Register message handler
   */
  onMessage(handler: (msg: WebSocketMessage) => void): void {
    this.messageHandlers.push(handler);
  }

  /**
   * Unregister message handler
   */
  offMessage(handler: (msg: WebSocketMessage) => void): void {
    const index = this.messageHandlers.indexOf(handler);
    if (index > -1) {
      this.messageHandlers.splice(index, 1);
    }
  }

  /**
   * Register state change handler
   */
  onStateChange(handler: (state: ConnectionState) => void): void {
    this.stateHandlers.push(handler);
  }

  /**
   * Get current state
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Check if authenticated
   */
  isAuthenticated(): boolean {
    return this.state === ConnectionState.ACTIVE;
  }

  /**
   * Get message queue (for debugging)
   */
  getMessageQueue(): WebSocketMessage[] {
    return [...this.messageQueue];
  }

  /**
   * Clear message queue
   */
  clearMessageQueue(): void {
    this.messageQueue = [];
  }

  private handleMessage(message: WebSocketMessage): void {
    this.messageQueue.push(message);
    this.messageHandlers.forEach((handler) => handler(message));
  }

  private notifyStateChange(): void {
    this.stateHandlers.forEach((handler) => handler(this.state));
  }
}
