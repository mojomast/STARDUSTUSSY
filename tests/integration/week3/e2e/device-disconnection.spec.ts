import { test, expect } from '@playwright/test';

test.describe('Test Case 5: Device Disconnection', () => {
  
  test('should handle intentional device logout', async ({ browser }) => {
    const contexts = [];
    const pages = [];
    
    // Setup 3 devices
    for (let i = 0; i < 3; i++) {
      const context = await browser.newContext({
        viewport: i === 0 ? { width: 1280, height: 720 } : { width: 375, height: 667 },
      });
      const page = await context.newPage();
      contexts.push(context);
      pages.push(page);
    }
    
    // Create session on device 1
    await pages[0].goto('/');
    await pages[0].click('[data-testid="create-session-btn"]');
    await expect(pages[0].locator('[data-testid="session-id"]')).toBeVisible();
    const handoffToken = await pages[0].locator('[data-testid="handoff-token"]').textContent();
    
    // Connect devices 2 and 3
    for (let i = 1; i < 3; i++) {
      await pages[i].goto(`/?handoff=${handoffToken}`);
      await expect(pages[i].locator('[data-testid="session-connected"]')).toBeVisible();
    }
    
    // Verify all 3 devices connected
    for (const page of pages) {
      await expect(page.locator('[data-testid="connected-devices-count"]')).toHaveText('3');
    }
    
    // Device 2 logs out intentionally
    await pages[1].click('[data-testid="logout-btn"]');
    
    // Should show logout confirmation
    await expect(pages[1].locator('[data-testid="logout-confirm-dialog"]')).toBeVisible();
    await pages[1].click('[data-testid="confirm-logout-btn"]');
    
    // Device 2 should be disconnected
    await expect(pages[1].locator('[data-testid="session-disconnected"]')).toBeVisible({ timeout: 5000 });
    
    // Devices 1 and 3 should show 2 devices remaining
    await pages[0].waitForTimeout(1000);
    await expect(pages[0].locator('[data-testid="connected-devices-count"]')).toHaveText('2');
    await expect(pages[2].locator('[data-testid="connected-devices-count"]')).toHaveText('2');
    
    // Session should persist for remaining devices
    await expect(pages[0].locator('[data-testid="session-connected"]')).toBeVisible();
    await expect(pages[2].locator('[data-testid="session-connected"]')).toBeVisible();
    
    for (const context of contexts) {
      await context.close();
    }
  });

  test('should handle unexpected device disconnect', async ({ browser }) => {
    const contexts = [];
    const pages = [];
    
    // Setup 3 devices
    for (let i = 0; i < 3; i++) {
      const context = await browser.newContext();
      const page = await context.newPage();
      contexts.push(context);
      pages.push(page);
    }
    
    // Create and connect session
    await pages[0].goto('/');
    await pages[0].click('[data-testid="create-session-btn"]');
    await expect(pages[0].locator('[data-testid="session-id"]')).toBeVisible();
    const handoffToken = await pages[0].locator('[data-testid="handoff-token"]').textContent();
    
    for (let i = 1; i < 3; i++) {
      await pages[i].goto(`/?handoff=${handoffToken}`);
      await expect(pages[i].locator('[data-testid="session-connected"]')).toBeVisible();
    }
    
    // Simulate unexpected disconnect by closing context abruptly
    await contexts[1].close();
    contexts.splice(1, 1);
    pages.splice(1, 1);
    
    // Wait for disconnect detection
    await pages[0].waitForTimeout(2000);
    
    // Remaining devices should update device count
    await expect(pages[0].locator('[data-testid="connected-devices-count"]')).toHaveText('2');
    
    // Should show device disconnected notification
    await expect(pages[0].locator('[data-testid="device-disconnected-notification"]')).toBeVisible();
    
    // Session should remain active
    await expect(pages[0].locator('[data-testid="session-connected"]')).toBeVisible();
    
    for (const context of contexts) {
      await context.close();
    }
  });

  test('should verify session persistence after all devices disconnect', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    
    // Create session
    await page.goto('/');
    await page.click('[data-testid="create-session-btn"]');
    await expect(page.locator('[data-testid="session-id"]')).toBeVisible();
    const sessionId = await page.locator('[data-testid="session-id"]').textContent();
    
    // Set state
    await page.fill('[data-testid="state-input"]', 'Persistent session data');
    await page.click('[data-testid="save-state-btn"]');
    await expect(page.locator('[data-testid="save-status"]')).toHaveText('Saved');
    
    // Disconnect (close browser)
    await context.close();
    
    // Wait a moment (session should persist)
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Reconnect with new context
    const newContext = await browser.newContext();
    const newPage = await newContext.newPage();
    
    // Navigate back to session
    await newPage.goto('/');
    await newPage.fill('[data-testid="session-id-input"]', sessionId!);
    await newPage.click('[data-testid="join-session-btn"]');
    
    // Should reconnect to same session
    await expect(newPage.locator('[data-testid="session-connected"]')).toBeVisible({ timeout: 10000 });
    await expect(newPage.locator('[data-testid="session-id"]')).toHaveText(sessionId!);
    
    // State should be preserved
    await expect(newPage.locator('[data-testid="state-input"]')).toHaveValue('Persistent session data');
    
    await newContext.close();
  });

  test('should handle device being kicked by another device', async ({ browser }) => {
    const contexts = [];
    const pages = [];
    
    // Setup admin device and regular device
    const adminContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const adminPage = await adminContext.newPage();
    contexts.push(adminContext);
    pages.push(adminPage);
    
    const userContext = await browser.newContext({ viewport: { width: 375, height: 667 } });
    const userPage = await userContext.newPage();
    contexts.push(userContext);
    pages.push(userPage);
    
    // Create session on admin device
    await adminPage.goto('/');
    await adminPage.click('[data-testid="create-session-btn"]');
    await expect(adminPage.locator('[data-testid="session-id"]')).toBeVisible();
    const handoffToken = await adminPage.locator('[data-testid="handoff-token"]').textContent();
    
    // User joins session
    await userPage.goto(`/?handoff=${handoffToken}`);
    await expect(userPage.locator('[data-testid="session-connected"]')).toBeVisible();
    
    // Admin views connected devices
    await adminPage.click('[data-testid="view-devices-btn"]');
    await expect(adminPage.locator('[data-testid="device-list"]')).toBeVisible();
    
    // Admin kicks user device
    await adminPage.click('[data-testid="kick-device-btn"]');
    await expect(adminPage.locator('[data-testid="kick-confirm-dialog"]')).toBeVisible();
    await adminPage.click('[data-testid="confirm-kick-btn"]');
    
    // User should be disconnected
    await expect(userPage.locator('[data-testid="kicked-notification"]')).toBeVisible({ timeout: 5000 });
    await expect(userPage.locator('[data-testid="session-disconnected"]')).toBeVisible();
    
    // User should see reason for disconnection
    await expect(userPage.locator('[data-testid="kick-reason"]')).toContainText('removed by session owner');
    
    for (const context of contexts) {
      await context.close();
    }
  });

  test('should maintain session when primary device disconnects', async ({ browser }) => {
    const contexts = [];
    const pages = [];
    
    // Setup 3 devices
    for (let i = 0; i < 3; i++) {
      const context = await browser.newContext();
      const page = await context.newPage();
      contexts.push(context);
      pages.push(page);
    }
    
    // Create session on device 1 (primary)
    await pages[0].goto('/');
    await pages[0].click('[data-testid="create-session-btn"]');
    await expect(pages[0].locator('[data-testid="session-id"]')).toBeVisible();
    const handoffToken = await pages[0].locator('[data-testid="handoff-token"]').textContent();
    const sessionId = await pages[0].locator('[data-testid="session-id"]').textContent();
    
    // Connect devices 2 and 3
    for (let i = 1; i < 3; i++) {
      await pages[i].goto(`/?handoff=${handoffToken}`);
      await expect(pages[i].locator('[data-testid="session-connected"]')).toBeVisible();
    }
    
    // Primary device disconnects
    await contexts[0].close();
    contexts.shift();
    pages.shift();
    
    // Wait for disconnect detection
    await pages[0].waitForTimeout(2000);
    
    // Other devices should remain connected to same session
    for (const page of pages) {
      await expect(page.locator('[data-testid="session-connected"]')).toBeVisible();
      await expect(page.locator('[data-testid="session-id"]')).toHaveText(sessionId!);
    }
    
    // One of the remaining devices should become primary
    await expect(pages[0].locator('[data-testid="primary-device-indicator"]')).toBeVisible();
    
    for (const context of contexts) {
      await context.close();
    }
  });

  test('should handle device reconnect after logout', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    
    // Create session
    await page.goto('/');
    await page.click('[data-testid="create-session-btn"]');
    await expect(page.locator('[data-testid="session-id"]')).toBeVisible();
    const handoffToken = await page.locator('[data-testid="handoff-token"]').textContent();
    
    // Logout
    await page.click('[data-testid="logout-btn"]');
    await page.click('[data-testid="confirm-logout-btn"]');
    await expect(page.locator('[data-testid="session-disconnected"]')).toBeVisible();
    
    // Reconnect with same handoff token
    await page.goto(`/?handoff=${handoffToken}`);
    await page.waitForLoadState('networkidle');
    
    // Should be able to rejoin
    await expect(page.locator('[data-testid="session-connected"]')).toBeVisible({ timeout: 10000 });
    
    await context.close();
  });

  test('should track device connection history', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    
    // Create session
    await page.goto('/');
    await page.click('[data-testid="create-session-btn"]');
    await expect(page.locator('[data-testid="session-id"]')).toBeVisible();
    
    // View connection history
    await page.click('[data-testid="view-activity-btn"]');
    await expect(page.locator('[data-testid="activity-log"]')).toBeVisible();
    
    // Should show initial connection
    await expect(page.locator('[data-testid="activity-log"]')).toContainText('Device connected');
    
    // Simulate another device connecting
    const context2 = await browser.newContext();
    const page2 = await context2.newPage();
    const handoffToken = await page.locator('[data-testid="handoff-token"]').textContent();
    
    await page2.goto(`/?handoff=${handoffToken}`);
    await expect(page2.locator('[data-testid="session-connected"]')).toBeVisible();
    
    // Activity log should update
    await page.waitForTimeout(1000);
    await expect(page.locator('[data-testid="activity-log"]')).toContainText('New device connected');
    
    // Disconnect second device
    await context2.close();
    await page.waitForTimeout(1000);
    
    // Should show disconnect in log
    await expect(page.locator('[data-testid="activity-log"]')).toContainText('Device disconnected');
    
    await context.close();
  });
});
