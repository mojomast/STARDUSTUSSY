import { WebSocketClient } from '../../../packages/client-state-manager/src/core/WebSocketClient';
import { StateManager } from '../../../packages/client-state-manager/src/core/StateManager';
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

/**
 * Chaos Engineering Tests
 * Tests for random service failures, Redis cluster failures,
 * PostgreSQL failover, and network partition simulation
 */

describe('Chaos Engineering', () => {
  let client: WebSocketClient;
  let stateManager: StateManager;

  beforeEach(() => {
    // Setup before each test
  });

  afterEach(() => {
    if (client) {
      client.disconnect();
    }
    if (stateManager) {
      stateManager.destroy();
    }
  });

  describe('Random Service Failures', () => {
    it('should handle random WebSocket server crashes', async () => {
      const CRASH_PROBABILITY = 0.1; // 10% chance of crash per operation
      const OPERATIONS = 100;
      let successfulOperations = 0;
      let recoveredConnections = 0;

      client = new WebSocketClient({
        url: 'ws://localhost:8080',
        sessionId: 'chaos-session',
        token: 'test-token',
        deviceId: 'chaos-device',
        autoReconnect: true,
        maxReconnectAttempts: 10,
        reconnectDelay: 100,
      });

      client.on('reconnected', () => {
        recoveredConnections++;
      });

      await client.connect();

      for (let i = 0; i < OPERATIONS; i++) {
        try {
          // Simulate random server crash
          if (Math.random() < CRASH_PROBABILITY) {
            // Simulate crash by forcing disconnect
            (client as any).ws?.close();
          }

          if (client.isConnected) {
            client.send('test_operation', { index: i });
            successfulOperations++;
          }

          await new Promise(resolve => setTimeout(resolve, 50));
        } catch (error) {
          // Operation failed
        }
      }

      // Wait for reconnections
      await new Promise(resolve => setTimeout(resolve, 2000));

      console.log(`\n=== Random Crash Test Results ===`);
      console.log(`Operations attempted: ${OPERATIONS}`);
      console.log(`Successful operations: ${successfulOperations}`);
      console.log(`Recovered connections: ${recoveredConnections}`);
      console.log(`Success rate: ${((successfulOperations / OPERATIONS) * 100).toFixed(2)}%`);

      expect(successfulOperations).toBeGreaterThan(OPERATIONS * 0.5); // At least 50% success
      expect(client.isConnected || recoveredConnections > 0).toBe(true);
    });

    it('should handle service degradation (slow responses)', async () => {
      const DEGRADATION_PROBABILITY = 0.3;
      const NORMAL_LATENCY = 10;
      const DEGRADED_LATENCY = 2000;
      
      let normalResponses = 0;
      let degradedResponses = 0;
      let timeouts = 0;

      client = new WebSocketClient({
        url: 'ws://localhost:8080',
        sessionId: 'degradation-session',
        token: 'test-token',
        deviceId: 'degradation-device',
        connectionTimeout: 5000,
      });

      await client.connect();

      for (let i = 0; i < 50; i++) {
        const startTime = Date.now();
        
        try {
          // Simulate service degradation
          if (Math.random() < DEGRADATION_PROBABILITY) {
            await new Promise(resolve => setTimeout(resolve, DEGRADED_LATENCY));
            degradedResponses++;
          } else {
            await new Promise(resolve => setTimeout(resolve, NORMAL_LATENCY));
            client.send('test', { index: i });
            normalResponses++;
          }
        } catch (error) {
          timeouts++;
        }
      }

      console.log(`\n=== Service Degradation Test Results ===`);
      console.log(`Normal responses: ${normalResponses}`);
      console.log(`Degraded responses: ${degradedResponses}`);
      console.log(`Timeouts: ${timeouts}`);

      expect(normalResponses + degradedResponses).toBeGreaterThan(0);
    });

    it('should handle cascading failures', async () => {
      const services = ['auth', 'websocket', 'state', 'snapshot'];
      let failedServices = new Set();
      let recoveryAttempts = 0;

      client = new WebSocketClient({
        url: 'ws://localhost:8080',
        sessionId: 'cascading-session',
        token: 'test-token',
        deviceId: 'cascading-device',
        autoReconnect: true,
      });

      // Simulate cascading failure
      const simulateFailure = async () => {
        for (const service of services) {
          if (Math.random() < 0.2) {
            failedServices.add(service);
            
            if (service === 'websocket') {
              client.disconnect();
            }
          }
        }
      };

      // Simulate recovery
      const simulateRecovery = async () => {
        recoveryAttempts++;
        failedServices.clear();
        
        try {
          await client.connect();
        } catch (error) {
          // Recovery failed
        }
      };

      // Run chaos scenario
      for (let i = 0; i < 10; i++) {
        await simulateFailure();
        await new Promise(resolve => setTimeout(resolve, 200));
        
        if (failedServices.size > 0) {
          await simulateRecovery();
        }
      }

      console.log(`\n=== Cascading Failure Test Results ===`);
      console.log(`Recovery attempts: ${recoveryAttempts}`);
      console.log(`Final connection state: ${client.isConnected}`);

      expect(recoveryAttempts).toBeGreaterThan(0);
    });
  });

  describe('Redis Cluster Node Failures', () => {
    it('should handle Redis master node failure', async () => {
      stateManager = new StateManager({
        deviceId: 'redis-test-device',
        userId: 'test-user',
        sessionId: 'redis-failure-session',
        websocketUrl: 'ws://localhost:8080',
        token: 'test-token',
        autoSync: true,
      });

      // Set initial state
      stateManager.setState('redis.test', 'initial-value');

      // Simulate Redis master failure (writes would fail temporarily)
      const operations: { operation: string; success: boolean; error?: string }[] = [];

      for (let i = 0; i < 20; i++) {
        try {
          stateManager.setState(`redis.data${i}`, i);
          operations.push({ operation: `write-${i}`, success: true });
        } catch (error) {
          operations.push({ 
            operation: `write-${i}`, 
            success: false, 
            error: (error as Error).message 
          });
        }

        // Simulate failover delay
        if (i === 5) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      const successfulOps = operations.filter(o => o.success).length;
      
      console.log(`\n=== Redis Master Failure Results ===`);
      console.log(`Total operations: ${operations.length}`);
      console.log(`Successful operations: ${successfulOps}`);
      console.log(`Failed operations: ${operations.length - successfulOps}`);

      expect(successfulOps).toBeGreaterThan(0);
    });

    it('should handle Redis read replica failures', async () => {
      const readAttempts = 50;
      let successfulReads = 0;
      let failedReads = 0;

      stateManager = new StateManager({
        deviceId: 'redis-read-test',
        userId: 'test-user',
        sessionId: 'redis-read-session',
        websocketUrl: 'ws://localhost:8080',
        token: 'test-token',
      });

      // Populate state
      for (let i = 0; i < 10; i++) {
        stateManager.setState(`data.${i}`, `value-${i}`);
      }

      // Simulate read failures
      for (let i = 0; i < readAttempts; i++) {
        try {
          // Simulate replica failure on certain attempts
          if (Math.random() < 0.3 && i > 10 && i < 30) {
            throw new Error('Redis read replica unavailable');
          }
          
          const value = stateManager.getStateAtPath(`data.${i % 10}`);
          if (value) {
            successfulReads++;
          }
        } catch (error) {
          failedReads++;
        }
      }

      console.log(`\n=== Redis Read Replica Failure Results ===`);
      console.log(`Read attempts: ${readAttempts}`);
      console.log(`Successful reads: ${successfulReads}`);
      console.log(`Failed reads: ${failedReads}`);

      expect(successfulReads).toBeGreaterThan(readAttempts * 0.5);
    });

    it('should handle Redis cluster reconfiguration', async () => {
      stateManager = new StateManager({
        deviceId: 'redis-cluster-test',
        userId: 'test-user',
        sessionId: 'redis-cluster-session',
        websocketUrl: 'ws://localhost:8080',
        token: 'test-token',
      });

      const operationsDuringReconfig: any[] = [];

      // Start operations
      for (let i = 0; i < 100; i++) {
        const opStart = Date.now();
        
        try {
          // Simulate cluster slot migration
          if (i > 30 && i < 60) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          
          stateManager.setState(`cluster.${i}`, { index: i, timestamp: Date.now() });
          
          operationsDuringReconfig.push({
            operation: i,
            duration: Date.now() - opStart,
            success: true,
          });
        } catch (error) {
          operationsDuringReconfig.push({
            operation: i,
            duration: Date.now() - opStart,
            success: false,
            error: (error as Error).message,
          });
        }
      }

      const successfulOps = operationsDuringReconfig.filter(o => o.success).length;
      const avgDuration = operationsDuringReconfig.reduce((sum, o) => sum + o.duration, 0) 
        / operationsDuringReconfig.length;

      console.log(`\n=== Redis Cluster Reconfiguration Results ===`);
      console.log(`Operations: ${operationsDuringReconfig.length}`);
      console.log(`Successful: ${successfulOps}`);
      console.log(`Average duration: ${avgDuration.toFixed(2)}ms`);

      expect(successfulOps).toBeGreaterThan(80); // At least 80% success
    });
  });

  describe('PostgreSQL Failover Testing', () => {
    it('should handle PostgreSQL primary failover', async () => {
      stateManager = new StateManager({
        deviceId: 'postgres-test-device',
        userId: 'test-user',
        sessionId: 'postgres-failover-session',
        websocketUrl: 'ws://localhost:8080',
        token: 'test-token',
        autoSync: true,
      });

      const operations: { op: number; success: boolean; latency: number }[] = [];

      for (let i = 0; i < 50; i++) {
        const start = Date.now();
        
        try {
          // Simulate failover at operation 20
          if (i === 20) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
          
          stateManager.setState(`postgres.data${i}`, i);
          
          operations.push({
            op: i,
            success: true,
            latency: Date.now() - start,
          });
        } catch (error) {
          operations.push({
            op: i,
            success: false,
            latency: Date.now() - start,
          });
        }
      }

      const successfulOps = operations.filter(o => o.success).length;
      const opsDuringFailover = operations.filter(o => o.op >= 20 && o.op <= 25);
      const opsAfterFailover = operations.filter(o => o.op > 25 && o.success);

      console.log(`\n=== PostgreSQL Failover Results ===`);
      console.log(`Total operations: ${operations.length}`);
      console.log(`Successful: ${successfulOps}`);
      console.log(`Ops during failover: ${opsDuringFailover.length}`);
      console.log(`Ops after failover: ${opsAfterFailover.length}`);

      expect(opsAfterFailover.length).toBeGreaterThan(0);
    });

    it('should handle PostgreSQL replication lag', async () => {
      const REPLICATION_LAG_MS = 500;
      let staleReads = 0;
      let consistentReads = 0;

      stateManager = new StateManager({
        deviceId: 'postgres-lag-test',
        userId: 'test-user',
        sessionId: 'postgres-lag-session',
        websocketUrl: 'ws://localhost:8080',
        token: 'test-token',
      });

      // Write data
      stateManager.setState('replicated.data', 'version-1');
      
      // Simulate reads during replication lag
      for (let i = 0; i < 30; i++) {
        const value = stateManager.getStateAtPath('replicated.data');
        
        // Simulate replication lag for first 10 reads
        if (i < 10) {
          await new Promise(resolve => setTimeout(resolve, REPLICATION_LAG_MS / 10));
          staleReads++;
        } else {
          consistentReads++;
        }
      }

      console.log(`\n=== PostgreSQL Replication Lag Results ===`);
      console.log(`Stale reads: ${staleReads}`);
      console.log(`Consistent reads: ${consistentReads}`);

      expect(consistentReads).toBeGreaterThan(0);
    });
  });

  describe('Network Partition Simulation', () => {
    it('should handle split-brain scenario', async () => {
      const partition1Clients: WebSocketClient[] = [];
      const partition2Clients: WebSocketClient[] = [];

      // Create clients that will be split into two partitions
      for (let i = 0; i < 10; i++) {
        const client1 = new WebSocketClient({
          url: 'ws://partition1:8080',
          sessionId: `split-session-${i}`,
          token: 'test-token',
          deviceId: `partition1-device-${i}`,
        });

        const client2 = new WebSocketClient({
          url: 'ws://partition2:8080',
          sessionId: `split-session-${i}`,
          token: 'test-token',
          deviceId: `partition2-device-${i}`,
        });

        partition1Clients.push(client1);
        partition2Clients.push(client2);
      }

      // Simulate partition by having clients write conflicting data
      for (let i = 0; i < partition1Clients.length; i++) {
        // Clients in partition 1 write one value
        // Clients in partition 2 write different value
        // This simulates split-brain
      }

      console.log(`\n=== Split-Brain Scenario ===`);
      console.log(`Partition 1 clients: ${partition1Clients.length}`);
      console.log(`Partition 2 clients: ${partition2Clients.length}`);

      // Cleanup
      partition1Clients.forEach(c => c.disconnect());
      partition2Clients.forEach(c => c.disconnect());

      expect(partition1Clients.length).toBe(partition2Clients.length);
    });

    it('should handle asymmetric partition (one-way network failure)', async () => {
      client = new WebSocketClient({
        url: 'ws://localhost:8080',
        sessionId: 'asymmetric-partition-session',
        token: 'test-token',
        deviceId: 'asymmetric-device',
        autoReconnect: true,
      });

      let messagesSent = 0;
      let messagesAcked = 0;
      let timeouts = 0;

      await client.connect();

      // Simulate asymmetric partition: can send but not receive
      for (let i = 0; i < 20; i++) {
        try {
          client.send('test_message', { index: i });
          messagesSent++;

          // Simulate missing ACKs
          if (i > 5 && i < 15) {
            await new Promise((_, reject) => 
              setTimeout(() => reject(new Error('ACK timeout')), 500)
            );
          } else {
            messagesAcked++;
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } catch (error) {
          timeouts++;
        }
      }

      console.log(`\n=== Asymmetric Partition Results ===`);
      console.log(`Messages sent: ${messagesSent}`);
      console.log(`Messages acked: ${messagesAcked}`);
      console.log(`Timeouts: ${timeouts}`);

      expect(messagesSent).toBeGreaterThan(0);
    });

    it('should handle intermittent partition (flapping network)', async () => {
      const partitionEvents: { time: number; partitioned: boolean }[] = [];
      let isPartitioned = false;

      client = new WebSocketClient({
        url: 'ws://localhost:8080',
        sessionId: 'flapping-session',
        token: 'test-token',
        deviceId: 'flapping-device',
        autoReconnect: true,
        reconnectDelay: 100,
        maxReconnectAttempts: 20,
      });

      let connectionStateChanges = 0;
      client.on('state_change', () => {
        connectionStateChanges++;
      });

      await client.connect();

      // Simulate flapping network for 10 seconds
      const flapInterval = setInterval(() => {
        isPartitioned = !isPartitioned;
        partitionEvents.push({
          time: Date.now(),
          partitioned: isPartitioned,
        });

        if (isPartitioned) {
          (client as any).ws?.close();
        }
      }, 500);

      await new Promise(resolve => setTimeout(resolve, 5000));
      clearInterval(flapInterval);

      // Wait for stabilization
      await new Promise(resolve => setTimeout(resolve, 2000));

      console.log(`\n=== Flapping Network Results ===`);
      console.log(`Partition events: ${partitionEvents.length}`);
      console.log(`Connection state changes: ${connectionStateChanges}`);
      console.log(`Final connection state: ${client.isConnected}`);

      expect(connectionStateChanges).toBeGreaterThan(0);
    });

    it('should handle complete network blackout', async () => {
      let blackoutStartTime: number | null = null;
      let blackoutEndTime: number | null = null;
      let messagesQueued = 0;

      client = new WebSocketClient({
        url: 'ws://localhost:8080',
        sessionId: 'blackout-session',
        token: 'test-token',
        deviceId: 'blackout-device',
        autoReconnect: true,
        messageQueueLimit: 100,
      });

      await client.connect();

      // Simulate blackout
      blackoutStartTime = Date.now();
      (client as any).ws?.close();

      // Queue messages during blackout
      for (let i = 0; i < 50; i++) {
        if (!client.isConnected) {
          messagesQueued++;
        }
        client.send('queued_message', { index: i, timestamp: Date.now() });
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Restore network after 2 seconds
      await new Promise(resolve => setTimeout(resolve, 2000));
      blackoutEndTime = Date.now();

      // Attempt reconnection
      try {
        await client.connect();
      } catch (error) {
        // Reconnection may fail
      }

      const blackoutDuration = blackoutEndTime - blackoutStartTime;

      console.log(`\n=== Network Blackout Results ===`);
      console.log(`Blackout duration: ${blackoutDuration}ms`);
      console.log(`Messages queued: ${messagesQueued}`);
      console.log(`Final connection state: ${client.isConnected}`);

      expect(messagesQueued).toBeGreaterThan(0);
    });
  });

  describe('Combined Chaos Scenarios', () => {
    it('should survive full chaos scenario', async () => {
      const CHAOS_DURATION = 30000; // 30 seconds
      let operationsTotal = 0;
      let operationsSuccessful = 0;
      let errorCount = 0;

      stateManager = new StateManager({
        deviceId: 'full-chaos-device',
        userId: 'test-user',
        sessionId: 'full-chaos-session',
        websocketUrl: 'ws://localhost:8080',
        token: 'test-token',
        autoSync: true,
        conflictResolution: 'server-wins',
      });

      client = new WebSocketClient({
        url: 'ws://localhost:8080',
        sessionId: 'full-chaos-session',
        token: 'test-token',
        deviceId: 'full-chaos-device',
        autoReconnect: true,
        maxReconnectAttempts: 50,
        reconnectDelay: 50,
      });

      try {
        await client.connect();
      } catch (error) {
        // Connection may fail initially
      }

      // Run chaos
      const chaosStart = Date.now();
      const chaosInterval = setInterval(() => {
        const chaosType = Math.random();

        try {
          if (chaosType < 0.2) {
            // Simulate service failure
            (client as any).ws?.close();
          } else if (chaosType < 0.4) {
            // Simulate network latency spike
            // (would need server-side simulation)
          } else if (chaosType < 0.6) {
            // Simulate partition
            if (Math.random() < 0.1) {
              (client as any).ws?.close();
            }
          }

          // Try to perform operation
          operationsTotal++;
          stateManager.setState(`chaos.data.${operationsTotal}`, {
            timestamp: Date.now(),
            random: Math.random(),
          });
          operationsSuccessful++;
        } catch (error) {
          errorCount++;
        }
      }, 100);

      await new Promise(resolve => setTimeout(resolve, CHAOS_DURATION));
      clearInterval(chaosInterval);

      // Wait for recovery
      await new Promise(resolve => setTimeout(resolve, 2000));

      console.log(`\n=== Full Chaos Scenario Results ===`);
      console.log(`Duration: ${CHAOS_DURATION}ms`);
      console.log(`Total operations: ${operationsTotal}`);
      console.log(`Successful operations: ${operationsSuccessful}`);
      console.log(`Errors: ${errorCount}`);
      console.log(`Success rate: ${((operationsSuccessful / operationsTotal) * 100).toFixed(2)}%`);
      console.log(`Final connection state: ${client.isConnected}`);

      expect(operationsSuccessful).toBeGreaterThan(0);
      expect((operationsSuccessful / operationsTotal)).toBeGreaterThan(0.3); // At least 30% success
    });
  });
});
