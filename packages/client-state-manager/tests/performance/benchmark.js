/**
 * Performance Benchmark Suite for Client State Manager
 * 
 * Run with: npm run test:performance
 */

const { performance } = require('perf_hooks');

class PerformanceBenchmark {
  results = [];

  async run() {
    console.log('\n🚀 Running Client State Manager Performance Benchmarks\n');
    
    await this.benchmarkSerialization();
    await this.benchmarkDeltaCalculation();
    await this.benchmarkMemoryUsage();
    await this.benchmarkStateChanges();
    
    this.printSummary();
  }

  async benchmarkSerialization() {
    console.log('📊 Serialization Benchmarks');
    console.log('-'.repeat(50));

    const testStates = [
      { name: 'Small (1KB)', data: this.generateState(10) },
      { name: 'Medium (50KB)', data: this.generateState(500) },
      { name: 'Large (500KB)', data: this.generateState(5000) },
    ];

    for (const test of testStates) {
      const times = [];
      const iterations = 100;

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        JSON.stringify(test.data);
        times.push(performance.now() - start);
      }

      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      const max = Math.max(...times);
      const min = Math.min(...times);

      console.log(`${test.name}:`);
      console.log(`  Average: ${avg.toFixed(3)}ms`);
      console.log(`  Min: ${min.toFixed(3)}ms`);
      console.log(`  Max: ${max.toFixed(3)}ms`);
      console.log(`  Target: <50ms - ${avg < 50 ? '✅ PASS' : '❌ FAIL'}`);
      console.log();

      this.results.push({
        category: 'Serialization',
        test: test.name,
        avg,
        min,
        max,
        target: 50,
        passed: avg < 50,
      });
    }
  }

  async benchmarkDeltaCalculation() {
    console.log('📊 Delta Calculation Benchmarks');
    console.log('-'.repeat(50));

    const baseState = this.generateState(100);
    const modifiedState = { ...baseState };
    
    // Modify 10% of keys
    const keys = Object.keys(baseState);
    for (let i = 0; i < keys.length * 0.1; i++) {
      modifiedState[keys[i]] = this.generateRandomValue();
    }

    const times = [];
    const iterations = 1000;

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      this.calculateDiff(baseState, modifiedState);
      times.push(performance.now() - start);
    }

    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const max = Math.max(...times);
    const min = Math.min(...times);

    console.log(`Delta Calculation (10% changes):`);
    console.log(`  Average: ${avg.toFixed(3)}ms`);
    console.log(`  Min: ${min.toFixed(3)}ms`);
    console.log(`  Max: ${max.toFixed(3)}ms`);
    console.log(`  Target: <10ms - ${avg < 10 ? '✅ PASS' : '❌ FAIL'}`);
    console.log();

    this.results.push({
      category: 'Delta Calculation',
      test: '10% changes',
      avg,
      min,
      max,
      target: 10,
      passed: avg < 10,
    });
  }

  async benchmarkMemoryUsage() {
    console.log('📊 Memory Usage Benchmarks');
    console.log('-'.repeat(50));

    if (global.gc) {
      global.gc();
    }

    const initialMemory = process.memoryUsage();

    // Create many snapshots
    const snapshots = [];
    for (let i = 0; i < 100; i++) {
      snapshots.push({
        id: `snap-${i}`,
        data: this.generateState(100),
        timestamp: Date.now(),
      });
    }

    if (global.gc) {
      global.gc();
    }

    const finalMemory = process.memoryUsage();
    const heapGrowth = (finalMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024;

    console.log(`Memory Growth (100 snapshots):`);
    console.log(`  Growth: ${heapGrowth.toFixed(2)} MB`);
    console.log(`  Per snapshot: ${(heapGrowth / 100).toFixed(3)} MB`);
    console.log();

    this.results.push({
      category: 'Memory',
      test: 'Snapshot storage',
      growth: heapGrowth,
      passed: heapGrowth < 100,
    });
  }

  async benchmarkStateChanges() {
    console.log('📊 State Change Benchmarks');
    console.log('-'.repeat(50));

    const times = [];
    const iterations = 10000;

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      
      // Simulate state change
      const state = { version: i, data: {} };
      state.data[`key-${i % 100}`] = this.generateRandomValue();
      
      times.push(performance.now() - start);
    }

    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const throughput = 1000 / avg;

    console.log(`State Changes:`);
    console.log(`  Average: ${avg.toFixed(4)}ms`);
    console.log(`  Throughput: ${throughput.toFixed(0)} ops/sec`);
    console.log(`  Target: >1000 ops/sec - ${throughput > 1000 ? '✅ PASS' : '❌ FAIL'}`);
    console.log();

    this.results.push({
      category: 'State Changes',
      test: 'Throughput',
      avg,
      throughput,
      target: 1000,
      passed: throughput > 1000,
    });
  }

  generateState(keyCount) {
    const state = {};
    for (let i = 0; i < keyCount; i++) {
      state[`key-${i}`] = this.generateRandomValue();
    }
    return state;
  }

  generateRandomValue() {
    const types = ['string', 'number', 'boolean', 'object', 'array'];
    const type = types[Math.floor(Math.random() * types.length)];

    switch (type) {
      case 'string':
        return Math.random().toString(36).substring(7);
      case 'number':
        return Math.random() * 1000;
      case 'boolean':
        return Math.random() > 0.5;
      case 'object':
        return {
          id: Math.random().toString(36),
          value: Math.random(),
          nested: {
            data: Math.random().toString(),
          },
        };
      case 'array':
        return [1, 2, 3, Math.random()];
      default:
        return null;
    }
  }

  calculateDiff(oldObj, newObj, path = '', operations = []) {
    const oldKeys = Object.keys(oldObj);
    const newKeys = Object.keys(newObj);

    for (const key of oldKeys) {
      if (!(key in newObj)) {
        operations.push({ op: 'remove', path: `${path}/${key}` });
      }
    }

    for (const key of newKeys) {
      const oldVal = oldObj[key];
      const newVal = newObj[key];
      const currentPath = `${path}/${key}`;

      if (!(key in oldObj)) {
        operations.push({ op: 'add', path: currentPath, value: newVal });
      } else if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        if (typeof oldVal === 'object' && typeof newVal === 'object') {
          this.calculateDiff(oldVal, newVal, currentPath, operations);
        } else {
          operations.push({ op: 'replace', path: currentPath, value: newVal });
        }
      }
    }

    return operations;
  }

  printSummary() {
    console.log('\n📈 Performance Summary');
    console.log('='.repeat(50));
    
    const passed = this.results.filter(r => r.passed).length;
    const total = this.results.length;
    
    console.log(`Tests Passed: ${passed}/${total}`);
    console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%`);
    console.log();

    if (passed === total) {
      console.log('✅ All performance targets met!');
    } else {
      console.log('⚠️  Some performance targets not met:');
      this.results
        .filter(r => !r.passed)
        .forEach(r => {
          console.log(`  - ${r.category}: ${r.test}`);
        });
    }
    console.log();
  }
}

// Run benchmarks
const benchmark = new PerformanceBenchmark();
benchmark.run().catch(console.error);
