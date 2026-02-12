/**
 * WebSocket Connection Handshake Tests
 * Tests the WebSocket connection establishment and basic lifecycle
 */

import { WebSocketTestClient } from '../clients/WebSocketTestClient';
import { ConnectionState, MessageType } from '../types';
import { testConfig, wait } from '../utils';

describe('WebSocket Connection Handshake', () => {
  let client: WebSocketTestClient;

  afterEach(async () => {
    if (client) {
      await client.disconnect();
    }
  });

  describe('Connection Establishment', () => {
    test('should connect to WebSocket server successfully', async () => {
      client = new WebSocketTestClient({
        url: testConfig.wsUrl,
        timeout: testConfig.connectionTimeout,
      });

      await client.connect();

      expect(client.isConnected()).toBe(true);
      expect(client.getState()).toBe(ConnectionState.CONNECTED);
    });

    test('should timeout on connection failure', async () => {
      client = new WebSocketTestClient({
        url: 'ws://localhost:99999/ws', // Invalid port
        timeout: 1000,
      });

      await expect(client.connect()).rejects.toThrow();
    });

    test('should transition through correct states', async () => {
      const states: ConnectionState[] = [];
      
      client = new WebSocketTestClient({
        url: testConfig.wsUrl,
        timeout: testConfig.connectionTimeout,
      });

      client.onStateChange((state) => {
        states.push(state);
      });

      await client.connect();

      expect(states).toContain(ConnectionState.CONNECTING);
      expect(states).toContain(ConnectionState.CONNECTED);
    });
  });

  describe('Disconnection', () => {
    test('should disconnect cleanly', async () => {
      client = new WebSocketTestClient({
        url: testConfig.wsUrl,
        timeout: testConfig.connectionTimeout,
      });

      await client.connect();
      expect(client.isConnected()).toBe(true);

      await client.disconnect();
      expect(client.isConnected()).toBe(false);
      expect(client.getState()).toBe(ConnectionState.CLOSED);
    });

    test('should handle multiple disconnect calls gracefully', async () => {
      client = new WebSocketTestClient({
        url: testConfig.wsUrl,
        timeout: testConfig.connectionTimeout,
      });

      await client.connect();
      await client.disconnect();
      await client.disconnect(); // Should not throw
      
      expect(client.isConnected()).toBe(false);
    });
  });

  describe('Multiple Connections', () => {
    test('should handle multiple concurrent connections', async () => {
      const clients: WebSocketTestClient[] = [];
      
      try {
        for (let i = 0; i < 5; i++) {
          const c = new WebSocketTestClient({
            url: testConfig.wsUrl,
            timeout: testConfig.connectionTimeout,
          });
          clients.push(c);
        }

        await Promise.all(clients.map((c) => c.connect()));

        clients.forEach((c) => {
          expect(c.isConnected()).toBe(true);
        });
      } finally {
        await Promise.all(clients.map((c) => c.disconnect()));
      }
    });
  });

  describe('Connection Resilience', () => {
    test('should handle rapid connect/disconnect cycles', async () => {
      client = new WebSocketTestClient({
        url: testConfig.wsUrl,
        timeout: testConfig.connectionTimeout,
      });

      for (let i = 0; i < 3; i++) {
        await client.connect();
        expect(client.isConnected()).toBe(true);
        await client.disconnect();
        expect(client.isConnected()).toBe(false);
      }
    });
  });
});
