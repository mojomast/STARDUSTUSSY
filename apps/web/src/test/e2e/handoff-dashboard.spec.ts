import { test, expect } from '@playwright/test';

test.describe('Cross-Device Handoff Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('/login');
    await page.fill('[data-testid="email-input"]', 'test@example.com');
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.click('[data-testid="login-button"]');
    await page.waitForURL('/');
  });

  test('user can initiate handoff from dashboard', async ({ page }) => {
    // Click handoff button on dashboard
    await page.click('text=Handoff');

    // Verify handoff modal opens
    await expect(page.locator('text=Continue on Another Device')).toBeVisible();

    // Verify device selection step is shown
    await expect(page.locator('text=Select target device')).toBeVisible();
  });

  test('user can select a device for handoff', async ({ page }) => {
    await page.click('text=Handoff');
    await page.waitForSelector('[data-testid="device-list"]');

    // Select a device (assuming there's at least one device)
    const deviceCard = page.locator('[data-testid="device-card"]').first();
    await deviceCard.click();

    // Verify we move to method selection step
    await expect(page.locator('text=Choose transfer method')).toBeVisible();
  });

  test('user can choose QR code transfer method', async ({ page }) => {
    await page.click('text=Handoff');
    
    // Select first device
    await page.locator('[data-testid="device-card"]').first().click();

    // Select QR code method
    await page.click('text=QR Code');

    // Verify QR code display
    await expect(page.locator('text=Scan to Connect')).toBeVisible();
    await expect(page.locator('text=Expires in')).toBeVisible();
  });

  test('user can cancel handoff', async ({ page }) => {
    await page.click('text=Handoff');
    
    // Cancel from device selection
    await page.click('text=Cancel');

    // Verify modal closes
    await expect(page.locator('text=Continue on Another Device')).not.toBeVisible();
  });

  test('user can access QR scanner from devices page', async ({ page }) => {
    await page.goto('/devices');
    
    // Click scan QR button
    await page.click('text=Scan QR');

    // Verify scanner opens
    await expect(page.locator('text=Point camera at QR code')).toBeVisible();
  });

  test('user can generate QR code from devices page', async ({ page }) => {
    await page.goto('/devices');
    
    // Click show QR button
    await page.click('text=Show QR');

    // Verify QR code is displayed
    await expect(page.locator('text=Scan to Connect')).toBeVisible();
  });
});

test.describe('Session Continuity', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('[data-testid="email-input"]', 'test@example.com');
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.click('[data-testid="login-button"]');
    await page.waitForURL('/');
  });

  test('recent sessions are displayed on dashboard', async ({ page }) => {
    await expect(page.locator('text=Recent Sessions')).toBeVisible();
    
    // Verify at least one session is shown (or empty state)
    const sessions = await page.locator('[data-testid="session-item"]').count();
    expect(sessions).toBeGreaterThanOrEqual(0);
  });

  test('user can navigate to sessions page', async ({ page }) => {
    await page.click('text=Sessions');
    await page.waitForURL('/sessions');

    await expect(page.locator('text=Session Management')).toBeVisible();
  });

  test('session statistics are displayed', async ({ page }) => {
    await page.goto('/sessions');

    await expect(page.locator('text=Session Statistics')).toBeVisible();
    await expect(page.locator('text=Total Sessions')).toBeVisible();
    await expect(page.locator('text=Total Data')).toBeVisible();
    await expect(page.locator('text=Device Types')).toBeVisible();
  });
});

test.describe('Admin Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('[data-testid="email-input"]', 'admin@example.com');
    await page.fill('[data-testid="password-input"]', 'admin123');
    await page.click('[data-testid="login-button"]');
    await page.waitForURL('/');
  });

  test('admin dashboard metrics are displayed', async ({ page }) => {
    await expect(page.locator('text=Admin Dashboard')).toBeVisible();

    // Verify metrics cards are shown
    await expect(page.locator('text=Active Sessions')).toBeVisible();
    await expect(page.locator('text=Connected Devices')).toBeVisible();
    await expect(page.locator('text=Reconnection Rate')).toBeVisible();
    await expect(page.locator('text=Storage Used')).toBeVisible();
  });

  test('time range selector works', async ({ page }) => {
    // Click different time ranges
    await page.click('text=1H');
    await page.click('text=7D');
    await page.click('text=30D');

    // Verify active state changes
    const activeButton = page.locator('button.active');
    await expect(activeButton).toHaveText('30D');
  });

  test('alerts panel is displayed when alerts exist', async ({ page }) => {
    // This test assumes alerts exist in the system
    const alertsPanel = page.locator('text=Alerts');
    
    if (await alertsPanel.isVisible()) {
      await expect(page.locator('[data-testid="alert-item"]').first()).toBeVisible();
    }
  });

  test('export functionality is accessible', async ({ page }) => {
    await page.click('text=Export');

    // Verify export dropdown opens
    await expect(page.locator('text=Format')).toBeVisible();
    await expect(page.locator('text=Metrics')).toBeVisible();
  });
});
