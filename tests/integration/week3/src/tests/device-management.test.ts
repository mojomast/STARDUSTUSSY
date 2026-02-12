import { test, expect } from '@playwright/test';
import { MultiDeviceTestHelper } from '../helpers/MultiDeviceTestHelper';

test.describe('Device Management Integration Tests', () => {
  let helper: MultiDeviceTestHelper;

  test.beforeEach(async ({ browser }) => {
    helper = new MultiDeviceTestHelper(browser);
  });

  test.afterEach(async () => {
    await helper.cleanup();
  });

  test('should track device presence correctly', async () => {
    const devices = [];
    
    // Create and connect 3 devices
    for (let i = 0; i < 3; i++) {
      const device = await helper.createDevice({ name: `Device ${i + 1}` });
      devices.push(device);
    }
    
    await helper.createSession(devices[0]);
    const handoffToken = await helper.getHandoffToken(devices[0]);
    
    for (let i = 1; i < 3; i++) {
      await helper.joinSession(devices[i], handoffToken);
    }
    
    // All devices should show 3 connected
    for (const device of devices) {
      await expect(device.page.locator('[data-testid="connected-devices-count"]')).toHaveText('3');
    }
    
    // Close one device
    await helper.closeDevice(devices[1]);
    
    // Wait for presence update
    await devices[0].page.waitForTimeout(2000);
    
    // Remaining devices should show 2 connected
    await expect(devices[0].page.locator('[data-testid="connected-devices-count"]')).toHaveText('2');
    await expect(devices[2].page.locator('[data-testid="connected-devices-count"]')).toHaveText('2');
  });

  test('should handle device logout', async () => {
    const device1 = await helper.createDevice({ name: 'Primary' });
    const device2 = await helper.createDevice({ name: 'Secondary' });
    
    await helper.createSession(device1);
    const handoffToken = await helper.getHandoffToken(device1);
    await helper.joinSession(device2, handoffToken);
    
    // Device 2 logs out
    await device2.page.click('[data-testid="logout-btn"]');
    await device2.page.click('[data-testid="confirm-logout-btn"]');
    
    // Device 2 should be disconnected
    await expect(device2.page.locator('[data-testid="session-disconnected"]')).toBeVisible({ timeout: 5000 });
    
    // Device 1 should update count
    await expect(device1.page.locator('[data-testid="connected-devices-count"]')).toHaveText('1', { timeout: 5000 });
  });

  test('should handle unexpected device disconnect', async () => {
    const device1 = await helper.createDevice();
    const device2 = await helper.createDevice();
    
    await helper.createSession(device1);
    const handoffToken = await helper.getHandoffToken(device1);
    await helper.joinSession(device2, handoffToken);
    
    // Unexpected disconnect (close without logout)
    await device2.context.close();
    
    // Wait for detection
    await device1.page.waitForTimeout(2000);
    
    // Device 1 should show notification
    await expect(device1.page.locator('[data-testid="device-disconnected-notification"]')).toBeVisible();
    await expect(device1.page.locator('[data-testid="connected-devices-count"]')).toHaveText('1');
  });

  test('should transfer primary ownership when primary disconnects', async () => {
    const devices = [];
    
    // Create 3 devices
    for (let i = 0; i < 3; i++) {
      const device = await helper.createDevice({ name: `Device ${i + 1}` });
      devices.push(device);
    }
    
    // Device 1 creates session (primary)
    await helper.createSession(devices[0]);
    await expect(devices[0].page.locator('[data-testid="primary-device-indicator"]')).toBeVisible();
    
    const handoffToken = await helper.getHandoffToken(devices[0]);
    
    // Others join
    for (let i = 1; i < 3; i++) {
      await helper.joinSession(devices[i], handoffToken);
      await expect(devices[i].page.locator('[data-testid="primary-device-indicator"]')).not.toBeVisible();
    }
    
    // Primary disconnects
    await devices[0].context.close();
    devices.shift();
    
    // Wait for ownership transfer
    await devices[0].page.waitForTimeout(2000);
    
    // Device 2 should become primary
    await expect(devices[0].page.locator('[data-testid="primary-device-indicator"]')).toBeVisible();
  });

  test('should maintain session after all devices disconnect', async () => {
    const device = await helper.createDevice();
    
    await helper.createSession(device);
    await helper.setState(device, 'Persistent data');
    const sessionId = await device.page.locator('[data-testid="session-id"]').textContent();
    
    // Disconnect
    await device.context.close();
    
    // Wait
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Reconnect with new context
    const newContext = await helper['browser'].newContext();
    const newPage = await newContext.newPage();
    
    await newPage.goto('/');
    await newPage.fill('[data-testid="session-id-input"]', sessionId!);
    await newPage.click('[data-testid="join-session-btn"]');
    
    // Should reconnect to same session
    await expect(newPage.locator('[data-testid="session-connected"]')).toBeVisible({ timeout: 10000 });
    await expect(newPage.locator('[data-testid="session-id"]')).toHaveText(sessionId!);
    await expect(newPage.locator('[data-testid="state-input"]')).toHaveValue('Persistent data');
    
    await newContext.close();
  });

  test('should show device list with details', async () => {
    const device1 = await helper.createDesktopDevice('Desktop');
    const device2 = await helper.createMobileDevice('iPhone');
    
    await helper.createSession(device1);
    const handoffToken = await helper.getHandoffToken(device1);
    await helper.joinSession(device2, handoffToken);
    
    // View device list
    await device1.page.click('[data-testid="view-devices-btn"]');
    await expect(device1.page.locator('[data-testid="device-list"]')).toBeVisible();
    
    // Should show both devices
    await expect(device1.page.locator('[data-testid="device-list"]')).toContainText('Desktop');
    await expect(device1.page.locator('[data-testid="device-list"]')).toContainText('iPhone');
    
    // Should show device types
    await expect(device1.page.locator('[data-testid="device-list"]')).toContainText('desktop');
    await expect(device1.page.locator('[data-testid="device-list"]')).toContainText('mobile');
  });

  test('should allow primary device to kick other devices', async () => {
    const primary = await helper.createDevice({ name: 'Primary' });
    const secondary = await helper.createDevice({ name: 'Secondary' });
    
    await helper.createSession(primary);
    const handoffToken = await helper.getHandoffToken(primary);
    await helper.joinSession(secondary, handoffToken);
    
    // Primary views devices and kicks secondary
    await primary.page.click('[data-testid="view-devices-btn"]');
    await primary.page.click('[data-testid="kick-device-btn"]');
    await primary.page.click('[data-testid="confirm-kick-btn"]');
    
    // Secondary should be kicked
    await expect(secondary.page.locator('[data-testid="kicked-notification"]')).toBeVisible({ timeout: 5000 });
    await expect(secondary.page.locator('[data-testid="session-disconnected"]')).toBeVisible();
    
    // Primary should update count
    await expect(primary.page.locator('[data-testid="connected-devices-count"]')).toHaveText('1');
  });
});
