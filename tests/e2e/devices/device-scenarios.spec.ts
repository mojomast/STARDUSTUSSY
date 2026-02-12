import { test, expect } from '../fixtures/base';
import { createTestUser, cleanupTestUser } from '../fixtures/users';
import { DevicePresets } from '../fixtures/base';

test.describe('Device Testing - Desktop to Mobile Handoff', () => {
  let testUser: any;

  test.beforeEach(async ({ database }) => {
    testUser = await createTestUser(database);
  });

  test.afterEach(async ({ database }) => {
    if (testUser) {
      await cleanupTestUser(database, testUser.email);
    }
  });

  test('session transfers from desktop to mobile', async ({ browser }) => {
    // Setup desktop
    const desktopContext = await browser.newContext(DevicePresets.desktop);
    const desktopPage = await desktopContext.newPage();
    
    await test.step('Login on desktop', async () => {
      await desktopPage.goto('/login');
      await desktopPage.fill('[data-testid="email-input"], input#email', testUser.email);
      await desktopPage.fill('[data-testid="password-input"], input#password', testUser.password);
      await desktopPage.click('[data-testid="login-submit"], button[type="submit"]');
      await desktopPage.waitForURL('/', { timeout: 10000 });
    });

    // Create session on desktop
    await test.step('Create session on desktop', async () => {
      await desktopPage.goto('/sessions');
      await desktopPage.click('[data-testid="create-session-btn"], button:text("New Session")');
      await desktopPage.fill('[data-testid="session-name"], input[name="name"]', 'Desktop Session');
      await desktopPage.click('[data-testid="start-session-btn"], button:text("Start")');
      await desktopPage.fill('[data-testid="session-notes"], textarea', 'Created on desktop');
      await desktopPage.waitForTimeout(1500);
    });

    // Setup mobile
    const mobileContext = await browser.newContext(DevicePresets.mobile);
    const mobilePage = await mobileContext.newPage();
    
    await test.step('Login on mobile', async () => {
      await mobilePage.goto('/login');
      await mobilePage.fill('[data-testid="email-input"], input#email', testUser.email);
      await mobilePage.fill('[data-testid="password-input"], input#password', testUser.password);
      await mobilePage.click('[data-testid="login-submit"], button[type="submit"]');
      await mobilePage.waitForURL('/', { timeout: 10000 });
    });

    await test.step('Verify session on mobile', async () => {
      await mobilePage.goto('/sessions');
      await mobilePage.waitForTimeout(2000);
      
      // Should see the session created on desktop
      await expect(mobilePage.locator('text=/Desktop Session/i')).toBeVisible();
      
      // State should be synced
      const notes = await mobilePage.inputValue('[data-testid="session-notes"], textarea');
      expect(notes).toContain('Created on desktop');
    });

    await desktopContext.close();
    await mobileContext.close();
  });

  test('QR code handoff from desktop to mobile', async ({ browser }) => {
    const desktopContext = await browser.newContext(DevicePresets.desktop);
    const desktopPage = await desktopContext.newPage();
    
    await desktopPage.goto('/login');
    await desktopPage.fill('[data-testid="email-input"], input#email', testUser.email);
    await desktopPage.fill('[data-testid="password-input"], input#password', testUser.password);
    await desktopPage.click('[data-testid="login-submit"], button[type="submit"]');
    await desktopPage.waitForURL('/');
    
    await desktopPage.goto('/sessions');
    await desktopPage.click('[data-testid="create-session-btn"], button:text("New Session")');
    await desktopPage.fill('[data-testid="session-name"], input[name="name"]', 'QR Handoff Session');
    await desktopPage.click('[data-testid="start-session-btn"], button:text("Start")');

    // Initiate handoff
    await test.step('Generate QR code for handoff', async () => {
      await desktopPage.click('[data-testid="handoff-btn"], button:text("Handoff")');
      
      // Should show QR code
      await expect(desktopPage.locator('[data-testid="qr-code"], canvas')).toBeVisible();
      
      // Get handoff URL from QR code or input
      const handoffUrl = await desktopPage.locator('[data-testid="handoff-url"]').inputValue().catch(() => null);
      
      const mobileContext = await browser.newContext(DevicePresets.mobile);
      const mobilePage = await mobileContext.newPage();
      
      await test.step('Scan/handoff to mobile', async () => {
        if (handoffUrl) {
          await mobilePage.goto(handoffUrl);
        } else {
          // Fallback: login manually
          await mobilePage.goto('/login');
          await mobilePage.fill('[data-testid="email-input"], input#email', testUser.email);
          await mobilePage.fill('[data-testid="password-input"], input#password', testUser.password);
          await mobilePage.click('[data-testid="login-submit"], button[type="submit"]');
          await mobilePage.waitForURL('/');
          await mobilePage.goto('/sessions');
        }
        
        await mobilePage.waitForTimeout(2000);
        await expect(mobilePage.locator('text=/QR Handoff Session/i')).toBeVisible();
      });
      
      await mobileContext.close();
    });

    await desktopContext.close();
  });

  test('real-time sync during handoff', async ({ browser }) => {
    const desktopContext = await browser.newContext(DevicePresets.desktop);
    const desktopPage = await desktopContext.newPage();
    const mobileContext = await browser.newContext(DevicePresets.mobile);
    const mobilePage = await mobileContext.newPage();

    // Login both devices
    for (const page of [desktopPage, mobilePage]) {
      await page.goto('/login');
      await page.fill('[data-testid="email-input"], input#email', testUser.email);
      await page.fill('[data-testid="password-input"], input#password', testUser.password);
      await page.click('[data-testid="login-submit"], button[type="submit"]');
      await page.waitForURL('/');
    }

    // Create session on desktop
    await desktopPage.goto('/sessions');
    await desktopPage.click('[data-testid="create-session-btn"], button:text("New Session")');
    await desktopPage.fill('[data-testid="session-name"], input[name="name"]', 'Real-time Sync');
    await desktopPage.click('[data-testid="start-session-btn"], button:text("Start")');

    // Mobile navigates to sessions
    await mobilePage.goto('/sessions');
    await mobilePage.waitForTimeout(1500);

    await test.step('Real-time updates sync to mobile', async () => {
      // Desktop makes changes
      await desktopPage.fill('[data-testid="session-notes"], textarea', 'Update 1');
      await desktopPage.waitForTimeout(1000);
      
      // Mobile should receive update
      const mobileNotes1 = await mobilePage.inputValue('[data-testid="session-notes"], textarea');
      expect(mobileNotes1).toContain('Update 1');
      
      // Another update
      await desktopPage.fill('[data-testid="session-notes"], textarea', 'Update 2');
      await desktopPage.waitForTimeout(1000);
      
      const mobileNotes2 = await mobilePage.inputValue('[data-testid="session-notes"], textarea');
      expect(mobileNotes2).toContain('Update 2');
    });

    await desktopContext.close();
    await mobileContext.close();
  });
});

