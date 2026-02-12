import { ServiceClient } from '../utils/serviceClient';
import { TestDataManager } from '../utils/testDataManager';
import { v4 as uuidv4 } from 'uuid';
import WebSocket from 'ws';

describe('WebSocket Integration Tests', () => {
  let client: ServiceClient;
  let testData: TestDataManager;
  const jwtSecret = 'harmony-flow-secret-key';

  beforeAll(async () => {
    client = new ServiceClient({
      baseURL: process.env.API_BASE_URL || 'http://localhost:8080',
      wsURL: process.env.WS_URL || 'ws://localhost:8080/ws',
    });
    testData = new TestDataManager();

    // Verify service health
    const health = await client.healthCheck();
    expect(health.healthy).toBe(true);
  });

  afterAll(async () => {
    await client.close();
    await testData.cleanup();
  });

  describe('WebSocket Handshake and Authentication', () => {
    test('should establish WebSocket connection', async () => {
      const ws = await client.createWebSocketConnection();
      
      expect(ws.readyState).toBe(WebSocket.OPEN);
      
      client.closeWebSocket(ws.url);
    });

    test('should authenticate successfully with valid JWT', async () => {
      const userId = uuidv4();
      const sessionId = uuidv4();
      const deviceId = uuidv4();
      
      const token = client.generateJWTToken(userId, sessionId, deviceId, jwtSecret);
      
      const ws = await client.createWebSocketConnection();
      const authResponse = await client.authenticateWebSocket(ws, token);
      
      expect(authResponse.type).toBe(8); // AuthSuccess
      expect(authResponse.payload).toHaveProperty('new_token');
      expect(authResponse.payload).toHaveProperty('expires_at');
      
      client.closeWebSocket(ws.url);
    });

    test('should reject authentication with invalid JWT', async () => {
      const ws = await client.createWebSocketConnection();
      
      await expect(
        client.authenticateWebSocket(ws, 'invalid-token')
      ).rejects.toThrow('Authentication failed');
      
      client.closeWebSocket(ws.url);
    });

    test('should reject authentication with expired JWT', async () => {
      const userId = uuidv4();
      const sessionId = uuidv4();
      const deviceId = uuidv4();
      
      // Create expired token
      const expiredToken = require('jsonwebtoken').sign(
        {
          user_id: userId,
          session_id: sessionId,
          device_id: deviceId,
          exp: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
        },
        jwtSecret
      );
      
      const ws = await client.createWebSocketConnection();
      
      await expect(
        client.authenticateWebSocket(ws, expiredToken)
      ).rejects.toThrow();
      
      client.closeWebSocket(ws.url);
    });
  });

  describe('State Synchronization Flow', () => {
    test('should synchronize state updates across connections', async () => {
      const userId = uuidv4();
      const sessionId = uuidv4();
      const deviceId1 = uuidv4();
      const deviceId2 = uuidv4();
      
      // Create test snapshot
      await testData.createTestSnapshot({
        sessionId,
        userId,
        stateData: { counter: 0 },
      });

      // Create two connections for same user/session
      const token1 = client.generateJWTToken(userId, sessionId, deviceId1, jwtSecret);
      const token2 = client.generateJWTToken(userId, sessionId, deviceId2, jwtSecret);
      
      const ws1 = await client.createWebSocketConnection('device1');
      const ws2 = await client.createWebSocketConnection('device2');
      
      await client.authenticateWebSocket(ws1, token1);
      await client.authenticateWebSocket(ws2, token2);

      // Send state update from first device
      await client.sendWebSocketMessage(ws1, {
        type: 5, // StateUpdate
        session_id: sessionId,
        user_id: userId,
        payload: { key: 'counter', value: 1 },
        timestamp: Date.now(),
      });

      // Verify second device receives the update
      const receivedMessage = await client.waitForMessage(ws2, 5, 5000);
      expect(receivedMessage.payload).toEqual({ key: 'counter', value: 1 });

      client.closeWebSocket('device1');
      client.closeWebSocket('device2');
    });

    test('should retrieve snapshot after authentication', async () => {
      const userId = uuidv4();
      const sessionId = uuidv4();
      const deviceId = uuidv4();
      
      // Create test snapshot
      await testData.createTestSnapshot({
        sessionId,
        userId,
        stateData: { theme: 'dark', language: 'en' },
      });

      const token = client.generateJWTToken(userId, sessionId, deviceId, jwtSecret);
      const ws = await client.createWebSocketConnection();
      
      const authResponse = await client.authenticateWebSocket(ws, token);
      
      // After auth, snapshot should be sent if exists
      expect(authResponse.type).toBe(8);
      
      client.closeWebSocket(ws.url);
    });

    test('should request and receive snapshot', async () => {
      const userId = uuidv4();
      const sessionId = uuidv4();
      const deviceId = uuidv4();
      
      await testData.createTestSnapshot({
        sessionId,
        userId,
        stateData: { settings: { notifications: true } },
      });

      const token = client.generateJWTToken(userId, sessionId, deviceId, jwtSecret);
      const ws = await client.createWebSocketConnection();
      
      await client.authenticateWebSocket(ws, token);
      
      // Request snapshot
      await client.sendWebSocketMessage(ws, {
        type: 3, // SnapshotRequest
        session_id: sessionId,
        user_id: userId,
        timestamp: Date.now(),
      });

      // Wait for snapshot response
      const response = await client.waitForMessage(ws, 4, 5000);
      expect(response.type).toBe(4); // SnapshotResponse
      expect(response.payload).toHaveProperty('session_id', sessionId);
      expect(response.payload).toHaveProperty('state_data');

      client.closeWebSocket(ws.url);
    });
  });

  describe('Reconnection with Backoff', () => {
    test('should handle reconnection with session restoration', async () => {
      const userId = uuidv4();
      const sessionId = uuidv4();
      const deviceId = uuidv4();
      
      await testData.createTestSnapshot({
        sessionId,
        userId,
        stateData: { step: 1 },
      });

      const token = client.generateJWTToken(userId, sessionId, deviceId, jwtSecret);
      
      // First connection
      const ws1 = await client.createWebSocketConnection('conn1');
      await client.authenticateWebSocket(ws1, token);
      
      // Simulate disconnect
      client.closeWebSocket('conn1');
      
      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Reconnect
      const ws2 = await client.createWebSocketConnection('conn2');
      const authResponse = await client.authenticateWebSocket(ws2, token);
      
      expect(authResponse.type).toBe(8);
      
      client.closeWebSocket('conn2');
    });

    test('should maintain session state after reconnection', async () => {
      const userId = uuidv4();
      const sessionId = uuidv4();
      const deviceId = uuidv4();
      
      await testData.createTestSnapshot({
        sessionId,
        userId,
        stateData: { count: 5 },
      });

      const token = client.generateJWTToken(userId, sessionId, deviceId, jwtSecret);
      
      // First connection and state update
      const ws1 = await client.createWebSocketConnection('conn1');
      await client.authenticateWebSocket(ws1, token);
      
      await client.sendWebSocketMessage(ws1, {
        type: 5,
        session_id: sessionId,
        user_id: userId,
        payload: { key: 'count', value: 10 },
        timestamp: Date.now(),
      });

      client.closeWebSocket('conn1');
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Reconnect and verify state
      const ws2 = await client.createWebSocketConnection('conn2');
      await client.authenticateWebSocket(ws2, token);
      
      await client.sendWebSocketMessage(ws2, {
        type: 3,
        session_id: sessionId,
        user_id: userId,
        timestamp: Date.now(),
      });

      const response = await client.waitForMessage(ws2, 4, 5000);
      expect(response.payload.state_data).toHaveProperty('count');
      
      client.closeWebSocket('conn2');
    });
  });

  describe('Multi-Device Session Handling', () => {
    test('should handle multiple devices for same user', async () => {
      const userId = uuidv4();
      const sessionId = uuidv4();
      const devices = ['device1', 'device2', 'device3'];
      
      await testData.createTestSnapshot({
        sessionId,
        userId,
        stateData: { shared: true },
      });

      const connections: WebSocket[] = [];
      
      // Connect all devices
      for (const deviceId of devices) {
        const token = client.generateJWTToken(userId, sessionId, deviceId, jwtSecret);
        const ws = await client.createWebSocketConnection(deviceId);
        await client.authenticateWebSocket(ws, token);
        connections.push(ws);
      }

      // Update from first device
      await client.sendWebSocketMessage(connections[0], {
        type: 5,
        session_id: sessionId,
        user_id: userId,
        payload: { key: 'shared', value: 'updated' },
        timestamp: Date.now(),
      });

      // All devices should receive the update
      for (let i = 1; i < connections.length; i++) {
        const msg = await client.waitForMessage(connections[i], 5, 5000);
        expect(msg.payload.value).toBe('updated');
      }

      // Cleanup
      connections.forEach(ws => client.closeWebSocket(ws.url));
    });

    test('should isolate different user sessions', async () => {
      const userId1 = uuidv4();
      const userId2 = uuidv4();
      const sessionId1 = uuidv4();
      const sessionId2 = uuidv4();
      
      await testData.createTestSnapshot({
        sessionId: sessionId1,
        userId: userId1,
        stateData: { user: 1 },
      });
      
      await testData.createTestSnapshot({
        sessionId: sessionId2,
        userId: userId2,
        stateData: { user: 2 },
      });

      const token1 = client.generateJWTToken(userId1, sessionId1, 'device1', jwtSecret);
      const token2 = client.generateJWTToken(userId2, sessionId2, 'device2', jwtSecret);
      
      const ws1 = await client.createWebSocketConnection('user1');
      const ws2 = await client.createWebSocketConnection('user2');
      
      await client.authenticateWebSocket(ws1, token1);
      await client.authenticateWebSocket(ws2, token2);

      // Update from user 1
      await client.sendWebSocketMessage(ws1, {
        type: 5,
        session_id: sessionId1,
        user_id: userId1,
        payload: { key: 'data', value: 'private' },
        timestamp: Date.now(),
      });

      // User 2 should not receive the update (timeout expected)
      await expect(
        client.waitForMessage(ws2, 5, 2000)
      ).rejects.toThrow('Timeout');

      client.closeWebSocket('user1');
      client.closeWebSocket('user2');
    });
  });

  describe('Error Recovery Scenarios', () => {
    test('should handle malformed messages gracefully', async () => {
      const userId = uuidv4();
      const sessionId = uuidv4();
      const deviceId = uuidv4();
      
      const token = client.generateJWTToken(userId, sessionId, deviceId, jwtSecret);
      const ws = await client.createWebSocketConnection();
      
      await client.authenticateWebSocket(ws, token);
      
      // Send malformed message
      ws.send('not valid json');
      
      // Connection should still be open
      expect(ws.readyState).toBe(WebSocket.OPEN);
      
      client.closeWebSocket(ws.url);
    });

    test('should handle unauthorized state update attempts', async () => {
      const ws = await client.createWebSocketConnection();
      
      // Try to send state update without authentication
      await client.sendWebSocketMessage(ws, {
        type: 5, // StateUpdate
        session_id: uuidv4(),
        payload: { key: 'test', value: 'data' },
        timestamp: Date.now(),
      });

      // Should receive error
      const error = await client.waitForMessage(ws, 6, 3000); // Error message type
      expect(error.type).toBe(6);
      expect(error.payload).toHaveProperty('code', 403);

      client.closeWebSocket(ws.url);
    });

    test('should handle heartbeat mechanism', async () => {
      const userId = uuidv4();
      const sessionId = uuidv4();
      const deviceId = uuidv4();
      
      const token = client.generateJWTToken(userId, sessionId, deviceId, jwtSecret);
      const ws = await client.createWebSocketConnection();
      
      await client.authenticateWebSocket(ws, token);
      
      // Send heartbeat
      const clientTime = Date.now();
      await client.sendWebSocketMessage(ws, {
        type: 1, // Heartbeat
        payload: { client_time: clientTime },
        timestamp: clientTime,
      });

      // Should receive heartbeat ack
      const ack = await client.waitForMessage(ws, 2, 5000); // HeartbeatAck
      expect(ack.type).toBe(2);
      expect(ack.payload).toHaveProperty('server_time');
      expect(ack.payload).toHaveProperty('client_time', clientTime);

      client.closeWebSocket(ws.url);
    });
  });
});
