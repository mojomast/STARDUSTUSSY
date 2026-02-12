import { test as base, expect, Page, BrowserContext } from '@playwright/test';
import { TestUsers, createTestUser, cleanupTestUser } from '../fixtures/users';
import { DatabaseHelper } from '../fixtures/database';

// Extend base test with fixtures
type TestFixtures = {
  authenticatedPage: Page;
  testUser: { email: string; password: string; name: string };
  database: DatabaseHelper;
  deviceType: 'desktop' | 'mobile' | 'tablet';
};

export const test = base.extend<TestFixtures>({
  // Database helper fixture
  database: async ({}, use) => {
    const db = new DatabaseHelper();
    await db.connect();
    await use(db);
    await db.disconnect();
  },

  // Test user fixture
  testUser: async ({ database }, use) => {
    const user = await createTestUser(database);
    await use(user);
    await cleanupTestUser(database, user.email);
  },

  // Authenticated page fixture
  authenticatedPage: async ({ page, testUser }, use) => {
    // Navigate to login
    await page.goto('/login');
    
    // Fill in credentials
    await page.fill('[data-testid="email-input"]', testUser.email);
    await page.fill('[data-testid="password-input"]', testUser.password);
    
    // Submit login
    await page.click('[data-testid="login-submit"]');
    
    // Wait for redirect to dashboard
    await page.waitForURL('/', { timeout: 10000 });
    await expect(page.locator('[data-testid="dashboard-container"]')).toBeVisible();
    
    await use(page);
  },

  // Device type fixture for responsive testing
  deviceType: ['desktop', { option: true }],
});

export { expect };

// Custom expect matchers
expect.extend({
  async toHavePerformanceBudget(page: Page, metric: string, budget: number) {
    const performanceTiming = await page.evaluate(() => {
      const timing = performance.timing;
      return {
        loadTime: timing.loadEventEnd - timing.navigationStart,
        firstPaint: timing.responseStart - timing.navigationStart,
        domInteractive: timing.domInteractive - timing.navigationStart,
      };
    });

    const actual = performanceTiming[metric as keyof typeof performanceTiming];
    const pass = actual <= budget;

    return {
      pass,
      message: () =>
        pass
          ? `Expected ${metric} (${actual}ms) to be greater than budget (${budget}ms)`
          : `Expected ${metric} (${actual}ms) to be less than or equal to budget (${budget}ms)`,
    };
  },
});

// Test utilities
export class E2EUtils {
  static async simulateNetworkFailure(page: Page): Promise<void> {
    await page.route('**/*', (route) => {
      route.abort('failed');
    });
  }

  static async restoreNetwork(page: Page): Promise<void> {
    await page.unroute('**/*');
  }

  static async waitForWebSocketConnection(page: Page, timeout = 10000): Promise<void> {
    await page.waitForFunction(
      () => {
        const status = document.querySelector('[data-testid="connection-status"]');
        return status?.textContent?.toLowerCase().includes('connected');
      },
      { timeout }
    );
  }

  static async captureScreenshot(page: Page, name: string): Promise<void> {
    await page.screenshot({ 
      path: `reports/screenshots/${name}-${Date.now()}.png`,
      fullPage: true 
    });
  }

  static async measureFrameRate(page: Page, duration = 1000): Promise<number> {
    return await page.evaluate(async (ms) => {
      let frameCount = 0;
      const startTime = performance.now();
      
      const countFrames = () => {
        frameCount++;
        if (performance.now() - startTime < ms) {
          requestAnimationFrame(countFrames);
        }
      };
      
      requestAnimationFrame(countFrames);
      await new Promise(resolve => setTimeout(resolve, ms));
      return frameCount;
    }, duration);
  }
}

// Network condition presets
export const NetworkConditions = {
  fast3G: {
    offline: false,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
    latency: 150,
  },
  slow3G: {
    offline: false,
    downloadThroughput: (400 * 1024) / 8,
    uploadThroughput: (400 * 1024) / 8,
    latency: 400,
  },
  offline: {
    offline: true,
    downloadThroughput: 0,
    uploadThroughput: 0,
    latency: 0,
  },
};

// Device presets for testing
export const DevicePresets = {
  desktop: {
    viewport: { width: 1280, height: 720 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  },
  mobile: {
    viewport: { width: 375, height: 667 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
  },
  tablet: {
    viewport: { width: 768, height: 1024 },
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
  },
};
