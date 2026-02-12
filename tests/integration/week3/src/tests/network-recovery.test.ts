import { test, expect } from '@playwright/test';
import { MultiDeviceTestHelper } from '../helpers/MultiDeviceTestHelper';

test.describe('Network Recovery Integration Tests', () => {
  let helper: MultiDeviceTestHelper;

  test.beforeEach(async ({ browser }) => {
    helper = new MultiDeviceTestHelper(browser);
  });

  test.afterEach(async () => {
    await helper.cleanup();
  });

  test('should recover state after network interruption', async () => {
    const device1 = await helper.createDevice();
    const device2 = await helper.createDevice();
    
    await helper.createSession(device1);
    await helper.setState(device1, 'Initial state');
    
    const handoffToken = await helper.getHandoffToken(device1);
    await helper.joinSession(device2, handoffToken);
    
    // Interrupt network on device 2
    await helper.disconnectDevice(device2);
    
    // Change on device 1
    await helper.setState(device1, 'Changed while device 2 offline');
    
    // Reconnect device 2
    await helper.reconnectDevice(device2);
    
    // Verify sync
    await expect(device2.page.locator('[data-testid="state-input"]')).toHaveValue(
      'Changed while device 2 offline',
      { timeout: 10000 }
    );
  });

  test('should queue and sync multiple offline changes', async () => {
    const device = await helper.createDevice();
    
    await helper.createSession(device);
    
    // Go offline
    await helper.disconnectDevice(device);
    
    // Make multiple changes
    const changes = ['Change 1', 'Change 2', 'Change 3'];
    for (const change of changes) {
      await device.page.fill('[data-testid="state-input"]', change);
      await device.page.click('[data-testid="save-state-btn"]');
    }
    
    // Verify pending changes count
    await expect(device.page.locator('[data-testid="pending-changes-count"]')).toHaveText('3');
    
    // Reconnect
    await helper.reconnectDevice(device);
    
    // Wait for sync
    await expect(device.page.locator('[data-testid="pending-changes-count"]')).toHaveText('0', { timeout: 10000 });
    await expect(device.page.locator('[data-testid="state-input"]')).toHaveValue('Change 3');
  });

  test('should handle intermittent connectivity', async () => {
    const device = await helper.createDevice();
    
    await helper.createSession(device);
    
    // Multiple disconnect/reconnect cycles
    for (let i = 0; i < 5; i++) {
      await helper.disconnectDevice(device);
      await device.page.waitForTimeout(500);
      
      await device.page.fill('[data-testid="state-input"]', `Cycle ${i + 1}`);
      await device.page.click('[data-testid="save-state-btn"]');
      
      await helper.reconnectDevice(device);
      await device.page.waitForTimeout(1000);
      
      // Verify still connected
      await expect(device.page.locator('[data-testid="connection-status"]')).toHaveText(/connected/i);
    }
    
    // Final state should be correct
    await expect(device.page.locator('[data-testid="state-input"]')).toHaveValue('Cycle 5');
  });

  test('should recover session after extended disconnection', async () => {
    const device = await helper.createDevice();
    
    await helper.createSession(device);
    await helper.setState(device, 'Important data');
    
    const sessionId = await device.page.locator('[data-testid="session-id"]').textContent();
    
    // Disconnect for extended period
    await helper.disconnectDevice(device);
    await device.page.waitForTimeout(3000); // Simulate 3 seconds offline
    
    // Reconnect
    await helper.reconnectDevice(device);
    
    // Session should be preserved
    await expect(device.page.locator('[data-testid="session-id"]')).toHaveText(sessionId!, { timeout: 10000 });
    await expect(device.page.locator('[data-testid="state-input"]')).toHaveValue('Important data');
  });

  test('should handle WebSocket failures and fallback', async () => {
    const device = await helper.createDevice();
    
    await helper.createSession(device);
    
    // Block WebSocket
    await device.page.context().route(/ws:\/\/.*/, (route) => route.abort());
    
    // Should fallback to HTTP polling
    await expect(device.page.locator('[data-testid="connection-mode"]')).toHaveText(/polling/i, { timeout: 10000 });
    
    // State operations should still work
    await helper.setState(device, 'Polling mode test');
    
    // Restore WebSocket
    await device.page.context().unroute(/ws:\/\/.*/);
    
    // Should reconnect with WebSocket
    await device.page.click('[data-testid="reconnect-websocket-btn"]');
    await expect(device.page.locator('[data-testid="connection-mode"]')).toHaveText(/websocket/i, { timeout: 10000 });
  });
});
