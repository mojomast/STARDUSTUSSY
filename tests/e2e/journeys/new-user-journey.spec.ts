import { test, expect } from '../fixtures/base';
import { createTestUser, cleanupTestUser, generateUniqueEmail, generatePassword } from '../fixtures/users';
import { E2EUtils } from '../fixtures/base';

test.describe('Complete User Journey - Registration to Session', () => {
  test('complete journey: register → login → create session → logout', async ({ page, database }) => {
    const testEmail = generateUniqueEmail('journey');
    const testPassword = generatePassword();
    const testName = 'Journey Test User';

    // Step 1: Navigate to login page
    await test.step('Navigate to login', async () => {
      await page.goto('/login');
      await page.waitForLoadState('networkidle');
      await expect(page.locator('text=/sign in/i, text=/login/i')).toBeVisible();
    });

    // Step 2: Switch to registration
    await test.step('Switch to registration', async () => {
      await page.click('[data-testid="create-account-link"], text="Create Account"');
      await expect(page.locator('[data-testid="name-input"], input#name')).toBeVisible();
    });

    // Step 3: Fill registration form
    await test.step('Fill registration form', async () => {
      await page.fill('[data-testid="name-input"], input#name', testName);
      await page.fill('[data-testid="email-input"], input#email', testEmail);
      await page.fill('[data-testid="password-input"], input#password', testPassword);
    });

    // Step 4: Submit registration
    await test.step('Submit registration', async () => {
      await page.click('[data-testid="register-submit"], button[type="submit"]');
      
      // Wait for redirect to dashboard
      await page.waitForURL('/', { timeout: 15000 });
      await expect(page.locator('[data-testid="dashboard-container"], [data-testid="welcome-message"]')).toBeVisible();
    });

    // Step 5: Verify user created in database
    await test.step('Verify user in database', async () => {
      const user = await database.getUserByEmail(testEmail);
      expect(user).toBeTruthy();
      expect(user.name).toBe(testName);
    });

    // Step 6: Navigate to sessions
    await test.step('Navigate to sessions', async () => {
      await page.click('[data-testid="sessions-link"], a:text("Sessions"), nav >> a >> nth=1');
      await page.waitForURL('**/sessions');
      await expect(page.locator('[data-testid="sessions-page"], h1:text("Sessions")')).toBeVisible();
    });

    // Step 7: Create a new session
    await test.step('Create new session', async () => {
      await page.click('[data-testid="create-session-btn"], button:text("New Session")');
      await page.fill('[data-testid="session-name"], input[name="name"]', 'My First Session');
      await page.click('[data-testid="start-session-btn"], button:text("Start")');
      
      // Verify session created
      await expect(page.locator('[data-testid="session-active"], text=/active/i')).toBeVisible();
    });

    // Step 8: Interact with session
    await test.step('Interact with session', async () => {
      // Add some state
      await page.fill('[data-testid="session-notes"], textarea', 'This is my first session!');
      
      // Wait for auto-save
      await page.waitForTimeout(2000);
      
      // Verify state persisted
      await page.reload();
      await page.waitForLoadState('networkidle');
      
      const notes = await page.inputValue('[data-testid="session-notes"], textarea');
      expect(notes).toBe('This is my first session!');
    });

    // Step 9: End session
    await test.step('End session', async () => {
      await page.click('[data-testid="end-session-btn"], button:text("End")');
      
      const confirmBtn = page.locator('button:text("Confirm"), button:text("Yes")');
      if (await confirmBtn.isVisible().catch(() => false)) {
        await confirmBtn.click();
      }
      
      await expect(page.locator('[data-testid="session-ended"], text=/completed/i')).toBeVisible();
    });

    // Step 10: Logout
    await test.step('Logout', async () => {
      await page.click('[data-testid="logout-btn"], button:text("Logout"), a:text("Logout")');
      
      // Should redirect to login
      await page.waitForURL('**/login', { timeout: 10000 });
      await expect(page.locator('text=/sign in/i, input#email')).toBeVisible();
    });

    // Step 11: Verify cannot access protected routes
    await test.step('Verify session invalidated', async () => {
      await page.goto('/sessions');
      await page.waitForLoadState('networkidle');
      
      // Should redirect to login
      expect(page.url()).toContain('/login');
    });

    // Cleanup
    await cleanupTestUser(database, testEmail);
  });

  test('journey with validation errors recovery', async ({ page }) => {
    const testEmail = generateUniqueEmail('validation');
    const testPassword = generatePassword();

    await page.goto('/login');
    
    // Try to register with invalid data
    await page.click('[data-testid="create-account-link"], text="Create Account"');
    await page.fill('[data-testid="email-input"], input#email', 'invalid-email');
    await page.fill('[data-testid="password-input"], input#password', '123');
    await page.click('[data-testid="register-submit"], button[type="submit"]');
    
    // Should show errors
    await expect(page.locator('text=/valid email/i')).toBeVisible();
    await expect(page.locator('text=/password.*8/i, text=/password.*strong/i')).toBeVisible();
    
    // Fix errors and retry
    await page.fill('[data-testid="email-input"], input#email', testEmail);
    await page.fill('[data-testid="password-input"], input#password', testPassword);
    await page.fill('[data-testid="name-input"], input#name', 'Validation Test');
    await page.click('[data-testid="register-submit"], button[type="submit"]');
    
    // Should succeed
    await page.waitForURL('/', { timeout: 15000 });
    await expect(page.locator('[data-testid="dashboard-container"]')).toBeVisible();
  });

  test('journey with network interruption during registration', async ({ page, context }) => {
    const testEmail = generateUniqueEmail('network');
    const testPassword = generatePassword();

    await page.goto('/login');
    await page.click('[data-testid="create-account-link"], text="Create Account"');
    
    await page.fill('[data-testid="name-input"], input#name', 'Network Test');
    await page.fill('[data-testid="email-input"], input#email', testEmail);
    await page.fill('[data-testid="password-input"], input#password', testPassword);
    
    // Simulate network failure during submission
    await E2EUtils.simulateNetworkFailure(page);
    await page.click('[data-testid="register-submit"], button[type="submit"]');
    
    // Should show error
    await expect(page.locator('text=/network/i, text=/connection/i, text=/error/i')).toBeVisible();
    
    // Restore network and retry
    await E2EUtils.restoreNetwork(page);
    await page.waitForTimeout(2000);
    
    await page.click('[data-testid="register-submit"], button[type="submit"]');
    
    // Should succeed now
    await page.waitForURL('/', { timeout: 15000 });
    await expect(page.locator('[data-testid="dashboard-container"]')).toBeVisible();
  });
});
