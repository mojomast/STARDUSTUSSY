import { test, expect } from '@playwright/test';

test.describe('PWA', () => {
  test('should have manifest.json', async ({ page }) => {
    const response = await page.goto('/manifest.json');
    expect(response?.status()).toBe(200);
    
    const manifest = await response?.json();
    expect(manifest.name).toBe('HarmonyFlow SyncBridge');
    expect(manifest.short_name).toBe('SyncBridge');
  });

  test('should have service worker', async ({ page }) => {
    await page.goto('/');
    const swPath = await page.evaluate(() => {
      return navigator.serviceWorker?.controller?.scriptURL;
    });
    expect(swPath).toContain('sw.js');
  });
});
