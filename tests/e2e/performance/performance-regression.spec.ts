import { test, expect } from '../fixtures/base';
import { createTestUser, cleanupTestUser } from '../fixtures/users';
import { E2EUtils } from '../fixtures/base';

// Performance budgets
test.describe.configure({ mode: 'serial' });

const PERFORMANCE_BUDGETS = {
  pageLoad: 3000,        // 3 seconds
  firstPaint: 1500,      // 1.5 seconds
  timeToInteractive: 3500, // 3.5 seconds
  apiResponse: 500,      // 500ms
  animationFrameRate: 55, // 55 FPS minimum
};

const BASELINE_METRICS = {
  login: 1200,
  dashboard: 800,
  sessionCreate: 1500,
  stateSync: 200,
  handoff: 3000,
};

test.describe('Performance Regression Tests', () => {
  let testUser: any;

  test.beforeAll(async ({ database }) => {
    testUser = await createTestUser(database);
  });

  test.afterAll(async ({ database }) => {
    if (testUser) {
      await cleanupTestUser(database, testUser.email);
    }
  });

  test('login page load performance', async ({ page }) => {
    const startTime = Date.now();
    
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    
    const loadTime = Date.now() - startTime;
    
    // Collect detailed metrics
    const metrics = await page.evaluate(() => {
      const timing = performance.timing;
      const paint = performance.getEntriesByType('paint');
      
      return {
        loadTime: timing.loadEventEnd - timing.navigationStart,
        firstPaint: paint.find(p => p.name === 'first-paint')?.startTime || 0,
        firstContentfulPaint: paint.find(p => p.name === 'first-contentful-paint')?.startTime || 0,
        domInteractive: timing.domInteractive - timing.navigationStart,
        domComplete: timing.domComplete - timing.navigationStart,
      };
    });

    // Log metrics for trend analysis
    console.log('Login Page Metrics:', JSON.stringify(metrics));

    // Assert against budgets
    expect(metrics.loadTime).toBeLessThan(PERFORMANCE_BUDGETS.pageLoad);
    expect(metrics.firstContentfulPaint).toBeLessThan(PERFORMANCE_BUDGETS.firstPaint);
    expect(metrics.domInteractive).toBeLessThan(PERFORMANCE_BUDGETS.timeToInteractive);

    // Compare against baseline
    const baselineDiff = ((metrics.loadTime - BASELINE_METRICS.login) / BASELINE_METRICS.login) * 100;
    console.log(`Performance vs baseline: ${baselineDiff.toFixed(2)}%`);
    
    // Fail if more than 20% slower than baseline
    expect(baselineDiff).toBeLessThan(20);
  });

  test('dashboard load performance', async ({ page }) => {
    // Login first
    await page.goto('/login');
    await page.fill('[data-testid="email-input"], input#email', testUser.email);
    await page.fill('[data-testid="password-input"], input#password', testUser.password);
    await page.click('[data-testid="login-submit"], button[type="submit"]');
    await page.waitForURL('/');

    // Now measure dashboard performance
    const startTime = Date.now();
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const loadTime = Date.now() - startTime;

    const metrics = await page.evaluate(() => {
      const timing = performance.timing;
      const paint = performance.getEntriesByType('paint');
      
      return {
        loadTime: timing.loadEventEnd - timing.navigationStart,
        firstContentfulPaint: paint.find(p => p.name === 'first-contentful-paint')?.startTime || 0,
        domInteractive: timing.domInteractive - timing.navigationStart,
      };
    });

    console.log('Dashboard Metrics:', JSON.stringify(metrics));

    expect(metrics.loadTime).toBeLessThan(PERFORMANCE_BUDGETS.pageLoad);
    expect(metrics.firstContentfulPaint).toBeLessThan(PERFORMANCE_BUDGETS.firstPaint);

    const baselineDiff = ((metrics.loadTime - BASELINE_METRICS.dashboard) / BASELINE_METRICS.dashboard) * 100;
    expect(baselineDiff).toBeLessThan(20);
  });

  test('session creation performance', async ({ page }) => {
    await page.goto('/login');
    await page.fill('[data-testid="email-input"], input#email', testUser.email);
    await page.fill('[data-testid="password-input"], input#password', testUser.password);
    await page.click('[data-testid="login-submit"], button[type="submit"]');
    await page.waitForURL('/');

    await page.goto('/sessions');

    const startTime = Date.now();
    await page.click('[data-testid="create-session-btn"], button:text("New Session")');
    await page.fill('[data-testid="session-name"], input[name="name"]', 'Performance Test');
    await page.click('[data-testid="start-session-btn"], button:text("Start")');
    
    // Wait for session to be active
    await page.waitForSelector('[data-testid="session-active"], text=/active/i', { timeout: 5000 });
    
    const operationTime = Date.now() - startTime;
    
    console.log(`Session creation time: ${operationTime}ms`);
    
    expect(operationTime).toBeLessThan(PERFORMANCE_BUDGETS.pageLoad);
    
    const baselineDiff = ((operationTime - BASELINE_METRICS.sessionCreate) / BASELINE_METRICS.sessionCreate) * 100;
    expect(baselineDiff).toBeLessThan(20);
  });

  test('state synchronization performance', async ({ browser }) => {
    const context1 = await browser.newContext();
    const page1 = await context1.newPage();
    const context2 = await browser.newContext();
    const page2 = await context2.newPage();

    // Login both pages
    for (const page of [page1, page2]) {
      await page.goto('/login');
      await page.fill('[data-testid="email-input"], input#email', testUser.email);
      await page.fill('[data-testid="password-input"], input#password', testUser.password);
      await page.click('[data-testid="login-submit"], button[type="submit"]');
      await page.waitForURL('/');
      await page.goto('/sessions');
    }

    // Create session on page1
    await page1.click('[data-testid="create-session-btn"], button:text("New Session")');
    await page1.fill('[data-testid="session-name"], input[name="name"]', 'Sync Performance Test');
    await page1.click('[data-testid="start-session-btn"], button:text("Start")');
    await page1.waitForTimeout(1000);

    // Measure sync time
    const startTime = Date.now();
    await page1.fill('[data-testid="session-notes"], textarea', 'Test sync data');
    
    // Wait for sync to page2
    await page2.waitForTimeout(3000);
    const page2Value = await page2.inputValue('[data-testid="session-notes"], textarea');
    const syncTime = Date.now() - startTime;

    expect(page2Value).toContain('Test sync data');
    console.log(`State sync time: ${syncTime}ms`);
    
    expect(syncTime).toBeLessThan(PERFORMANCE_BUDGETS.apiResponse * 6); // Allow for network latency

    await context1.close();
    await context2.close();
  });

  test('animation frame rate performance', async ({ page }) => {
    await page.goto('/login');
    await page.fill('[data-testid="email-input"], input#email', testUser.email);
    await page.fill('[data-testid="password-input"], input#password', testUser.password);
    await page.click('[data-testid="login-submit"], button[type="submit"]');
    await page.waitForURL('/');

    const fps = await E2EUtils.measureFrameRate(page, 2000);
    
    console.log(`Animation FPS: ${fps}`);
    
    expect(fps).toBeGreaterThanOrEqual(PERFORMANCE_BUDGETS.animationFrameRate);
  });

  test('memory usage during session', async ({ page }) => {
    await page.goto('/login');
    await page.fill('[data-testid="email-input"], input#email', testUser.email);
    await page.fill('[data-testid="password-input"], input#password', testUser.password);
    await page.click('[data-testid="login-submit"], button[type="submit"]');
    await page.waitForURL('/');

    // Get initial memory
    const initialMemory = await page.evaluate(() => {
      return (performance as any).memory?.usedJSHeapSize || 0;
    });

    // Perform operations
    await page.goto('/sessions');
    for (let i = 0; i < 5; i++) {
      await page.click('[data-testid="create-session-btn"], button:text("New Session")');
      await page.fill('[data-testid="session-name"], input[name="name"]', `Session ${i}`);
      await page.click('[data-testid="start-session-btn"], button:text("Start")');
      await page.waitForTimeout(500);
      await page.click('[data-testid="end-session-btn"], button:text("End")');
      await page.waitForTimeout(500);
    }

    // Get final memory
    const finalMemory = await page.evaluate(() => {
      return (performance as any).memory?.usedJSHeapSize || 0;
    });

    const memoryIncrease = finalMemory - initialMemory;
    console.log(`Memory increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)} MB`);

    // Memory should not increase excessively (less than 50MB)
    if (initialMemory > 0) {
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    }
  });

  test('API response times', async ({ page }) => {
    const apiMetrics: { endpoint: string; duration: number }[] = [];

    // Intercept API calls
    await page.route('**/api/**', async (route) => {
      const startTime = Date.now();
      const response = await route.fetch();
      const duration = Date.now() - startTime;
      
      const url = route.request().url();
      const endpoint = url.split('/api/')[1]?.split('?')[0] || 'unknown';
      apiMetrics.push({ endpoint, duration });
      
      await route.fulfill({ response });
    });

    await page.goto('/login');
    await page.fill('[data-testid="email-input"], input#email', testUser.email);
    await page.fill('[data-testid="password-input"], input#password', testUser.password);
    await page.click('[data-testid="login-submit"], button[type="submit"]');
    await page.waitForURL('/');

    await page.goto('/sessions');
    await page.click('[data-testid="create-session-btn"], button:text("New Session")');

    console.log('API Metrics:', JSON.stringify(apiMetrics));

    // Check all API calls meet budget
    for (const metric of apiMetrics) {
      expect(metric.duration).toBeLessThan(PERFORMANCE_BUDGETS.apiResponse);
    }
  });

  test('WebSocket connection establishment time', async ({ page }) => {
    const startTime = Date.now();
    
    await page.goto('/login');
    await page.fill('[data-testid="email-input"], input#email', testUser.email);
    await page.fill('[data-testid="password-input"], input#password', testUser.password);
    await page.click('[data-testid="login-submit"], button[type="submit"]');
    await page.waitForURL('/');

    // Wait for WebSocket connection
    await E2EUtils.waitForWebSocketConnection(page, 10000);
    
    const connectionTime = Date.now() - startTime;
    console.log(`WebSocket connection time: ${connectionTime}ms`);
    
    expect(connectionTime).toBeLessThan(5000);
  });

  test('resource loading performance', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    const resources = await page.evaluate(() => {
      return performance.getEntriesByType('resource').map((r: any) => ({
        name: r.name.split('/').pop(),
        duration: r.duration,
        size: r.transferSize,
      }));
    });

    // Check for slow resources
    const slowResources = resources.filter((r: any) => r.duration > 1000);
    
    if (slowResources.length > 0) {
      console.warn('Slow resources detected:', slowResources);
    }

    // No resource should take more than 3 seconds
    for (const resource of resources) {
      expect(resource.duration).toBeLessThan(3000);
    }
  });
});

test.describe('Performance Budget Enforcement', () => {
  test('bundle size budget', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    const jsResources = await page.evaluate(() => {
      return performance.getEntriesByType('resource')
        .filter((r: any) => r.name.endsWith('.js'))
        .map((r: any) => ({
          name: r.name,
          size: r.transferSize,
        }));
    });

    const totalJsSize = jsResources.reduce((sum: number, r: any) => sum + r.size, 0);
    console.log(`Total JS bundle size: ${(totalJsSize / 1024).toFixed(2)} KB`);

    // Total JS should be less than 500KB (budget)
    expect(totalJsSize).toBeLessThan(500 * 1024);
  });

  test('image optimization budget', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    const imageResources = await page.evaluate(() => {
      return performance.getEntriesByType('resource')
        .filter((r: any) => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(r.name))
        .map((r: any) => ({
          name: r.name,
          size: r.transferSize,
        }));
    });

    for (const img of imageResources) {
      // Individual images should be less than 200KB
      expect(img.size).toBeLessThan(200 * 1024);
    }
  });
});