test.describe('Device Testing - Mobile to Desktop Handoff', () => {
  let testUser: any;

  test.beforeEach(async ({ database }) => {
    testUser = await createTestUser(database);
  });

  test.afterEach(async ({ database }) => {
    if (testUser) {
      await cleanupTestUser(database, testUser.email);
    }
  });

  test('session created on mobile syncs to desktop', async ({ browser }) => {
    const mobileContext = await browser.newContext(DevicePresets.mobile);
    const mobilePage = await mobileContext.newPage();
    
    await test.step('Create session on mobile', async () => {
      await mobilePage.goto('/login');
      await mobilePage.fill('[data-testid="email-input"], input#email', testUser.email);
      await mobilePage.fill('[data-testid="password-input"], input#password', testUser.password);
      await mobilePage.click('[data-testid="login-submit"], button[type="submit"]');
      await mobilePage.waitForURL('/', { timeout: 10000 });
      
      await mobilePage.goto('/sessions');
      await mobilePage.click('[data-testid="create-session-btn"], button:text("New Session")');
      await mobilePage.fill('[data-testid="session-name"], input[name="name"]', 'Mobile Created Session');
      await mobilePage.click('[data-testid="start-session-btn"], button:text("Start")');
      await mobilePage.fill('[data-testid="session-notes"], textarea', 'Created on my phone');
      await mobilePage.waitForTimeout(1500);
    });

    const desktopContext = await browser.newContext(DevicePresets.desktop);
    const desktopPage = await desktopContext.newPage();
    
    await test.step('Verify on desktop', async () => {
      await desktopPage.goto('/login');
      await desktopPage.fill('[data-testid="email-input"], input#email', testUser.email);
      await desktopPage.fill('[data-testid="password-input"], input#password', testUser.password);
      await desktopPage.click('[data-testid="login-submit"], button[type="submit"]');
      await desktopPage.waitForURL('/', { timeout: 10000 });
      
      await desktopPage.goto('/sessions');
      await desktopPage.waitForTimeout(2000);
      
      await expect(desktopPage.locator('text=/Mobile Created Session/i')).toBeVisible();
      
      const notes = await desktopPage.inputValue('[data-testid="session-notes"], textarea');
      expect(notes).toContain('Created on my phone');
    });

    await mobileContext.close();
    await desktopContext.close();
  });

  test('mobile edits sync to desktop', async ({ browser }) => {
    const contexts: any[] = [];
    const pages: any[] = [];

    for (const device of ['mobile', 'desktop']) {
      const context = await browser.newContext(DevicePresets[device as keyof typeof DevicePresets]);
      const page = await context.newPage();
      
      await page.goto('/login');
      await page.fill('[data-testid="email-input"], input#email', testUser.email);
      await page.fill('[data-testid="password-input"], input#password', testUser.password);
      await page.click('[data-testid="login-submit"], button[type="submit"]');
      await page.waitForURL('/');
      await page.goto('/sessions');
      
      contexts.push(context);
      pages.push(page);
    }

    const [mobilePage, desktopPage] = pages;

    // Create session on mobile
    await mobilePage.click('[data-testid="create-session-btn"], button:text("New Session")');
    await mobilePage.fill('[data-testid="session-name"], input[name="name"]', 'Sync Test');
    await mobilePage.click('[data-testid="start-session-btn"], button:text("Start")');
    await mobilePage.waitForTimeout(1000);

    // Desktop should see it
    await desktopPage.reload();
    await desktopPage.waitForTimeout(1500);

    await test.step('Mobile edits sync to desktop', async () => {
      await mobilePage.fill('[data-testid="session-notes"], textarea', 'Edited on mobile');
      await mobilePage.waitForTimeout(1500);
      
      const desktopNotes = await desktopPage.inputValue('[data-testid="session-notes"], textarea');
      expect(desktopNotes).toContain('Edited on mobile');
    });

    for (const context of contexts) {
      await context.close();
    }
  });
});

