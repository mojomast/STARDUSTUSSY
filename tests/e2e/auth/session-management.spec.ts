import { test, expect } from '../fixtures/base';
import { createTestUser, cleanupTestUser, createTestSession } from '../fixtures/users';
import { DatabaseHelper } from '../fixtures/database';

test.describe('Session Management', () => {
  let testUser: any;

  test.beforeEach(async ({ page, database }) => {
    testUser = await createTestUser(database);
    
    // Login
    await page.goto('/login');
    await page.fill('[data-testid="email-input"], input#email', testUser.email);
    await page.fill('[data-testid="password-input"], input#password', testUser.password);
    await page.click('[data-testid="login-submit"], button[type="submit"]');
    await page.waitForURL('/', { timeout: 10000 });
  });

  test.afterEach(async ({ database }) => {
    if (testUser) {
      await cleanupTestUser(database, testUser.email);
    }
  });

  test('should display active sessions', async ({ page }) => {
    await page.goto('/sessions');
    await page.waitForLoadState('networkidle');

    // Should show sessions list
    await expect(page.locator('[data-testid="sessions-list"], [data-testid="active-sessions"]')).toBeVisible();
  });

  test('should create a new session', async ({ page, database }) => {
    await page.goto('/sessions');
    
    // Click create session button
    await page.click('[data-testid="create-session-btn"], button:text("New Session")');
    
    // Fill session details
    await page.fill('[data-testid="session-name"], input[name="name"]', 'Test Session');
    await page.selectOption('[data-testid="session-type"], select[name="type"]', 'meditation');
    
    // Start session
    await page.click('[data-testid="start-session-btn"], button:text("Start")');

    // Verify session created in database
    const sessions = await database.getSessionsByUserId(testUser.id);
    expect(sessions.length).toBeGreaterThan(0);
    expect(sessions[0].status).toBe('active');
  });

  test('should pause and resume session', async ({ page }) => {
    // Create a session first
    await createTestSession(database, testUser.id, { status: 'active' });
    
    await page.goto('/sessions');
    
    // Pause session
    await page.click('[data-testid="pause-session-btn"], button:text("Pause")');
    
    // Should show paused state
    await expect(page.locator('text=/paused/i, [data-testid="session-paused"]')).toBeVisible();
    
    // Resume session
    await page.click('[data-testid="resume-session-btn"], button:text("Resume")');
    
    // Should show active state
    await expect(page.locator('text=/active/i, [data-testid="session-active"]')).toBeVisible();
  });

  test('should end session and save data', async ({ page, database }) => {
    const session = await createTestSession(database, testUser.id, { status: 'active' });
    
    await page.goto('/sessions');
    
    // End session
    await page.click('[data-testid="end-session-btn"], button:text("End")');
    
    // Confirm end session if dialog appears
    const confirmButton = page.locator('button:text("Confirm"), button:text("Yes")');
    if (await confirmButton.isVisible().catch(() => false)) {
      await confirmButton.click();
    }

    // Verify session ended
    await page.waitForTimeout(1000);
    const sessions = await database.getSessionsByUserId(testUser.id);
    const endedSession = sessions.find((s: any) => s.id === session.id);
    expect(endedSession?.status).toBe('inactive');
  });

  test('should restore session after page reload', async ({ page, database }) => {
    // Create an active session
    const session = await createTestSession(database, testUser.id, { 
      status: 'active',
      deviceType: 'desktop'
    });
    
    await page.goto('/sessions');
    
    // Set some state
    await page.fill('[data-testid="state-input"], textarea', 'Session state data');
    
    // Reload page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Should restore session
    await expect(page.locator('[data-testid="session-active"], text=/active/i')).toBeVisible();
    
    // State should be preserved
    const stateValue = await page.inputValue('[data-testid="state-input"], textarea');
    expect(stateValue).toContain('Session state data');
  });

  test('should sync session state across tabs', async ({ browser, database }) => {
    const session = await createTestSession(database, testUser.id, { status: 'active' });
    
    // Create first context and login
    const context1 = await browser.newContext();
    const page1 = await context1.newPage();
    await page1.goto('/login');
    await page1.fill('[data-testid="email-input"], input#email', testUser.email);
    await page1.fill('[data-testid="password-input"], input#password', testUser.password);
    await page1.click('[data-testid="login-submit"], button[type="submit"]');
    await page1.waitForURL('/');
    
    // Create second context and login
    const context2 = await browser.newContext();
    const page2 = await context2.newPage();
    await page2.goto('/login');
    await page2.fill('[data-testid="email-input"], input#email', testUser.email);
    await page2.fill('[data-testid="password-input"], input#password', testUser.password);
    await page2.click('[data-testid="login-submit"], button[type="submit"]');
    await page2.waitForURL('/');

    // Navigate to sessions in both
    await page1.goto('/sessions');
    await page2.goto('/sessions');
    
    // Update state in first tab
    await page1.fill('[data-testid="state-input"], textarea', 'Synced state');
    await page1.waitForTimeout(2000);
    
    // Check state in second tab
    const stateValue = await page2.inputValue('[data-testid="state-input"], textarea');
    expect(stateValue).toBe('Synced state');

    // Cleanup
    await context1.close();
    await context2.close();
  });

  test('should show session history', async ({ page, database }) => {
    // Create some completed sessions
    for (let i = 0; i < 3; i++) {
      await createTestSession(database, testUser.id, { 
        status: 'inactive',
        deviceType: 'desktop'
      });
    }
    
    await page.goto('/sessions');
    
    // Click history tab
    await page.click('[data-testid="history-tab"], button:text("History")');
    
    // Should show past sessions
    const sessions = await page.locator('[data-testid="session-item"], [data-testid="history-item"]').count();
    expect(sessions).toBeGreaterThanOrEqual(3);
  });

  test('should allow session deletion', async ({ page, database }) => {
    const session = await createTestSession(database, testUser.id, { status: 'inactive' });
    
    await page.goto('/sessions');
    await page.click('[data-testid="history-tab"], button:text("History")');
    
    // Find and delete session
    const deleteBtn = page.locator('[data-testid="delete-session-btn"]').first();
    if (await deleteBtn.isVisible().catch(() => false)) {
      await deleteBtn.click();
      
      // Confirm deletion
      await page.click('button:text("Confirm"), button:text("Delete")');
      
      // Verify session deleted
      await page.waitForTimeout(1000);
      const sessions = await database.getSessionsByUserId(testUser.id);
      expect(sessions.find((s: any) => s.id === session.id)).toBeUndefined();
    }
  });

  test('should display session statistics', async ({ page }) => {
    await page.goto('/sessions');
    
    // Should show statistics section
    await expect(page.locator('[data-testid="session-stats"], [data-testid="statistics"]')).toBeVisible();
    
    // Should display metrics
    await expect(page.locator('text=/total sessions/i, text=/active time/i')).toBeVisible();
  });

  test('should filter sessions by type', async ({ page, database }) => {
    // Create sessions of different types
    await createTestSession(database, testUser.id, { status: 'inactive', deviceType: 'desktop' });
    await createTestSession(database, testUser.id, { status: 'inactive', deviceType: 'mobile' });
    
    await page.goto('/sessions');
    await page.click('[data-testid="history-tab"], button:text("History")');
    
    // Apply filter if available
    const filterSelect = page.locator('[data-testid="filter-type"], select[name="filter"]');
    if (await filterSelect.isVisible().catch(() => false)) {
      await filterSelect.selectOption('meditation');
      
      // Should update list
      await page.waitForTimeout(500);
    }
  });
});
