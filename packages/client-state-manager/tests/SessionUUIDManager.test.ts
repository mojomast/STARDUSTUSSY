/**
 * Session UUID Manager Tests
 */

import { SessionUUIDManager } from '../src/handoff/SessionUUIDManager';
import { generateUUID } from '../src/utils/uuid';

describe('SessionUUIDManager', () => {
  let sessionManager: SessionUUIDManager;
  let getItemMock: jest.Mock;
  let setItemMock: jest.Mock;
  let removeItemMock: jest.Mock;

  beforeEach(() => {
    // Create mock functions
    getItemMock = jest.fn();
    setItemMock = jest.fn();
    removeItemMock = jest.fn();

    // Create localStorage mock
    const localStorageMock = {
      getItem: getItemMock,
      setItem: setItemMock,
      removeItem: removeItemMock,
      clear: jest.fn(),
      key: jest.fn(),
      length: 0,
    };

    // Update global localStorage
    (global as { localStorage: Storage }).localStorage = localStorageMock as Storage;

    sessionManager = new SessionUUIDManager({
      userId: 'test-user',
      storage: localStorageMock as Storage,
    });
  });

  describe('Session Creation', () => {
    test('should create a new session', () => {
      const session = sessionManager.createSession();

      expect(session).toBeDefined();
      expect(session.id).toBeDefined();
      expect(session.metadata.userId).toBe('test-user');
      expect(session.deviceList).toHaveLength(1);
      expect(session.metadata.totalDevices).toBe(1);
      expect(session.expiresAt).toBeGreaterThan(Date.now());
    });

    test('should persist session to storage', () => {
      sessionManager.createSession();

      expect(setItemMock).toHaveBeenCalled();
      const calls = setItemMock.mock.calls;
      expect(calls.some((call: string[]) => call[0].includes('harmonyflow_session'))).toBe(true);
    });

    test('should generate device fingerprint on creation', () => {
      const fingerprint = sessionManager.getDeviceFingerprint();

      expect(fingerprint).toBeDefined();
      expect(fingerprint?.id).toBeDefined();
      expect(fingerprint?.userAgent).toBe('test-agent');
    });
  });

  describe('Session Retrieval', () => {
    test('should get current session', () => {
      sessionManager.createSession();
      
      const session = sessionManager.getCurrentSession();
      
      expect(session).toBeDefined();
      expect(session?.metadata.userId).toBe('test-user');
    });

    test('should return null when no session exists', () => {
      const session = sessionManager.getCurrentSession();
      
      expect(session).toBeNull();
    });

    test('should return null for expired session', () => {
      const expiredSession = {
        id: generateUUID(),
        createdAt: Date.now() - 8 * 24 * 60 * 60 * 1000,
        lastActiveAt: Date.now() - 8 * 24 * 60 * 60 * 1000,
        expiresAt: Date.now() - 24 * 60 * 60 * 1000,
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
        if (key === 'harmonyflow_session') return expiredSession.id;
        if (key === `harmonyflow_session_${expiredSession.id}`) {
          return JSON.stringify(expiredSession);
        }
        return null;
      });

      const localStorageMock = {
        getItem: getItemMock,
        setItem: setItemMock,
        removeItem: removeItemMock,
        clear: jest.fn(),
        key: jest.fn(),
        length: 0,
      };

      const newManager = new SessionUUIDManager({
        userId: 'test-user',
        storage: localStorageMock as Storage,
      });

      expect(newManager.getCurrentSession()).toBeNull();
    });
  });

  describe('Session Joining', () => {
    test('should join existing session', () => {
      const sessionId = generateUUID();
      const existingSession = {
        id: sessionId,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
        deviceList: [],
        metadata: {
          userId: 'test-user',
          sessionType: 'default',
          createdBy: 'other-device',
          totalDevices: 0,
          maxDevices: 5,
        },
      };

      getItemMock.mockImplementation((key: string) => {
        if (key === `harmonyflow_session_${sessionId}`) {
          return JSON.stringify(existingSession);
        }
        return null;
      });

      const localStorageMock = {
        getItem: getItemMock,
        setItem: setItemMock,
        removeItem: removeItemMock,
        clear: jest.fn(),
        key: jest.fn(),
        length: 0,
      };

      const newManager = new SessionUUIDManager({
        userId: 'test-user',
        storage: localStorageMock as Storage,
      });

      const session = newManager.joinSession(sessionId);
      
      expect(session).toBeDefined();
      expect(session?.id).toBe(sessionId);
      expect(session?.metadata.totalDevices).toBe(1);
    });

    test('should return null for non-existent session', () => {
      const session = sessionManager.joinSession(generateUUID());
      
      expect(session).toBeNull();
    });
  });

  describe('Device Management', () => {
    test('should add device to session', () => {
      sessionManager.createSession();

      const newDevice = {
        id: 'new-device-id',
        type: 'mobile' as const,
        connectedAt: new Date().toISOString(),
      };

      const result = sessionManager.addDevice(newDevice);
      
      expect(result).toBe(true);
      expect(sessionManager.getDevices()).toHaveLength(2);
    });

    test('should not exceed max devices', () => {
      const localStorageMock = {
        getItem: getItemMock,
        setItem: setItemMock,
        removeItem: removeItemMock,
        clear: jest.fn(),
        key: jest.fn(),
        length: 0,
      };

      const manager = new SessionUUIDManager({
        userId: 'test-user',
        maxDevices: 2,
        storage: localStorageMock as Storage,
      });

      manager.createSession();

      const device1 = { id: 'device-1', type: 'mobile' as const, connectedAt: new Date().toISOString() };
      const device2 = { id: 'device-2', type: 'tablet' as const, connectedAt: new Date().toISOString() };

      expect(manager.addDevice(device1)).toBe(true);
      // Second device should fail because createSession already adds one device
      expect(manager.addDevice(device2)).toBe(false);
    });

    test('should remove device from session', () => {
      sessionManager.createSession();

      const deviceId = sessionManager.getDeviceId();
      const result = sessionManager.removeDevice(deviceId);
      
      expect(result).toBe(true);
      expect(sessionManager.getDevices()).toHaveLength(0);
    });
  });

  describe('Session Expiration', () => {
    test('should check if session is expired', () => {
      sessionManager.createSession();
      
      expect(sessionManager.isExpired()).toBe(false);
    });

    test('should extend session', () => {
      sessionManager.createSession();
      
      const originalExpiry = sessionManager.getCurrentSession()!.expiresAt;
      
      jest.advanceTimersByTime(1000);
      
      sessionManager.extendSession();
      
      const newExpiry = sessionManager.getCurrentSession()!.expiresAt;
      expect(newExpiry).toBeGreaterThan(originalExpiry);
    });
  });

  describe('Subscriptions', () => {
    test('should notify subscribers of session changes', () => {
      const listener = jest.fn();
      sessionManager.subscribe(listener);

      sessionManager.createSession();

      expect(listener).toHaveBeenCalled();
      expect(listener.mock.calls[0][0]).toBeDefined();
    });

    test('should allow unsubscribing', () => {
      const listener = jest.fn();
      const unsubscribe = sessionManager.subscribe(listener);

      unsubscribe();
      sessionManager.createSession();

      const callCount = listener.mock.calls.length;
      
      listener.mockClear();
      sessionManager.createSession();
      
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('Device Fingerprint', () => {
    test('should persist fingerprint', () => {
      sessionManager.createSession();

      expect(setItemMock).toHaveBeenCalledWith(
        'harmonyflow_device_fp',
        expect.any(String)
      );
    });

    test('should restore fingerprint from storage', () => {
      const fingerprint = {
        id: 'test-fp-id',
        userAgent: 'previous-agent',
        screenResolution: '1920x1080',
        timezone: 'UTC',
        language: 'en',
        platform: 'test',
        hardwareConcurrency: 4,
        colorDepth: 24,
        pixelRatio: 1,
        touchSupport: false,
        createdAt: Date.now(),
      };

      getItemMock.mockImplementation((key: string) => {
        if (key === 'harmonyflow_device_fp') {
          return JSON.stringify(fingerprint);
        }
        return null;
      });

      const localStorageMock = {
        getItem: getItemMock,
        setItem: setItemMock,
        removeItem: removeItemMock,
        clear: jest.fn(),
        key: jest.fn(),
        length: 0,
      };

      const newManager = new SessionUUIDManager({
        userId: 'test-user',
        storage: localStorageMock as Storage,
      });

      expect(newManager.getDeviceFingerprint()?.id).toBe('test-fp-id');
    });
  });
});
