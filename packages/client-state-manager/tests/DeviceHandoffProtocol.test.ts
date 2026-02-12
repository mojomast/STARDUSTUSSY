/**
 * Device Handoff Protocol Tests
 */

import { DeviceHandoffProtocol } from '../src/handoff/DeviceHandoffProtocol';
import { DeviceFingerprint } from '../src/types/handoff';

describe('DeviceHandoffProtocol', () => {
  let protocol: DeviceHandoffProtocol;
  let getItemMock: jest.Mock;
  let setItemMock: jest.Mock;
  let removeItemMock: jest.Mock;

  beforeEach(() => {
    getItemMock = jest.fn();
    setItemMock = jest.fn();
    removeItemMock = jest.fn();

    const localStorageMock = {
      getItem: getItemMock,
      setItem: setItemMock,
      removeItem: removeItemMock,
      clear: jest.fn(),
      key: jest.fn(),
      length: 0,
    };

    (global as { localStorage: Storage }).localStorage = localStorageMock as Storage;

    protocol = new DeviceHandoffProtocol({
      storage: localStorageMock as Storage,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Token Generation', () => {
    test('should generate handoff token', () => {
      const token = protocol.generateHandoffToken('session-123', 'device-abc');

      expect(token).toBeDefined();
      expect(token.sessionId).toBe('session-123');
      expect(token.createdBy).toBe('device-abc');
      expect(token.token).toBeDefined();
      expect(token.expiresAt).toBeGreaterThan(Date.now());
      expect(token.maxUses).toBe(1);
    });

    test('should generate token with custom options', () => {
      const token = protocol.generateHandoffToken('session-123', 'device-abc', {
        maxUses: 3,
        expiryMinutes: 10,
      });

      expect(token.maxUses).toBe(3);
      expect(token.expiresAt).toBeGreaterThan(Date.now() + 9 * 60 * 1000);
      expect(token.expiresAt).toBeLessThan(Date.now() + 11 * 60 * 1000);
    });

    test('should persist tokens', () => {
      protocol.generateHandoffToken('session-123', 'device-abc');

      expect(setItemMock).toHaveBeenCalledWith(
        'harmonyflow_handoff',
        expect.any(String)
      );
    });
  });

  describe('QR Code Generation', () => {
    test('should generate QR code data', () => {
      const token = protocol.generateHandoffToken('session-123', 'device-abc');
      const qrData = protocol.generateQRCodeData(token);

      expect(qrData).toBeDefined();
      expect(qrData.token).toBe(token.token);
      expect(qrData.sessionId).toBe('session-123');
      expect(qrData.expiresAt).toBe(token.expiresAt);
      expect(qrData.checksum).toBeDefined();
    });

    test('should create QR code data URL', () => {
      const token = protocol.generateHandoffToken('session-123', 'device-abc');
      const qrData = protocol.generateQRCodeData(token);
      const dataUrl = protocol.createQRCode(qrData);

      expect(dataUrl).toBeDefined();
      expect(dataUrl.startsWith('data:image/svg+xml;base64,')).toBe(true);
    });
  });

  describe('QR Code Parsing', () => {
    test('should parse valid QR code', () => {
      const token = protocol.generateHandoffToken('session-123', 'device-abc');
      const qrData = protocol.generateQRCodeData(token);
      const jsonData = JSON.stringify(qrData);

      const parsed = protocol.parseQRCodeData(jsonData);

      expect(parsed).toBeDefined();
      expect(parsed?.token).toBe(token.token);
      expect(parsed?.sessionId).toBe('session-123');
    });

    test('should return null for invalid data', () => {
      const parsed = protocol.parseQRCodeData('invalid-json');
      expect(parsed).toBeNull();
    });

    test('should return null for unknown token', () => {
      const qrData = {
        token: 'unknown-token',
        sessionId: 'session-123',
        expiresAt: Date.now() + 60000,
        checksum: 'invalid',
      };

      const parsed = protocol.parseQRCodeData(JSON.stringify(qrData));
      expect(parsed).toBeNull();
    });
  });

  describe('Token Validation', () => {
    test('should validate active token', () => {
      const token = protocol.generateHandoffToken('session-123', 'device-abc');

      const result = protocol.validateToken(token.token);

      expect(result.valid).toBe(true);
    });

    test('should invalidate unknown token', () => {
      const result = protocol.validateToken('unknown-token');

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Token not found');
    });

    test('should invalidate expired token', () => {
      const token = protocol.generateHandoffToken('session-123', 'device-abc', {
        expiryMinutes: -1,
      });

      const result = protocol.validateToken(token.token);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Token expired');
    });
  });

  describe('Token Revocation', () => {
    test('should revoke token', () => {
      const token = protocol.generateHandoffToken('session-123', 'device-abc');

      const result = protocol.revokeToken(token.token);

      expect(result).toBe(true);
      expect(protocol.validateToken(token.token).valid).toBe(false);
    });

    test('should return false for unknown token', () => {
      const result = protocol.revokeToken('unknown-token');
      expect(result).toBe(false);
    });
  });

  describe('Handoff Request', () => {
    const mockFingerprint: DeviceFingerprint = {
      id: 'target-device',
      userAgent: 'target-agent',
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

    test('should approve valid handoff request', async () => {
      const token = protocol.generateHandoffToken('session-123', 'source-device');

      const response = await protocol.requestHandoff(
        token.token,
        mockFingerprint,
        'source-device'
      );

      expect(response.approved).toBe(true);
      expect(response.sessionId).toBe('session-123');
      expect(response.devices).toHaveLength(1);
    });

    test('should reject unknown token', async () => {
      const response = await protocol.requestHandoff(
        'unknown-token',
        mockFingerprint,
        'source-device'
      );

      expect(response.approved).toBe(false);
      expect(response.message).toBe('Invalid or expired token');
    });

    test('should reject expired token', async () => {
      const token = protocol.generateHandoffToken('session-123', 'source-device', {
        expiryMinutes: -1,
      });

      const response = await protocol.requestHandoff(
        token.token,
        mockFingerprint,
        'source-device'
      );

      expect(response.approved).toBe(false);
      expect(response.message).toBe('Token expired');
    });
  });

  describe('Device Authorization', () => {
    test('should authorize device', () => {
      const auth = protocol.authorizeDevice('device-123', 'session-123', 'admin-device', {
        canRead: true,
        canWrite: true,
        canDelete: false,
        canInvite: true,
      });

      expect(auth).toBeDefined();
      expect(auth.deviceId).toBe('device-123');
      expect(auth.permissions.canRead).toBe(true);
      expect(auth.permissions.canDelete).toBe(false);
    });

    test('should check if device is authorized', () => {
      protocol.authorizeDevice('device-123', 'session-123', 'admin-device', {
        canRead: true,
        canWrite: false,
        canDelete: false,
        canInvite: false,
      });

      expect(protocol.isDeviceAuthorized('device-123')).toBe(true);
      expect(protocol.isDeviceAuthorized('device-456')).toBe(false);
    });

    test('should get device permissions', () => {
      protocol.authorizeDevice('device-123', 'session-123', 'admin-device', {
        canRead: true,
        canWrite: true,
        canDelete: false,
        canInvite: true,
      });

      const perms = protocol.getDevicePermissions('device-123');
      
      expect(perms).toBeDefined();
      expect(perms?.canRead).toBe(true);
      expect(perms?.canWrite).toBe(true);
    });

    test('should revoke device authorization', () => {
      protocol.authorizeDevice('device-123', 'session-123', 'admin-device', {
        canRead: true,
        canWrite: false,
        canDelete: false,
        canInvite: false,
      });

      const result = protocol.revokeDeviceAuthorization('device-123');
      
      expect(result).toBe(true);
      expect(protocol.isDeviceAuthorized('device-123')).toBe(false);
    });
  });

  describe('Event Subscription', () => {
    test('should receive handoff events', () => {
      const listener = jest.fn();
      const unsubscribe = protocol.subscribeToEvents(listener);

      protocol.generateHandoffToken('session-123', 'device-abc');

      expect(listener).toHaveBeenCalled();
      expect(listener.mock.calls[0][0].type).toBe('token-created');

      unsubscribe();
    });
  });

  describe('Cleanup', () => {
    test('should clean up expired tokens', () => {
      const validToken = protocol.generateHandoffToken('session-1', 'device-a');
      const expiredToken = protocol.generateHandoffToken('session-2', 'device-b', {
        expiryMinutes: -1,
      });

      const cleaned = protocol.cleanupExpiredTokens();

      expect(cleaned).toBe(1);
      expect(protocol.validateToken(validToken.token).valid).toBe(true);
      expect(protocol.validateToken(expiredToken.token).valid).toBe(false);
    });
  });
});
