import { WebSocketClient } from '../src/core/WebSocketClient';
import {
  WebSocketConnectionState,
  WebSocketError,
  ConnectionError,
  AuthenticationError,
  SessionState,
  StateDelta,
} from '../src/types';

describe('WebSocketClient', () => {
  let client: WebSocketClient;
  const mockWebSocket = {
    send: jest.fn(),
    close: jest.fn(),
    readyState: WebSocket.OPEN,
    onopen: null as (() => void) | null,
    onmessage: null as ((event: { data: string }) => void) | null,
    onclose: null as ((event: CloseEvent) => void) | null,
    onerror: null as ((error: Event) => void) | null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    
    global.WebSocket = jest.fn().mockImplementation(() => {
      return mockWebSocket;
    }) as unknown as typeof WebSocket;

    client = new WebSocketClient({
      url: 'ws://localhost:8080',
      sessionId: 'test-session',
      token: 'test-token',
      deviceId: 'test-device',
      autoReconnect: true,
      reconnectDelay: 1000,
      maxReconnectDelay: 60000,
      reconnectDelayMultiplier: 2,
      enableHeartbeat: true,
      heartbeatInterval: 30000,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    client.disconnect();
  });

  describe('connection', () => {
    it('should create client with correct initial state', () => {
      expect(client).toBeDefined();
      expect(client.currentState).toBe('CLOSED');
      expect(client.isConnected).toBe(false);
      expect(client.sessionId).toBe('test-session');
      expect(client.deviceId).toBe('test-device');
    });

    it('should connect successfully', async () => {
      const connectPromise = client.connect();
      
      mockWebSocket.onopen?.();
      
      await connectPromise;
      
      expect(client.currentState).toBe('CONNECTED');
      expect(client.isConnected).toBe(true);
    });

    it('should build correct connection URL', async () => {
      const connectPromise = client.connect();
      
      expect(global.WebSocket).toHaveBeenCalledWith(
        expect.stringContaining('ws://localhost:8080')
      );
      expect(global.WebSocket).toHaveBeenCalledWith(
        expect.stringContaining('token=test-token')
      );
      expect(global.WebSocket).toHaveBeenCalledWith(
        expect.stringContaining('deviceId=test-device')
      );
      
      mockWebSocket.onopen?.();
      await connectPromise;
    });

    it('should handle connection timeout', async () => {
      client = new WebSocketClient({
        url: 'ws://localhost:8080',
        sessionId: 'test-session',
        token: 'test-token',
        deviceId: 'test-device',
        connectionTimeout: 1000,
      });

      const connectPromise = client.connect();
      
      jest.advanceTimersByTime(1001);
      
      await expect(connectPromise).rejects.toThrow('Connection timeout');
    });

    it('should not reconnect multiple times if already connecting', async () => {
      const promise1 = client.connect();
      const promise2 = client.connect();
      
      mockWebSocket.onopen?.();
      
      await Promise.all([promise1, promise2]);
      
      expect(global.WebSocket).toHaveBeenCalledTimes(1);
    });
  });

  describe('reconnection', () => {
    it('should reconnect with exponential backoff', async () => {
      const reconnectingHandler = jest.fn();
      client.on('reconnecting', reconnectingHandler);
      
      await client.connect();
      mockWebSocket.onopen?.();
      
      mockWebSocket.onclose?.({ code: 1006 } as CloseEvent);
      
      expect(reconnectingHandler).toHaveBeenCalledWith(1, 1000);
      
      jest.advanceTimersByTime(1000);
      mockWebSocket.onopen?.();
      
      expect(client.currentState).toBe('CONNECTED');
    });

    it('should cap reconnect delay at max', async () => {
      const reconnectingHandler = jest.fn();
      client.on('reconnecting', reconnectingHandler);
      
      await client.connect();
      mockWebSocket.onopen?.();
      
      for (let i = 0; i < 10; i++) {
        mockWebSocket.onclose?.({ code: 1006 } as CloseEvent);
        jest.advanceTimersByTime(60000);
        
        if (i < 9) {
          mockWebSocket.onopen?.();
        }
      }
      
      const lastCall = reconnectingHandler.mock.calls[reconnectingHandler.mock.calls.length - 1];
      expect(lastCall[1]).toBeLessThanOrEqual(60000);
    });

    it('should not reconnect after max attempts', async () => {
      client = new WebSocketClient({
        url: 'ws://localhost:8080',
        sessionId: 'test-session',
        token: 'test-token',
        deviceId: 'test-device',
        maxReconnectAttempts: 2,
      });
      
      await client.connect();
      mockWebSocket.onopen?.();
      
      const consoleError = jest.spyOn(console, 'error').mockImplementation();
      
      for (let i = 0; i < 3; i++) {
        mockWebSocket.onclose?.({ code: 1006 } as CloseEvent);
        jest.advanceTimersByTime(60000);
      }
      
      expect(consoleError).toHaveBeenCalledWith('Max reconnection attempts reached');
      consoleError.mockRestore();
    });

    it('should not reconnect on normal close', async () => {
      const reconnectingHandler = jest.fn();
      client.on('reconnecting', reconnectingHandler);
      
      await client.connect();
      mockWebSocket.onopen?.();
      
      mockWebSocket.onclose?.({ code: 1000 } as CloseEvent);
      
      expect(reconnectingHandler).not.toHaveBeenCalled();
    });
  });

  describe('heartbeat', () => {
    it('should send heartbeat at interval', async () => {
      await client.connect();
      mockWebSocket.onopen?.();
      
      jest.advanceTimersByTime(30000);
      
      expect(mockWebSocket.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"heartbeat"')
      );
    });

    it('should disconnect after max missed heartbeats', async () => {
      await client.connect();
      mockWebSocket.onopen?.();
      
      for (let i = 0; i < 3; i++) {
        jest.advanceTimersByTime(30000);
      }
      
      expect(mockWebSocket.close).toHaveBeenCalled();
    });

    it('should reset missed heartbeats on ping', async () => {
      await client.connect();
      mockWebSocket.onopen?.();
      
      mockWebSocket.onmessage?.({
        data: JSON.stringify({
          id: '1',
          type: 'ping',
          timestamp: new Date().toISOString(),
          payload: { timestamp: new Date().toISOString() },
        }),
      });
      
      jest.advanceTimersByTime(60000);
      
      expect(mockWebSocket.close).not.toHaveBeenCalled();
    });
  });

  describe('messaging', () => {
    beforeEach(async () => {
      await client.connect();
      mockWebSocket.onopen?.();
    });

    it('should send message when connected', () => {
      client.send('subscribe', { sessionId: 'test' });
      
      expect(mockWebSocket.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"subscribe"')
      );
    });

    it('should queue message when not connected', () => {
      client.disconnect();
      
      client.send('subscribe', { sessionId: 'test' });
      
      expect(mockWebSocket.send).not.toHaveBeenCalled();
    });

    it('should flush queue on connect', async () => {
      client.disconnect();
      
      client.send('subscribe', { sessionId: 'test' });
      
      const connectPromise = client.connect();
      mockWebSocket.onopen?.();
      await connectPromise;
      
      expect(mockWebSocket.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"subscribe"')
      );
    });

    it('should reject message exceeding max size', () => {
      client = new WebSocketClient({
        url: 'ws://localhost:8080',
        sessionId: 'test-session',
        token: 'test-token',
        deviceId: 'test-device',
        maxMessageSize: 10,
      });
      
      expect(() => {
        client.send('state_update', { large: 'payload that exceeds limit' });
      }).toThrow();
    });

    it('should drop old messages when queue is full', () => {
      client = new WebSocketClient({
        url: 'ws://localhost:8080',
        sessionId: 'test-session',
        token: 'test-token',
        deviceId: 'test-device',
        messageQueueLimit: 2,
      });
      
      client.send('subscribe', { id: '1' });
      client.send('subscribe', { id: '2' });
      client.send('subscribe', { id: '3' });
      
      expect((client as unknown as { messageQueue: unknown[] }).messageQueue.length).toBe(2);
    });
  });

  describe('event handling', () => {
    it('should emit state_change event', () => {
      const handler = jest.fn();
      client.on('state_change', handler);
      
      client.connect();
      mockWebSocket.onopen?.();
      
      expect(handler).toHaveBeenCalledWith('CONNECTED');
    });

    it('should emit message event', () => {
      const handler = jest.fn();
      client.on('message', handler);
      
      client.connect();
      mockWebSocket.onopen?.();
      
      const message = {
        id: '1',
        type: 'state_sync',
        timestamp: new Date().toISOString(),
        payload: { state: {} },
      };
      
      mockWebSocket.onmessage?.({ data: JSON.stringify(message) });
      
      expect(handler).toHaveBeenCalledWith(expect.objectContaining(message));
    });

    it('should allow unsubscribing from events', () => {
      const handler = jest.fn();
      const unsubscribe = client.on('state_change', handler);
      
      unsubscribe();
      
      client.connect();
      mockWebSocket.onopen?.();
      
      expect(handler).not.toHaveBeenCalled();
    });

    it('should handle invalid messages gracefully', () => {
      const consoleWarn = jest.spyOn(console, 'warn').mockImplementation();
      
      client.connect();
      mockWebSocket.onopen?.();
      
      mockWebSocket.onmessage?.({ data: 'invalid json' });
      
      expect(consoleWarn).not.toHaveBeenCalled();
      
      mockWebSocket.onmessage?.({ data: JSON.stringify({ invalid: 'message' }) });
      
      expect(consoleWarn).toHaveBeenCalled();
      
      consoleWarn.mockRestore();
    });
  });

  describe('message processing', () => {
    beforeEach(async () => {
      await client.connect();
      mockWebSocket.onopen?.();
    });

    it('should process state_sync message', () => {
      const handler = jest.fn();
      client.on('state_sync', handler);
      
      mockWebSocket.onmessage?.({
        data: JSON.stringify({
          id: '1',
          type: 'state_sync',
          timestamp: new Date().toISOString(),
          payload: { state: { data: {} }, version: 1 },
        }),
      });
      
      expect(handler).toHaveBeenCalledWith({ data: {} }, 1);
      expect(client.currentState).toBe('ACTIVE');
    });

    it('should process state_delta message', () => {
      const handler = jest.fn();
      client.on('state_delta', handler);
      
      const delta: StateDelta = {
        baseVersion: 1,
        targetVersion: 2,
        operations: [],
        timestamp: Date.now(),
      };
      
      mockWebSocket.onmessage?.({
        data: JSON.stringify({
          id: '1',
          type: 'state_delta',
          timestamp: new Date().toISOString(),
          payload: { delta, version: 2 },
        }),
      });
      
      expect(handler).toHaveBeenCalledWith(delta, 2);
    });

    it('should process device_joined message', () => {
      const handler = jest.fn();
      client.on('device_joined', handler);
      
      mockWebSocket.onmessage?.({
        data: JSON.stringify({
          id: '1',
          type: 'device_joined',
          timestamp: new Date().toISOString(),
          payload: { device: { id: 'device-1', type: 'web' } },
        }),
      });
      
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ id: 'device-1' }));
    });

    it('should process error message', () => {
      mockWebSocket.onmessage?.({
        data: JSON.stringify({
          id: '1',
          type: 'error',
          timestamp: new Date().toISOString(),
          payload: { code: 'AUTH_ERROR', message: 'Auth failed', recoverable: false },
        }),
      });
      
      expect(() => {
        mockWebSocket.onmessage?.({
          data: JSON.stringify({
            id: '1',
            type: 'error',
            timestamp: new Date().toISOString(),
            payload: { code: 'AUTH_ERROR', message: 'Auth failed', recoverable: false },
          }),
        });
      }).toThrow(AuthenticationError);
    });
  });

  describe('public methods', () => {
    beforeEach(async () => {
      await client.connect();
      mockWebSocket.onopen?.();
    });

    it('should subscribe to session', () => {
      client.subscribe('session-1', 5);
      
      expect(mockWebSocket.send).toHaveBeenCalledWith(
        expect.stringContaining('"sessionId":"session-1"')
      );
      expect(mockWebSocket.send).toHaveBeenCalledWith(
        expect.stringContaining('"lastVersion":5')
      );
    });

    it('should unsubscribe from session', () => {
      client.unsubscribe('session-1');
      
      expect(mockWebSocket.send).toHaveBeenCalledWith(
        expect.stringContaining('"sessionId":"session-1"')
      );
    });

    it('should acknowledge message', () => {
      client.acknowledge('msg-1');
      
      expect(mockWebSocket.send).toHaveBeenCalledWith(
        expect.stringContaining('"messageId":"msg-1"')
      );
    });

    it('should send state update', () => {
      const state: SessionState = {
        id: 'session-1',
        userId: 'user-1',
        deviceId: 'device-1',
        version: 1,
        data: {},
        lastModified: Date.now(),
      };
      
      client.sendStateUpdate(state);
      
      expect(mockWebSocket.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"state_update"')
      );
    });
  });
});
