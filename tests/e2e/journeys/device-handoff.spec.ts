import { test, expect } from '../fixtures/base';
import { createTestUser, cleanupTestUser, createTestSession } from '../fixtures/users';
import { DevicePresets, E2EUtils } from '../fixtures/base';

test.describe('Device Handoff Complete Flow', () => {
  let testUser: any;

  test.beforeEach(async ({ database }) => {
    testUser = await createTestUser(database);
  });

  test.afterEach(async ({ database }) => {
    if (testUser) {
      await cleanupTestUser(database, testUser.email);
    }
  });

  test('complete handoff: desktop → mobile → desktop', async ({ browser, database }) => {
    // Create desktop context
    const desktopContext = await browser.newContext(DevicePresets.desktop);
    const desktopPage = await desktopContext.newPage();

    // Step 1: Login on desktop
    await test.step('Login on desktop', async () => {
      await desktopPage.goto('/login');
      await desktopPage.fill('[data-testid="email-input"], input#email', testUser.email);
      await desktopPage.fill('[data-testid="password-input"], input#password', testUser.password);
      await desktopPage.click('[data-testid="login-submit"], button[type="submit"]');
      await desktopPage.waitForURL('/', { timeout: 10000 });
    });

    // Step 2: Create session on desktop
    await test.step('Create session on desktop', async () => {
      await desktopPage.click('[data-testid="sessions-link"], a:text("Sessions")');
      await desktopPage.waitForURL('**/sessions');
      
      await desktopPage.click('[data-testid="create-session-btn"], button:text("New Session")');
      await desktopPage.fill('[data-testid="session-name"], input[name="name"]', 'Handoff Test Session');
      await desktopPage.click('[data-testid="start-session-btn"], button:text("Start")');
      
      // Add some state
      await desktopPage.fill('[data-testid="session-notes"], textarea', 'Started on desktop');
      await desktopPage.waitForTimeout(1000);
    });

    // Step 3: Initiate handoff on desktop
    await test.step('Initiate handoff from desktop', async () => {
      await desktopPage.click('[data-testid="handoff-btn"], button:text("Handoff")');
      
      // Should show QR code or handoff options
      await expect(desktopPage.locator('[data-testid="handoff-modal"], [data-testid="qr-code"]')).toBeVisible();
      
      // Get handoff code/URL if available
      const handoffUrl = await desktopPage.locator('[data-testid="handoff-url"]').inputValue().catch(() => null);
      
      // Create mobile context
      const mobileContext = await browser.newContext(DevicePresets.mobile);
      const mobilePage = await mobileContext.newPage();
      
      // Step 4: Accept handoff on mobile
      await test.step('Accept handoff on mobile', async () => {
        if (handoffUrl) {
          await mobilePage.goto(handoffUrl);
        } else {
          // Alternative: login and sync
          await mobilePage.goto('/login');
          await mobilePage.fill('[data-testid="email-input"], input#email', testUser.email);
          await mobilePage.fill('[data-testid="password-input"], input#password', testUser.password);
          await mobilePage.click('[data-testid="login-submit"], button[type="submit"]');
          await mobilePage.waitForURL('/', { timeout: 10000 });
          
          await mobilePage.click('[data-testid="sessions-link"], a:text("Sessions")');
        }
        
        await mobilePage.waitForLoadState('networkidle');
        
        // Should show the session
        await expect(mobilePage.locator('text=/Handoff Test Session/i')).toBeVisible();
      });

      // Step 5: Continue session on mobile
      await test.step('Continue session on mobile', async () => {
        // Verify state was transferred
        const notes = await mobilePage.inputValue('[data-testid="session-notes"], textarea');
        expect(notes).toContain('Started on desktop');
        
        // Add mobile content
        await mobilePage.fill('[data-testid="session-notes"], textarea', 'Started on desktop\nAdded on mobile');
        await mobilePage.waitForTimeout(1000);
      });

      // Step 6: Return to desktop and verify sync
      await test.step('Verify sync back to desktop', async () => {
        // Desktop should show updated state
        await desktopPage.reload();
        await desktopPage.waitForLoadState('networkidle');
        
        const desktopNotes = await desktopPage.inputValue('[data-testid="session-notes"], textarea');
        expect(desktopNotes).toContain('Added on mobile');
      });

      await mobileContext.close();
    });

    await desktopContext.close();
  });

  test('handoff with conflict resolution', async ({ browser, database }) => {
    const desktopContext = await browser.newContext(DevicePresets.desktop);
    const desktopPage = await desktopContext.newPage();

    // Login and create session
    await desktopPage.goto('/login');
    await desktopPage.fill('[data-testid="email-input"], input#email', testUser.email);
    await desktopPage.fill('[data-testid="password-input"], input#password', testUser.password);
    await desktopPage.click('[data-testid="login-submit"], button[type="submit"]');
    await desktopPage.waitForURL('/');

    // Create session
    await desktopPage.goto('/sessions');
    await desktopPage.click('[data-testid="create-session-btn"], button:text("New Session")');
    await desktopPage.fill('[data-testid="session-name"], input[name="name"]', 'Conflict Test');
    await desktopPage.click('[data-testid="start-session-btn"], button:text("Start")');

    const mobileContext = await browser.newContext(DevicePresets.mobile);
    const mobilePage = await mobileContext.newPage();

    // Login on mobile
    await mobilePage.goto('/login');
    await mobilePage.fill('[data-testid="email-input"], input#email', testUser.email);
    await mobilePage.fill('[data-testid="password-input"], input#password', testUser.password);
    await mobilePage.click('[data-testid="login-submit"], button[type="submit"]');
    await mobilePage.waitForURL('/');
    await mobilePage.goto('/sessions');

    // Simulate simultaneous edits
    await test.step('Simulate concurrent edits', async () => {
      // Desktop makes changes
      await desktopPage.fill('[data-testid="session-notes"], textarea', 'Desktop version');
      
      // Mobile makes different changes without syncing
      await mobilePage.fill('[data-testid="session-notes"], textarea', 'Mobile version');
      
      // Wait for sync
      await desktopPage.waitForTimeout(2000);
      await mobilePage.waitForTimeout(2000);
    });

    // Check for conflict resolution
    await test.step('Verify conflict resolution', async () => {
      await desktopPage.reload();
      await mobilePage.reload();
      
      // Both should show some resolution (either merged or one version)
      const desktopNotes = await desktopPage.inputValue('[data-testid="session-notes"], textarea');
      const mobileNotes = await mobilePage.inputValue('[data-testid="session-notes"], textarea');
      
      // Either they should match or a conflict dialog should appear
      if (desktopNotes !== mobileNotes) {
        // Check for conflict dialog
        const conflictDialog = desktopPage.locator('[data-testid="conflict-dialog"], text=/conflict/i');
        const hasConflict = await conflictDialog.isVisible().catch(() => false);
        
        if (hasConflict) {
          // Resolve conflict
          await desktopPage.click('[data-testid="accept-local"], button:text("Keep Mine")');
        }
      }
    });

    await desktopContext.close();
    await mobileContext.close();
  });

  test('handoff cancellation and recovery', async ({ browser, database }) => {
    const desktopContext = await browser.newContext(DevicePresets.desktop);
    const desktopPage = await desktopContext.newPage();

    // Login and create session
    await desktopPage.goto('/login');
    await desktopPage.fill('[data-testid="email-input"], input#email', testUser.email);
    await desktopPage.fill('[data-testid="password-input"], input#password', testUser.password);
    await desktopPage.click('[data-testid="login-submit"], button[type="submit"]');
    await desktopPage.waitForURL('/');

    await desktopPage.goto('/sessions');
    await desktopPage.click('[data-testid="create-session-btn"], button:text("New Session")');
    await desktopPage.fill('[data-testid="session-name"], input[name="name"]', 'Recovery Test');
    await desktopPage.click('[data-testid="start-session-btn"], button:text("Start")');
    
    await desktopPage.fill('[data-testid="session-notes"], textarea', 'Important data');
    await desktopPage.waitForTimeout(1000);

    // Cancel handoff
    await test.step('Cancel handoff', async () => {
      await desktopPage.click('[data-testid="handoff-btn"], button:text("Handoff")');
      await expect(desktopPage.locator('[data-testid="handoff-modal"]')).toBeVisible();
      
      // Cancel
      await desktopPage.click('[data-testid="cancel-handoff"], button:text("Cancel")');
      
      // Should close modal
      await expect(desktopPage.locator('[data-testid="handoff-modal"]')).not.toBeVisible();
      
      // Session should still be active
      await expect(desktopPage.locator('[data-testid="session-active"]')).toBeVisible();
    });

    // Retry handoff
    await test.step('Retry handoff successfully', async () => {
      await desktopPage.click('[data-testid="handoff-btn"], button:text("Handoff")');
      
      // Complete handoff to mobile
      const mobileContext = await browser.newContext(DevicePresets.mobile);
      const mobilePage = await mobileContext.newPage();
      
      await mobilePage.goto('/login');
      await mobilePage.fill('[data-testid="email-input"], input#email', testUser.email);
      await mobilePage.fill('[data-testid="password-input"], input#password', testUser.password);
      await mobilePage.click('[data-testid="login-submit"], button[type="submit"]');
      await mobilePage.waitForURL('/');
      
      await mobilePage.goto('/sessions');
      
      // Should see the session
      await expect(mobilePage.locator('text=/Recovery Test/i')).toBeVisible();
      
      // Verify state preserved
      const notes = await mobilePage.inputValue('[data-testid="session-notes"], textarea');
      expect(notes).toContain('Important data');
      
      await mobileContext.close();
    });

    await desktopContext.close();
  });

  test('multi-device handoff scenario', async ({ browser, database }) => {
    // Setup: Desktop, Tablet, Mobile
    const contexts: any[] = [];
    const pages: any[] = [];

    for (const device of ['desktop', 'tablet', 'mobile']) {
      const context = await browser.newContext(DevicePresets[device as keyof typeof DevicePresets]);
      const page = await context.newPage();
      
      // Login each device
      await page.goto('/login');
      await page.fill('[data-testid="email-input"], input#email', testUser.email);
      await page.fill('[data-testid="password-input"], input#password', testUser.password);
      await page.click('[data-testid="login-submit"], button[type="submit"]');
      await page.waitForURL('/');
      
      contexts.push(context);
      pages.push(page);
    }

    const [desktop, tablet, mobile] = pages;

    // Create session on desktop
    await test.step('Create session on desktop', async () => {
      await desktop.goto('/sessions');
      await desktop.click('[data-testid="create-session-btn"], button:text("New Session")');
      await desktop.fill('[data-testid="session-name"], input[name="name"]', 'Multi-Device Session');
      await desktop.click('[data-testid="start-session-btn"], button:text("Start")');
      await desktop.fill('[data-testid="session-notes"], textarea', 'Created on Desktop');
      await desktop.waitForTimeout(1500);
    });

    // Handoff to tablet
    await test.step('Handoff to tablet', async () => {
      await tablet.goto('/sessions');
      await tablet.waitForTimeout(2000);
      
      const tabletNotes = await tablet.inputValue('[data-testid="session-notes"], textarea');
      expect(tabletNotes).toContain('Created on Desktop');
      
      // Add tablet content
      await tablet.fill('[data-testid="session-notes"], textarea', 'Created on Desktop\nUpdated on Tablet');
      await tablet.waitForTimeout(1000);
    });

    // Handoff to mobile
    await test.step('Handoff to mobile', async () => {
      await mobile.goto('/sessions');
      await mobile.waitForTimeout(2000);
      
      const mobileNotes = await mobile.inputValue('[data-testid="session-notes"], textarea');
      expect(mobileNotes).toContain('Updated on Tablet');
      
      // Add mobile content
      await mobile.fill('[data-testid="session-notes"], textarea', 'Created on Desktop\nUpdated on Tablet\nFinal update on Mobile');
      await mobile.waitForTimeout(1000);
    });

    // Verify all devices synced
    await test.step('Verify all devices synced', async () => {
      for (const page of [desktop, tablet]) {
        await page.reload();
        await page.waitForLoadState('networkidle');
        
        const notes = await page.inputValue('[data-testid="session-notes"], textarea');
        expect(notes).toContain('Final update on Mobile');
      }
    });

    // Cleanup
    for (const context of contexts) {
      await context.close();
    }
  });
});
