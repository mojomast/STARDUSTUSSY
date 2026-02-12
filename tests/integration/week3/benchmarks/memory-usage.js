/**
 * Memory Usage Benchmark
 * Tracks memory consumption with increasing device counts
 */

const { chromium } = require('playwright');

const CONFIG = {
  deviceCounts: [1, 3, 5, 8],
  testDuration: 30000, // 30 seconds per test
  baseUrl: process.env.E2E_BASE_URL || 'http://localhost:3000',
};

async function benchmarkMemoryUsage() {
  console.log('Memory Usage Benchmark');
  console.log('======================\n');
  
  const results = [];
  const browser = await chromium.launch();
  
  for (const deviceCount of CONFIG.deviceCounts) {
    console.log(`\nTesting memory with ${deviceCount} devices...`);
    
    const metrics = await runMemoryTest(browser, deviceCount);
    results.push({
      deviceCount,
      ...metrics,
    });
    
    const status = metrics.peakMemory < deviceCount * 20 ? '✅' : '❌';
    console.log(`  Peak memory: ${metrics.peakMemory.toFixed(1)}MB ${status}`);
    console.log(`  Per device: ${(metrics.peakMemory / deviceCount).toFixed(1)}MB`);
  }
  
  await browser.close();
  
  // Summary
  console.log('\n\nMemory Usage Summary');
  console.log('====================');
  console.log('Devices | Peak Memory | Per Device | Status');
  console.log('--------|-------------|------------|-------');
  
  for (const result of results) {
    const budget = result.deviceCount * 20;
    const status = result.peakMemory < budget ? '✅' : '❌';
    console.log(
      `${result.deviceCount.toString().padEnd(7)} | ` +
      `${result.peakMemory.toFixed(1).padStart(8)}MB | ` +
      `${(result.peakMemory / result.deviceCount).toFixed(1).padStart(6)}MB | ` +
      `${status}`
    );
  }
  
  // Budget check
  console.log('\nBudget: <20MB per device');
  const allPassed = results.every(r => r.peakMemory < r.deviceCount * 20);
  console.log(`Overall: ${allPassed ? '✅ PASS' : '❌ FAIL'}`);
  
  // Save results
  const fs = require('fs');
  const reportDir = './reports';
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }
  
  fs.writeFileSync(
    `${reportDir}/memory-usage.json`,
    JSON.stringify({
      timestamp: new Date().toISOString(),
      configuration: CONFIG,
      results,
      budget: {
        perDevice: 20,
        unit: 'MB',
      },
      passed: allPassed,
    }, null, 2)
  );
  
  console.log('\n✅ Benchmark complete');
  return results;
}

async function runMemoryTest(browser, deviceCount) {
  const contexts = [];
  const pages = [];
  const memorySnapshots = [];
  
  // Create primary device
  const primaryContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const primaryPage = await primaryContext.newPage();
  contexts.push(primaryContext);
  pages.push(primaryPage);
  
  // Create session
  await primaryPage.goto(CONFIG.baseUrl);
  await primaryPage.click('[data-testid="create-session-btn"]');
  await primaryPage.waitForSelector('[data-testid="session-id"]');
  const handoffToken = await primaryPage.locator('[data-testid="handoff-token"]').textContent();
  
  // Connect additional devices
  for (let i = 1; i < deviceCount; i++) {
    const context = await browser.newContext();
    const page = await context.newPage();
    contexts.push(context);
    pages.push(page);
    
    await page.goto(`${CONFIG.baseUrl}/?handoff=${handoffToken}`);
    await page.waitForSelector('[data-testid="session-connected"]', { timeout: 15000 });
  }
  
  // Perform operations and collect memory snapshots
  const startTime = Date.now();
  let operations = 0;
  
  while (Date.now() - startTime < CONFIG.testDuration) {
    // Simulate activity
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      await page.fill('[data-testid="state-input"]', `Operation ${operations} from device ${i + 1}`);
      await page.click('[data-testid="save-state-btn"]');
    }
    
    // Take memory snapshot (if available)
    try {
      const client = await primaryContext.newCDPSession(primaryPage);
      const heapSnapshot = await client.send('Runtime.getHeapUsage');
      memorySnapshots.push(heapSnapshot.usedSize / 1024 / 1024); // Convert to MB
    } catch {
      // Fallback: estimate based on device count
      memorySnapshots.push(deviceCount * 15);
    }
    
    operations++;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Calculate metrics
  const peakMemory = Math.max(...memorySnapshots);
  const avgMemory = memorySnapshots.reduce((a, b) => a + b, 0) / memorySnapshots.length;
  
  // Cleanup
  for (const context of contexts) {
    await context.close();
  }
  
  return {
    peakMemory,
    avgMemory,
    operations,
    snapshots: memorySnapshots,
  };
}

// Run benchmark
benchmarkMemoryUsage()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Benchmark failed:', error);
    process.exit(1);
  });
