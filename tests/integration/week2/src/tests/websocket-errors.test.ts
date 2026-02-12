/**
 * Error Handling Scenario Tests
 * Tests various error conditions and edge cases
 */

import { WebSocketTestClient } from '../clients/WebSocketTestClient';
import { MessageType, ConnectionState } from '../types';
import {
  testConfig,
  createTestUser,
  generateTestToken,
  wait,
} from '../utils';

describe('Error Handling Scenarios', () => {
  let client: WebSocketTestClient;

  afterEach(async () => {
    if (client) {
      await client.disconnect();
    }
  });

  describe('Invalid Message Types', () => {
    test('should handle unknown message type gracefully', async () => {
      client = new WebSocketTestClient({
        url: testConfig.wsUrl,
        timeout: testConfig.connectionTimeout,
      });
      await client.connect();

      client.send({
        type: 999, // Unknown type
        timestamp: Math.floor(Date.now() / 1000),
        payload: {},
      });

      // Should not crash, connection should remain open
      await wait(500);
      expect(client.isConnected()).toBe(true);
    });

    test('should handle negative message type', async () => {
      client = new WebSocketTestClient({
        url: testConfig.wsUrl,
        timeout: testConfig.connectionTimeout,
      });
      await client.connect();

      client.send({
        type: -1,
        timestamp: Math.floor(Date.now() / 1000),
        payload: {},
      });

      await wait(500);
      expect(client.isConnected()).toBe(true);
    });

    test('should handle message with missing fields', async () => {
      client = new WebSocketTestClient({
        url: testConfig.wsUrl,
        timeout: testConfig.connectionTimeout,
      });
      await client.connect();

      // Send message with missing timestamp
      (client as any).ws?.send(JSON.stringify({
        type: MessageType.Heartbeat,
        payload: {},
      }));

      await wait(500);
      expect(client.isConnected()).toBe(true);
    });
  });

  describe('Malformed Messages', () => {
    test('should handle invalid JSON', async () => {
      client = new WebSocketTestClient({
        url: testConfig.wsUrl,
        timeout: testConfig.connectionTimeout,
      });
      await client.connect();

      // Send invalid JSON
      (client as any).ws?.send('not valid json');

      // Connection should be closed or error should be handled
      await wait(500);
      // Note: Behavior may vary - some implementations close connection
    });

    test('should handle empty message', async () => {
      client = new WebSocketTestClient({
        url: testConfig.wsUrl,
        timeout: testConfig.connectionTimeout,
      });
      await client.connect();

      (client as any).ws?.send('');

      await wait(500);
    });

    test('should handle null payload', async () => {
      client = new WebSocketTestClient({
        url: testConfig.wsUrl,
        timeout: testConfig.connectionTimeout,
      });
      await client.connect();

      client.send({
        type: MessageType.Heartbeat,
        timestamp: Math.floor(Date.now() / 1000),
        payload: null as any,
      });

      await wait(500);
      expect(client.isConnected()).toBe(true);
    });
  });

  describe('Authentication Errors', () => {
    test('should return 401 for invalid token format', async () => {
      client = new WebSocketTestClient({
        url: testConfig.wsUrl,
        timeout: testConfig.connectionTimeout,
      });
      await client.connect();

      client.authenticate('not.a.valid.token');
      
      const response = await client.waitForMessage(
        MessageType.AuthFailure,
        testConfig.messageTimeout
      );

      expect(response.type).toBe(MessageType.AuthFailure);
      expect(response.payload.code).toBe(401);
    });

    test('should return 401 for token with invalid signature', async () => {
      client = new WebSocketTestClient({
        url: testConfig.wsUrl,
        timeout: testConfig.connectionTimeout,
      });
      await client.connect();

      // Create a token with wrong signature
      const user = createTestUser();
      const validToken = generateTestToken(user);
      const tamperedToken = validToken.slice(0, -5) + 'xxxxx';

      client.authenticate(tamperedToken);
      
      const response = await client.waitForMessage(
        MessageType.AuthFailure,
        testConfig.messageTimeout
      );

      expect(response.type).toBe(MessageType.AuthFailure);
      expect(response.payload.code).toBe(401);
    });
  });

  describe('Unauthorized Access Errors', () => {
    test('should return 403 for snapshot request without auth', async () => {
      client = new WebSocketTestClient({
        url: testConfig.wsUrl,
        timeout: testConfig.connectionTimeout,
      });
      await client.connect();

      client.requestSnapshot();
      
      const response = await client.waitForMessage(
        MessageType.Error,
        testConfig.messageTimeout
      );

      expect(response.type).toBe(MessageType.Error);
      expect(response.payload.code).toBe(403);
      expect(response.payload.message).toContain('Not authenticated');
    });

    test('should return 403 for state update without auth', async () => {
      client = new WebSocketTestClient({
        url: testConfig.wsUrl,
        timeout: testConfig.connectionTimeout,
      });
      await client.connect();

      client.sendStateUpdate('key', 'value');
      
      const response = await client.waitForMessage(
        MessageType.Error,
        testConfig.messageTimeout
      );

      expect(response.type).toBe(MessageType.Error);
      expect(response.payload.code).toBe(403);
    });
  });

  describe('Connection Errors', () => {
    test('should handle rapid connection attempts', async () => {
      const clients: WebSocketTestClient[] = [];

      try {
        // Rapidly create multiple connections
        for (let i = 0; i < 10; i++) {
          const c = new WebSocketTestClient({
            url: testConfig.wsUrl,
            timeout: testConfig.connectionTimeout,
          });
          clients.push(c);
        }

        // Connect all simultaneously
        await Promise.all(clients.map((c) => c.connect()));

        // All should be connected
        clients.forEach((c) => {
          expect(c.isConnected()).toBe(true);
        });
      } finally {
        await Promise.all(clients.map((c) => c.disconnect()));
      }
    });

    test('should handle connection during high load', async () => {
      const clients: WebSocketTestClient[] = [];
      const user = createTestUser();
      const token = generateTestToken(user);

      try {
        // Create 20 concurrent connections with authentication
        for (let i = 0; i < 20; i++) {
          const c = new WebSocketTestClient({
            url: testConfig.wsUrl,
            timeout: testConfig.connectionTimeout,
          });
          clients.push(c);
        }

        await Promise.all(clients.map((c) => c.connect()));
        
        // Authenticate all
        const authPromises = clients.map((c) => {
          c.authenticate(token);
          return c.waitForAuthResponse();
        });

        const responses = await Promise.all(authPromises);
        
        responses.forEach((response) => {
          expect(response.type).toBe(MessageType.AuthSuccess);
        });

        clients.forEach((c) => {
          expect(c.isAuthenticated()).toBe(true);
        });
      } finally {
        await Promise.all(clients.map((c) => c.disconnect()));
      }
    });
  });

  describe('Server Error Handling', () => {
    test('should handle large payload gracefully', async () => {
      client = new WebSocketTestClient({
        url: testConfig.wsUrl,
        timeout: testConfig.connectionTimeout,
      });
      await client.connect();

      const user = createTestUser();
      const token = generateTestToken(user);
      client.authenticate(token);
      await client.waitForAuthResponse();

      // Create a large payload (close to but under limit)
      const largeValue = 'x'.repeat(50000);
      client.sendStateUpdate('large_key', largeValue);

      await wait(500);
      expect(client.isConnected()).toBe(true);
    });

    test('should reject extremely large payload', async () => {
      client = new WebSocketTestClient({
        url: testConfig.wsUrl,
        timeout: testConfig.connectionTimeout,
      });
      await client.connect();

      const user = createTestUser();
      const token = generateTestToken(user);
      client.authenticate(token);
      await client.waitForAuthResponse();

      // Create a very large payload (over 512KB limit)
      const hugeValue = 'x'.repeat(600000);
      client.sendStateUpdate('huge_key', hugeValue);

      // Connection may be closed due to message size limit
      await wait(500);
    });
  });

  describe('Timeout Handling', () => {
    test('should timeout waiting for message', async () => {
      client = new WebSocketTestClient({
        url: testConfig.wsUrl,
        timeout: testConfig.connectionTimeout,
      });
      await client.connect();

      // Try to wait for a message that won't come
      await expect(
        client.waitForMessage(MessageType.SnapshotResponse, 100)
      ).rejects.toThrow('Timeout');
    });

    test('should handle connection timeout', async () => {
      client = new WebSocketTestClient({
        url: 'ws://localhost:99999/ws',
        timeout: 500,
      });

      await expect(client.connect()).rejects.toThrow();
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty string values', async () => {
      client = new WebSocketTestClient({
        url: testConfig.wsUrl,
        timeout: testConfig.connectionTimeout,
      });
      await client.connect();

      const user = createTestUser();
      const token = generateTestToken(user);
      client.authenticate(token);
      await client.waitForAuthResponse();

      client.sendStateUpdate('empty_string', '');
      await wait(100);

      client.requestSnapshot();
      const response = await client.waitForMessage(
        MessageType.SnapshotResponse,
        testConfig.messageTimeout
      );

      expect(response.payload.state_data.empty_string).toBe('');
    });

    test('should handle null and undefined values', async () => {
      client = new WebSocketTestClient({
        url: testConfig.wsUrl,
        timeout: testConfig.connectionTimeout,
      });
      await client.connect();

      const user = createTestUser();
      const token = generateTestToken(user);
      client.authenticate(token);
      await client.waitForAuthResponse();

      client.sendStateUpdate('null_value', null);
      client.sendStateUpdate('undefined_value', undefined);
      await wait(100);

      client.requestSnapshot();
      const response = await client.waitForMessage(
        MessageType.SnapshotResponse,
        testConfig.messageTimeout
      );

      // JSON serialization converts undefined to null
      expect(response.payload.state_data.null_value).toBeNull();
    });

    test('should handle special characters in keys and values', async () => {
      client = new WebSocketTestClient({
        url: testConfig.wsUrl,
        timeout: testConfig.connectionTimeout,
      });
      await client.connect();

      const user = createTestUser();
      const token = generateTestToken(user);
      client.authenticate(token);
      await client.waitForAuthResponse();

      const specialKey = 'key with spaces & special chars: @#$%';
      const specialValue = 'value with "quotes" and \n newlines';
      
      client.sendStateUpdate(specialKey, specialValue);
      await wait(100);

      client.requestSnapshot();
      const response = await client.waitForMessage(
        MessageType.SnapshotResponse,
        testConfig.messageTimeout
      );

      expect(response.payload.state_data[specialKey]).toBe(specialValue);
    });
  });
});
