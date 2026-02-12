import { test, expect } from '@playwright/test';
import { MultiDeviceTestHelper } from '../helpers/MultiDeviceTestHelper';

test.describe('Session Expiry Integration Tests', () => {
  let helper: MultiDeviceTestHelper;

  test.beforeEach(async ({ browser }) => {
    helper = new MultiDeviceTestHelper(browser);
  });

  test.afterEach(async () => {
    await helper.cleanup();
  });

  test('should show expiration warning before session expires', async () => {
    const device = await helper.createDevice();
    
    await helper.createSession(device);
    
    // Trigger expiration warning
    await device.page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('test-session-expiring-soon', {
        detail: { minutesRemaining: 5 }
      }));
    });
    
    await expect(device.page.locator('[data-testid="session-expiring-warning"]')).toBeVisible({ timeout: 5000 });
    await expect(device.page.locator('[data-testid="session-expiring-warning"]')).toContainText('5 minutes');
  });

  test('should allow extending session before expiration', async () => {
    const device = await helper.createDevice();
    
    await helper.createSession(device);
    await helper.setState(device, 'Data to preserve');
    
    const sessionId = await device.page.locator('[data-testid="session-id"]').textContent();
    
    // Trigger warning
    await device.page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('test-session-expiring-soon', {
        detail: { minutesRemaining: 5 }
      }));
    });
    
    // Extend session
    await device.page.click('[data-testid="extend-session-btn"]');
    
    await expect(device.page.locator('[data-testid="session-extended-success"]')).toBeVisible({ timeout: 5000 });
    
    // Reload and verify session still active
    await device.page.reload();
    await expect(device.page.locator('[data-testid="session-id"]')).toHaveText(sessionId!, { timeout: 10000 });
    await expect(device.page.locator('[data-testid="state-input"]')).toHaveValue('Data to preserve');
  });

  test('should handle session expiration gracefully', async () => {
    const device = await helper.createDevice();
    
    await helper.createSession(device);
    await helper.setState(device, 'Will be lost');
    
    // Expire session
    await device.page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('test-expire-session'));
    });
    
    // Should show expiration error
    await expect(device.page.locator('[data-testid="session-expired-error"]')).toBeVisible({ timeout: 5000 });
    
    // Should not allow further edits
    await expect(device.page.locator('[data-testid="state-input"]')).toBeDisabled();
  });

  test('should handle expired session on reconnection', async () => {
    const device = await helper.createDevice();
    
    await helper.createSession(device);
    const sessionId = await device.page.locator('[data-testid="session-id"]').textContent();
    
    // Disconnect
    await helper.disconnectDevice(device);
    
    // Expire session while offline
    await device.page.evaluate((sid) => {
      window.dispatchEvent(new CustomEvent('test-expire-session-by-id', {
        detail: { sessionId: sid }
      }));
    }, sessionId);
    
    // Reconnect
    await helper.reconnectDevice(device);
    
    // Should show expired error
    await expect(device.page.locator('[data-testid="session-expired-error"]')).toBeVisible({ timeout: 10000 });
  });

  test('should propagate expiration warning to all connected devices', async () => {
    const devices = [];
    
    // Create 3 devices
    for (let i = 0; i < 3; i++) {
      const device = await helper.createDevice({ name: `Device ${i + 1}` });
      devices.push(device);
    }
    
    // Create and join session
    await helper.createSession(devices[0]);
    const handoffToken = await helper.getHandoffToken(devices[0]);
    
    for (let i = 1; i < 3; i++) {
      await helper.joinSession(devices[i], handoffToken);
    }
    
    // Trigger expiration warning
    await devices[0].page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('test-session-expiring-soon', {
        detail: { minutesRemaining: 5 }
      }));
    });
    
    // All devices should show warning
    for (const device of devices) {
      await expect(device.page.locator('[data-testid="session-expiring-warning"]')).toBeVisible({ timeout: 5000 });
    }
  });

  test('should handle handoff with expired session token', async () => {
    const mobile = await helper.createMobileDevice();
    await helper.createSession(mobile);
    
    const handoffToken = await helper.getHandoffToken(mobile);
    
    // Expire session
    await mobile.page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('test-expire-session'));
    });
    
    const desktop = await helper.createDesktopDevice();
    await desktop.page.goto(`/?handoff=${handoffToken}`);
    await desktop.page.waitForLoadState('networkidle');
    
    // Should show error
    await expect(desktop.page.locator('[data-testid="session-expired-error"]')).toBeVisible({ timeout: 5000 });
    await expect(desktop.page.locator('[data-testid="create-new-session-btn"]')).toBeVisible();
  });
});
