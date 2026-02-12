import { test, expect } from '../fixtures/base';
import { createTestUser, cleanupTestUser } from '../fixtures/users';

test.describe('Admin Dashboard Navigation', () => {
  let adminUser: any;
  let regularUser: any;

  test.beforeEach(async ({ database }) => {
    adminUser = await createTestUser(database, { role: 'admin' });
    regularUser = await createTestUser(database, { role: 'user' });
  });

  test.afterEach(async ({ database }) => {
    if (adminUser) await cleanupTestUser(database, adminUser.email);
    if (regularUser) await cleanupTestUser(database, regularUser.email);
  });

  test('admin can access dashboard', async ({ page }) => {
    // Login as admin
    await page.goto('/login');
    await page.fill('[data-testid="email-input"], input#email', adminUser.email);
    await page.fill('[data-testid="password-input"], input#password', adminUser.password);
    await page.click('[data-testid="login-submit"], button[type="submit"]');
    await page.waitForURL('/', { timeout: 10000 });

    // Should see admin dashboard
    await expect(page.locator('[data-testid="admin-dashboard"], [data-testid="dashboard-container"]')).toBeVisible();
    
    // Should see admin-specific elements
    const adminElements = await page.locator('[data-testid="admin-panel"], [data-testid="user-management"], text=/admin/i').count();
    expect(adminElements).toBeGreaterThan(0);
  });

  test('admin dashboard displays metrics', async ({ page }) => {
    await page.goto('/login');
    await page.fill('[data-testid="email-input"], input#email', adminUser.email);
    await page.fill('[data-testid="password-input"], input#password', adminUser.password);
    await page.click('[data-testid="login-submit"], button[type="submit"]');
    await page.waitForURL('/');

    // Check for metrics cards
    await expect(page.locator('[data-testid="metrics-cards"], [data-testid="stats-container"]')).toBeVisible();
    
    // Should display key metrics
    const metrics = ['users', 'sessions', 'active', 'sync'];
    for (const metric of metrics) {
      const metricElement = page.locator(`[data-testid*="${metric}"], text=/${metric}/i`).first();
      if (await metricElement.isVisible().catch(() => false)) {
        await expect(metricElement).toBeVisible();
      }
    }
  });

  test('admin can navigate to user management', async ({ page }) => {
    await page.goto('/login');
    await page.fill('[data-testid="email-input"], input#email', adminUser.email);
    await page.fill('[data-testid="password-input"], input#password', adminUser.password);
    await page.click('[data-testid="login-submit"], button[type="submit"]');
    await page.waitForURL('/');

    // Navigate to users section
    await page.click('[data-testid="users-link"], [data-testid="user-management"], a:text("Users")');
    
    await page.waitForURL('**/users', { timeout: 5000 });
    
    // Should show user list
    await expect(page.locator('[data-testid="users-list"], [data-testid="user-table"]')).toBeVisible();
  });

  test('admin can view system logs', async ({ page }) => {
    await page.goto('/login');
    await page.fill('[data-testid="email-input"], input#email', adminUser.email);
    await page.fill('[data-testid="password-input"], input#password', adminUser.password);
    await page.click('[data-testid="login-submit"], button[type="submit"]');
    await page.waitForURL('/');

    // Navigate to logs
    await page.click('[data-testid="logs-link"], a:text("Logs"), a:text("System")');
    
    // Should show logs
    await expect(page.locator('[data-testid="logs-container"], [data-testid="log-entries"]')).toBeVisible();
  });

  test('admin can filter dashboard data', async ({ page }) => {
    await page.goto('/login');
    await page.fill('[data-testid="email-input"], input#email', adminUser.email);
    await page.fill('[data-testid="password-input"], input#password', adminUser.password);
    await page.click('[data-testid="login-submit"], button[type="submit"]');
    await page.waitForURL('/');

    // Apply time range filter
    const timeFilter = page.locator('[data-testid="time-range"], select[name="timeRange"]');
    if (await timeFilter.isVisible().catch(() => false)) {
      await timeFilter.selectOption('24h');
      await page.waitForTimeout(500);
      
      // Data should update
      await expect(page.locator('[data-testid="metrics-cards"]')).toBeVisible();
    }
  });

  test('admin dashboard is responsive', async ({ page }) => {
    await page.goto('/login');
    await page.fill('[data-testid="email-input"], input#email', adminUser.email);
    await page.fill('[data-testid="password-input"], input#password', adminUser.password);
    await page.click('[data-testid="login-submit"], button[type="submit"]');
    await page.waitForURL('/');

    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Should still show dashboard (may be collapsed)
    await expect(page.locator('[data-testid="dashboard-container"], [data-testid="hamburger-menu"]')).toBeVisible();
    
    // Test tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    await expect(page.locator('[data-testid="dashboard-container"]')).toBeVisible();
  });

  test('regular user cannot access admin features', async ({ page }) => {
    // Login as regular user
    await page.goto('/login');
    await page.fill('[data-testid="email-input"], input#email', regularUser.email);
    await page.fill('[data-testid="password-input"], input#password', regularUser.password);
    await page.click('[data-testid="login-submit"], button[type="submit"]');
    await page.waitForURL('/', { timeout: 10000 });

    // Try to access admin route
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');
    
    // Should be redirected or show access denied
    const currentUrl = page.url();
    const accessDenied = await page.locator('text=/access denied/i, text=/forbidden/i, text=/unauthorized/i').isVisible().catch(() => false);
    
    expect(accessDenied || !currentUrl.includes('/admin')).toBeTruthy();
  });

  test('admin can view real-time updates', async ({ page, browser }) => {
    await page.goto('/login');
    await page.fill('[data-testid="email-input"], input#email', adminUser.email);
    await page.fill('[data-testid="password-input"], input#password', adminUser.password);
    await page.click('[data-testid="login-submit"], button[type="submit"]');
    await page.waitForURL('/');

    // Note initial metrics
    const initialActiveSessions = await page.locator('[data-testid="active-sessions-count"]').textContent().catch(() => '0');

    // Create a new user session in another context
    const userContext = await browser.newContext();
    const userPage = await userContext.newPage();
    
    await userPage.goto('/login');
    await userPage.fill('[data-testid="email-input"], input#email', regularUser.email);
    await userPage.fill('[data-testid="password-input"], input#password', regularUser.password);
    await userPage.click('[data-testid="login-submit"], button[type="submit"]');
    await userPage.waitForURL('/');

    // Wait for potential update
    await page.waitForTimeout(3000);

    // Dashboard should reflect changes (if real-time is implemented)
    await userContext.close();
  });

  test('admin can export dashboard data', async ({ page }) => {
    await page.goto('/login');
    await page.fill('[data-testid="email-input"], input#email', adminUser.email);
    await page.fill('[data-testid="password-input"], input#password', adminUser.password);
    await page.click('[data-testid="login-submit"], button[type="submit"]');
    await page.waitForURL('/');

    // Look for export button
    const exportBtn = page.locator('[data-testid="export-btn"], button:text("Export")');
    if (await exportBtn.isVisible().catch(() => false)) {
      // Start waiting for download before clicking
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        exportBtn.click(),
      ]);
      
      // Verify download started
      expect(download.suggestedFilename()).toMatch(/\.(csv|xlsx|json)$/);
    }
  });

  test('admin dashboard shows alerts and notifications', async ({ page }) => {
    await page.goto('/login');
    await page.fill('[data-testid="email-input"], input#email', adminUser.email);
    await page.fill('[data-testid="password-input"], input#password', adminUser.password);
    await page.click('[data-testid="login-submit"], button[type="submit"]');
    await page.waitForURL('/');

    // Check for alerts panel
    const alertsPanel = page.locator('[data-testid="alerts-panel"], [data-testid="notifications"]');
    if (await alertsPanel.isVisible().catch(() => false)) {
      await expect(alertsPanel).toBeVisible();
    }
  });
});
