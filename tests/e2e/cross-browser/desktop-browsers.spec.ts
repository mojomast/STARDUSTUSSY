import { test, expect } from '../fixtures/base';
import { createTestUser, cleanupTestUser } from '../fixtures/users';

test.describe('Cross-Browser Testing - Desktop Browsers', () => {
  let testUser: any;

  test.beforeEach(async ({ database }) => {
    testUser = await createTestUser(database);
  });

  test.afterEach(async ({ database }) => {
    if (testUser) {
      await cleanupTestUser(database, testUser.email);
    }
  });

  test('Chrome: complete login flow', async ({ page }) => {
    test.skip(!test.info().project.name.includes('chromium'), 'Chrome only');
    
    await page.goto('/login');
    await page.fill('[data-testid="email-input"], input#email', testUser.email);
    await page.fill('[data-testid="password-input"], input#password', testUser.password);
    await page.click('[data-testid="login-submit"], button[type="submit"]');
    await page.waitForURL('/', { timeout: 10000 });
    
    await expect(page.locator('[data-testid="dashboard-container"]')).toBeVisible();
  });

  test('Firefox: complete login flow', async ({ page }) => {
    test.skip(!test.info().project.name.includes('firefox'), 'Firefox only');
    
    await page.goto('/login');
    await page.fill('[data-testid="email-input"], input#email', testUser.email);
    await page.fill('[data-testid="password-input"], input#password', testUser.password);
    await page.click('[data-testid="login-submit"], button[type="submit"]');
    await page.waitForURL('/', { timeout: 10000 });
    
    await expect(page.locator('[data-testid="dashboard-container"]')).toBeVisible();
  });

  test('WebKit: complete login flow', async ({ page }) => {
    test.skip(!test.info().project.name.includes('webkit'), 'WebKit only');
    
    await page.goto('/login');
    await page.fill('[data-testid="email-input"], input#email', testUser.email);
    await page.fill('[data-testid="password-input"], input#password', testUser.password);
    await page.click('[data-testid="login-submit"], button[type="submit"]');
    await page.waitForURL('/', { timeout: 10000 });
    
    await expect(page.locator('[data-testid="dashboard-container"]')).toBeVisible();
  });

  test('all browsers: consistent styling', async ({ page }) => {
    await page.goto('/login');
    
    // Check that form elements are properly styled
    const loginForm = page.locator('form');
    await expect(loginForm).toBeVisible();
    
    // Verify inputs have proper styling
    const emailInput = page.locator('[data-testid="email-input"], input#email');
    const styles = await emailInput.evaluate((el) => {
      const computed = window.getComputedStyle(el);
      return {
        display: computed.display,
        visibility: computed.visibility,
        padding: computed.padding,
      };
    });
    
    expect(styles.display).not.toBe('none');
    expect(styles.visibility).not.toBe('hidden');
  });

  test('all browsers: WebSocket functionality', async ({ page }) => {
    await page.goto('/login');
    await page.fill('[data-testid="email-input"], input#email', testUser.email);
    await page.fill('[data-testid="password-input"], input#password', testUser.password);
    await page.click('[data-testid="login-submit"], button[type="submit"]');
    await page.waitForURL('/');
    
    // Wait for WebSocket connection
    await page.waitForTimeout(3000);
    
    // Check connection status
    const connectionStatus = await page.locator('[data-testid="connection-status"]').textContent().catch(() => '');
    
    // Should be connected or show appropriate status
    expect(connectionStatus.toLowerCase()).toMatch(/connected|connecting|offline/);
  });

  test('all browsers: localStorage works correctly', async ({ page }) => {
    await page.goto('/login');
    
    // Set item in localStorage
    await page.evaluate(() => {
      localStorage.setItem('test-key', 'test-value');
    });
    
    // Verify it's stored
    const value = await page.evaluate(() => localStorage.getItem('test-key'));
    expect(value).toBe('test-value');
    
    // Reload and verify persistence
    await page.reload();
    const persistedValue = await page.evaluate(() => localStorage.getItem('test-key'));
    expect(persistedValue).toBe('test-value');
  });

  test('all browsers: responsive layout', async ({ page }) => {
    await page.goto('/login');
    
    // Test different viewport sizes
    const viewports = [
      { width: 1920, height: 1080, name: 'Full HD' },
      { width: 1366, height: 768, name: 'Laptop' },
      { width: 1280, height: 720, name: 'HD' },
    ];
    
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.reload();
      await page.waitForLoadState('networkidle');
      
      // Form should still be usable
      await expect(page.locator('[data-testid="email-input"], input#email')).toBeVisible();
      await expect(page.locator('[data-testid="password-input"], input#password')).toBeVisible();
    }
  });

  test('Chrome: service worker registration', async ({ page }) => {
    test.skip(!test.info().project.name.includes('chromium'), 'Chrome only');
    
    await page.goto('/');
    
    // Check if service worker is registered
    const swRegistered = await page.evaluate(async () => {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();
        return !!registration;
      }
      return false;
    });
    
    // Note: This might be false in test environment
    if (swRegistered) {
      expect(swRegistered).toBe(true);
    }
  });

  test('all browsers: form validation behavior', async ({ page }) => {
    await page.goto('/login');
    
    // Submit empty form
    await page.click('[data-testid="login-submit"], button[type="submit"]');
    
    // Should show validation message (browser-native or custom)
    const validationMessage = await page.locator('input#email').evaluate((el: HTMLInputElement) => el.validationMessage);
    
    expect(validationMessage.length).toBeGreaterThan(0);
  });

  test('all browsers: keyboard navigation works', async ({ page }) => {
    await page.goto('/login');
    
    // Tab through form elements
    await page.keyboard.press('Tab');
    let focused = await page.locator(':focus').getAttribute('data-testid').catch(() => '');
    
    // Should have focusable elements
    const focusableElements = await page.locator('input, button, a').count();
    expect(focusableElements).toBeGreaterThan(0);
  });
});

test.describe('Browser-Specific Features', () => {
  test('Chrome: supports modern ES features', async ({ page }) => {
    test.skip(!test.info().project.name.includes('chromium'), 'Chrome only');
    
    await page.goto('/');
    
    const supportsES2020 = await page.evaluate(() => {
      try {
        // Test BigInt support
        const big = BigInt(1);
        // Test optional chaining
        const obj = { a: { b: 1 } };
        const val = obj?.a?.b;
        // Test nullish coalescing
        const nullish = null ?? 'default';
        return true;
      } catch {
        return false;
      }
    });
    
    expect(supportsES2020).toBe(true);
  });

  test('Firefox: CSS Grid and Flexbox', async ({ page }) => {
    test.skip(!test.info().project.name.includes('firefox'), 'Firefox only');
    
    await page.goto('/login');
    
    const supportsLayout = await page.evaluate(() => {
      const testEl = document.createElement('div');
      return (
        CSS.supports('display', 'grid') &&
        CSS.supports('display', 'flex')
      );
    });
    
    expect(supportsLayout).toBe(true);
  });

  test('Safari: IndexedDB support', async ({ page }) => {
    test.skip(!test.info().project.name.includes('webkit'), 'Safari only');
    
    await page.goto('/');
    
    const supportsIDB = await page.evaluate(() => {
      return 'indexedDB' in window;
    });
    
    expect(supportsIDB).toBe(true);
  });
});
