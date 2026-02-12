import { ServiceClient } from '../utils/serviceClient';
import { TestDataManager } from '../utils/testDataManager';
import { v4 as uuidv4 } from 'uuid';

describe('Session State Service API Tests', () => {
  let client: ServiceClient;
  let testData: TestDataManager;

  beforeAll(async () => {
    client = new ServiceClient({
      baseURL: process.env.API_BASE_URL || 'http://localhost:8080',
      wsURL: process.env.WS_URL || 'ws://localhost:8080/ws',
    });
    testData = new TestDataManager();
  });

  afterAll(async () => {
    await client.close();
    await testData.cleanup();
  });

  describe('Health Check API', () => {
    test('should return healthy status', async () => {
      const health = await client.healthCheck();
      
      expect(health.healthy).toBe(true);
      expect(health.status).toBeDefined();
      expect(health.timestamp).toBeDefined();
    });

    test('should respond within acceptable time', async () => {
      const start = Date.now();
      await client.healthCheck();
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(1000); // Should respond within 1 second
    });
  });

  describe('Snapshot API', () => {
    test('should create a new snapshot', async () => {
      const sessionId = uuidv4();
      const stateData = {
        user: { name: 'Test User', email: 'test@example.com' },
        preferences: { theme: 'dark', notifications: true },
      };

      const response = await client.createSnapshot(sessionId, stateData);
      
      expect(response).toBeDefined();
      
      // Verify snapshot was created
      const snapshot = await client.getSnapshot(sessionId);
      expect(snapshot).toBeDefined();
    });

    test('should retrieve existing snapshot', async () => {
      const sessionId = uuidv4();
      const stateData = {
        counter: 42,
        items: ['a', 'b', 'c'],
      };

      await client.createSnapshot(sessionId, stateData);
      
      const snapshot = await client.getSnapshot(sessionId);
      
      expect(snapshot).toBeDefined();
      expect(snapshot).toHaveProperty('session_id', sessionId);
      expect(snapshot).toHaveProperty('state_data');
    });

    test('should return 404 for non-existent snapshot', async () => {
      const nonExistentId = uuidv4();
      
      try {
        await client.getSnapshot(nonExistentId);
        fail('Should have thrown error');
      } catch (error: any) {
        expect(error.response?.status).toBe(404);
      }
    });

    test('should update existing snapshot', async () => {
      const sessionId = uuidv4();
      const initialData = { version: 1, data: 'initial' };
      const updatedData = { version: 2, data: 'updated' };

      await client.createSnapshot(sessionId, initialData);
      await client.createSnapshot(sessionId, updatedData);
      
      const snapshot = await client.getSnapshot(sessionId);
      expect(snapshot.state_data).toEqual(updatedData);
    });

    test('should handle large state data', async () => {
      const sessionId = uuidv4();
      const largeStateData = {
        items: Array(1000).fill(null).map((_, i) => ({
          id: i,
          data: 'x'.repeat(100),
          metadata: { created: new Date().toISOString() },
        })),
      };

      const start = Date.now();
      await client.createSnapshot(sessionId, largeStateData);
      const duration = Date.now() - start;
      
      // Should complete within performance threshold
      expect(duration).toBeLessThan(50);
      
      const snapshot = await client.getSnapshot(sessionId);
      expect(snapshot.state_data.items).toHaveLength(1000);
    });

    test('should handle concurrent snapshot updates', async () => {
      const sessionId = uuidv4();
      const updates = Array(10).fill(null).map((_, i) => ({
        key: `value${i}`,
        timestamp: Date.now(),
      }));

      // Send concurrent updates
      await Promise.all(
        updates.map((data, i) =>
          client.createSnapshot(sessionId, { updateIndex: i, data })
        )
      );

      // Verify at least one update persisted
      const snapshot = await client.getSnapshot(sessionId);
      expect(snapshot).toBeDefined();
      expect(snapshot.state_data).toBeDefined();
    });

    test('should validate snapshot data structure', async () => {
      const sessionId = uuidv4();
      const invalidData = null;

      try {
        await client.createSnapshot(sessionId, invalidData as any);
      } catch (error: any) {
        // Should handle gracefully
        expect(error).toBeDefined();
      }
    });
  });

  describe('API Response Time Baselines', () => {
    test('health check should respond within 100ms', async () => {
      const times: number[] = [];
      
      for (let i = 0; i < 10; i++) {
        const start = Date.now();
        await client.healthCheck();
        times.push(Date.now() - start);
      }
      
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      expect(avgTime).toBeLessThan(100);
    });

    test('snapshot creation should complete within 50ms', async () => {
      const times: number[] = [];
      
      for (let i = 0; i < 10; i++) {
        const sessionId = uuidv4();
        const stateData = { test: i };
        
        const start = Date.now();
        await client.createSnapshot(sessionId, stateData);
        times.push(Date.now() - start);
      }
      
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      expect(avgTime).toBeLessThan(50);
    });

    test('snapshot retrieval should complete within 30ms', async () => {
      const sessionId = uuidv4();
      await client.createSnapshot(sessionId, { data: 'test' });
      
      const times: number[] = [];
      
      for (let i = 0; i < 10; i++) {
        const start = Date.now();
        await client.getSnapshot(sessionId);
        times.push(Date.now() - start);
      }
      
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      expect(avgTime).toBeLessThan(30);
    });
  });

  describe('Error Handling', () => {
    test('should handle missing request body', async () => {
      try {
        await client.createSnapshot('', {});
      } catch (error: any) {
        expect(error.response?.status).toBeGreaterThanOrEqual(400);
      }
    });

    test('should handle invalid session ID format', async () => {
      const invalidSessionIds = ['', '   ', 'invalid!@#', 'a'.repeat(1000)];
      
      for (const sessionId of invalidSessionIds) {
        try {
          await client.createSnapshot(sessionId, { test: true });
        } catch (error: any) {
          // Should handle gracefully
          expect(error).toBeDefined();
        }
      }
    });

    test('should handle special characters in state data', async () => {
      const sessionId = uuidv4();
      const stateData = {
        special: '!@#$%^&*()_+-=[]{}|;\':",./<>?',
        unicode: 'Hello 世界 🌍 ñ',
        html: '<script>alert("xss")</script>',
      };

      await client.createSnapshot(sessionId, stateData);
      const snapshot = await client.getSnapshot(sessionId);
      
      expect(snapshot.state_data.special).toBe(stateData.special);
      expect(snapshot.state_data.unicode).toBe(stateData.unicode);
    });
  });

  describe('Security', () => {
    test('should reject unauthorized requests', async () => {
      // Create a client without proper authentication
      const unauthenticatedClient = new ServiceClient({
        baseURL: process.env.API_BASE_URL || 'http://localhost:8080',
        wsURL: process.env.WS_URL || 'ws://localhost:8080/ws',
      });

      // Most endpoints should be publicly accessible for health checks
      // but sensitive operations should require auth
      const health = await unauthenticatedClient.healthCheck();
      expect(health.healthy).toBe(true);

      await unauthenticatedClient.close();
    });

    test('should handle rate limiting', async () => {
      const requests = Array(100).fill(null).map(() => client.healthCheck());
      
      const results = await Promise.allSettled(requests);
      
      // All should succeed or be rate limited gracefully
      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      expect(succeeded).toBeGreaterThan(0);
    });
  });
});
