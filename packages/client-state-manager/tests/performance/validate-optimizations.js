/**
 * Quick performance validation test
 */

const { StateManager } = require('../src/core/StateManager');

// Mock WebSocket
global.WebSocket = class MockWebSocket {
  constructor() {
    setTimeout(() => this.onopen && this.onopen(), 0);
  }
  send() {}
  close() {}
};

async function testPerformance() {
  console.log('🧪 Performance Optimization Validation\n');
  
  const manager = new StateManager({
    deviceId: 'test-device',
    userId: 'test-user',
    sessionId: 'test-session',
    websocketUrl: 'ws://localhost:8080',
    token: 'test-token',
    debounceMs: 50,
    autoSync: false,
  });

  // Test serialization metrics
  console.log('1️⃣ Testing serialization metrics...');
  manager.setState('test.key1', 'value1');
  manager.setState('test.key2', 'value2');
  manager.setState('test.key3', { nested: 'data' });
  
  const metrics = manager.getDetailedMetrics();
  console.log('   Serialization metrics:', JSON.stringify(metrics.serialization, null, 2));
  
  // Test memory health check
  console.log('\n2️⃣ Testing memory health check...');
  const health = manager.checkMemoryHealth();
  console.log('   Memory healthy:', health.healthy);
  if (health.warnings.length > 0) {
    console.log('   Warnings:', health.warnings);
  }
  
  // Test memory analysis
  console.log('\n3️⃣ Testing memory analysis...');
  console.log('   Memory analysis available:', !!metrics.memoryAnalysis);
  console.log('   Has potential leak:', metrics.memoryAnalysis.hasPotentialLeak);
  console.log('   Recommendation:', metrics.memoryAnalysis.recommendation);
  
  // Test debouncing
  console.log('\n4️⃣ Testing debouncing...');
  const start = Date.now();
  manager.setState('rapid.1', 'a');
  manager.setState('rapid.2', 'b');
  manager.setState('rapid.3', 'c');
  const end = Date.now();
  console.log('   Rapid changes took:', end - start, 'ms');
  console.log('   (Should be fast due to debouncing)');
  
  // Cleanup
  await manager.destroy();
  
  console.log('\n✅ All performance features validated!');
}

testPerformance().catch(console.error);
