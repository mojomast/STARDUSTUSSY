import { WebSocketClient } from '../../../packages/client-state-manager/src/core/WebSocketClient';
import { StateManager } from '../../../packages/client-state-manager/src/core/StateManager';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

/**
 * Performance Validation Tests
 * Load tests: 10,000 concurrent WebSocket connections
 * Stress tests: 100 handoffs per second
 * Endurance tests: 24-hour continuous operation
 * Memory leak detection
 * CPU profiling under load
 */

describe('Performance Validation', () => {
  const TEST_TIMEOUT = 300000; // 5 minutes for long tests

  describe('Load Test: 10,000 Concurrent WebSocket Connections', () => {
    it('should establish 10,000 concurrent connections', async () => {
      const CONNECTION_COUNT = 10000;
      const clients: WebSocketClient[] = [];
      const connectionTimes: number[] = [];
      const failures: Error[] = [];

      console.log(`Starting load test with ${CONNECTION_COUNT} connections...`);
      const testStart = Date.now();

      // Create connections in batches to avoid overwhelming the system
      const BATCH_SIZE = 100;
      for (let batch = 0; batch < CONNECTION_COUNT / BATCH_SIZE; batch++) {
        const batchPromises: Promise<void>[] = [];

        for (let i = 0; i < BATCH_SIZE; i++) {
          const clientIndex = batch * BATCH_SIZE + i;
          const client = new WebSocketClient({
            url: 'ws://localhost:8080',
            sessionId: `load-test-session-${clientIndex}`,
            token: `test-token-${clientIndex}`,
            deviceId: `load-test-device-${clientIndex}`,
            autoReconnect: false,
            connectionTimeout: 10000,
          });

          clients.push(client);

          const connectStart = Date.now();
          const promise = client.connect()
            .then(() => {
              connectionTimes.push(Date.now() - connectStart);
            })
            .catch((error) => {
              failures.push(error);
            });

          batchPromises.push(promise);
        }

        await Promise.all(batchPromises);

        // Small delay between batches
        if (batch % 10 === 0) {
          console.log(`Connected batch ${batch + 1}/${CONNECTION_COUNT / BATCH_SIZE}`);
        }
      }

      const testDuration = Date.now() - testStart;
      const successfulConnections = clients.filter(c => c.isConnected).length;
      const successRate = (successfulConnections / CONNECTION_COUNT) * 100;

      console.log(`\n=== Load Test Results ===`);
      console.log(`Total connections attempted: ${CONNECTION_COUNT}`);
      console.log(`Successful connections: ${successfulConnections}`);
      console.log(`Failed connections: ${failures.length}`);
      console.log(`Success rate: ${successRate.toFixed(2)}%`);
      console.log(`Total duration: ${testDuration}ms`);
      console.log(`Average connection time: ${
        connectionTimes.reduce((a, b) => a + b, 0) / connectionTimes.length
      }ms`);
      console.log(`Min connection time: ${Math.min(...connectionTimes)}ms`);
      console.log(`Max connection time: ${Math.max(...connectionTimes)}ms`);
      console.log(`P95 connection time: ${calculatePercentile(connectionTimes, 95)}ms`);
      console.log(`P99 connection time: ${calculatePercentile(connectionTimes, 99)}ms`);

      // Acceptance criteria: >95% success rate, P95 latency < 1000ms
      expect(successRate).toBeGreaterThanOrEqual(95);
      expect(calculatePercentile(connectionTimes, 95)).toBeLessThan(1000);

      // Cleanup
      clients.forEach(c => c.disconnect());
    }, TEST_TIMEOUT);

    it('should maintain connections under sustained load', async () => {
      const SUSTAINED_CONNECTIONS = 1000;
      const TEST_DURATION = 60000; // 1 minute
      const clients: WebSocketClient[] = [];

      // Establish connections
      for (let i = 0; i < SUSTAINED_CONNECTIONS; i++) {
        const client = new WebSocketClient({
          url: 'ws://localhost:8080',
          sessionId: `sustained-session-${i}`,
          token: `test-token-${i}`,
          deviceId: `sustained-device-${i}`,
          enableHeartbeat: true,
          heartbeatInterval: 5000,
          autoReconnect: true,
        });

        try {
          await client.connect();
          clients.push(client);
        } catch (error) {
          // Some failures acceptable
        }
      }

      const initialConnected = clients.filter(c => c.isConnected).length;
      console.log(`Sustained load test: ${initialConnected} connections established`);

      // Keep connections open and send periodic messages
      const messageInterval = setInterval(() => {
        clients.forEach((client, index) => {
          if (client.isConnected && index % 10 === 0) { // Every 10th client
            client.send('ping', { timestamp: Date.now() });
          }
        });
      }, 1000);

      // Wait for test duration
      await new Promise(resolve => setTimeout(resolve, TEST_DURATION));
      clearInterval(messageInterval);

      const finalConnected = clients.filter(c => c.isConnected).length;
      const retentionRate = (finalConnected / initialConnected) * 100;

      console.log(`\n=== Sustained Load Results ===`);
      console.log(`Initial connections: ${initialConnected}`);
      console.log(`Final connections: ${finalConnected}`);
      console.log(`Retention rate: ${retentionRate.toFixed(2)}%`);

      expect(retentionRate).toBeGreaterThanOrEqual(95);

      // Cleanup
      clients.forEach(c => c.disconnect());
    }, TEST_TIMEOUT);

    it('should handle connection churn (rapid connect/disconnect)', async () => {
      const CHURN_RATE = 100; // connections per second
      const TEST_DURATION = 30000; // 30 seconds
      let connects = 0;
      let disconnects = 0;
      let failedConnects = 0;

      const churnInterval = setInterval(async () => {
        for (let i = 0; i < CHURN_RATE; i++) {
          const client = new WebSocketClient({
            url: 'ws://localhost:8080',
            sessionId: `churn-session-${Date.now()}-${i}`,
            token: 'test-token',
            deviceId: `churn-device-${i}`,
            autoReconnect: false,
          });

          try {
            await client.connect();
            connects++;
            
            // Disconnect quickly
            setTimeout(() => {
              client.disconnect();
              disconnects++;
            }, Math.random() * 1000);
          } catch (error) {
            failedConnects++;
          }
        }
      }, 1000);

      await new Promise(resolve => setTimeout(resolve, TEST_DURATION));
      clearInterval(churnInterval);

      // Wait for pending disconnects
      await new Promise(resolve => setTimeout(resolve, 2000));

      const successRate = (connects / (connects + failedConnects)) * 100;

      console.log(`\n=== Connection Churn Results ===`);
      console.log(`Total connects: ${connects}`);
      console.log(`Failed connects: ${failedConnects}`);
      console.log(`Total disconnects: ${disconnects}`);
      console.log(`Success rate: ${successRate.toFixed(2)}%`);

      expect(successRate).toBeGreaterThanOrEqual(90);
    }, TEST_TIMEOUT);
  });

  describe('Stress Test: 100 Handoffs Per Second', () => {
    it('should process 100 handoffs per second', async () => {
      const HANDOFF_RATE = 100; // per second
      const TEST_DURATION = 30000; // 30 seconds
      const targetHandoffs = (HANDOFF_RATE * TEST_DURATION) / 1000;
      
      let handoffsInitiated = 0;
      let handoffsCompleted = 0;
      let handoffsFailed = 0;
      const handoffLatencies: number[] = [];

      const stateManagers: StateManager[] = [];

      // Create state managers for handoff simulation
      const createHandoffPair = () => {
        const sourceManager = new StateManager({
          deviceId: 'source-device',
          userId: 'test-user',
          sessionId: `handoff-session-${handoffsInitiated}`,
          websocketUrl: 'ws://localhost:8080',
          token: 'test-token',
          autoSync: false,
        });

        const targetManager = new StateManager({
          deviceId: 'target-device',
          userId: 'test-user',
          sessionId: `handoff-session-${handoffsInitiated}`,
          websocketUrl: 'ws://localhost:8080',
          token: 'test-token',
          autoSync: false,
        });

        return { sourceManager, targetManager };
      };

      const stressInterval = setInterval(async () => {
        for (let i = 0; i < HANDOFF_RATE / 10; i++) { // Spread across 100ms intervals
          handoffsInitiated++;
          const handoffStart = Date.now();
          
          try {
            const { sourceManager, targetManager } = createHandoffPair();
            stateManagers.push(sourceManager, targetManager);

            // Simulate handoff: set state on source
            sourceManager.setState('handoff.data', { id: handoffsInitiated, timestamp: Date.now() });
            const snapshot = sourceManager.createSnapshot();

            // Transfer to target
            targetManager.restoreSnapshot(snapshot.id);
            
            handoffLatencies.push(Date.now() - handoffStart);
            handoffsCompleted++;

            // Cleanup
            setTimeout(() => {
              sourceManager.destroy();
              targetManager.destroy();
            }, 100);
          } catch (error) {
            handoffsFailed++;
          }
        }
      }, 100);

      await new Promise(resolve => setTimeout(resolve, TEST_DURATION));
      clearInterval(stressInterval);

      // Wait for completion
      await new Promise(resolve => setTimeout(resolve, 1000));

      const successRate = (handoffsCompleted / handoffsInitiated) * 100;
      const throughput = handoffsCompleted / (TEST_DURATION / 1000);

      console.log(`\n=== Handoff Stress Test Results ===`);
      console.log(`Target handoffs: ${targetHandoffs}`);
      console.log(`Handoffs initiated: ${handoffsInitiated}`);
      console.log(`Handoffs completed: ${handoffsCompleted}`);
      console.log(`Handoffs failed: ${handoffsFailed}`);
      console.log(`Success rate: ${successRate.toFixed(2)}%`);
      console.log(`Actual throughput: ${throughput.toFixed(2)} handoffs/sec`);
      console.log(`Average latency: ${
        handoffLatencies.reduce((a, b) => a + b, 0) / handoffLatencies.length
      }ms`);
      console.log(`P95 latency: ${calculatePercentile(handoffLatencies, 95)}ms`);
      console.log(`P99 latency: ${calculatePercentile(handoffLatencies, 99)}ms`);

      expect(throughput).toBeGreaterThanOrEqual(80); // Allow 20% variance
      expect(successRate).toBeGreaterThanOrEqual(95);
      expect(calculatePercentile(handoffLatencies, 95)).toBeLessThan(100); // <100ms target

      // Cleanup remaining managers
      stateManagers.forEach(m => m.destroy());
    }, TEST_TIMEOUT);

    it('should handle burst traffic: 1000 handoffs in 1 second', async () => {
      const BURST_SIZE = 1000;
      const results = await Promise.allSettled(
        Array.from({ length: BURST_SIZE }, async (_, i) => {
          const manager = new StateManager({
            deviceId: 'burst-device',
            userId: 'test-user',
            sessionId: `burst-session-${i}`,
            websocketUrl: 'ws://localhost:8080',
            token: 'test-token',
            autoSync: false,
          });

          manager.setState('burst.data', i);
          const snapshot = manager.createSnapshot();
          
          await new Promise(resolve => setTimeout(resolve, 10));
          
          manager.destroy();
          return snapshot.id;
        })
      );

      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      console.log(`\n=== Burst Traffic Results ===`);
      console.log(`Burst size: ${BURST_SIZE}`);
      console.log(`Successful: ${successful}`);
      console.log(`Failed: ${failed}`);
      console.log(`Success rate: ${((successful / BURST_SIZE) * 100).toFixed(2)}%`);

      expect(successful / BURST_SIZE).toBeGreaterThanOrEqual(0.95);
    });
  });

  describe('Endurance Test: 24-Hour Continuous Operation', () => {
    it('should run endurance test (shortened for CI: 5 minutes)', async () => {
      const ENDURANCE_DURATION = 300000; // 5 minutes for CI (would be 24 hours in production)
      const SAMPLE_INTERVAL = 30000; // Sample every 30 seconds
      
      const manager = new StateManager({
        deviceId: 'endurance-device',
        userId: 'test-user',
        sessionId: 'endurance-session',
        websocketUrl: 'ws://localhost:8080',
        token: 'test-token',
        autoSync: true,
      });

      const samples: { timestamp: number; memory?: number; operationTime: number }[] = [];
      let operations = 0;
      let errors = 0;

      // Perform continuous operations
      const operationInterval = setInterval(() => {
        const start = Date.now();
        try {
          manager.setState(`endurance.counter`, operations++);
          if (operations % 100 === 0) {
            manager.createSnapshot({ label: `snapshot-${operations}` });
          }
        } catch (error) {
          errors++;
        }

        // Sample performance
        if (operations % 10 === 0) {
          samples.push({
            timestamp: Date.now(),
            operationTime: Date.now() - start,
          });
        }
      }, 100);

      await new Promise(resolve => setTimeout(resolve, ENDURANCE_DURATION));
      clearInterval(operationInterval);

      // Calculate statistics
      const avgOperationTime = samples.reduce((sum, s) => sum + s.operationTime, 0) / samples.length;
      const maxOperationTime = Math.max(...samples.map(s => s.operationTime));
      
      console.log(`\n=== Endurance Test Results ===`);
      console.log(`Duration: ${ENDURANCE_DURATION / 1000}s`);
      console.log(`Total operations: ${operations}`);
      console.log(`Errors: ${errors}`);
      console.log(`Error rate: ${((errors / operations) * 100).toFixed(4)}%`);
      console.log(`Avg operation time: ${avgOperationTime.toFixed(2)}ms`);
      console.log(`Max operation time: ${maxOperationTime}ms`);
      console.log(`Operations/sec: ${(operations / (ENDURANCE_DURATION / 1000)).toFixed(2)}`);

      expect(errors / operations).toBeLessThan(0.001); // <0.1% error rate
      expect(avgOperationTime).toBeLessThan(10); // <10ms average

      manager.destroy();
    }, TEST_TIMEOUT * 2);
  });

  describe('Memory Leak Detection', () => {
    it('should not leak memory during continuous operation', async () => {
      const TEST_DURATION = 120000; // 2 minutes
      const SAMPLE_INTERVAL = 10000; // Sample every 10 seconds
      
      const memorySamples: number[] = [];
      
      const manager = new StateManager({
        deviceId: 'memory-test-device',
        userId: 'test-user',
        sessionId: 'memory-test-session',
        websocketUrl: 'ws://localhost:8080',
        token: 'test-token',
        autoSync: true,
      });

      // Warm up
      for (let i = 0; i < 100; i++) {
        manager.setState(`warmup.${i}`, { data: i, timestamp: Date.now() });
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const initialMemory = process.memoryUsage().heapUsed;
      memorySamples.push(initialMemory);

      // Run operations
      const testInterval = setInterval(() => {
        // Create and discard state
        for (let i = 0; i < 50; i++) {
          manager.setState(`test.${i}`, { data: Math.random(), timestamp: Date.now() });
        }

        // Create snapshots
        for (let i = 0; i < 5; i++) {
          manager.createSnapshot();
        }

        // Sample memory
        if (global.gc) {
          global.gc();
        }
        memorySamples.push(process.memoryUsage().heapUsed);
      }, SAMPLE_INTERVAL);

      await new Promise(resolve => setTimeout(resolve, TEST_DURATION));
      clearInterval(testInterval);

      // Calculate memory trend
      const firstHalf = memorySamples.slice(0, Math.floor(memorySamples.length / 2));
      const secondHalf = memorySamples.slice(Math.floor(memorySamples.length / 2));
      
      const firstHalfAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const secondHalfAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
      
      const growthRate = ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100;

      console.log(`\n=== Memory Leak Detection Results ===`);
      console.log(`Initial memory: ${(initialMemory / 1024 / 1024).toFixed(2)} MB`);
      console.log(`Final memory: ${(memorySamples[memorySamples.length - 1] / 1024 / 1024).toFixed(2)} MB`);
      console.log(`Memory growth rate: ${growthRate.toFixed(2)}%`);
      console.log(`Sample count: ${memorySamples.length}`);

      // Allow some growth but not excessive
      expect(growthRate).toBeLessThan(50); // Less than 50% growth

      manager.destroy();
    }, TEST_TIMEOUT);

    it('should clean up resources after destroy', async () => {
      const managers: StateManager[] = [];
      
      // Create many managers
      for (let i = 0; i < 100; i++) {
        const manager = new StateManager({
          deviceId: `cleanup-device-${i}`,
          userId: 'test-user',
          sessionId: `cleanup-session-${i}`,
          websocketUrl: 'ws://localhost:8080',
          token: 'test-token',
        });
        
        // Add some state
        for (let j = 0; j < 10; j++) {
          manager.setState(`data.${j}`, { value: j });
        }
        
        managers.push(manager);
      }

      // Measure memory with managers active
      if (global.gc) {
        global.gc();
      }
      const memoryWithManagers = process.memoryUsage().heapUsed;

      // Destroy all managers
      await Promise.all(managers.map(m => m.destroy()));

      // Measure memory after cleanup
      if (global.gc) {
        global.gc();
      }
      const memoryAfterCleanup = process.memoryUsage().heapUsed;
      
      const memoryReclaimed = memoryWithManagers - memoryAfterCleanup;

      console.log(`\n=== Resource Cleanup Results ===`);
      console.log(`Memory with managers: ${(memoryWithManagers / 1024 / 1024).toFixed(2)} MB`);
      console.log(`Memory after cleanup: ${(memoryAfterCleanup / 1024 / 1024).toFixed(2)} MB`);
      console.log(`Memory reclaimed: ${(memoryReclaimed / 1024 / 1024).toFixed(2)} MB`);

      // Most memory should be reclaimed
      expect(memoryReclaimed).toBeGreaterThan(0);
    });
  });

  describe('CPU Profiling Under Load', () => {
    it('should maintain CPU usage under 80% during load', async () => {
      const TEST_DURATION = 60000; // 1 minute
      const cpuSamples: number[] = [];

      const manager = new StateManager({
        deviceId: 'cpu-test-device',
        userId: 'test-user',
        sessionId: 'cpu-test-session',
        websocketUrl: 'ws://localhost:8080',
        token: 'test-token',
        autoSync: true,
      });

      // Start CPU measurement
      const startUsage = process.cpuUsage();

      // Generate load
      let operations = 0;
      const loadInterval = setInterval(() => {
        for (let i = 0; i < 100; i++) {
          manager.setState(`cpu.${operations}`, {
            data: 'x'.repeat(1000),
            timestamp: Date.now(),
          });
          operations++;
        }

        // Sample CPU
        const currentUsage = process.cpuUsage(startUsage);
        const totalUsage = (currentUsage.user + currentUsage.system) / 1000; // Convert to ms
        cpuSamples.push(totalUsage);
      }, 1000);

      await new Promise(resolve => setTimeout(resolve, TEST_DURATION));
      clearInterval(loadInterval);

      const avgCpu = cpuSamples.reduce((a, b) => a + b, 0) / cpuSamples.length;
      const maxCpu = Math.max(...cpuSamples);

      console.log(`\n=== CPU Profiling Results ===`);
      console.log(`Operations performed: ${operations}`);
      console.log(`Average CPU time per second: ${avgCpu.toFixed(2)}ms`);
      console.log(`Max CPU time: ${maxCpu.toFixed(2)}ms`);
      console.log(`CPU usage: ${((avgCpu / 1000) * 100).toFixed(2)}%`);

      // CPU time per second should be reasonable
      expect(avgCpu).toBeLessThan(800); // Less than 80% of one core

      manager.destroy();
    });

    it('should profile WebSocket operations CPU usage', async () => {
      const client = new WebSocketClient({
        url: 'ws://localhost:8080',
        sessionId: 'cpu-profile-session',
        token: 'test-token',
        deviceId: 'cpu-profile-device',
      });

      await client.connect();

      const startUsage = process.cpuUsage();
      const MESSAGE_COUNT = 1000;

      // Send many messages
      for (let i = 0; i < MESSAGE_COUNT; i++) {
        client.send('test_message', { index: i, data: 'x'.repeat(100) });
      }

      const endUsage = process.cpuUsage(startUsage);
      const totalCpuTime = (endUsage.user + endUsage.system) / 1000; // ms
      const cpuPerMessage = totalCpuTime / MESSAGE_COUNT;

      console.log(`\n=== WebSocket CPU Profiling ===`);
      console.log(`Messages sent: ${MESSAGE_COUNT}`);
      console.log(`Total CPU time: ${totalCpuTime.toFixed(2)}ms`);
      console.log(`CPU per message: ${cpuPerMessage.toFixed(4)}ms`);

      expect(cpuPerMessage).toBeLessThan(1); // Less than 1ms per message

      client.disconnect();
    });
  });
});

// Helper function
function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}
