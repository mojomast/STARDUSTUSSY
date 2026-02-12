/**
 * Handoff Manager Tests
 */

import { HandoffManager } from '../src/handoff/HandoffManager';
import { WebSocketClient } from '../src/core/WebSocketClient';
import { generateUUID } from '../src/utils/uuid';

// Mock WebSocketClient
jest.mock('../src/core/WebSocketClient');

describe('HandoffManager', () => {
  let handoffManager: HandoffManager;
  let mockWebSocket: jest.Mocked<WebSocketClient>;
  let getItemMock: jest.Mock;
  let setItemMock: jest.Mock;

  beforeEach(() => {
    getItemMock = jest.fn();
    setItemMock = jest.fn();

    const localStorageMock = {
      getItem: getItemMock,
      setItem: setItemMock,
      removeItem: jest.fn(),
      clear: jest.fn(),
      key: jest.fn(),
      length: 0,
    };

    (global as { localStorage: Storage }).localStorage = localStorageMock as Storage;

    mockWebSocket = new WebSocketClient({
      url: 'ws://test',
      sessionId: 'test-session',
      token: 'test-token',
      deviceId: 'test-device',
    }) as jest.Mocked<WebSocketClient>;

    handoffManager = new HandoffManager({
      userId: 'test-user',
      websocket: mockWebSocket,
      websocketUrl: 'ws://test',
      debug: false,
    });
  });

  afterEach(() => {
    handoffManager.destroy();
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    test('should initialize successfully', async () => {
      const status = await handoffManager.initialize();
      
      expect(status).toBeDefined();
      expect(status.sessionId).toBe('');
      expect(status.isActive).toBe(false);
    });
  });

  describe('Session Management', () => {
    test('should create a new session', async () => {
      await handoffManager.initialize();
      
      const session = handoffManager.createSession();
      
      expect(session).toBeDefined();
      expect(session.id).toBeDefined();
      expect(session.userId).toBe('test-user');
      expect(session.devices).toHaveLength(1);
      expect(session.state.version).toBe(1);
    });

    test('should join existing session', async () => {
      await handoffManager.initialize();
      
      const sessionId = generateUUID();
      const mockSession = {
        id: sessionId,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
        deviceList: [],
        metadata: {
          userId: 'test-user',
          sessionType: 'default',
          createdBy: 'test-device',
          totalDevices: 0,
          maxDevices: 5,
        },
      };

      getItemMock.mockImplementation((key: string) => {
        if (key === 'harmonyflow_session') return sessionId;
        if (key === `harmonyflow_session_${sessionId}`) return JSON.stringify(mockSession);
        return null;
      });

      const newManager = new HandoffManager({
        userId: 'test-user',
        websocket: mockWebSocket,
        websocketUrl: 'ws://test',
        debug: false,
      });

      const status = await newManager.initialize(sessionId);
      
      expect(status.sessionId).toBe(sessionId);
    });

    test('should leave session', async () => {
      await handoffManager.initialize();
      handoffManager.createSession();
      
      handoffManager.leaveSession();
      
      const status = handoffManager.getStatus();
      expect(status.isActive).toBe(false);
      expect(status.sessionId).toBe('');
    });
  });

  describe('QR Code Handoff', () => {
    test('should generate QR code when session exists', async () => {
      await handoffManager.initialize();
      handoffManager.createSession();
      
      const result = handoffManager.generateQRCode();
      
      expect(result).toBeDefined();
      expect(result?.token).toBeDefined();
      expect(result?.dataUrl).toBeDefined();
      expect(result?.dataUrl.startsWith('data:image/svg+xml;base64,')).toBe(true);
    });

    test('should return null when no session exists', async () => {
      await handoffManager.initialize();
      
      const result = handoffManager.generateQRCode();
      
      expect(result).toBeNull();
    });

    test('should handle deep link', async () => {
      const url = 'harmonyflow://handoff?token=abc123&sessionId=xyz789';
      
      const deepLink = handoffManager.handleDeepLink(url);
      
      expect(deepLink).toBeDefined();
      expect(deepLink?.token).toBe('abc123');
      expect(deepLink?.sessionId).toBe('xyz789');
    });

    test('should handle invalid deep link', () => {
      const deepLink = handoffManager.handleDeepLink('invalid-url');
      
      expect(deepLink).toBeNull();
    });
  });

  describe('State Synchronization', () => {
    test('should sync state', async () => {
      await handoffManager.initialize();
      handoffManager.createSession();
      
      handoffManager.syncState('user.name', 'John');
      
      const session = handoffManager.getCurrentSession();
      expect(session?.state.data.user?.name).toBe('John');
    });

    test('should handle remote state change', async () => {
      await handoffManager.initialize();
      handoffManager.createSession();
      
      const delta = {
        baseVersion: 1,
        targetVersion: 2,
        operations: [
          {
            op: 'add' as const,
            path: '/settings/theme',
            value: 'dark',
          },
        ],
        timestamp: Date.now(),
      };

      handoffManager.handleRemoteStateChange('remote-device', delta);
      
      const session = handoffManager.getCurrentSession();
      expect(session?.state.data.settings?.theme).toBe('dark');
    });
  });

  describe('Event Handling', () => {
    test('should emit and receive events', async () => {
      await handoffManager.initialize();
      
      const eventHandler = jest.fn();
      const unsubscribe = handoffManager.subscribe(eventHandler);
      
      handoffManager.createSession();
      
      expect(eventHandler).toHaveBeenCalled();
      expect(eventHandler.mock.calls[0][0].type).toBe('session-created');
      
      unsubscribe();
    });

    test('should handle multiple listeners', async () => {
      await handoffManager.initialize();
      
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      
      handoffManager.subscribe(handler1);
      handoffManager.subscribe(handler2);
      
      handoffManager.createSession();
      
      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });
  });

  describe('Platform Optimizations', () => {
    test('should return web optimizations by default', () => {
      const opts = handoffManager.getPlatformOptimizations();
      
      expect(opts.platform).toBe('web');
      expect(opts.batteryAware).toBe(true);
    });

    test('should return mobile optimizations', () => {
      const mobileManager = new HandoffManager({
        userId: 'test-user',
        websocket: mockWebSocket,
        websocketUrl: 'ws://test',
        platform: 'ios',
      });
      
      const opts = mobileManager.getPlatformOptimizations();
      
      expect(opts.platform).toBe('ios');
      expect(opts.backgroundSync).toBe(true);
      expect(opts.pushNotifications).toBe(true);
      
      mobileManager.destroy();
    });
  });

  describe('Snapshot Replay', () => {
    test('should resume from snapshot', async () => {
      await handoffManager.initialize();
      handoffManager.createSession();
      
      const snapshot = {
        id: generateUUID(),
        timestamp: Date.now(),
        version: 1,
        data: { test: 'data' },
        checksum: '',
        deviceId: 'test-device',
        sessionId: handoffManager.getCurrentSession()!.id,
      };
      
      const result = await handoffManager.resumeFromSnapshot(snapshot);
      
      expect(result.success).toBe(true);
      expect(result.state.data).toEqual({ test: 'data' });
    });
  });
});
