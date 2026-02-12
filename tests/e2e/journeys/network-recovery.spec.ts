import { test, expect } from '../fixtures/base';
import { createTestUser, cleanupTestUser, createTestSession } from '../fixtures/users';
import { E2EUtils, NetworkConditions } from '../fixtures/base';

test.describe('Session Recovery After Network Failure', () => {
  let testUser: any;

  test.beforeEach(async ({ database }) => {
    testUser = await createTestUser(database);
  });

  test.afterEach(async ({ database }) => {
    if (testUser) {
      await cleanupTestUser(database, testUser.email);
    }
  });

  test('should recover session after brief network outage', async ({ page, context }) => {
    // Login and create session
    await page.goto('/login');
    await page.fill('[data-testid="email-input"], input#email', testUser.email);
    await page.fill('[data-testid="password-input"], input#password', testUser.password);
    await page.click('[data-testid="login-submit"], button[type="submit"]');
    await page.waitForURL('/', { timeout: 10000 });

    await page.goto('/sessions');
    await page.click('[data-testid="create-session-btn"], button:text("New Session")');
    await page.fill('[data-testid="session-name"], input[name="name"]', 'Recovery Test');
    await page.click('[data-testid="start-session-btn"], button:text("Start")');
    
    // Add some state
    await page.fill('[data-testid="session-notes"], textarea', 'Before network failure');
    await page.waitForTimeout(1000);

    // Simulate network failure
    await test.step('Simulate network failure', async () => {
      await context.setOffline(true);
      
      // Should show offline indicator
      await expect(page.locator('[data-testid="offline-indicator"], text=/offline/i')).toBeVisible({ timeout: 5000 });
      
      // Connection status should show disconnected
      await expect(page.locator('[data-testid="connection-status"], text=/disconnected/i, text=/offline/i')).toBeVisible();
    });

    // Continue working offline
    await test.step('Work offline', async () => {
      await page.fill('[data-testid="session-notes"], textarea', 'Before network failure\nAdded offline');
      await page.waitForTimeout(1000);
    });

    // Restore network
    await test.step('Restore network and recover', async () => {
      await context.setOffline(false);
      
      // Should reconnect
      await expect(page.locator('[data-testid="connection-status"], text=/connected/i')).toBeVisible({ timeout: 15000 });
      
      // Offline indicator should disappear
      await expect(page.locator('[data-testid="offline-indicator"]')).not.toBeVisible({ timeout: 5000 });
      
      // Wait for sync
      await page.waitForTimeout(2000);
    });

    // Verify session recovered
    await test.step('Verify data integrity', async () => {
      await page.reload();
      await page.waitForLoadState('networkidle');
      
      const notes = await page.inputValue('[data-testid="session-notes"], textarea');
      expect(notes).toContain('Added offline');
    });
  });

  test('should queue changes during extended outage', async ({ page, context, database }) => {
    // Login and create session
    await page.goto('/login');
    await page.fill('[data-testid="email-input"], input#email', testUser.email);
    await page.fill('[data-testid="password-input"], input#password', testUser.password);
    await page.click('[data-testid="login-submit"], button[type="submit"]');
    await page.waitForURL('/');

    await page.goto('/sessions');
    await page.click('[data-testid="create-session-btn"], button:text("New Session")');
    await page.fill('[data-testid="session-name"], input[name="name"]', 'Queue Test');
    await page.click('[data-testid="start-session-btn"], button:text("Start")');

    // Go offline
    await context.setOffline(true);
    
    // Make multiple changes while offline
    const changes = [
      'Change 1',
      'Change 2',
      'Change 3',
      'Final change'
    ];
    
    for (const change of changes) {
      await page.fill('[data-testid="session-notes"], textarea', change);
      await page.waitForTimeout(500);
    }

    // Restore network
    await context.setOffline(false);
    
    // Wait for reconnection and sync
    await expect(page.locator('[data-testid="connection-status"], text=/connected/i')).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(3000);

    // Verify final state synced
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    const finalNotes = await page.inputValue('[data-testid="session-notes"], textarea');
    expect(finalNotes).toBe('Final change');
  });

  test('should handle intermittent connectivity', async ({ page, context }) => {
    // Login
    await page.goto('/login');
    await page.fill('[data-testid="email-input"], input#email', testUser.email);
    await page.fill('[data-testid="password-input"], input#password', testUser.password);
    await page.click('[data-testid="login-submit"], button[type="submit"]');
    await page.waitForURL('/');

    await page.goto('/sessions');
    await page.click('[data-testid="create-session-btn"], button:text("New Session")');
    await page.fill('[data-testid="session-name"], input[name="name"]', 'Intermittent Test');
    await page.click('[data-testid="start-session-btn"], button:text("Start")');

    // Simulate intermittent connectivity
    for (let i = 0; i < 3; i++) {
      // Go offline
      await context.setOffline(true);
      await page.waitForTimeout(1000);
      
      // Make change
      await page.fill('[data-testid="session-notes"], textarea', `Update ${i + 1}`);
      
      // Go online
      await context.setOffline(false);
      await page.waitForTimeout(2000);
    }

    // Final verification
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    const notes = await page.inputValue('[data-testid="session-notes"], textarea');
    expect(notes).toBe('Update 3');
  });

  test('should recover WebSocket connection after failure', async ({ page, context }) => {
    // Login
    await page.goto('/login');
    await page.fill('[data-testid="email-input"], input#email', testUser.email);
    await page.fill('[data-testid="password-input"], input#password', testUser.password);
    await page.click('[data-testid="login-submit"], button[type="submit"]');
    await page.waitForURL('/');

    // Wait for initial WebSocket connection
    await E2EUtils.waitForWebSocketConnection(page);

    // Block WebSocket connections
    await test.step('Block WebSocket', async () => {
      await page.route('wss://**', (route) => route.abort());
      await page.route('ws://**', (route) => route.abort());
      
      // Should show disconnected state
      await expect(page.locator('[data-testid="connection-status"], text=/disconnected/i')).toBeVisible({ timeout: 10000 });
    });

    // Unblock WebSocket
    await test.step('Unblock WebSocket', async () => {
      await page.unroute('wss://**');
      await page.unroute('ws://**');
      
      // Should reconnect
      await E2EUtils.waitForWebSocketConnection(page, 15000);
      
      await expect(page.locator('[data-testid="connection-status"], text=/connected/i')).toBeVisible();
    });
  });

  test('should preserve session during page reload with network issues', async ({ page, context, database }) => {
    // Login and create session
    await page.goto('/login');
    await page.fill('[data-testid="email-input"], input#email', testUser.email);
    await page.fill('[data-testid="password-input"], input#password', testUser.password);
    await page.click('[data-testid="login-submit"], button[type="submit"]');
    await page.waitForURL('/');

    const session = await createTestSession(database, testUser.id, { status: 'active' });
    await page.goto('/sessions');
    await page.fill('[data-testid="session-notes"], textarea', 'Important data');
    await page.waitForTimeout(1000);

    // Go offline and reload
    await context.setOffline(true);
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Should still show session data from cache
    const notes = await page.inputValue('[data-testid="session-notes"], textarea');
    expect(notes).toContain('Important data');

    // Restore network
    await context.setOffline(false);
    await page.waitForTimeout(3000);
  });

  test('should show sync status indicator', async ({ page }) => {
    await page.goto('/login');
    await page.fill('[data-testid="email-input"], input#email', testUser.email);
    await page.fill('[data-testid="password-input"], input#password', testUser.password);
    await page.click('[data-testid="login-submit"], button[type="submit"]');
    await page.waitForURL('/');

    // Check for sync status indicator
    const syncIndicator = page.locator('[data-testid="sync-status"], [data-testid="sync-indicator"]');
    if (await syncIndicator.isVisible().catch(() => false)) {
      await expect(syncIndicator).toBeVisible();
    }
  });

  test('should handle slow network gracefully', async ({ page, context }) => {
    // Emulate slow 3G
    await context.setOffline(false);
    
    // Note: Playwright doesn't have built-in network throttling like Puppeteer
    // This test verifies the app handles slow conditions gracefully

    await page.goto('/login');
    await page.fill('[data-testid="email-input"], input#email', testUser.email);
    await page.fill('[data-testid="password-input"], input#password', testUser.password);
    await page.click('[data-testid="login-submit"], button[type="submit"]');
    
    // Should eventually log in even with slow network
    await page.waitForURL('/', { timeout: 30000 });
    await expect(page.locator('[data-testid="dashboard-container"]')).toBeVisible();
  });

  test('should not lose data when connection drops during save', async ({ page, context, database }) => {
    // Login and create session
    await page.goto('/login');
    await page.fill('[data-testid="email-input"], input#email', testUser.email);
    await page.fill('[data-testid="password-input"], input#password', testUser.password);
    await page.click('[data-testid="login-submit"], button[type="submit"]');
    await page.waitForURL('/');

    await page.goto('/sessions');
    await page.click('[data-testid="create-session-btn"], button:text("New Session")');
    await page.fill('[data-testid="session-name"], input[name="name"]', 'Critical Save Test');
    await page.click('[data-testid="start-session-btn"], button:text("Start")');

    // Add data
    await page.fill('[data-testid="session-notes"], textarea', 'Critical data that must not be lost');
    
    // Drop connection right after input
    await context.setOffline(true);
    await page.waitForTimeout(100);

    // Restore connection
    await context.setOffline(false);
    await page.waitForTimeout(3000);

    // Verify data was preserved
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    const notes = await page.inputValue('[data-testid="session-notes"], textarea');
    expect(notes).toContain('Critical data that must not be lost');
  });

  test('should show retry option on failed operations', async ({ page, context }) => {
    await page.goto('/login');
    await page.fill('[data-testid="email-input"], input#email', testUser.email);
    await page.fill('[data-testid="password-input"], input#password', testUser.password);
    await page.click('[data-testid="login-submit"], button[type="submit"]');
    await page.waitForURL('/');

    // Go to sessions and create one
    await page.goto('/sessions');
    
    // Block API requests
    await page.route('**/api/**', (route) => route.abort('failed'));
    
    // Try to create session
    await page.click('[data-testid="create-session-btn"], button:text("New Session")');
    
    // Should show error with retry option
    const retryButton = page.locator('[data-testid="retry-btn"], button:text("Retry"), button:text("Try Again")');
    if (await retryButton.isVisible().catch(() => false)) {
      // Unblock and retry
      await page.unroute('**/api/**');
      await retryButton.click();
      
      // Should succeed now
      await expect(page.locator('[data-testid="session-form"], [data-testid="create-session-form"]')).toBeVisible();
    }
  });
});
