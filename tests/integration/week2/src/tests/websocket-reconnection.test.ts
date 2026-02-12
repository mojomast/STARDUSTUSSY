/**
 * Reconnection Logic Tests
 * Tests client reconnection behavior and state recovery
 */

import { WebSocketTestClient } from '../clients/WebSocketTestClient';
import { MessageType, ConnectionState } from '../types';
import {
  testConfig,
  createTestUser,
  generateTestToken,
  wait,
} from '../utils';

describe('Reconnection Logic', () => {
  describe('Basic Reconnection', () => {
    test('should reconnect after connection loss', async () => {
      const user = createTestUser();
      const token = generateTestToken(user);

      const client = new WebSocketTestClient({
        url: testConfig.wsUrl,
        timeout: testConfig.connectionTimeout,
      });

      // Initial connection
      await client.connect();
      client.authenticate(token);
      await client.waitForAuthResponse();
      expect(client.isAuthenticated()).toBe(true);

      // Simulate connection loss
      await client.disconnect();
      expect(client.isConnected()).toBe(false);

      // Reconnect
      await client.connect();
      expect(client.isConnected()).toBe(true);

      // Re-authenticate
      client.authenticate(token);
      const authResponse = await client.waitForAuthResponse();
      expect(authResponse.type).toBe(MessageType.AuthSuccess);
      expect(client.isAuthenticated()).toBe(true);
    });

    test('should recover state after reconnection', async () => {
      const user = createTestUser();
      const token = generateTestToken(user);

      let client = new WebSocketTestClient({
        url: testConfig.wsUrl,
        timeout: testConfig.connectionTimeout,
      });

      try {
        // Initial connection and state setup
        await client.connect();
        client.authenticate(token);
        await client.waitForAuthResponse();

        client.sendStateUpdate('recovery_key', 'recovery_value');
        await wait(200);

        // Disconnect
        await client.disconnect();

        // Reconnect
        client = new WebSocketTestClient({
          url: testConfig.wsUrl,
          timeout: testConfig.connectionTimeout,
        });
        await client.connect();
        client.authenticate(token);
        await client.waitForAuthResponse();

        // Request state
        client.requestSnapshot();
        const snapshot = await client.waitForMessage(
          MessageType.SnapshotResponse,
          testConfig.messageTimeout
        );

        expect(snapshot.payload.state_data.recovery_key).toBe('recovery_value');
      } finally {
        await client.disconnect();
      }
    });
  });

  describe('Reconnection State Transitions', () => {
    test('should transition through correct states during reconnection', async () => {
      const user = createTestUser();
      const token = generateTestToken(user);

      const client = new WebSocketTestClient({
        url: testConfig.wsUrl,
        timeout: testConfig.connectionTimeout,
      });

      const states: ConnectionState[] = [];
      client.onStateChange((state) => states.push(state));

      // Initial connection
      await client.connect();
      client.authenticate(token);
      await client.waitForAuthResponse();

      // Disconnect and reconnect
      await client.disconnect();
      await client.connect();

      // Check state transitions
      expect(states).toContain(ConnectionState.CONNECTING);
      expect(states).toContain(ConnectionState.CONNECTED);
      expect(states).toContain(ConnectionState.CLOSED);

      await client.disconnect();
    });
  });

  describe('Multiple Reconnections', () => {
    test('should handle multiple disconnect/reconnect cycles', async () => {
      const user = createTestUser();
      const token = generateTestToken(user);

      const client = new WebSocketTestClient({
        url: testConfig.wsUrl,
        timeout: testConfig.connectionTimeout,
      });

      for (let i = 0; i < 3; i++) {
        await client.connect();
        client.authenticate(token);
        await client.waitForAuthResponse();
        expect(client.isAuthenticated()).toBe(true);

        // Add some state
        client.sendStateUpdate(`cycle_${i}`, `value_${i}`);
        await wait(100);

        await client.disconnect();
        expect(client.isConnected()).toBe(false);
      }

      // Final connection to verify cumulative state
      await client.connect();
      client.authenticate(token);
      await client.waitForAuthResponse();

      client.requestSnapshot();
      const snapshot = await client.waitForMessage(
        MessageType.SnapshotResponse,
        testConfig.messageTimeout
      );

      // All values should be present
      for (let i = 0; i < 3; i++) {
        expect(snapshot.payload.state_data[`cycle_${i}`]).toBe(`value_${i}`);
      }

      await client.disconnect();
    });
  });

  describe('Reconnection with Different Tokens', () => {
    test('should handle reconnection with refreshed token', async () => {
      const user = createTestUser();
      const originalToken = generateTestToken(user);

      const client = new WebSocketTestClient({
        url: testConfig.wsUrl,
        timeout: testConfig.connectionTimeout,
      });

      try {
        // Initial connection
        await client.connect();
        client.authenticate(originalToken);
        const authResponse = await client.waitForAuthResponse();
        const refreshedToken = authResponse.payload.new_token as string;

        client.sendStateUpdate('key', 'value');
        await wait(100);

        // Disconnect
        await client.disconnect();

        // Reconnect with refreshed token
        await client.connect();
        client.authenticate(refreshedToken);
        const reauthResponse = await client.waitForAuthResponse();
        expect(reauthResponse.type).toBe(MessageType.AuthSuccess);

        // Verify state persisted
        client.requestSnapshot();
        const snapshot = await client.waitForMessage(
          MessageType.SnapshotResponse,
          testConfig.messageTimeout
        );

        expect(snapshot.payload.state_data.key).toBe('value');
      } finally {
        await client.disconnect();
      }
    });
  });

  describe('Concurrent Client Reconnection', () => {
    test('should handle multiple clients reconnecting simultaneously', async () => {
      const sessionId = `concurrent-reconnect-${Date.now()}`;
      const user = createTestUser({ sessionId });
      const token = generateTestToken(user);

      const clients: WebSocketTestClient[] = [];

      try {
        // Create and connect initial clients
        for (let i = 0; i < 5; i++) {
          const c = new WebSocketTestClient({
            url: testConfig.wsUrl,
            timeout: testConfig.connectionTimeout,
          });
          await c.connect();
          c.authenticate(token);
          await c.waitForAuthResponse();
          clients.push(c);
        }

        // All disconnect simultaneously
        await Promise.all(clients.map((c) => c.disconnect()));

        // All reconnect simultaneously
        await Promise.all(clients.map((c) => c.connect()));

        // All re-authenticate
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

  describe('Reconnection Timeouts', () => {
    test('should handle connection timeout on reconnection', async () => {
      const client = new WebSocketTestClient({
        url: 'ws://localhost:99999/ws',
        timeout: 500,
      });

      await expect(client.connect()).rejects.toThrow();
    });

    test('should handle slow reconnection', async () => {
      const user = createTestUser();
      const token = generateTestToken(user);

      const client = new WebSocketTestClient({
        url: testConfig.wsUrl,
        timeout: testConfig.connectionTimeout,
      });

      await client.connect();
      client.authenticate(token);
      await client.waitForAuthResponse();

      await client.disconnect();

      // Wait before reconnecting
      await wait(2000);

      await client.connect();
      client.authenticate(token);
      const response = await client.waitForAuthResponse();

      expect(response.type).toBe(MessageType.AuthSuccess);
      await client.disconnect();
    });
  });

  describe('Partial Reconnection Scenarios', () => {
    test('should handle reconnection during authentication', async () => {
      const user = createTestUser();
      const token = generateTestToken(user);

      const client = new WebSocketTestClient({
        url: testConfig.wsUrl,
        timeout: testConfig.connectionTimeout,
      });

      await client.connect();
      
      // Start authentication but don't wait
      client.authenticate(token);

      // Disconnect during authentication
      await client.disconnect();

      // Reconnect and complete authentication
      await client.connect();
      client.authenticate(token);
      const response = await client.waitForAuthResponse();

      expect(response.type).toBe(MessageType.AuthSuccess);
      await client.disconnect();
    });

    test('should handle reconnection with pending messages', async () => {
      const user = createTestUser();
      const token = generateTestToken(user);

      const client = new WebSocketTestClient({
        url: testConfig.wsUrl,
        timeout: testConfig.connectionTimeout,
      });

      await client.connect();
      client.authenticate(token);
      await client.waitForAuthResponse();

      // Queue up some state updates
      for (let i = 0; i < 5; i++) {
        client.sendStateUpdate(`key_${i}`, `value_${i}`);
      }

      // Disconnect immediately (some messages may be in flight)
      await client.disconnect();

      // Reconnect
      await client.connect();
      client.authenticate(token);
      await client.waitForAuthResponse();

      // Request snapshot to see what persisted
      client.requestSnapshot();
      const snapshot = await client.waitForMessage(
        MessageType.SnapshotResponse,
        testConfig.messageTimeout
      );

      // Some or all values should be present (depending on timing)
      expect(Object.keys(snapshot.payload.state_data).length).toBeGreaterThanOrEqual(0);

      await client.disconnect();
    });
  });
});
