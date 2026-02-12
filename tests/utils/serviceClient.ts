import WebSocket from 'ws';
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

export interface ServiceClientConfig {
  baseURL: string;
  wsURL: string;
  timeout?: number;
}

export interface HealthStatus {
  healthy: boolean;
  status: string;
  timestamp: string;
  version?: string;
}

export interface WebSocketMessage {
  type: number;
  session_id?: string;
  user_id?: string;
  timestamp: number;
  payload?: Record<string, unknown>;
  correlation_id?: string;
}

export class ServiceClient {
  private httpClient: AxiosInstance;
  private wsConnections: Map<string, WebSocket> = new Map();
  private config: ServiceClientConfig;

  constructor(config: ServiceClientConfig) {
    this.config = config;
    this.httpClient = axios.create({
      baseURL: config.baseURL,
      timeout: config.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  async healthCheck(): Promise<HealthStatus> {
    const response = await this.httpClient.get('/health');
    return response.data;
  }

  async createSnapshot(sessionId: string, stateData: Record<string, unknown>): Promise<unknown> {
    const response = await this.httpClient.post('/session/snapshot', {
      session_id: sessionId,
      state_data: stateData,
    });
    return response.data;
  }

  async getSnapshot(sessionId: string): Promise<unknown> {
    const response = await this.httpClient.get(`/session/${sessionId}`);
    return response.data;
  }

  generateJWTToken(userId: string, sessionId: string, deviceId: string, secret: string): string {
    return jwt.sign(
      {
        user_id: userId,
        session_id: sessionId,
        device_id: deviceId,
        exp: Math.floor(Date.now() / 1000) + 900, // 15 minutes
      },
      secret
    );
  }

  async createWebSocketConnection(
    connectionId?: string,
    autoReconnect: boolean = false
  ): Promise<WebSocket> {
    const id = connectionId || uuidv4();
    const ws = new WebSocket(this.config.wsURL);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('WebSocket connection timeout'));
      }, 10000);

      ws.on('open', () => {
        clearTimeout(timeout);
        this.wsConnections.set(id, ws);
        resolve(ws);
      });

      ws.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  async authenticateWebSocket(
    ws: WebSocket,
    token: string
  ): Promise<WebSocketMessage> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('WebSocket authentication timeout'));
      }, 10000);

      const messageHandler = (data: WebSocket.RawData) => {
        const message = JSON.parse(data.toString()) as WebSocketMessage;
        if (message.type === 8) { // AuthSuccess
          clearTimeout(timeout);
          ws.off('message', messageHandler);
          resolve(message);
        } else if (message.type === 9) { // AuthFailure
          clearTimeout(timeout);
          ws.off('message', messageHandler);
          reject(new Error(`Authentication failed: ${JSON.stringify(message.payload)}`));
        }
      };

      ws.on('message', messageHandler);

      ws.send(JSON.stringify({
        type: 7, // Auth
        payload: { token },
        timestamp: Date.now(),
      }));
    });
  }

  async sendWebSocketMessage(ws: WebSocket, message: WebSocketMessage): Promise<void> {
    return new Promise((resolve, reject) => {
      ws.send(JSON.stringify(message), (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  async waitForMessage(ws: WebSocket, expectedType: number, timeoutMs: number = 5000): Promise<WebSocketMessage> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timeout waiting for message type ${expectedType}`));
      }, timeoutMs);

      const handler = (data: WebSocket.RawData) => {
        const message = JSON.parse(data.toString()) as WebSocketMessage;
        if (message.type === expectedType) {
          clearTimeout(timeout);
          ws.off('message', handler);
          resolve(message);
        }
      };

      ws.on('message', handler);
    });
  }

  getWebSocket(connectionId: string): WebSocket | undefined {
    return this.wsConnections.get(connectionId);
  }

  closeWebSocket(connectionId: string): void {
    const ws = this.wsConnections.get(connectionId);
    if (ws) {
      ws.close();
      this.wsConnections.delete(connectionId);
    }
  }

  async close(): Promise<void> {
    for (const [id, ws] of this.wsConnections) {
      ws.close();
      this.wsConnections.delete(id);
    }
  }

  getActiveConnections(): number {
    return this.wsConnections.size;
  }
}
