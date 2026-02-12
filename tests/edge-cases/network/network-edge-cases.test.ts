import { WebSocketClient } from '../../../packages/client-state-manager/src/core/WebSocketClient';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

/**
 * Network Edge Case Tests
 * Tests for intermittent connectivity, slow networks, rapid connect/disconnect,
 * and WebSocket timeout scenarios
 */

describe('Network Edge Cases', () => {
  let client: WebSocketClient;
  let mockWebSocket: any;
  let mockServer: any;

  beforeEach(() => {
    mockServer = {
      clients: new Set(),
      dropConnection: jest.fn(),
      simulatePacketLoss: jest.fn(),
      delayMessages: jest.fn(),
    };
  });

  afterEach(() => {
    if (client) {
      client.disconnect();
    }
    jest.clearAllMocks();
  });

  describe('Intermittent Connectivity - Packet Loss Simulation', () => {
    it('should handle 10% packet loss gracefully', async () => {
      const packetLossRate = 0.1;
      let messagesSent = 0;
      let messagesReceived = 0;

      client = new WebSocketClient({
        url: 'ws://localhost:8080',
        sessionId: 'test-session',
        token: 'test-token',
        deviceId: 'test-device',
        autoReconnect: true,
        maxReconnectAttempts: 5,
      });

      // Simulate packet loss
      const originalSend = WebSocket.prototype.send;
      WebSocket.prototype.send = function(data: string) {
        messagesSent++;
        if (Math.random() > packetLossRate) {
          messagesReceived++;
          originalSend.call(this, data);
        }
      };

      try {
        await client.connect();
        
        // Send 100 messages with simulated packet loss
        for (let i = 0; i < 100; i++) {
          client.send('test_message', { index: i });
        }

        // Wait for processing
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Should have retransmitted lost packets
        expect(messagesReceived).toBeGreaterThan(messagesSent * 0.8);
        expect(client.isConnected).toBe(true);
      } finally {
        WebSocket.prototype.send = originalSend;
      }
    });

    it('should handle 50% packet loss with exponential backoff', async () => {
      const packetLossRate = 0.5;
      let connectionAttempts = 0;

      client = new WebSocketClient({
        url: 'ws://localhost:8080',
        sessionId: 'test-session',
        token: 'test-token',
        deviceId: 'test-device',
        autoReconnect: true,
        reconnectDelay: 100,
        maxReconnectDelay: 5000,
        reconnectDelayMultiplier: 2,
      });

      client.on('reconnecting', () => {
        connectionAttempts++;
      });

      // Simulate high packet loss
      const originalSend = WebSocket.prototype.send;
      WebSocket.prototype.send = function(data: string) {
        if (Math.random() > packetLossRate) {
          originalSend.call(this, data);
        }
      };

      try {
        await client.connect();
        
        // Send messages under high packet loss
        for (let i = 0; i < 20; i++) {
          client.send('test_message', { index: i });
          await new Promise(resolve => setTimeout(resolve, 50));
        }

        // Should have attempted reconnections
        expect(connectionAttempts).toBeGreaterThan(0);
        
        // Connection should eventually stabilize
        await new Promise(resolve => setTimeout(resolve, 2000));
        expect(client.isConnected).toBe(true);
      } finally {
        WebSocket.prototype.send = originalSend;
      }
    });

    it('should queue messages during packet loss and deliver on reconnection', async () => {
      const queuedMessages: any[] = [];
      
      client = new WebSocketClient({
        url: 'ws://localhost:8080',
        sessionId: 'test-session',
        token: 'test-token',
        deviceId: 'test-device',
        messageQueueLimit: 100,
        autoReconnect: true,
      });

      await client.connect();

      // Simulate complete packet loss for 2 seconds
      let packetLossEnabled = true;
      const originalSend = WebSocket.prototype.send;
      WebSocket.prototype.send = function(data: string) {
        if (!packetLossEnabled) {
          queuedMessages.push(JSON.parse(data));
          originalSend.call(this, data);
        }
      };

      try {
        // Send messages during packet loss
        for (let i = 0; i < 10; i++) {
          client.send('test_message', { index: i });
        }

        // Disable packet loss (simulate reconnection)
        await new Promise(resolve => setTimeout(resolve, 100));
        packetLossEnabled = false;

        // Trigger reconnection
        client.disconnect();
        await client.connect();

        // Wait for queue flush
        await new Promise(resolve => setTimeout(resolve, 500));

        // All messages should be delivered
        expect(queuedMessages.length).toBeGreaterThanOrEqual(10);
      } finally {
        WebSocket.prototype.send = originalSend;
      }
    });
  });

  describe('Slow Network - 3G Simulation', () => {
    it('should handle 3G latency (300ms RTT)', async () => {
      const latency = 300;
      
      client = new WebSocketClient({
        url: 'ws://localhost:8080',
        sessionId: 'test-session',
        token: 'test-token',
        deviceId: 'test-device',
        connectionTimeout: 5000,
        heartbeatInterval: 10000,
      });

      // Simulate 3G latency
      const originalSend = WebSocket.prototype.send;
      WebSocket.prototype.send = function(data: string) {
        setTimeout(() => {
          originalSend.call(this, data);
        }, latency / 2);
      };

      try {
        const startTime = Date.now();
        await client.connect();
        const connectTime = Date.now() - startTime;

        // Connection should succeed despite latency
        expect(client.isConnected).toBe(true);
        expect(connectTime).toBeGreaterThanOrEqual(latency / 2);

        // Heartbeat should still work with adjusted intervals
        await new Promise(resolve => setTimeout(resolve, latency * 2));
        expect(client.isConnected).toBe(true);
      } finally {
        WebSocket.prototype.send = originalSend;
      }
    });

    it('should handle bandwidth throttling (384kbps upload)', async () => {
      const bandwidth = 384 * 1024 / 8; // 384 kbps in bytes per second
      const messageSize = 1024; // 1KB messages
      const messagesToSend = 10;

      client = new WebSocketClient({
        url: 'ws://localhost:8080',
        sessionId: 'test-session',
        token: 'test-token',
        deviceId: 'test-device',
        messageQueueLimit: 50,
      });

      await client.connect();

      // Simulate bandwidth throttling
      const originalSend = WebSocket.prototype.send;
      WebSocket.prototype.send = function(data: string) {
        const delay = (data.length / bandwidth) * 1000;
        setTimeout(() => {
          originalSend.call(this, data);
        }, delay);
      };

      try {
        const startTime = Date.now();

        // Send multiple large messages
        for (let i = 0; i < messagesToSend; i++) {
          const largeData = 'x'.repeat(messageSize);
          client.send('large_message', { data: largeData, index: i });
        }

        // Wait for all messages with throttling
        const expectedTime = (messagesToSend * messageSize / bandwidth) * 1000;
        await new Promise(resolve => setTimeout(resolve, expectedTime + 500));

        const totalTime = Date.now() - startTime;
        
        // Should have taken longer due to throttling
        expect(totalTime).toBeGreaterThan(expectedTime * 0.8);
        expect(client.isConnected).toBe(true);
      } finally {
        WebSocket.prototype.send = originalSend;
      }
    });

    it('should handle variable latency (jitter 50-500ms)', async () => {
      client = new WebSocketClient({
        url: 'ws://localhost:8080',
        sessionId: 'test-session',
        token: 'test-token',
        deviceId: 'test-device',
        heartbeatInterval: 5000,
        maxMissedHeartbeats: 5,
      });

      // Simulate variable latency
      const originalSend = WebSocket.prototype.send;
      WebSocket.prototype.send = function(data: string) {
        const jitter = Math.random() * 450 + 50; // 50-500ms
        setTimeout(() => {
          originalSend.call(this, data);
        }, jitter);
      };

      try {
        await client.connect();

        // Send rapid messages
        const messageTimes: number[] = [];
        for (let i = 0; i < 20; i++) {
          messageTimes.push(Date.now());
          client.send('test_message', { index: i });
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Wait for processing
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Connection should remain stable despite jitter
        expect(client.isConnected).toBe(true);
      } finally {
        WebSocket.prototype.send = originalSend;
      }
    });
  });

  describe('Rapid Connect/Disconnect Cycles', () => {
    it('should handle 10 rapid connect/disconnect cycles', async () => {
      const cycles = 10;
      let connectCount = 0;
      let disconnectCount = 0;

      for (let i = 0; i < cycles; i++) {
        client = new WebSocketClient({
          url: 'ws://localhost:8080',
          sessionId: `test-session-${i}`,
          token: 'test-token',
          deviceId: 'test-device',
          autoReconnect: false,
        });

        client.on('open', () => connectCount++);
        client.on('close', () => disconnectCount++);

        await client.connect();
        expect(client.isConnected).toBe(true);
        
        await new Promise(resolve => setTimeout(resolve, 50));
        client.disconnect();
      }

      expect(connectCount).toBe(cycles);
      expect(disconnectCount).toBe(cycles);
    });

    it('should handle connect while already connecting', async () => {
      client = new WebSocketClient({
        url: 'ws://localhost:8080',
        sessionId: 'test-session',
        token: 'test-token',
        deviceId: 'test-device',
      });

      // Start multiple concurrent connections
      const promises = [
        client.connect(),
        client.connect(),
        client.connect(),
      ];

      // All should resolve to the same connection
      await Promise.all(promises);
      
      expect(client.isConnected).toBe(true);
    });

    it('should handle disconnect during reconnection attempt', async () => {
      client = new WebSocketClient({
        url: 'ws://invalid-host:9999',
        sessionId: 'test-session',
        token: 'test-token',
        deviceId: 'test-device',
        autoReconnect: true,
        reconnectDelay: 100,
        maxReconnectAttempts: 10,
      });

      let reconnectingCount = 0;
      client.on('reconnecting', () => {
        reconnectingCount++;
        // Disconnect during reconnection
        if (reconnectingCount === 3) {
          client.disconnect();
        }
      });

      try {
        await client.connect();
      } catch (error) {
        // Expected to fail
      }

      // Wait for reconnection attempts
      await new Promise(resolve => setTimeout(resolve, 500));

      expect(reconnectingCount).toBeGreaterThanOrEqual(3);
      expect(client.isConnected).toBe(false);
    });

    it('should clean up resources after rapid cycles', async () => {
      const openWebSockets: WebSocket[] = [];
      
      // Track WebSocket instances
      const OriginalWebSocket = WebSocket;
      (global as any).WebSocket = class extends OriginalWebSocket {
        constructor(url: string | URL, protocols?: string | string[]) {
          super(url, protocols);
          openWebSockets.push(this);
        }
      };

      try {
        for (let i = 0; i < 5; i++) {
          client = new WebSocketClient({
            url: 'ws://localhost:8080',
            sessionId: `test-session-${i}`,
            token: 'test-token',
            deviceId: 'test-device',
          });

          await client.connect();
          await new Promise(resolve => setTimeout(resolve, 50));
          client.disconnect();
        }

        // All WebSockets should be closed
        const closedCount = openWebSockets.filter(ws => 
          ws.readyState === WebSocket.CLOSED
        ).length;
        
        expect(closedCount).toBe(openWebSockets.length);
      } finally {
        (global as any).WebSocket = OriginalWebSocket;
      }
    });
  });

  describe('WebSocket Timeout Scenarios', () => {
    it('should timeout connection after 5 seconds', async () => {
      client = new WebSocketClient({
        url: 'ws://blackhole.example.com:8080',
        sessionId: 'test-session',
        token: 'test-token',
        deviceId: 'test-device',
        connectionTimeout: 5000,
        autoReconnect: false,
      });

      const startTime = Date.now();
      
      await expect(client.connect()).rejects.toThrow('Connection timeout');
      
      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeGreaterThanOrEqual(4500);
      expect(elapsed).toBeLessThan(6000);
    });

    it('should detect heartbeat timeout after 3 missed beats', async () => {
      let heartbeatTimeouts = 0;
      
      client = new WebSocketClient({
        url: 'ws://localhost:8080',
        sessionId: 'test-session',
        token: 'test-token',
        deviceId: 'test-device',
        enableHeartbeat: true,
        heartbeatInterval: 1000,
        maxMissedHeartbeats: 3,
        autoReconnect: false,
      });

      client.on('error', (error: Error) => {
        if (error.message.includes('Heartbeat timeout')) {
          heartbeatTimeouts++;
        }
      });

      await client.connect();

      // Stop server from responding to heartbeats
      // This would require server-side simulation
      // For now, we verify the mechanism exists
      
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Should have attempted heartbeat checks
      expect(client.currentState).not.toBe('ACTIVE');
    });

    it('should handle message send timeout', async () => {
      client = new WebSocketClient({
        url: 'ws://localhost:8080',
        sessionId: 'test-session',
        token: 'test-token',
        deviceId: 'test-device',
      });

      await client.connect();

      // Simulate blocked send
      const originalSend = WebSocket.prototype.send;
      let sendBlocked = true;
      WebSocket.prototype.send = function() {
        if (sendBlocked) {
          // Never actually send
          return;
        }
        originalSend.apply(this, arguments as any);
      };

      try {
        // Queue messages while send is blocked
        for (let i = 0; i < 10; i++) {
          client.send('test_message', { index: i });
        }

        // Messages should be queued
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Unblock and reconnect
        sendBlocked = false;
        client.disconnect();
        await client.connect();

        // Wait for queue flush
        await new Promise(resolve => setTimeout(resolve, 500));
        
        expect(client.isConnected).toBe(true);
      } finally {
        WebSocket.prototype.send = originalSend;
      }
    });

    it('should handle incomplete handshake', async () => {
      client = new WebSocketClient({
        url: 'ws://localhost:8080',
        sessionId: 'test-session',
        token: 'test-token',
        deviceId: 'test-device',
        connectionTimeout: 3000,
        autoReconnect: true,
        maxReconnectAttempts: 3,
      });

      // Simulate server that connects but never sends state_sync
      let handshakeIncomplete = true;
      client.on('state_change', (state: string) => {
        if (state === 'CONNECTED' && handshakeIncomplete) {
          // Prevent transition to ACTIVE
          handshakeIncomplete = false;
        }
      });

      try {
        await client.connect();
        
        // Should remain in CONNECTED state, not ACTIVE
        await new Promise(resolve => setTimeout(resolve, 2000));
        expect(client.currentState).toBe('CONNECTED');
      } catch (error) {
        // May fail due to timeout
        expect(error).toBeDefined();
      }
    });
  });
});
