import { test, expect } from '@playwright/test';

test.describe('Test Case 3: Network Interruption Recovery', () => {
  
  test('should recover when one device loses connection', async ({ browser }) => {
    // Setup two devices
    const context1 = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page1 = await context1.newPage();
    
    const context2 = await browser.newContext({ viewport: { width: 375, height: 667 } });
    const page2 = await context2.newPage();
    
    // Device 1: Create session
    await page1.goto('/');
    await page1.click('[data-testid="create-session-btn"]');
    await expect(page1.locator('[data-testid="session-id"]')).toBeVisible();
    const handoffToken = await page1.locator('[data-testid="handoff-token"]').textContent();
    
    // Device 2: Join session
    await page2.goto(`/?handoff=${handoffToken}`);
    await expect(page2.locator('[data-testid="session-connected"]')).toBeVisible();
    
    // Step 1: Set initial state
    await page1.fill('[data-testid="state-input"]', 'Initial state');
    await page1.click('[data-testid="save-state-btn"]');
    await page1.waitForTimeout(1000);
    
    // Verify both devices have state
    await expect(page2.locator('[data-testid="state-input"]')).toHaveValue('Initial state');
    
    // Step 2: Drop connection on device 1
    await context1.setOffline(true);
    
    // Verify offline indicator shown
    await expect(page1.locator('[data-testid="offline-indicator"]')).toBeVisible({ timeout: 5000 });
    
    // Step 3: Make changes on device 2 while device 1 is offline
    await page2.fill('[data-testid="state-input"]', 'Changed while device 1 offline');
    await page2.click('[data-testid="save-state-btn"]');
    
    // Step 4: Reconnect device 1
    await context1.setOffline(false);
    
    // Step 5: Verify reconnection
    await expect(page1.locator('[data-testid="connection-status"]')).toHaveText(/connected/i, { timeout: 15000 });
    
    // Step 6: Verify state sync after reconnection
    await expect(page1.locator('[data-testid="state-input"]')).toHaveValue('Changed while device 1 offline', { timeout: 10000 });
    
    // Cleanup
    await context1.close();
    await context2.close();
  });

  test('should merge changes from both devices after reconnection', async ({ browser }) => {
    const context1 = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page1 = await context1.newPage();
    
    const context2 = await browser.newContext({ viewport: { width: 375, height: 667 } });
    const page2 = await context2.newPage();
    
    // Setup session
    await page1.goto('/');
    await page1.click('[data-testid="create-session-btn"]');
    await expect(page1.locator('[data-testid="session-id"]')).toBeVisible();
    const handoffToken = await page1.locator('[data-testid="handoff-token"]').textContent();
    
    await page2.goto(`/?handoff=${handoffToken}`);
    await expect(page2.locator('[data-testid="session-connected"]')).toBeVisible();
    
    // Disconnect device 1
    await context1.setOffline(true);
    await expect(page1.locator('[data-testid="offline-indicator"]')).toBeVisible();
    
    // Make different changes on both devices
    await page1.fill('[data-testid="state-input"]', 'Change from offline device');
    await page1.click('[data-testid="save-state-btn"]');
    
    await page2.fill('[data-testid="state-input"]', 'Change from online device');
    await page2.click('[data-testid="save-state-btn"]');
    
    // Reconnect device 1
    await context1.setOffline(false);
    await expect(page1.locator('[data-testid="connection-status"]')).toHaveText(/connected/i, { timeout: 15000 });
    
    // Wait for merge
    await page1.waitForTimeout(3000);
    
    // Verify both devices converged (last-write-wins or merge)
    const value1 = await page1.locator('[data-testid="state-input"]').inputValue();
    const value2 = await page2.locator('[data-testid="state-input"]').inputValue();
    
    expect(value1).toBe(value2);
    
    // Verify conflict resolution indicator
    await expect(page1.locator('[data-testid="sync-complete-indicator"]')).toBeVisible();
    
    await context1.close();
    await context2.close();
  });

  test('should queue changes while offline and sync on reconnect', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    
    await page.goto('/');
    await page.click('[data-testid="create-session-btn"]');
    await expect(page.locator('[data-testid="session-id"]')).toBeVisible();
    
    // Go offline
    await context.setOffline(true);
    await expect(page.locator('[data-testid="offline-indicator"]')).toBeVisible();
    
    // Make multiple changes while offline
    const changes = ['Change 1', 'Change 2', 'Change 3', 'Change 4'];
    for (const change of changes) {
      await page.fill('[data-testid="state-input"]', change);
      await page.click('[data-testid="save-state-btn"]');
      await page.waitForTimeout(500);
    }
    
    // Verify pending changes indicator
    await expect(page.locator('[data-testid="pending-changes-count"]')).toHaveText('4');
    
    // Reconnect
    await context.setOffline(false);
    
    // Wait for sync
    await expect(page.locator('[data-testid="pending-changes-count"]')).toHaveText('0', { timeout: 10000 });
    await expect(page.locator('[data-testid="sync-status"]')).toHaveText('Synced');
    
    // Verify final state is the last change
    await expect(page.locator('[data-testid="state-input"]')).toHaveValue('Change 4');
    
    await context.close();
  });

  test('should handle intermittent network drops', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    
    await page.goto('/');
    await page.click('[data-testid="create-session-btn"]');
    await expect(page.locator('[data-testid="session-id"]')).toBeVisible();
    
    // Simulate intermittent drops
    for (let i = 0; i < 5; i++) {
      // Go offline
      await context.setOffline(true);
      await page.waitForTimeout(500);
      
      // Make a change
      await page.fill('[data-testid="state-input"]', `Intermittent test ${i + 1}`);
      await page.click('[data-testid="save-state-btn"]');
      
      // Come back online
      await context.setOffline(false);
      await page.waitForTimeout(1000);
      
      // Verify still connected
      await expect(page.locator('[data-testid="connection-status"]')).toHaveText(/connected/i);
    }
    
    // Final state should be the last change
    await expect(page.locator('[data-testid="state-input"]')).toHaveValue('Intermittent test 5');
    
    await context.close();
  });

  test('should recover session after extended offline period', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    
    await page.goto('/');
    await page.click('[data-testid="create-session-btn"]');
    await expect(page.locator('[data-testid="session-id"]')).toBeVisible();
    const sessionId = await page.locator('[data-testid="session-id"]').textContent();
    
    // Set some state
    await page.fill('[data-testid="state-input"]', 'State before long offline');
    await page.click('[data-testid="save-state-btn"]');
    
    // Go offline for extended period (simulate 30 seconds)
    await context.setOffline(true);
    await expect(page.locator('[data-testid="offline-indicator"]')).toBeVisible();
    
    await page.waitForTimeout(5000); // Shortened for test speed
    
    // Reconnect
    await context.setOffline(false);
    
    // Should recover session
    await expect(page.locator('[data-testid="connection-status"]')).toHaveText(/connected/i, { timeout: 15000 });
    
    // Session should be preserved
    const recoveredSessionId = await page.locator('[data-testid="session-id"]').textContent();
    expect(recoveredSessionId).toBe(sessionId);
    
    // State should be preserved
    await expect(page.locator('[data-testid="state-input"]')).toHaveValue('State before long offline');
    
    await context.close();
  });

  test('should handle WebSocket connection failure gracefully', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    
    // Block WebSocket connections
    await context.route('**/*', (route) => {
      if (route.request().url().includes('ws://') || route.request().url().includes('wss://')) {
        route.abort();
      } else {
        route.continue();
      }
    });
    
    await page.goto('/');
    
    // Should show connection error
    await expect(page.locator('[data-testid="connection-error"]')).toBeVisible({ timeout: 10000 });
    
    // Should offer retry option
    await expect(page.locator('[data-testid="retry-connection-btn"]')).toBeVisible();
    
    // Remove WebSocket block
    await context.unroute('**/*');
    
    // Retry connection
    await page.click('[data-testid="retry-connection-btn"]');
    
    // Should eventually connect
    await expect(page.locator('[data-testid="connection-status"]')).toHaveText(/connected/i, { timeout: 15000 });
    
    await context.close();
  });

  test('should sync after multiple rapid disconnections', async ({ browser }) => {
    const contexts = [];
    const pages = [];
    
    // Setup 3 devices
    for (let i = 0; i < 3; i++) {
      const context = await browser.newContext();
      const page = await context.newPage();
      contexts.push(context);
      pages.push(page);
    }
    
    // Create session
    await pages[0].goto('/');
    await pages[0].click('[data-testid="create-session-btn"]');
    await expect(pages[0].locator('[data-testid="session-id"]')).toBeVisible();
    const handoffToken = await pages[0].locator('[data-testid="handoff-token"]').textContent();
    
    // Connect other devices
    for (let i = 1; i < 3; i++) {
      await pages[i].goto(`/?handoff=${handoffToken}`);
      await expect(pages[i].locator('[data-testid="session-connected"]')).toBeVisible();
    }
    
    // Rapid disconnect/reconnect cycles
    for (let cycle = 0; cycle < 3; cycle++) {
      // Disconnect random device
      const deviceIdx = cycle % 3;
      await contexts[deviceIdx].setOffline(true);
      await pages[deviceIdx].waitForTimeout(500);
      
      // Make change on another device
      const otherIdx = (cycle + 1) % 3;
      await pages[otherIdx].fill('[data-testid="state-input"]', `Cycle ${cycle + 1} update`);
      await pages[otherIdx].click('[data-testid="save-state-btn"]');
      
      // Reconnect
      await contexts[deviceIdx].setOffline(false);
      await pages[deviceIdx].waitForTimeout(1000);
    }
    
    // Final sync check
    await pages[0].waitForTimeout(2000);
    
    for (const page of pages) {
      await expect(page.locator('[data-testid="state-input"]')).toHaveValue('Cycle 3 update');
    }
    
    for (const context of contexts) {
      await context.close();
    }
  });
});