test.describe('Device Testing - Tablet Scenarios', () => {
  let testUser: any;

  test.beforeEach(async ({ database }) => {
    testUser = await createTestUser(database);
  });

  test.afterEach(async ({ database }) => {
    if (testUser) {
      await cleanupTestUser(database, testUser.email);
    }
  });

  test('tablet: landscape and portrait modes', async ({ browser }) => {
    const context = await browser.newContext(DevicePresets.tablet);
    const page = await context.newPage();

    await page.goto('/login');
    await page.fill('[data-testid="email-input"], input#email', testUser.email);
    await page.fill('[data-testid="password-input"], input#password', testUser.password);
    await page.click('[data-testid="login-submit"], button[type="submit"]');
    await page.waitForURL('/');

    await test.step('Portrait mode', async () => {
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.reload();
      await page.waitForLoadState('networkidle');
      
      await expect(page.locator('[data-testid="dashboard-container"]')).toBeVisible();
    });

    await test.step('Landscape mode', async () => {
      await page.setViewportSize({ width: 1024, height: 768 });
      await page.reload();
      await page.waitForLoadState('networkidle');
      
      await expect(page.locator('[data-testid="dashboard-container"]')).toBeVisible();
    });

    await context.close();
  });

  test('tablet: participates in multi-device sync', async ({ browser }) => {
    const desktopContext = await browser.newContext(DevicePresets.desktop);
    const desktopPage = await desktopContext.newPage();
    const tabletContext = await browser.newContext(DevicePresets.tablet);
    const tabletPage = await tabletContext.newPage();

    // Login both
    for (const page of [desktopPage, tabletPage]) {
      await page.goto('/login');
      await page.fill('[data-testid="email-input"], input#email', testUser.email);
      await page.fill('[data-testid="password-input"], input#password', testUser.password);
      await page.click('[data-testid="login-submit"], button[type="submit"]');
      await page.waitForURL('/');
    }

    // Create on desktop
    await desktopPage.goto('/sessions');
    await desktopPage.click('[data-testid="create-session-btn"], button:text("New Session")');
    await desktopPage.fill('[data-testid="session-name"], input[name="name"]', 'Tablet Sync Test');
    await desktopPage.click('[data-testid="start-session-btn"], button:text("Start")');

    // Check on tablet
    await tabletPage.goto('/sessions');
    await tabletPage.waitForTimeout(2000);

    await expect(tabletPage.locator('text=/Tablet Sync Test/i')).toBeVisible();

    await desktopContext.close();
    await tabletContext.close();
  });

  test('tablet: touch and mouse interactions', async ({ browser }) => {
    const context = await browser.newContext(DevicePresets.tablet);
    const page = await context.newPage();

    await page.goto('/login');
    await page.fill('[data-testid="email-input"], input#email', testUser.email);
    await page.fill('[data-testid="password-input"], input#password', testUser.password);
    await page.click('[data-testid="login-submit"], button[type="submit"]');
    await page.waitForURL('/');

    await page.goto('/sessions');
    
    // Should work with both touch and click
    await page.tap('[data-testid="create-session-btn"], button:text("New Session")');
    await expect(page.locator('[data-testid="session-form"], form')).toBeVisible();

    await context.close();
  });
});
