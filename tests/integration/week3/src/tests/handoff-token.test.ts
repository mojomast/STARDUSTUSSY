import { test, expect } from '@playwright/test';
import { MultiDeviceTestHelper } from '../helpers/MultiDeviceTestHelper';
import { PerformanceMetricsCollector, performanceBudgets } from '../helpers/PerformanceMetrics';
import { TestDataGenerator } from '../helpers/TestDataGenerator';

test.describe('Multi-Device Handoff Integration Tests', () => {
  let helper: MultiDeviceTestHelper;
  let metrics: PerformanceMetricsCollector;
  let generator: TestDataGenerator;

  test.beforeEach(async ({ browser }) => {
    helper = new MultiDeviceTestHelper(browser);
    metrics = new PerformanceMetricsCollector();
    generator = new TestDataGenerator();
  });

  test.afterEach(async () => {
    await helper.cleanup();
    console.log(metrics.generateReport());
  });

  test('should complete full handoff flow within performance budget', async ({ browser }) => {
    // Create mobile device
    const mobile = await helper.createMobileDevice();
    
    // Create session on mobile
    const sessionId = await helper.createSession(mobile);
    expect(sessionId).toBeTruthy();
    
    // Add state
    await helper.setState(mobile, 'Test handoff state');
    
    // Measure handoff latency
    const desktop = await helper.createDesktopDevice();
    metrics.startTimer('handoff-latency');
    
    const handoffToken = await helper.getHandoffToken(mobile);
    await helper.joinSession(desktop, handoffToken);
    
    const handoffLatency = metrics.endTimer('handoff-latency');
    
    // Verify state transferred
    const desktopState = await helper.getState(desktop);
    expect(desktopState).toBe('Test handoff state');
    
    // Assert performance budget
    expect(handoffLatency).toBeLessThan(performanceBudgets.handoffLatency);
  });

  test('should handle complex state handoff', async () => {
    const mobile = await helper.createMobileDevice();
    await helper.createSession(mobile);
    
    // Set complex state
    const complexState = generator.generateComplexState();
    await mobile.page.fill('[data-testid="state-json-input"]', JSON.stringify(complexState));
    await mobile.page.click('[data-testid="save-state-btn"]');
    await mobile.page.waitForSelector('[data-testid="save-status"]:has-text("Saved")');
    
    // Handoff to desktop
    const desktop = await helper.createDesktopDevice();
    const handoffToken = await helper.getHandoffToken(mobile);
    await helper.joinSession(desktop, handoffToken);
    
    // Verify complex state
    const transferredState = await desktop.page.locator('[data-testid="state-json-input"]').inputValue();
    const parsedState = JSON.parse(transferredState);
    expect(parsedState).toEqual(complexState);
  });

  test('should handle multiple sequential handoffs', async () => {
    const devices = [];
    
    // Create initial device
    const device1 = await helper.createDevice({ name: 'Device 1' });
    devices.push(device1);
    await helper.createSession(device1);
    await helper.setState(device1, 'Initial state');
    
    // Chain of handoffs
    for (let i = 2; i <= 5; i++) {
      const device = await helper.createDevice({ name: `Device ${i}` });
      devices.push(device);
      
      const previousDevice = devices[i - 2];
      const handoffToken = await helper.getHandoffToken(previousDevice);
      await helper.joinSession(device, handoffToken);
      
      // Update state on new device
      await helper.setState(device, `State from device ${i}`);
    }
    
    // Verify all devices have final state
    const lastDevice = devices[devices.length - 1];
    const finalState = await helper.getState(lastDevice);
    expect(finalState).toBe('State from device 5');
  });

  test('should reject expired handoff tokens', async () => {
    const mobile = await helper.createMobileDevice();
    await helper.createSession(mobile);
    
    const handoffToken = await helper.getHandoffToken(mobile);
    
    // Simulate token expiration
    await mobile.page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('test-expire-handoff-token'));
    });
    
    const desktop = await helper.createDesktopDevice();
    await desktop.page.goto(`/?handoff=${handoffToken}`);
    await desktop.page.waitForLoadState('networkidle');
    
    // Should show error
    await expect(desktop.page.locator('[data-testid="handoff-expired-error"]')).toBeVisible({ timeout: 5000 });
  });
});
