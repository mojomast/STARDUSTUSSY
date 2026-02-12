import { test, expect, Page, BrowserContext } from '@playwright/test';
import { MultiDeviceTestHelper } from '../helpers/MultiDeviceTestHelper';

test.describe('Test Case 1: Start on Mobile → Continue on Web', () => {
  let helper: MultiDeviceTestHelper;
  
  test.beforeEach(async ({ browser }) => {
    helper = new MultiDeviceTestHelper(browser);
  });
  
  test.afterEach(async () => {
    await helper.cleanup();
  });

  test('should create session on mobile and continue on web', async ({ browser }) => {
    // Step 1: Create mobile context and page
    const mobileContext = await browser.newContext({
      viewport: { width: 375, height: 667 },
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
      deviceScaleFactor: 2,
    });
    const mobilePage = await mobileContext.newPage();
    
    // Step 2: Navigate to app on mobile
    await mobilePage.goto('/');
    await mobilePage.waitForLoadState('networkidle');
    await expect(mobilePage).toHaveTitle(/HarmonyFlow/);
    
    // Step 3: Create a session and add some state
    const sessionName = `mobile-session-${Date.now()}`;
    await mobilePage.fill('[data-testid="session-name-input"]', sessionName);
    await mobilePage.click('[data-testid="create-session-btn"]');
    
    // Wait for session creation
    await expect(mobilePage.locator('[data-testid="session-id"]')).toBeVisible({ timeout: 10000 });
    const sessionId = await mobilePage.locator('[data-testid="session-id"]').textContent();
    expect(sessionId).toBeTruthy();
    
    // Step 4: Add state data on mobile
    await mobilePage.fill('[data-testid="state-input"]', 'Hello from mobile!');
    await mobilePage.click('[data-testid="save-state-btn"]');
    
    // Wait for state to be saved
    await expect(mobilePage.locator('[data-testid="save-status"]')).toHaveText('Saved', { timeout: 5000 });
    
    // Step 5: Generate handoff token/QR code
    await mobilePage.click('[data-testid="handoff-btn"]');
    await expect(mobilePage.locator('[data-testid="handoff-qr"]')).toBeVisible({ timeout: 5000 });
    
    // Get handoff token
    const handoffToken = await mobilePage.locator('[data-testid="handoff-token"]').textContent();
    expect(handoffToken).toBeTruthy();
    
    // Step 6: Create desktop context and page
    const desktopContext = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const desktopPage = await desktopContext.newPage();
    
    // Step 7: Navigate to app on desktop with handoff token
    await desktopPage.goto(`/?handoff=${handoffToken}`);
    await desktopPage.waitForLoadState('networkidle');
    
    // Step 8: Verify state transfer - session loaded
    await expect(desktopPage.locator('[data-testid="session-id"]')).toHaveText(sessionId!, { timeout: 10000 });
    
    // Step 9: Verify state data transferred
    const stateInput = desktopPage.locator('[data-testid="state-input"]');
    await expect(stateInput).toHaveValue('Hello from mobile!', { timeout: 5000 });
    
    // Step 10: Verify session name transferred
    await expect(desktopPage.locator('[data-testid="session-name-display"]')).toHaveText(sessionName);
    
    // Step 11: Make changes on desktop and verify mobile updates
    await desktopPage.fill('[data-testid="state-input"]', 'Updated from desktop!');
    await desktopPage.click('[data-testid="save-state-btn"]');
    
    // Wait for sync to mobile
    await mobilePage.waitForTimeout(2000);
    
    const mobileStateInput = mobilePage.locator('[data-testid="state-input"]');
    await expect(mobileStateInput).toHaveValue('Updated from desktop!', { timeout: 5000 });
    
    // Cleanup
    await mobileContext.close();
    await desktopContext.close();
  });

  test('should handle QR code scanning for handoff', async ({ browser }) => {
    // Create mobile context
    const mobileContext = await browser.newContext({
      viewport: { width: 375, height: 667 },
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
    });
    const mobilePage = await mobileContext.newPage();
    
    // Create session on mobile
    await mobilePage.goto('/');
    await mobilePage.click('[data-testid="create-session-btn"]');
    await expect(mobilePage.locator('[data-testid="session-id"]')).toBeVisible();
    
    // Generate QR code
    await mobilePage.click('[data-testid="handoff-btn"]');
    await expect(mobilePage.locator('[data-testid="handoff-qr"]')).toBeVisible();
    
    // Extract QR code data (simulating scan)
    const qrData = await mobilePage.locator('[data-testid="handoff-qr"]').getAttribute('data-token');
    expect(qrData).toBeTruthy();
    
    // Create desktop context and "scan" QR
    const desktopContext = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const desktopPage = await desktopContext.newPage();
    
    // Navigate using scanned token
    await desktopPage.goto(`/?handoff=${qrData}`);
    await desktopPage.waitForLoadState('networkidle');
    
    // Verify session loaded
    await expect(desktopPage.locator('[data-testid="session-connected"]')).toBeVisible({ timeout: 10000 });
    
    await mobileContext.close();
    await desktopContext.close();
  });

  test('should handle invalid handoff token gracefully', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    
    // Try to use invalid handoff token
    await page.goto('/?handoff=invalid-token-12345');
    await page.waitForLoadState('networkidle');
    
    // Should show error message
    await expect(page.locator('[data-testid="handoff-error"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="handoff-error"]')).toContainText('Invalid');
    
    // Should offer option to create new session
    await expect(page.locator('[data-testid="create-new-session-btn"]')).toBeVisible();
    
    await context.close();
  });

  test('should measure handoff latency within budget', async ({ browser }) => {
    const mobileContext = await browser.newContext({
      viewport: { width: 375, height: 667 },
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
    });
    const mobilePage = await mobileContext.newPage();
    
    // Create session
    await mobilePage.goto('/');
    await mobilePage.click('[data-testid="create-session-btn"]');
    await expect(mobilePage.locator('[data-testid="session-id"]')).toBeVisible();
    
    // Generate handoff
    await mobilePage.click('[data-testid="handoff-btn"]');
    const handoffToken = await mobilePage.locator('[data-testid="handoff-token"]').textContent();
    
    // Measure handoff latency
    const desktopContext = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const desktopPage = await desktopContext.newPage();
    
    const startTime = Date.now();
    await desktopPage.goto(`/?handoff=${handoffToken}`);
    await desktopPage.waitForSelector('[data-testid="session-connected"]', { timeout: 10000 });
    const handoffLatency = Date.now() - startTime;
    
    // Assert latency is within budget (< 100ms)
    expect(handoffLatency).toBeLessThan(100);
    
    // Record metric
    test.info().annotations.push({
      type: 'metric',
      description: `handoff-latency: ${handoffLatency}ms`,
    });
    
    await mobileContext.close();
    await desktopContext.close();
  });

  test('should preserve complex state during handoff', async ({ browser }) => {
    const mobileContext = await browser.newContext({
      viewport: { width: 375, height: 667 },
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
    });
    const mobilePage = await mobileContext.newPage();
    
    // Create session with complex state
    await mobilePage.goto('/');
    await mobilePage.click('[data-testid="create-session-btn"]');
    
    // Add complex nested state
    const complexState = {
      user: { name: 'Test User', id: 12345 },
      preferences: { theme: 'dark', notifications: true },
      items: [
        { id: 1, name: 'Item 1', completed: false },
        { id: 2, name: 'Item 2', completed: true },
      ],
      timestamp: Date.now(),
    };
    
    await mobilePage.fill('[data-testid="state-json-input"]', JSON.stringify(complexState));
    await mobilePage.click('[data-testid="save-state-btn"]');
    await expect(mobilePage.locator('[data-testid="save-status"]')).toHaveText('Saved');
    
    // Get handoff token
    await mobilePage.click('[data-testid="handoff-btn"]');
    const handoffToken = await mobilePage.locator('[data-testid="handoff-token"]').textContent();
    
    // Continue on desktop
    const desktopContext = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const desktopPage = await desktopContext.newPage();
    
    await desktopPage.goto(`/?handoff=${handoffToken}`);
    await desktopPage.waitForLoadState('networkidle');
    
    // Verify complex state preserved
    const stateValue = await desktopPage.locator('[data-testid="state-json-input"]').inputValue();
    const transferredState = JSON.parse(stateValue);
    
    expect(transferredState).toEqual(complexState);
    
    await mobileContext.close();
    await desktopContext.close();
  });
});
