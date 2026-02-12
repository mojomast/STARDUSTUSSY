import { test, expect } from '@playwright/test';
import { MultiDeviceTestHelper } from '../helpers/MultiDeviceTestHelper';

test.describe('Conflict Resolution Integration Tests', () => {
  let helper: MultiDeviceTestHelper;

  test.beforeEach(async ({ browser }) => {
    helper = new MultiDeviceTestHelper(browser);
  });

  test.afterEach(async () => {
    await helper.cleanup();
  });

  test('should resolve concurrent edits with last-write-wins', async () => {
    const devices = [];
    
    // Create 3 devices
    for (let i = 0; i < 3; i++) {
      const device = await helper.createDevice({ name: `Device ${i + 1}` });
      devices.push(device);
    }
    
    // Create session on first device
    await helper.createSession(devices[0]);
    const handoffToken = await helper.getHandoffToken(devices[0]);
    
    // Connect other devices
    for (let i = 1; i < 3; i++) {
      await helper.joinSession(devices[i], handoffToken);
    }
    
    // Simultaneous edits
    await Promise.all([
      helper.setState(devices[0], 'Edit from Device 1'),
      helper.setState(devices[1], 'Edit from Device 2'),
      helper.setState(devices[2], 'Edit from Device 3'),
    ]);
    
    // Wait for conflict resolution
    await devices[0].page.waitForTimeout(2000);
    
    // All devices should converge to same value
    const states = await Promise.all(devices.map(d => helper.getState(d)));
    const uniqueStates = [...new Set(states)];
    expect(uniqueStates.length).toBe(1);
  });

  test('should handle rapid sequential edits', async () => {
    const device1 = await helper.createDevice({ name: 'Editor' });
    const device2 = await helper.createDevice({ name: 'Viewer' });
    
    await helper.createSession(device1);
    const handoffToken = await helper.getHandoffToken(device1);
    await helper.joinSession(device2, handoffToken);
    
    // Rapid edits on device 1
    for (let i = 0; i < 20; i++) {
      await helper.setState(device1, `Edit ${i + 1}`);
    }
    
    // Wait for sync
    await device1.page.waitForTimeout(2000);
    
    // Device 2 should have final value
    const finalState = await helper.getState(device2);
    expect(finalState).toBe('Edit 20');
  });

  test('should detect and report conflicts', async () => {
    const device1 = await helper.createDevice();
    const device2 = await helper.createDevice();
    
    await helper.createSession(device1);
    await helper.setState(device1, 'Initial');
    
    const handoffToken = await helper.getHandoffToken(device1);
    await helper.joinSession(device2, handoffToken);
    
    // Disconnect device 2
    await helper.disconnectDevice(device2);
    
    // Edit on both devices
    await helper.setState(device1, 'Change from device 1');
    await device2.page.fill('[data-testid="state-input"]', 'Change from device 2');
    await device2.page.click('[data-testid="save-state-btn"]');
    
    // Reconnect device 2
    await helper.reconnectDevice(device2);
    await device2.page.waitForTimeout(2000);
    
    // Should show conflict indicator
    await expect(device1.page.locator('[data-testid="conflict-indicator"]')).toBeVisible();
    await expect(device2.page.locator('[data-testid="conflict-indicator"]')).toBeVisible();
  });

  test('should handle concurrent array modifications', async () => {
    const device1 = await helper.createDevice();
    const device2 = await helper.createDevice();
    
    await helper.createSession(device1);
    
    // Set array state
    const initialArray = [{ id: 1, name: 'Item 1' }];
    await device1.page.fill('[data-testid="state-json-input"]', JSON.stringify({ items: initialArray }));
    await device1.page.click('[data-testid="save-state-btn"]');
    
    const handoffToken = await helper.getHandoffToken(device1);
    await helper.joinSession(device2, handoffToken);
    
    // Concurrent array modifications
    await device1.page.fill(
      '[data-testid="state-json-input"]',
      JSON.stringify({ items: [...initialArray, { id: 2, name: 'Item 2' }] })
    );
    await device1.page.click('[data-testid="save-state-btn"]');
    
    await device2.page.fill(
      '[data-testid="state-json-input"]',
      JSON.stringify({ items: [...initialArray, { id: 3, name: 'Item 3' }] })
    );
    await device2.page.click('[data-testid="save-state-btn"]');
    
    await device1.page.waitForTimeout(2000);
    
    // Both should have same state
    const state1 = await device1.page.locator('[data-testid="state-json-input"]').inputValue();
    const state2 = await device2.page.locator('[data-testid="state-json-input"]').inputValue();
    expect(state1).toBe(state2);
  });
});
