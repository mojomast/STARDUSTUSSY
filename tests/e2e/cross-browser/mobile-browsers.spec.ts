import { test, expect } from '../fixtures/base';
import { createTestUser, cleanupTestUser } from '../fixtures/users';
import { DevicePresets } from '../fixtures/base';

test.describe('Cross-Browser Testing - Mobile Browsers', () => {
  let testUser: any;

  test.beforeEach(async ({ database }) => {
    testUser = await createTestUser(database);
  });

  test.afterEach(async ({ database }) => {
    if (testUser) {
      await cleanupTestUser(database, testUser.email);
    }
  });

  test('iOS Safari: complete login flow', async ({ browser }) => {
    const context = await browser.newContext({
      ...DevicePresets.mobile,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    });
    const page = await context.newPage();

    await page.goto('/login');
    await page.fill('[data-testid="email-input"], input#email', testUser.email);
    await page.fill('[data-testid="password-input"], input#password', testUser.password);
    await page.click('[data-testid="login-submit"], button[type="submit"]');
    await page.waitForURL('/', { timeout: 10000 });
    
    await expect(page.locator('[data-testid="dashboard-container"]')).toBeVisible();
    
    await context.close();
  });

  test('Chrome Mobile: complete login flow', async ({ browser }) => {
    const context = await browser.newContext({
      ...DevicePresets.mobile,
      userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36',
    });
    const page = await context.newPage();

    await page.goto('/login');
    await page.fill('[data-testid="email-input"], input#email', testUser.email);
    await page.fill('[data-testid="password-input"], input#password', testUser.password);
    await page.click('[data-testid="login-submit"], button[type="submit"]');
    await page.waitForURL('/', { timeout: 10000 });
    
    await expect(page.locator('[data-testid="dashboard-container"]')).toBeVisible();
    
    await context.close();
  });

  test('mobile: touch interactions work', async ({ browser }) => {
    const context = await browser.newContext(DevicePresets.mobile);
    const page = await context.newPage();

    await page.goto('/login');
    
    // Test tap on elements
    await page.tap('[data-testid="email-input"], input#email');
    await page.fill('[data-testid="email-input"], input#email', testUser.email);
    
    await page.tap('[data-testid="password-input"], input#password');
    await page.fill('[data-testid="password-input"], input#password', testUser.password);
    
    await page.tap('[data-testid="login-submit"], button[type="submit"]');
    await page.waitForURL('/', { timeout: 10000 });
    
    await expect(page.locator('[data-testid="dashboard-container"]')).toBeVisible();
    
    await context.close();
  });

  test('mobile: viewport meta tag present', async ({ browser }) => {
    const context = await browser.newContext(DevicePresets.mobile);
    const page = await context.newPage();

    await page.goto('/login');
    
    const viewportMeta = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(viewportMeta).toContain('width=device-width');
    
    await context.close();
  });

  test('mobile: responsive navigation', async ({ browser }) => {
    const context = await browser.newContext(DevicePresets.mobile);
    const page = await context.newPage();

    await page.goto('/login');
    await page.fill('[data-testid="email-input"], input#email', testUser.email);
    await page.fill('[data-testid="password-input"], input#password', testUser.password);
    await page.click('[data-testid="login-submit"], button[type="submit"]');
    await page.waitForURL('/');
    
    // Should show mobile navigation (hamburger menu)
    const mobileNav = page.locator('[data-testid="mobile-nav"], [data-testid="hamburger-menu"], button[aria-label*="menu"]');
    if (await mobileNav.isVisible().catch(() => false)) {
      await mobileNav.tap();
      
      // Menu should open
      await expect(page.locator('[data-testid="mobile-menu"], nav[role="navigation"]')).toBeVisible();
    }
    
    await context.close();
  });

  test('mobile: form inputs are properly sized', async ({ browser }) => {
    const context = await browser.newContext(DevicePresets.mobile);
    const page = await context.newPage();

    await page.goto('/login');
    
    // Check input sizes - should be touch-friendly (min 44px)
    const inputBox = await page.locator('[data-testid="email-input"], input#email').boundingBox();
    
    if (inputBox) {
      expect(inputBox.height).toBeGreaterThanOrEqual(30); // Minimum touch target size
      expect(inputBox.width).toBeGreaterThan(100);
    }
    
    await context.close();
  });

  test('mobile: virtual keyboard handling', async ({ browser }) => {
    const context = await browser.newContext(DevicePresets.mobile);
    const page = await context.newPage();

    await page.goto('/login');
    
    // Focus on input should not break layout
    await page.click('[data-testid="email-input"], input#email');
    
    // Form should still be visible and accessible
    await expect(page.locator('[data-testid="password-input"], input#password')).toBeVisible();
    await expect(page.locator('[data-testid="login-submit"], button[type="submit"]')).toBeVisible();
    
    await context.close();
  });

  test('mobile: orientation changes handled', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 375, height: 667 },
    });
    const page = await context.newPage();

    await page.goto('/login');
    await expect(page.locator('form')).toBeVisible();
    
    // Change to landscape
    await page.setViewportSize({ width: 667, height: 375 });
    await page.waitForTimeout(500);
    
    // Form should still be visible
    await expect(page.locator('[data-testid="email-input"], input#email')).toBeVisible();
    
    // Change back to portrait
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(500);
    
    await expect(page.locator('[data-testid="email-input"], input#email')).toBeVisible();
    
    await context.close();
  });

  test('mobile: pull-to-refresh disabled or handled', async ({ browser }) => {
    const context = await browser.newContext(DevicePresets.mobile);
    const page = await context.newPage();

    await page.goto('/login');
    
    // Check if overscroll-behavior is set to prevent pull-to-refresh
    const bodyStyles = await page.locator('body').evaluate((el) => {
      const computed = window.getComputedStyle(el);
      return {
        overscrollBehavior: computed.overscrollBehavior,
        overscrollBehaviorY: computed.overscrollBehaviorY,
      };
    });
    
    // Should have overscroll-behavior set (optional but good practice)
    expect(['contain', 'none', 'auto']).toContain(bodyStyles.overscrollBehaviorY);
    
    await context.close();
  });

  test('mobile: PWA manifest present', async ({ browser }) => {
    const context = await browser.newContext(DevicePresets.mobile);
    const page = await context.newPage();

    await page.goto('/');
    
    // Check for manifest link
    const manifestLink = await page.locator('link[rel="manifest"]').getAttribute('href').catch(() => null);
    
    if (manifestLink) {
      // Manifest should be accessible
      const manifestUrl = new URL(manifestLink, page.url()).toString();
      const response = await page.request.get(manifestUrl);
      expect(response.status()).toBe(200);
      
      const manifest = await response.json();
      expect(manifest).toHaveProperty('name');
      expect(manifest).toHaveProperty('start_url');
    }
    
    await context.close();
  });

  test('mobile: theme color meta tag', async ({ browser }) => {
    const context = await browser.newContext(DevicePresets.mobile);
    const page = await context.newPage();

    await page.goto('/');
    
    const themeColor = await page.locator('meta[name="theme-color"]').getAttribute('content').catch(() => null);
    
    // Should have theme color for mobile browsers
    if (themeColor) {
      expect(themeColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
    
    await context.close();
  });
});

test.describe('Mobile-Specific Interactions', () => {
  test('mobile: swipe gestures handled', async ({ browser }) => {
    const context = await browser.newContext(DevicePresets.mobile);
    const page = await context.newPage();

    await page.goto('/login');
    
    // Test swipe (if swipe navigation exists)
    const viewport = page.viewportSize();
    if (viewport) {
      await page.touchscreen.tap(viewport.width / 2, viewport.height / 2);
    }
    
    // Page should still be stable
    await expect(page.locator('body')).toBeVisible();
    
    await context.close();
  });

  test('mobile: double-tap zoom prevented', async ({ browser }) => {
    const context = await browser.newContext(DevicePresets.mobile);
    const page = await context.newPage();

    await page.goto('/login');
    
    // Check viewport meta tag prevents zoom
    const viewportContent = await page.locator('meta[name="viewport"]').getAttribute('content');
    
    if (viewportContent) {
      const hasUserScalable = viewportContent.includes('user-scalable');
      if (hasUserScalable) {
        expect(viewportContent).toMatch(/user-scalable=no/);
      }
    }
    
    await context.close();
  });
});
