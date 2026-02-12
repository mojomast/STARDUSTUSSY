import { test, expect } from '@playwright/test';

test.describe('Test Case 4: Session Expiration Edge Cases', () => {
  
  test('should handle session expiration during handoff gracefully', async ({ browser }) => {
    const mobileContext = await browser.newContext({
      viewport: { width: 375, height: 667 },
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
    });
    const mobilePage = await mobileContext.newPage();
    
    // Create session on mobile
    await mobilePage.goto('/');
    await mobilePage.click('[data-testid="create-session-btn"]');
    await expect(mobilePage.locator('[data-testid="session-id"]')).toBeVisible();
    
    // Generate handoff token
    await mobilePage.click('[data-testid="handoff-btn"]');
    const handoffToken = await mobilePage.locator('[data-testid="handoff-token"]').textContent();
    
    // Simulate session expiration (in real test, this would wait for actual expiration or use test hooks)
    await mobilePage.evaluate(() => {
      // Trigger session expiration via test API
      window.dispatchEvent(new CustomEvent('test-expire-session'));
    });
    
    // Try to use expired handoff token on desktop
    const desktopContext = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const desktopPage = await desktopContext.newPage();
    
    await desktopPage.goto(`/?handoff=${handoffToken}`);
    await desktopPage.waitForLoadState('networkidle');
    
    // Should show session expired error
    await expect(desktopPage.locator('[data-testid="session-expired-error"]')).toBeVisible({ timeout: 5000 });
    await expect(desktopPage.locator('[data-testid="session-expired-error"]')).toContainText('expired');
    
    // Should offer to create new session
    await expect(desktopPage.locator('[data-testid="create-new-session-btn"]')).toBeVisible();
    
    await mobileContext.close();
    await desktopContext.close();
  });

  test('should handle device reconnecting to expired session', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    
    // Create session
    await page.goto('/');
    await page.click('[data-testid="create-session-btn"]');
    await expect(page.locator('[data-testid="session-id"]')).toBeVisible();
    const sessionId = await page.locator('[data-testid="session-id"]').textContent();
    
    // Set some state
    await page.fill('[data-testid="state-input"]', 'Important data');
    await page.click('[data-testid="save-state-btn"]');
    
    // Simulate session expiration
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('test-expire-session'));
    });
    
    // Try to reconnect (reload page with same session)
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Should show session expired message
    await expect(page.locator('[data-testid="session-expired-error"]')).toBeVisible({ timeout: 10000 });
    
    // Should not show old session data
    await expect(page.locator('[data-testid="session-id"]')).not.toHaveText(sessionId!);
    
    // Should have option to start fresh or recover
    await expect(page.locator('[data-testid="start-fresh-btn"]')).toBeVisible();
    
    await context.close();
  });

  test('should show warning before session expires', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    
    await page.goto('/');
    await page.click('[data-testid="create-session-btn"]');
    await expect(page.locator('[data-testid="session-id"]')).toBeVisible();
    
    // Simulate approaching expiration (e.g., 5 minutes before)
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('test-session-expiring-soon', { 
        detail: { minutesRemaining: 5 } 
      }));
    });
    
    // Should show expiration warning
    await expect(page.locator('[data-testid="session-expiring-warning"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="session-expiring-warning"]')).toContainText('5 minutes');
    
    // Should offer to extend session
    await expect(page.locator('[data-testid="extend-session-btn"]')).toBeVisible();
    
    await context.close();
  });

  test('should allow session extension before expiration', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    
    await page.goto('/');
    await page.click('[data-testid="create-session-btn"]');
    await expect(page.locator('[data-testid="session-id"]')).toBeVisible();
    const sessionId = await page.locator('[data-testid="session-id"]').textContent();
    
    // Set state
    await page.fill('[data-testid="state-input"]', 'Data to preserve');
    await page.click('[data-testid="save-state-btn"]');
    
    // Trigger expiring warning
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('test-session-expiring-soon', { 
        detail: { minutesRemaining: 5 } 
      }));
    });
    
    // Extend session
    await page.click('[data-testid="extend-session-btn"]');
    
    // Should show success message
    await expect(page.locator('[data-testid="session-extended-success"]')).toBeVisible({ timeout: 5000 });
    
    // Session should still be active
    await page.reload();
    await expect(page.locator('[data-testid="session-id"]')).toHaveText(sessionId!, { timeout: 10000 });
    await expect(page.locator('[data-testid="state-input"]')).toHaveValue('Data to preserve');
    
    await context.close();
  });

  test('should handle expired handoff token with expired session', async ({ browser }) => {
    const mobileContext = await browser.newContext({
      viewport: { width: 375, height: 667 },
    });
    const mobilePage = await mobileContext.newPage();
    
    // Create session
    await mobilePage.goto('/');
    await mobilePage.click('[data-testid="create-session-btn"]');
    await expect(mobilePage.locator('[data-testid="session-id"]')).toBeVisible();
    
    // Generate handoff token
    await mobilePage.click('[data-testid="handoff-btn"]');
    const handoffToken = await mobilePage.locator('[data-testid="handoff-token"]').textContent();
    
    // Wait for token expiration on mobile
    await mobilePage.evaluate(() => {
      window.dispatchEvent(new CustomEvent('test-expire-handoff-token'));
    });
    
    // Also expire the session
    await mobilePage.evaluate(() => {
      window.dispatchEvent(new CustomEvent('test-expire-session'));
    });
    
    const desktopContext = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const desktopPage = await desktopContext.newPage();
    
    // Try to use expired token
    await desktopPage.goto(`/?handoff=${handoffToken}`);
    await desktopPage.waitForLoadState('networkidle');
    
    // Should show both expired messages
    await expect(desktopPage.locator('[data-testid="handoff-expired-error"]')).toBeVisible({ timeout: 5000 });
    await expect(desktopPage.locator('[data-testid="session-expired-error"]')).toBeVisible();
    
    // Should provide clear next steps
    await expect(desktopPage.locator('[data-testid="start-new-session-btn"]')).toBeVisible();
    
    await mobileContext.close();
    await desktopContext.close();
  });

  test('should preserve state in local storage during expiration', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    
    await page.goto('/');
    await page.click('[data-testid="create-session-btn"]');
    await expect(page.locator('[data-testid="session-id"]')).toBeVisible();
    
    // Set state
    await page.fill('[data-testid="state-input"]', 'Important unsaved data');
    // Don't save - just leave in input
    
    // Trigger session expiration
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('test-expire-session'));
    });
    
    // Should show expiration error but preserve unsaved data warning
    await expect(page.locator('[data-testid="unsaved-data-warning"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="unsaved-data-warning"]')).toContainText('Important unsaved data');
    
    // Should offer to export/save data
    await expect(page.locator('[data-testid="export-data-btn"]')).toBeVisible();
    
    await context.close();
  });

  test('should handle concurrent devices with expiring session', async ({ browser }) => {
    const contexts = [];
    const pages = [];
    
    // Create 3 devices
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
    
    // Trigger session expiration warning on all devices
    for (const page of pages) {
      await page.evaluate(() => {
        window.dispatchEvent(new CustomEvent('test-session-expiring-soon', { 
          detail: { minutesRemaining: 5 } 
        }));
      });
    }
    
    // All devices should show warning
    for (const page of pages) {
      await expect(page.locator('[data-testid="session-expiring-warning"]')).toBeVisible();
    }
    
    // Extend from device 1
    await pages[0].click('[data-testid="extend-session-btn"]');
    await pages[0].waitForTimeout(1000);
    
    // Warning should disappear on all devices
    for (const page of pages) {
      await expect(page.locator('[data-testid="session-expiring-warning"]')).not.toBeVisible();
    }
    
    for (const context of contexts) {
      await context.close();
    }
  });
});
