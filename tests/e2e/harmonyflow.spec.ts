import { test, expect } from '@playwright/test';

test.describe('HarmonyFlow E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the application
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test.describe('Landing Page', () => {
    test('should load the application successfully', async ({ page }) => {
      // Check page title
      await expect(page).toHaveTitle(/HarmonyFlow/);
      
      // Check main elements are visible
      await expect(page.locator('body')).toBeVisible();
    });

    test('should display connection status', async ({ page }) => {
      // Check for connection status indicator
      const statusIndicator = page.locator('[data-testid="connection-status"]');
      
      // Should eventually show connected status
      await expect(statusIndicator).toHaveText(/connected/i, { timeout: 10000 });
    });

    test('should handle offline mode gracefully', async ({ page, context }) => {
      // Go offline
      await context.setOffline(true);
      
      // Should show offline indicator
      const offlineIndicator = page.locator('[data-testid="offline-indicator"]');
      await expect(offlineIndicator).toBeVisible({ timeout: 5000 });
      
      // Restore connection
      await context.setOffline(false);
      
      // Should reconnect
      const statusIndicator = page.locator('[data-testid="connection-status"]');
      await expect(statusIndicator).toHaveText(/connected/i, { timeout: 15000 });
    });
  });

  test.describe('State Management', () => {
    test('should persist state across page reloads', async ({ page }) => {
      // Set some state
      const input = page.locator('[data-testid="state-input"]');
      await input.fill('test-value-123');
      
      // Reload page
      await page.reload();
      await page.waitForLoadState('networkidle');
      
      // State should be restored
      await expect(input).toHaveValue('test-value-123');
    });

    test('should sync state across browser tabs', async ({ browser }) => {
      // Create first context
      const context1 = await browser.newContext();
      const page1 = await context1.newPage();
      await page1.goto('/');
      
      // Create second context
      const context2 = await browser.newContext();
      const page2 = await context2.newPage();
      await page2.goto('/');
      
      // Set state in first tab
      const input1 = page1.locator('[data-testid="state-input"]');
      await input1.fill('sync-test-value');
      
      // Wait for sync
      await page1.waitForTimeout(2000);
      
      // Check state in second tab
      const input2 = page2.locator('[data-testid="state-input"]');
      await expect(input2).toHaveValue('sync-test-value', { timeout: 5000 });
      
      // Cleanup
      await context1.close();
      await context2.close();
    });
  });

  test.describe('Multi-Device Sync', () => {
    test('should sync across desktop and mobile views', async ({ browser }) => {
      // Desktop context
      const desktopContext = await browser.newContext({
        viewport: { width: 1280, height: 720 },
      });
      const desktopPage = await desktopContext.newPage();
      await desktopPage.goto('/');
      
      // Mobile context
      const mobileContext = await browser.newContext({
        viewport: { width: 375, height: 667 },
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
      });
      const mobilePage = await mobileContext.newPage();
      await mobilePage.goto('/');
      
      // Update state on desktop
      const desktopInput = desktopPage.locator('[data-testid="state-input"]');
      await desktopInput.fill('cross-device-value');
      
      // Wait for sync
      await desktopPage.waitForTimeout(2000);
      
      // Verify on mobile
      const mobileInput = mobilePage.locator('[data-testid="state-input"]');
      await expect(mobileInput).toHaveValue('cross-device-value', { timeout: 5000 });
      
      // Cleanup
      await desktopContext.close();
      await mobileContext.close();
    });
  });

  test.describe('Error Handling', () => {
    test('should display error messages', async ({ page }) => {
      // Simulate an error condition
      await page.evaluate(() => {
        window.dispatchEvent(new CustomEvent('test-error', { 
          detail: { message: 'Test error message' } 
        }));
      });
      
      // Error message should be displayed
      const errorMessage = page.locator('[data-testid="error-message"]');
      await expect(errorMessage).toBeVisible();
      await expect(errorMessage).toContainText(/error/i);
    });

    test('should recover from connection errors', async ({ page, context }) => {
      // Simulate connection drop
      await context.setOffline(true);
      await page.waitForTimeout(2000);
      
      // Restore connection
      await context.setOffline(false);
      
      // Should reconnect automatically
      const statusIndicator = page.locator('[data-testid="connection-status"]');
      await expect(statusIndicator).toHaveText(/connected/i, { timeout: 15000 });
    });
  });

  test.describe('Performance', () => {
    test('should load within performance budget', async ({ page }) => {
      const startTime = Date.now();
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      const loadTime = Date.now() - startTime;
      
      // Should load in under 3 seconds
      expect(loadTime).toBeLessThan(3000);
    });

    test('should maintain 60fps during animations', async ({ page }) => {
      // Execute animation and measure FPS
      const fps = await page.evaluate(async () => {
        let frameCount = 0;
        const startTime = performance.now();
        
        const countFrames = () => {
          frameCount++;
          if (performance.now() - startTime < 1000) {
            requestAnimationFrame(countFrames);
          }
        };
        
        requestAnimationFrame(countFrames);
        
        // Trigger some state changes
        for (let i = 0; i < 100; i++) {
          window.dispatchEvent(new CustomEvent('state-update', { 
            detail: { value: i } 
          }));
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        return frameCount;
      });
      
      // Should maintain close to 60fps
      expect(fps).toBeGreaterThan(55);
    });
  });

  test.describe('Accessibility', () => {
    test('should have proper ARIA labels', async ({ page }) => {
      // Check for ARIA landmarks
      const main = page.locator('main');
      await expect(main).toHaveAttribute('role', 'main');
      
      // Check for button labels
      const buttons = page.locator('button');
      const buttonCount = await buttons.count();
      
      for (let i = 0; i < buttonCount; i++) {
        const button = buttons.nth(i);
        const ariaLabel = await button.getAttribute('aria-label');
        const text = await button.textContent();
        
        // Buttons should have either aria-label or text content
        expect(ariaLabel || text).toBeTruthy();
      }
    });

    test('should support keyboard navigation', async ({ page }) => {
      // Tab through interactive elements
      await page.keyboard.press('Tab');
      
      // Check that focus is visible
      const focusedElement = page.locator(':focus');
      await expect(focusedElement).toBeVisible();
      
      // Press Enter on focused element
      await page.keyboard.press('Enter');
      
      // Should not crash
      await expect(page.locator('body')).toBeVisible();
    });
  });
});
