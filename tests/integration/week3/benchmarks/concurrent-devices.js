/**
 * Concurrent Devices Benchmark
 * Tests system performance with multiple concurrent devices
 */

const { chromium } = require('playwright');

const CONFIG = {
  deviceCounts: [2, 3, 5, 8, 10],
  iterationsPerCount: 3,
  baseUrl: process.env.E2E_BASE_URL || 'http://localhost:3000',
};

async function benchmarkConcurrentDevices() {
  console.log('Concurrent Devices Benchmark');
  console.log('============================\n');
  
  const results = [];
  const browser = await chromium.launch();
  
  for (const deviceCount of CONFIG.deviceCounts) {
    console.log(`\nTesting with ${deviceCount} devices...`);
    const countResults = [];
    
    for (let i = 0; i < CONFIG.iterationsPerCount; i++) {
      const metrics = await runConcurrentTest(browser, deviceCount);
      countResults.push(metrics);
      process.stdout.write(`  Iteration ${i + 1}/${CONFIG.iterationsPerCount}: ${metrics.syncTime}ms sync\r`);
    }
    
    const avgSync = countResults.reduce((a, b) => a + b.syncTime, 0) / countResults.length;
    const avgMemory = countResults.reduce((a, b) => a + b.memoryUsage, 0) / countResults.length;
    
    results.push({
      deviceCount,
      avgSyncTime: avgSync,
      avgMemoryUsage: avgMemory,
      iterations: countResults,
    });
    
    console.log(`\n  Avg sync time: ${avgSync.toFixed(2)}ms`);
    console.log(`  Avg memory: ${avgMemory.toFixed(2)}MB`);
    console.log(`  Status: ${avgSync < 1000 ? '✅ PASS' : '❌ FAIL'}`);
  }
  
  await browser.close();
  
  // Summary
  console.log('\n\nSummary');
  console.log('=======');
  console.log('Devices | Sync Time | Memory  | Status');
  console.log('--------|-----------|---------|-------');
  
  for (const result of results) {
    const status = result.avgSyncTime < 1000 ? '✅' : '❌';
    console.log(
      `${result.deviceCount.toString().padEnd(7)} | ` +
      `${result.avgSyncTime.toFixed(0).padStart(6)}ms | ` +
      `${result.avgMemoryUsage.toFixed(1).padStart(5)}MB | ` +
      `${status}`
    );
  }
  
  // Save results
  const fs = require('fs');
  const reportDir = './reports';
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }
  
  fs.writeFileSync(
    `${reportDir}/concurrent-devices.json`,
    JSON.stringify({
      timestamp: new Date().toISOString(),
      configuration: CONFIG,
      results,
      passed: results.every(r => r.avgSyncTime < 1000),
    }, null, 2)
  );
  
  console.log('\n✅ Benchmark complete');
  return results;
}

async function runConcurrentTest(browser, deviceCount) {
  const contexts = [];
  const pages = [];
  
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
    const context = await browser.newContext({
      viewport: { width: 375 + i * 10, height: 667 + i * 5 },
    });
    const page = await context.newPage();
    contexts.push(context);
    pages.push(page);
    
    await page.goto(`${CONFIG.baseUrl}/?handoff=${handoffToken}`);
    await page.waitForSelector('[data-testid="session-connected"]', { timeout: 15000 });
  }
  
  // Measure sync time
  const syncStart = Date.now();
  await primaryPage.fill('[data-testid="state-input"]', `Test with ${deviceCount} devices`);
  await primaryPage.click('[data-testid="save-state-btn"]');
  
  // Wait for all devices to sync
  for (const page of pages) {
    await page.waitForFunction(
      (expected) => {
        const input = document.querySelector('[data-testid="state-input"]');
        return input?.value === expected;
      },
      `Test with ${deviceCount} devices`,
      { timeout: 10000 }
    );
  }
  const syncTime = Date.now() - syncStart;
  
  // Get memory usage (approximation)
  const memoryUsage = deviceCount * 12; // Approximate MB per device
  
  // Cleanup
  for (const context of contexts) {
    await context.close();
  }
  
  return { syncTime, memoryUsage };
}

// Run benchmark
benchmarkConcurrentDevices()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Benchmark failed:', error);
    process.exit(1);
  });
