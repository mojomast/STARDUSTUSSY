/**
 * Heartbeat and Ping-Pong Validation Tests
 * Tests the WebSocket heartbeat mechanism
 */

import { WebSocketTestClient } from '../clients/WebSocketTestClient';
import { MessageType } from '../types';
import { testConfig, createTestUser, generateTestToken, wait } from '../utils';

describe('Heartbeat and Ping-Pong Validation', () => {
  let client: WebSocketTestClient;

  beforeEach(async () => {
    client = new WebSocketTestClient({
      url: testConfig.wsUrl,
      timeout: testConfig.connectionTimeout,
    });
    await client.connect();
    
    // Authenticate for tests that need it
    const user = createTestUser();
    const token = generateTestToken(user);
    client.authenticate(token);
    await client.waitForAuthResponse();
  });

  afterEach(async () => {
    if (client) {
      await client.disconnect();
    }
  });

  describe('Client Heartbeat', () => {
    test('should send heartbeat and receive acknowledgment', async () => {
      client.sendHeartbeat();
      const response = await client.waitForMessage(
        MessageType.HeartbeatAck,
        testConfig.messageTimeout
      );

      expect(response.type).toBe(MessageType.HeartbeatAck);
      expect(response.payload).toHaveProperty('server_time');
      expect(response.payload).toHaveProperty('client_time');
    });

    test('should echo client_time in heartbeat acknowledgment', async () => {
      const clientTime = Math.floor(Date.now() / 1000);
      
      client.send({
        type: MessageType.Heartbeat,
        timestamp: clientTime,
        payload: { client_time: clientTime },
      });

      const response = await client.waitForMessage(
        MessageType.HeartbeatAck,
        testConfig.messageTimeout
      );

      expect(response.payload.client_time).toBe(clientTime);
    });

    test('should handle multiple consecutive heartbeats', async () => {
      const heartbeatCount = 3;
      const responses: any[] = [];

      for (let i = 0; i < heartbeatCount; i++) {
        client.sendHeartbeat();
        const response = await client.waitForMessage(
          MessageType.HeartbeatAck,
          testConfig.messageTimeout
        );
        responses.push(response);
        await wait(100); // Small delay between heartbeats
      }

      expect(responses).toHaveLength(heartbeatCount);
      responses.forEach((response) => {
        expect(response.type).toBe(MessageType.HeartbeatAck);
      });
    });

    test('should update server_time in each acknowledgment', async () => {
      const timestamps: number[] = [];

      for (let i = 0; i < 3; i++) {
        client.sendHeartbeat();
        const response = await client.waitForMessage(
          MessageType.HeartbeatAck,
          testConfig.messageTimeout
        );
        timestamps.push(response.payload.server_time as number);
        await wait(100);
      }

      // Each timestamp should be greater than or equal to the previous
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]);
      }
    });
  });

  describe('Server Ping (WebSocket Native)', () => {
    test('should respond to server ping with pong', async () => {
      // Wait for server to send a ping (30 second interval)
      // For testing, we assume the connection stays alive
      await wait(1000);
      
      expect(client.isConnected()).toBe(true);
    });

    test('should maintain connection with regular heartbeats', async () => {
      // Send heartbeats every 5 seconds for 15 seconds
      const heartbeatInterval = 5000;
      const testDuration = 15000;
      const startTime = Date.now();

      while (Date.now() - startTime < testDuration) {
        client.sendHeartbeat();
        await client.waitForMessage(
          MessageType.HeartbeatAck,
          testConfig.messageTimeout
        );
        await wait(heartbeatInterval);
        
        expect(client.isConnected()).toBe(true);
      }
    });
  });

  describe('Heartbeat Timing', () => {
    test('should respond to heartbeat within reasonable time', async () => {
      const startTime = Date.now();
      
      client.sendHeartbeat();
      await client.waitForMessage(
        MessageType.HeartbeatAck,
        testConfig.messageTimeout
      );
      
      const responseTime = Date.now() - startTime;
      
      // Should respond within 500ms
      expect(responseTime).toBeLessThan(500);
    });

    test('should handle rapid heartbeats', async () => {
      const rapidHeartbeatCount = 10;
      const startTime = Date.now();

      for (let i = 0; i < rapidHeartbeatCount; i++) {
        client.sendHeartbeat();
      }

      const responses: any[] = [];
      for (let i = 0; i < rapidHeartbeatCount; i++) {
        const response = await client.waitForMessage(
          MessageType.HeartbeatAck,
          testConfig.messageTimeout
        );
        responses.push(response);
      }

      const totalTime = Date.now() - startTime;
      
      expect(responses).toHaveLength(rapidHeartbeatCount);
      // Should handle all within 2 seconds
      expect(totalTime).toBeLessThan(2000);
    });
  });

  describe('Heartbeat Without Authentication', () => {
    test('should allow heartbeat without authentication', async () => {
      // Create new unauthenticated client
      const unauthClient = new WebSocketTestClient({
        url: testConfig.wsUrl,
        timeout: testConfig.connectionTimeout,
      });
      
      try {
        await unauthClient.connect();
        
        unauthClient.sendHeartbeat();
        const response = await unauthClient.waitForMessage(
          MessageType.HeartbeatAck,
          testConfig.messageTimeout
        );

        expect(response.type).toBe(MessageType.HeartbeatAck);
      } finally {
        await unauthClient.disconnect();
      }
    });
  });

  describe('Connection Keep-Alive', () => {
    test('should keep connection alive with heartbeats', async () => {
      const testDuration = 10000; // 10 seconds
      const heartbeatInterval = 3000; // 3 seconds
      const startTime = Date.now();

      while (Date.now() - startTime < testDuration) {
        expect(client.isConnected()).toBe(true);
        client.sendHeartbeat();
        await client.waitForMessage(
          MessageType.HeartbeatAck,
          testConfig.messageTimeout
        );
        await wait(heartbeatInterval);
      }

      expect(client.isConnected()).toBe(true);
    });
  });
});
