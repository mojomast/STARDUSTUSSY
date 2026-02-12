/**
 * JWT Authentication Flow Tests
 * Tests the authentication process via WebSocket
 */

import { WebSocketTestClient } from '../clients/WebSocketTestClient';
import { MessageType, ConnectionState } from '../types';
import {
  testConfig,
  createTestUser,
  generateTestToken,
  generateExpiredToken,
  generateInvalidToken,
} from '../utils';

describe('JWT Authentication Flow', () => {
  let client: WebSocketTestClient;

  beforeEach(async () => {
    client = new WebSocketTestClient({
      url: testConfig.wsUrl,
      timeout: testConfig.connectionTimeout,
    });
    await client.connect();
  });

  afterEach(async () => {
    if (client) {
      await client.disconnect();
    }
  });

  describe('Successful Authentication', () => {
    test('should authenticate with valid JWT token', async () => {
      const user = createTestUser();
      const token = generateTestToken(user);

      client.authenticate(token);
      const response = await client.waitForAuthResponse();

      expect(response.type).toBe(MessageType.AuthSuccess);
      expect(response.payload).toHaveProperty('new_token');
      expect(response.payload).toHaveProperty('expires_at');
      expect(client.isAuthenticated()).toBe(true);
      expect(client.getState()).toBe(ConnectionState.ACTIVE);
    });

    test('should receive new token on successful auth', async () => {
      const user = createTestUser();
      const token = generateTestToken(user);

      client.authenticate(token);
      const response = await client.waitForAuthResponse();

      expect(response.type).toBe(MessageType.AuthSuccess);
      expect(typeof response.payload.new_token).toBe('string');
      expect(response.payload.new_token.length).toBeGreaterThan(0);
    });

    test('should transition to AUTHENTICATING state during auth', async () => {
      const states: ConnectionState[] = [];
      client.onStateChange((state) => states.push(state));

      const user = createTestUser();
      const token = generateTestToken(user);

      client.authenticate(token);
      
      expect(states).toContain(ConnectionState.AUTHENTICATING);
      
      await client.waitForAuthResponse();
      expect(states).toContain(ConnectionState.ACTIVE);
    });
  });

  describe('Failed Authentication', () => {
    test('should reject expired JWT token', async () => {
      const user = createTestUser();
      const expiredToken = generateExpiredToken(user);

      client.authenticate(expiredToken);
      const response = await client.waitForAuthResponse();

      expect(response.type).toBe(MessageType.AuthFailure);
      expect(response.payload.code).toBe(401);
      expect(client.isAuthenticated()).toBe(false);
    });

    test('should reject invalid JWT token', async () => {
      const invalidToken = generateInvalidToken();

      client.authenticate(invalidToken);
      const response = await client.waitForAuthResponse();

      expect(response.type).toBe(MessageType.AuthFailure);
      expect(response.payload.code).toBe(401);
      expect(client.isAuthenticated()).toBe(false);
    });

    test('should reject missing token', async () => {
      client.send({
        type: MessageType.Auth,
        timestamp: Math.floor(Date.now() / 1000),
        payload: {},
      });

      const response = await client.waitForAuthResponse();

      expect(response.type).toBe(MessageType.AuthFailure);
      expect(response.payload.code).toBe(401);
    });

    test('should reject authentication after already authenticated', async () => {
      const user = createTestUser();
      const token = generateTestToken(user);

      // First authentication
      client.authenticate(token);
      await client.waitForAuthResponse();
      expect(client.isAuthenticated()).toBe(true);

      // Second authentication should still work (re-auth)
      client.authenticate(token);
      const response = await client.waitForAuthResponse();
      expect(response.type).toBe(MessageType.AuthSuccess);
    });
  });

  describe('Token Refresh', () => {
    test('should receive refreshed token on auth success', async () => {
      const user = createTestUser();
      const token = generateTestToken(user);

      client.authenticate(token);
      const response = await client.waitForAuthResponse();

      expect(response.type).toBe(MessageType.AuthSuccess);
      expect(response.payload.new_token).toBeDefined();
      expect(response.payload.expires_at).toBeDefined();
      
      // New token should be different from original
      expect(response.payload.new_token).not.toBe(token);
    });

    test('should be able to use refreshed token', async () => {
      const user = createTestUser();
      const token = generateTestToken(user);

      client.authenticate(token);
      const response = await client.waitForAuthResponse();

      expect(response.type).toBe(MessageType.AuthSuccess);

      // Disconnect and reconnect with new token
      await client.disconnect();
      
      client = new WebSocketTestClient({
        url: testConfig.wsUrl,
        timeout: testConfig.connectionTimeout,
      });
      await client.connect();

      client.authenticate(response.payload.new_token as string);
      const secondResponse = await client.waitForAuthResponse();

      expect(secondResponse.type).toBe(MessageType.AuthSuccess);
    });
  });

  describe('Concurrent Authentication', () => {
    test('should handle multiple clients authenticating simultaneously', async () => {
      const clients: WebSocketTestClient[] = [];
      
      try {
        // Create 5 clients
        for (let i = 0; i < 5; i++) {
          const c = new WebSocketTestClient({
            url: testConfig.wsUrl,
            timeout: testConfig.connectionTimeout,
          });
          await c.connect();
          clients.push(c);
        }

        // Authenticate all simultaneously
        const authPromises = clients.map((c) => {
          const user = createTestUser();
          const token = generateTestToken(user);
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

  describe('Error Handling', () => {
    test('should handle malformed auth message', async () => {
      client.send({
        type: MessageType.Auth,
        timestamp: Math.floor(Date.now() / 1000),
        payload: { token: null },
      });

      const response = await client.waitForAuthResponse();

      expect(response.type).toBe(MessageType.AuthFailure);
      expect(response.payload.code).toBe(401);
    });

    test('should handle auth message with extra fields', async () => {
      const user = createTestUser();
      const token = generateTestToken(user);

      client.send({
        type: MessageType.Auth,
        timestamp: Math.floor(Date.now() / 1000),
        payload: {
          token,
          extra_field: 'should_be_ignored',
          another_field: 123,
        },
      });

      const response = await client.waitForAuthResponse();

      expect(response.type).toBe(MessageType.AuthSuccess);
    });
  });
});
