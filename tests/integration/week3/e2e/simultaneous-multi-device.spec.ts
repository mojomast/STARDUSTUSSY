import { test, expect } from '@playwright/test';
import { MultiDeviceTestHelper } from '../helpers/MultiDeviceTestHelper';

test.describe('Test Case 2: Simultaneous Multi-Device Usage', () => {
  let helper: MultiDeviceTestHelper;
  
  test.beforeEach(async ({ browser }) => {
    helper = new MultiDeviceTestHelper(browser);
  });
  
  test.afterEach(async () => {
    await helper.cleanup();
  });

  test('should connect 5 devices to same session and sync all', async ({ browser }) => {
    const deviceCount = 5;
    const devices = [];
    
    // Step 1: Create session on first device (Desktop)
    const desktopContext = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const desktopPage = await desktopContext.newPage();
    devices.push({ context: desktopContext, page: desktopPage, name: 'Desktop' });
    
    await desktopPage.goto('/');
    await desktopPage.click('[data-testid="create-session-btn"]');
    await expect(desktopPage.locator('[data-testid="session-id"]')).toBeVisible({ timeout: 10000 });
    
    const sessionId = await desktopPage.locator('[data-testid="session-id"]').textContent();
    
    // Step 2: Create handoff token
    await desktopPage.click('[data-testid="handoff-btn"]');
    const handoffToken = await desktopPage.locator('[data-testid="handoff-token"]').textContent();
    
    // Step 3: Connect additional devices
    const deviceConfigs = [
      { name: 'iPhone', width: 375, height: 667, userAgent: 'iPhone' },
      { name: 'iPad', width: 1024, height: 1366, userAgent: 'iPad' },
      { name: 'Android', width: 412, height: 915, userAgent: 'Android' },
      { name: 'Laptop', width: 1440, height: 900, userAgent: 'MacBook' },
    ];
    
    for (const config of deviceConfigs) {
      const context = await browser.newContext({
        viewport: { width: config.width, height: config.height },
        userAgent: config.userAgent,
      });
      const page = await context.newPage();
      devices.push({ context, page, name: config.name });
      
      await page.goto(`/?handoff=${handoffToken}`);
      await page.waitForLoadState('networkidle');
      
      // Verify session loaded
      await expect(page.locator('[data-testid="session-connected"]')).toBeVisible({ timeout: 10000 });
    }
    
    // Step 4: Verify all devices show same session
    for (const device of devices) {
      const deviceSessionId = await device.page.locator('[data-testid="session-id"]').textContent();
      expect(deviceSessionId).toBe(sessionId);
      
      // Verify device count indicator
      const deviceCountText = await device.page.locator('[data-testid="connected-devices-count"]').textContent();
      expect(deviceCountText).toContain(String(deviceCount));
    }
    
    // Step 5: Make change on desktop, verify all sync
    await desktopPage.fill('[data-testid="state-input"]', 'Multi-device test value');
    await desktopPage.click('[data-testid="save-state-btn"]');
    
    // Wait for sync
    await desktopPage.waitForTimeout(2000);
    
    // Verify all devices have the update
    for (const device of devices) {
      const input = device.page.locator('[data-testid="state-input"]');
      await expect(input).toHaveValue('Multi-device test value', { timeout: 5000 });
    }
    
    // Cleanup
    for (const device of devices) {
      await device.context.close();
    }
  });

  test('should handle concurrent edits with conflict resolution', async ({ browser }) => {
    // Create 3 devices
    const contexts = [];
    const pages = [];
    
    // Device 1: Create session
    const context1 = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page1 = await context1.newPage();
    contexts.push(context1);
    pages.push(page1);
    
    await page1.goto('/');
    await page1.click('[data-testid="create-session-btn"]');
    await expect(page1.locator('[data-testid="session-id"]')).toBeVisible();
    const handoffToken = await page1.locator('[data-testid="handoff-token"]').textContent();
    
    // Device 2 & 3: Join session
    for (let i = 0; i < 2; i++) {
      const context = await browser.newContext({ 
        viewport: { width: 375, height: 667 },
        userAgent: 'Mobile',
      });
      const page = await context.newPage();
      contexts.push(context);
      pages.push(page);
      
      await page.goto(`/?handoff=${handoffToken}`);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('[data-testid="session-connected"]')).toBeVisible();
    }
    
    const [page2, page3] = [pages[1], pages[2]];
    
    // Step 1: All devices make simultaneous edits
    await Promise.all([
      page1.fill('[data-testid="state-input"]', 'Edit from Device 1'),
      page2.fill('[data-testid="state-input"]', 'Edit from Device 2'),
      page3.fill('[data-testid="state-input"]', 'Edit from Device 3'),
    ]);
    
    // Step 2: All devices save simultaneously
    await Promise.all([
      page1.click('[data-testid="save-state-btn"]'),
      page2.click('[data-testid="save-state-btn"]'),
      page3.click('[data-testid="save-state-btn"]'),
    ]);
    
    // Step 3: Wait for conflict resolution
    await page1.waitForTimeout(3000);
    
    // Step 4: Verify all devices converged to same state
    const values = await Promise.all(
      pages.map(async (page) => {
        return page.locator('[data-testid="state-input"]').inputValue();
      })
    );
    
    // All should have the same value (conflict resolution applied)
    const uniqueValues = [...new Set(values)];
    expect(uniqueValues.length).toBe(1);
    
    // Step 5: Verify conflict indicator was shown
    for (const page of pages) {
      const conflictIndicator = page.locator('[data-testid="conflict-resolved-indicator"]');
      await expect(conflictIndicator).toBeVisible({ timeout: 5000 });
    }
    
    // Cleanup
    for (const context of contexts) {
      await context.close();
    }
  });

  test('should handle rapid sequential edits across devices', async ({ browser }) => {
    // Setup 3 devices
    const contexts = [];
    const pages = [];
    
    const context1 = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page1 = await context1.newPage();
    contexts.push(context1);
    pages.push(page1);
    
    await page1.goto('/');
    await page1.click('[data-testid="create-session-btn"]');
    await expect(page1.locator('[data-testid="session-id"]')).toBeVisible();
    const handoffToken = await page1.locator('[data-testid="handoff-token"]').textContent();
    
    for (let i = 0; i < 2; i++) {
      const context = await browser.newContext({ viewport: { width: 375, height: 667 } });
      const page = await context.newPage();
      contexts.push(context);
      pages.push(page);
      await page.goto(`/?handoff=${handoffToken}`);
      await expect(page.locator('[data-testid="session-connected"]')).toBeVisible();
    }
    
    // Rapid sequential edits (10 edits in quick succession)
    const editCount = 10;
    for (let i = 0; i < editCount; i++) {
      const deviceIndex = i % 3;
      const page = pages[deviceIndex];
      
      await page.fill('[data-testid="state-input"]', `Edit ${i + 1} from Device ${deviceIndex + 1}`);
      await page.click('[data-testid="save-state-btn"]');
      
      // Small delay between edits
      await page.waitForTimeout(100);
    }
    
    // Wait for all syncs to complete
    await pages[0].waitForTimeout(3000);
    
    // All devices should have the last edit
    const lastEdit = `Edit ${editCount} from Device ${((editCount - 1) % 3) + 1}`;
    for (const page of pages) {
      await expect(page.locator('[data-testid="state-input"]')).toHaveValue(lastEdit, { timeout: 5000 });
    }
    
    // Cleanup
    for (const context of contexts) {
      await context.close();
    }
  });

  test('should maintain sync with 8 concurrent devices', async ({ browser }) => {
    const maxDevices = 8;
    const contexts = [];
    const pages = [];
    
    // Create primary device
    const primaryContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const primaryPage = await primaryContext.newPage();
    contexts.push(primaryContext);
    pages.push(primaryPage);
    
    await primaryPage.goto('/');
    await primaryPage.click('[data-testid="create-session-btn"]');
    await expect(primaryPage.locator('[data-testid="session-id"]')).toBeVisible();
    const handoffToken = await primaryPage.locator('[data-testid="handoff-token"]').textContent();
    
    // Connect remaining devices
    for (let i = 1; i < maxDevices; i++) {
      const context = await browser.newContext({
        viewport: { width: 375 + i * 10, height: 667 + i * 5 },
      });
      const page = await context.newPage();
      contexts.push(context);
      pages.push(page);
      
      await page.goto(`/?handoff=${handoffToken}`);
      await expect(page.locator('[data-testid="session-connected"]')).toBeVisible({ timeout: 15000 });
    }
    
    // Verify all devices connected
    for (const page of pages) {
      const deviceCount = await page.locator('[data-testid="connected-devices-count"]').textContent();
      expect(deviceCount).toContain(String(maxDevices));
    }
    
    // Test sync across all devices
    await primaryPage.fill('[data-testid="state-input"]', '8-device sync test');
    await primaryPage.click('[data-testid="save-state-btn"]');
    
    await primaryPage.waitForTimeout(3000);
    
    // Verify sync on all devices
    for (const page of pages) {
      await expect(page.locator('[data-testid="state-input"]')).toHaveValue('8-device sync test', { timeout: 5000 });
    }
    
    // Cleanup
    for (const context of contexts) {
      await context.close();
    }
  });

  test('should track device presence correctly', async ({ browser }) => {
    const contexts = [];
    const pages = [];
    
    // Create 3 devices
    const context1 = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page1 = await context1.newPage();
    contexts.push(context1);
    pages.push(page1);
    
    await page1.goto('/');
    await page1.click('[data-testid="create-session-btn"]');
    await expect(page1.locator('[data-testid="session-id"]')).toBeVisible();
    const handoffToken = await page1.locator('[data-testid="handoff-token"]').textContent();
    
    for (let i = 0; i < 2; i++) {
      const context = await browser.newContext({ viewport: { width: 375, height: 667 } });
      const page = await context.newPage();
      contexts.push(context);
      pages.push(page);
      await page.goto(`/?handoff=${handoffToken}`);
      await expect(page.locator('[data-testid="session-connected"]')).toBeVisible();
    }
    
    // Verify device list shows all 3
    await expect(page1.locator('[data-testid="device-list"]')).toContainText('3 devices');
    
    // Close one device
    await contexts[1].close();
    contexts.splice(1, 1);
    pages.splice(1, 1);
    
    // Wait for presence update
    await page1.waitForTimeout(2000);
    
    // Verify device list updated
    await expect(page1.locator('[data-testid="device-list"]')).toContainText('2 devices');
    
    // Cleanup remaining
    for (const context of contexts) {
      await context.close();
    }
  });
});
