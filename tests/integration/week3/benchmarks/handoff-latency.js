/**
 * Handoff Latency Benchmark
 * Measures the time to transfer a session from one device to another
 */

const { chromium } = require('playwright');

const CONFIG = {
  iterations: 50,
  warmupIterations: 5,
  baseUrl: process.env.E2E_BASE_URL || 'http://localhost:3000',
};

async function measureHandoffLatency() {
  const results = [];
  
  console.log('Handoff Latency Benchmark');
  console.log('========================\n');
  console.log(`Iterations: ${CONFIG.iterations}`);
  console.log(`Warmup: ${CONFIG.warmupIterations}\n`);
  
  const browser = await chromium.launch();
  
  // Warmup
  console.log('Running warmup iterations...');
  for (let i = 0; i < CONFIG.warmupIterations; i++) {
    await runHandoff(browser);
  }
  
  // Actual measurements
  console.log('Running benchmark iterations...\n');
  for (let i = 0; i < CONFIG.iterations; i++) {
    const latency = await runHandoff(browser);
    results.push(latency);
    process.stdout.write(`Iteration ${i + 1}/${CONFIG.iterations}: ${latency}ms\r`);
  }
  
  await browser.close();
  
  // Calculate statistics
  const sorted = [...results].sort((a, b) => a - b);
  const avg = results.reduce((a, b) => a + b, 0) / results.length;
  const min = Math.min(...results);
  const max = Math.max(...results);
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];
  
  // Output results
  console.log('\n\nResults');
  console.log('-------');
  console.log(`Average: ${avg.toFixed(2)}ms`);
  console.log(`Min: ${min}ms`);
  console.log(`Max: ${max}ms`);
  console.log(`P50: ${p50}ms`);
  console.log(`P95: ${p95}ms`);
  console.log(`P99: ${p99}ms`);
  console.log(`\nBudget: 100ms`);
  console.log(`Status: ${avg < 100 ? '✅ PASS' : '❌ FAIL'}`);
  
  // Save results
  const fs = require('fs');
  const reportDir = './reports';
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }
  
  fs.writeFileSync(
    `${reportDir}/handoff-latency.json`,
    JSON.stringify({
      timestamp: new Date().toISOString(),
      iterations: CONFIG.iterations,
      metrics: { avg, min, max, p50, p95, p99 },
      rawResults: results,
      budget: 100,
      passed: avg < 100,
    }, null, 2)
  );
  
  return { avg, p95, p99, passed: avg < 100 };
}

async function runHandoff(browser) {
  // Create mobile context
  const mobileContext = await browser.newContext({
    viewport: { width: 375, height: 667 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
  });
  const mobilePage = await mobileContext.newPage();
  
  // Create session
  await mobilePage.goto(CONFIG.baseUrl);
  await mobilePage.click('[data-testid="create-session-btn"]');
  await mobilePage.waitForSelector('[data-testid="session-id"]');
  
  // Get handoff token
  await mobilePage.click('[data-testid="handoff-btn"]');
  const handoffToken = await mobilePage.locator('[data-testid="handoff-token"]').textContent();
  
  // Measure handoff to desktop
  const desktopContext = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });
  const desktopPage = await desktopContext.newPage();
  
  const startTime = Date.now();
  await desktopPage.goto(`${CONFIG.baseUrl}/?handoff=${handoffToken}`);
  await desktopPage.waitForSelector('[data-testid="session-connected"]', { timeout: 10000 });
  const latency = Date.now() - startTime;
  
  // Cleanup
  await mobileContext.close();
  await desktopContext.close();
  
  return latency;
}

// Run benchmark
measureHandoffLatency()
  .then((results) => {
    console.log('\n✅ Benchmark complete');
    process.exit(results.passed ? 0 : 1);
  })
  .catch((error) => {
    console.error('\n❌ Benchmark failed:', error);
    process.exit(1);
  });
