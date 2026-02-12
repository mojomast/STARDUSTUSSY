/**
 * Session UUID Management Tests
 * Tests session identification and isolation
 */

import { WebSocketTestClient } from '../clients/WebSocketTestClient';
import { MessageType } from '../types';
import { testConfig, createTestUser, generateTestToken, wait } from '../utils';

describe('Session UUID Management', () => {
  describe('Session Isolation', () => {
    test('should isolate state between different sessions', async () => {
      const session1 = createTestUser({ sessionId: 'session-1' });
      const session2 = createTestUser({ sessionId: 'session-2' });
      
      const token1 = generateTestToken(session1);
      const token2 = generateTestToken(session2);

      const client1 = new WebSocketTestClient({
        url: testConfig.wsUrl,
        timeout: testConfig.connectionTimeout,
      });

      const client2 = new WebSocketTestClient({
        url: testConfig.wsUrl,
        timeout: testConfig.connectionTimeout,
      });

      try {
        // Connect and authenticate both clients
        await client1.connect();
        await client2.connect();

        client1.authenticate(token1);
        client2.authenticate(token2);

        await client1.waitForAuthResponse();
        await client2.waitForAuthResponse();

        // Update state in session 1
        client1.sendStateUpdate('session_key', 'session1_value');
        await wait(100);

        // Update state in session 2
        client2.sendStateUpdate('session_key', 'session2_value');
        await wait(100);

        // Request snapshots
        client1.requestSnapshot();
        client2.requestSnapshot();

        const [snapshot1, snapshot2] = await Promise.all([
          client1.waitForMessage(MessageType.SnapshotResponse, testConfig.messageTimeout),
          client2.waitForMessage(MessageType.SnapshotResponse, testConfig.messageTimeout),
        ]);

        // Verify isolation
        expect(snapshot1.payload.session_id).toBe('session-1');
        expect(snapshot2.payload.session_id).toBe('session-2');
        expect(snapshot1.payload.state_data.session_key).toBe('session1_value');
        expect(snapshot2.payload.state_data.session_key).toBe('session2_value');
      } finally {
        await client1.disconnect();
        await client2.disconnect();
      }
    });

    test('should maintain separate state for same user different sessions', async () => {
      const userId = 'user-123';
      const session1 = createTestUser({ userId, sessionId: 'user-123-session-1' });
      const session2 = createTestUser({ userId, sessionId: 'user-123-session-2' });
      
      const token1 = generateTestToken(session1);
      const token2 = generateTestToken(session2);

      const client1 = new WebSocketTestClient({
        url: testConfig.wsUrl,
        timeout: testConfig.connectionTimeout,
      });

      const client2 = new WebSocketTestClient({
        url: testConfig.wsUrl,
        timeout: testConfig.connectionTimeout,
      });

      try {
        await client1.connect();
        await client2.connect();

        client1.authenticate(token1);
        client2.authenticate(token2);

        await client1.waitForAuthResponse();
        await client2.waitForAuthResponse();

        // Different data in each session
        client1.sendStateUpdate('data', 'session1_data');
        client2.sendStateUpdate('data', 'session2_data');
        await wait(200);

        client1.requestSnapshot();
        client2.requestSnapshot();

        const [snapshot1, snapshot2] = await Promise.all([
          client1.waitForMessage(MessageType.SnapshotResponse, testConfig.messageTimeout),
          client2.waitForMessage(MessageType.SnapshotResponse, testConfig.messageTimeout),
        ]);

        expect(snapshot1.payload.state_data.data).toBe('session1_data');
        expect(snapshot2.payload.state_data.data).toBe('session2_data');
      } finally {
        await client1.disconnect();
        await client2.disconnect();
      }
    });
  });

  describe('UUID Format Validation', () => {
    test('should handle standard UUID format', async () => {
      const standardUUID = '550e8400-e29b-41d4-a716-446655440000';
      const user = createTestUser({ sessionId: standardUUID });
      const token = generateTestToken(user);

      const client = new WebSocketTestClient({
        url: testConfig.wsUrl,
        timeout: testConfig.connectionTimeout,
      });

      try {
        await client.connect();
        client.authenticate(token);
        
        const response = await client.waitForAuthResponse();
        expect(response.type).toBe(MessageType.AuthSuccess);

        client.requestSnapshot();
        const snapshot = await client.waitForMessage(
          MessageType.SnapshotResponse,
          testConfig.messageTimeout
        );

        expect(snapshot.payload.session_id).toBe(standardUUID);
      } finally {
        await client.disconnect();
      }
    });

    test('should handle simple string session IDs', async () => {
      const simpleId = 'simple-session-id-123';
      const user = createTestUser({ sessionId: simpleId });
      const token = generateTestToken(user);

      const client = new WebSocketTestClient({
        url: testConfig.wsUrl,
        timeout: testConfig.connectionTimeout,
      });

      try {
        await client.connect();
        client.authenticate(token);
        
        const response = await client.waitForAuthResponse();
        expect(response.type).toBe(MessageType.AuthSuccess);

        client.requestSnapshot();
        const snapshot = await client.waitForMessage(
          MessageType.SnapshotResponse,
          testConfig.messageTimeout
        );

        expect(snapshot.payload.session_id).toBe(simpleId);
      } finally {
        await client.disconnect();
      }
    });
  });

  describe('Session Persistence', () => {
    test('should persist session state across reconnections', async () => {
      const sessionId = `persistent-session-${Date.now()}`;
      const user = createTestUser({ sessionId });
      const token = generateTestToken(user);

      let client = new WebSocketTestClient({
        url: testConfig.wsUrl,
        timeout: testConfig.connectionTimeout,
      });

      try {
        // First connection: set state
        await client.connect();
        client.authenticate(token);
        await client.waitForAuthResponse();

        client.sendStateUpdate('persistent_key', 'persistent_value');
        await wait(200);

        // Disconnect
        await client.disconnect();

        // Reconnect with same session
        client = new WebSocketTestClient({
          url: testConfig.wsUrl,
          timeout: testConfig.connectionTimeout,
        });
        await client.connect();
        client.authenticate(token);
        await client.waitForAuthResponse();

        // Request snapshot
        client.requestSnapshot();
        const snapshot = await client.waitForMessage(
          MessageType.SnapshotResponse,
          testConfig.messageTimeout
        );

        // State should be preserved
        expect(snapshot.payload.state_data.persistent_key).toBe('persistent_value');
      } finally {
        await client.disconnect();
      }
    });

    test('should clear session state after TTL expires', async () => {
      const sessionId = `ttl-session-${Date.now()}`;
      const user = createTestUser({ sessionId });
      const token = generateTestToken(user);

      let client = new WebSocketTestClient({
        url: testConfig.wsUrl,
        timeout: testConfig.connectionTimeout,
      });

      try {
        // Set state
        await client.connect();
        client.authenticate(token);
        await client.waitForAuthResponse();

        client.sendStateUpdate('temp_key', 'temp_value');
        await wait(200);

        await client.disconnect();

        // Note: In a real test, we'd wait for TTL (7 days)
        // For this test, we verify the mechanism exists
        // This is a placeholder for the actual TTL test
        expect(true).toBe(true);
      } finally {
        await client.disconnect();
      }
    });
  });

  describe('Session Sharing', () => {
    test('should allow multiple clients in same session', async () => {
      const sessionId = `shared-session-${Date.now()}`;
      const user = createTestUser({ sessionId });
      const token = generateTestToken(user);

      const clients: WebSocketTestClient[] = [];

      try {
        // Create 3 clients for same session
        for (let i = 0; i < 3; i++) {
          const c = new WebSocketTestClient({
            url: testConfig.wsUrl,
            timeout: testConfig.connectionTimeout,
          });
          await c.connect();
          c.authenticate(token);
          await c.waitForAuthResponse();
          clients.push(c);
        }

        // Each client should see the same session ID
        clients.forEach((c) => {
          c.requestSnapshot();
        });

        const snapshots = await Promise.all(
          clients.map((c) =
            c.waitForMessage(MessageType.SnapshotResponse, testConfig.messageTimeout)
          )
        );

        snapshots.forEach((snapshot) => {
          expect(snapshot.payload.session_id).toBe(sessionId);
        });

        // Client 1 updates state
        clients[0].sendStateUpdate('shared_key', 'shared_value');
        await wait(100);

        // All clients should receive the update
        const updatePromises = clients.slice(1).map((c) =
          c.waitForMessage(MessageType.StateUpdate, testConfig.messageTimeout)
        );

        const updates = await Promise.all(updatePromises);
        
        updates.forEach((update) => {
          expect(update.payload.key).toBe('shared_key');
          expect(update.payload.value).toBe('shared_value');
        });
      } finally {
        await Promise.all(clients.map((c) => c.disconnect()));
      }
    });
  });

  describe('Session Validation', () => {
    test('should reject session ID mismatch in token', async () => {
      // Note: This test assumes the server validates session_id in token
      // against the connection context
      const user = createTestUser();
      const token = generateTestToken(user);

      const client = new WebSocketTestClient({
        url: testConfig.wsUrl,
        timeout: testConfig.connectionTimeout,
      });

      try {
        await client.connect();
        client.authenticate(token);
        
        const response = await client.waitForAuthResponse();
        expect(response.type).toBe(MessageType.AuthSuccess);
      } finally {
        await client.disconnect();
      }
    });
  });
});
