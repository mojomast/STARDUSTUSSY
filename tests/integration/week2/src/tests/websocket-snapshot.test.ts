/**
 * Snapshot Storage and Retrieval Tests
 * Tests the snapshot management functionality
 */

import { WebSocketTestClient } from '../clients/WebSocketTestClient';
import { MessageType } from '../types';
import { testConfig, createTestUser, generateTestToken, wait } from '../utils';

describe('Snapshot Storage and Retrieval', () => {
  let client: WebSocketTestClient;
  let user: ReturnType<typeof createTestUser>;
  let token: string;

  beforeEach(async () => {
    client = new WebSocketTestClient({
      url: testConfig.wsUrl,
      timeout: testConfig.connectionTimeout,
    });
    
    user = createTestUser();
    token = generateTestToken(user);
    
    await client.connect();
    client.authenticate(token);
    await client.waitForAuthResponse();
  });

  afterEach(async () => {
    if (client) {
      await client.disconnect();
    }
  });

  describe('Snapshot Retrieval', () => {
    test('should request and receive snapshot', async () => {
      client.requestSnapshot();
      
      const response = await client.waitForMessage(
        MessageType.SnapshotResponse,
        testConfig.messageTimeout
      );

      expect(response.type).toBe(MessageType.SnapshotResponse);
      expect(response.payload).toHaveProperty('session_id');
      expect(response.payload).toHaveProperty('state_data');
    });

    test('should receive empty snapshot for new session', async () => {
      client.requestSnapshot();
      
      const response = await client.waitForMessage(
        MessageType.SnapshotResponse,
        testConfig.messageTimeout
      );

      expect(response.payload.state_data).toEqual({});
      expect(response.payload.created_at).toBeNull();
    });

    test('should receive snapshot with correct session_id', async () => {
      client.requestSnapshot();
      
      const response = await client.waitForMessage(
        MessageType.SnapshotResponse,
        testConfig.messageTimeout
      );

      expect(response.payload.session_id).toBe(user.sessionId);
    });
  });

  describe('State Updates and Persistence', () => {
    test('should update state and retrieve it in snapshot', async () => {
      // Update state
      client.sendStateUpdate('test_key', 'test_value');
      await wait(100); // Allow server to process
      
      // Request snapshot
      client.requestSnapshot();
      
      const response = await client.waitForMessage(
        MessageType.SnapshotResponse,
        testConfig.messageTimeout
      );

      expect(response.payload.state_data).toHaveProperty('test_key', 'test_value');
    });

    test('should persist multiple state keys', async () => {
      const testData = {
        key1: 'value1',
        key2: 42,
        key3: { nested: 'object' },
        key4: [1, 2, 3],
      };

      // Update multiple keys
      Object.entries(testData).forEach(([key, value]) => {
        client.sendStateUpdate(key, value);
      });
      
      await wait(200);
      
      // Request snapshot
      client.requestSnapshot();
      
      const response = await client.waitForMessage(
        MessageType.SnapshotResponse,
        testConfig.messageTimeout
      );

      Object.entries(testData).forEach(([key, value]) => {
        expect(response.payload.state_data[key]).toEqual(value);
      });
    });

    test('should update existing key with new value', async () => {
      // Set initial value
      client.sendStateUpdate('counter', 1);
      await wait(100);
      
      // Update to new value
      client.sendStateUpdate('counter', 2);
      await wait(100);
      
      // Request snapshot
      client.requestSnapshot();
      
      const response = await client.waitForMessage(
        MessageType.SnapshotResponse,
        testConfig.messageTimeout
      );

      expect(response.payload.state_data.counter).toBe(2);
    });

    test('should delete state key', async () => {
      // Set a value
      client.sendStateUpdate('temp_key', 'temp_value');
      await wait(100);
      
      // Delete the key
      client.send({
        type: MessageType.StateUpdate,
        timestamp: Math.floor(Date.now() / 1000),
        payload: {
          key: 'temp_key',
          operation: 'DELETE',
        },
      });
      await wait(100);
      
      // Request snapshot
      client.requestSnapshot();
      
      const response = await client.waitForMessage(
        MessageType.SnapshotResponse,
        testConfig.messageTimeout
      );

      expect(response.payload.state_data).not.toHaveProperty('temp_key');
    });
  });

  describe('State Update Broadcasting', () => {
    test('should broadcast state update to all connected clients', async () => {
      const client2 = new WebSocketTestClient({
        url: testConfig.wsUrl,
        timeout: testConfig.connectionTimeout,
      });

      try {
        // Connect and authenticate second client
        await client2.connect();
        client2.authenticate(token);
        await client2.waitForAuthResponse();

        // Listen for state updates on client2
        const stateUpdatePromise = client2.waitForMessage(
          MessageType.StateUpdate,
          testConfig.messageTimeout
        );

        // Send state update from client1
        client.sendStateUpdate('broadcast_test', 'value');

        // Client2 should receive the broadcast
        const broadcast = await stateUpdatePromise;
        
        expect(broadcast.type).toBe(MessageType.StateUpdate);
        expect(broadcast.payload.key).toBe('broadcast_test');
        expect(broadcast.payload.value).toBe('value');
      } finally {
        await client2.disconnect();
      }
    });
  });

  describe('Concurrent State Updates', () => {
    test('should handle concurrent state updates from same client', async () => {
      const updateCount = 5;
      
      // Send multiple updates rapidly
      for (let i = 0; i < updateCount; i++) {
        client.sendStateUpdate(`key_${i}`, `value_${i}`);
      }
      
      await wait(200);
      
      // Request snapshot
      client.requestSnapshot();
      
      const response = await client.waitForMessage(
        MessageType.SnapshotResponse,
        testConfig.messageTimeout
      );

      // All keys should be present
      for (let i = 0; i < updateCount; i++) {
        expect(response.payload.state_data[`key_${i}`]).toBe(`value_${i}`);
      }
    });

    test('should handle concurrent updates from multiple clients', async () => {
      const clients: WebSocketTestClient[] = [];
      
      try {
        // Create 3 additional clients
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

        // Each client sends an update
        clients.forEach((c, i) => {
          c.sendStateUpdate(`client_${i}_key`, `client_${i}_value`);
        });
        
        await wait(300);
        
        // Request snapshot from main client
        client.requestSnapshot();
        
        const response = await client.waitForMessage(
          MessageType.SnapshotResponse,
          testConfig.messageTimeout
        );

        // All client updates should be present
        clients.forEach((_, i) => {
          expect(response.payload.state_data[`client_${i}_key`]).toBe(`client_${i}_value`);
        });
      } finally {
        await Promise.all(clients.map((c) => c.disconnect()));
      }
    });
  });

  describe('Error Handling', () => {
    test('should reject state update without authentication', async () => {
      // Create unauthenticated client
      const unauthClient = new WebSocketTestClient({
        url: testConfig.wsUrl,
        timeout: testConfig.connectionTimeout,
      });

      try {
        await unauthClient.connect();

        unauthClient.sendStateUpdate('test', 'value');
        
        const response = await unauthClient.waitForMessage(
          MessageType.Error,
          testConfig.messageTimeout
        );

        expect(response.type).toBe(MessageType.Error);
        expect(response.payload.code).toBe(403);
      } finally {
        await unauthClient.disconnect();
      }
    });

    test('should handle snapshot request without authentication', async () => {
      const unauthClient = new WebSocketTestClient({
        url: testConfig.wsUrl,
        timeout: testConfig.connectionTimeout,
      });

      try {
        await unauthClient.connect();

        unauthClient.requestSnapshot();
        
        const response = await unauthClient.waitForMessage(
          MessageType.Error,
          testConfig.messageTimeout
        );

        expect(response.type).toBe(MessageType.Error);
        expect(response.payload.code).toBe(403);
      } finally {
        await unauthClient.disconnect();
      }
    });
  });

  describe('State Data Types', () => {
    test('should handle string values', async () => {
      client.sendStateUpdate('string_key', 'string_value');
      await wait(100);
      
      client.requestSnapshot();
      const response = await client.waitForMessage(
        MessageType.SnapshotResponse,
        testConfig.messageTimeout
      );

      expect(response.payload.state_data.string_key).toBe('string_value');
    });

    test('should handle numeric values', async () => {
      client.sendStateUpdate('int_key', 42);
      client.sendStateUpdate('float_key', 3.14);
      await wait(100);
      
      client.requestSnapshot();
      const response = await client.waitForMessage(
        MessageType.SnapshotResponse,
        testConfig.messageTimeout
      );

      expect(response.payload.state_data.int_key).toBe(42);
      expect(response.payload.state_data.float_key).toBe(3.14);
    });

    test('should handle boolean values', async () => {
      client.sendStateUpdate('bool_true', true);
      client.sendStateUpdate('bool_false', false);
      await wait(100);
      
      client.requestSnapshot();
      const response = await client.waitForMessage(
        MessageType.SnapshotResponse,
        testConfig.messageTimeout
      );

      expect(response.payload.state_data.bool_true).toBe(true);
      expect(response.payload.state_data.bool_false).toBe(false);
    });

    test('should handle object values', async () => {
      const obj = { nested: { deep: { value: 'test' } }, arr: [1, 2, 3] };
      client.sendStateUpdate('obj_key', obj);
      await wait(100);
      
      client.requestSnapshot();
      const response = await client.waitForMessage(
        MessageType.SnapshotResponse,
        testConfig.messageTimeout
      );

      expect(response.payload.state_data.obj_key).toEqual(obj);
    });

    test('should handle array values', async () => {
      const arr = [1, 'two', { three: 3 }, [4, 5]];
      client.sendStateUpdate('arr_key', arr);
      await wait(100);
      
      client.requestSnapshot();
      const response = await client.waitForMessage(
        MessageType.SnapshotResponse,
        testConfig.messageTimeout
      );

      expect(response.payload.state_data.arr_key).toEqual(arr);
    });
  });
});
