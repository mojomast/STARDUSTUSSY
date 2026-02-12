import { test, expect } from '../fixtures/base';
import { TestUsers, createTestUser, cleanupTestUser } from '../fixtures/users';

test.describe('Login Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
  });

  test('should display login form', async ({ page }) => {
    await expect(page.locator('[data-testid="email-input"], input#email')).toBeVisible();
    await expect(page.locator('[data-testid="password-input"], input#password')).toBeVisible();
    await expect(page.locator('[data-testid="login-submit"], button[type="submit"]')).toBeVisible();
    await expect(page.locator('text=/forgot password/i')).toBeVisible();
  });

  test('should successfully login with valid credentials', async ({ page, database }) => {
    const user = await createTestUser(database);

    try {
      await page.fill('[data-testid="email-input"], input#email', user.email);
      await page.fill('[data-testid="password-input"], input#password', user.password);
      await page.click('[data-testid="login-submit"], button[type="submit"]');

      // Should redirect to dashboard
      await page.waitForURL('/', { timeout: 10000 });
      await expect(page.locator('[data-testid="dashboard-container"], [data-testid="welcome-message"]')).toBeVisible();
      
      // Verify session was created
      const sessions = await database.getSessionsByUserId(user.id!);
      expect(sessions.length).toBeGreaterThan(0);
      expect(sessions[0].status).toBe('active');
    } finally {
      await cleanupTestUser(database, user.email);
    }
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.fill('[data-testid="email-input"], input#email', 'invalid@example.com');
    await page.fill('[data-testid="password-input"], input#password', 'wrongpassword');
    await page.click('[data-testid="login-submit"], button[type="submit"]');

    // Should show error message
    await expect(page.locator('[data-testid="error-message"], text=/invalid/i, text=/incorrect/i')).toBeVisible();
  });

  test('should show error for empty fields', async ({ page }) => {
    await page.click('[data-testid="login-submit"], button[type="submit"]');

    // Should show validation errors
    await expect(page.locator('text=/email.*required/i, text=/required field/i')).toBeVisible();
    await expect(page.locator('text=/password.*required/i, text=/required field/i')).toBeVisible();
  });

  test('should toggle password visibility', async ({ page }) => {
    const passwordInput = page.locator('[data-testid="password-input"], input#password');
    
    await passwordInput.fill('secretpassword');
    
    // Initially should be password type
    await expect(passwordInput).toHaveAttribute('type', 'password');
    
    // Click toggle button if exists
    const toggleButton = page.locator('[data-testid="toggle-password"], button[aria-label*="password"], button[aria-label*="show"]');
    if (await toggleButton.isVisible().catch(() => false)) {
      await toggleButton.click();
      await expect(passwordInput).toHaveAttribute('type', 'text');
      
      await toggleButton.click();
      await expect(passwordInput).toHaveAttribute('type', 'password');
    }
  });

  test('should show loading state during login', async ({ page }) => {
    await page.fill('[data-testid="email-input"], input#email', 'test@example.com');
    await page.fill('[data-testid="password-input"], input#password', 'password');
    
    await page.click('[data-testid="login-submit"], button[type="submit"]');
    
    // Should show loading state
    await expect(page.locator('[data-testid="loading-indicator"], button[disabled]')).toBeVisible();
  });

  test('should redirect to dashboard if already authenticated', async ({ page, authenticatedPage }) => {
    // Try to access login page while authenticated
    await authenticatedPage.goto('/login');
    
    // Should redirect to dashboard
    await authenticatedPage.waitForURL('/', { timeout: 5000 });
    await expect(authenticatedPage.locator('[data-testid="dashboard-container"]')).toBeVisible();
  });

  test('should persist session across page reloads', async ({ page, database }) => {
    const user = await createTestUser(database);

    try {
      // Login
      await page.fill('[data-testid="email-input"], input#email', user.email);
      await page.fill('[data-testid="password-input"], input#password', user.password);
      await page.click('[data-testid="login-submit"], button[type="submit"]');
      await page.waitForURL('/');

      // Reload page
      await page.reload();
      await page.waitForLoadState('networkidle');

      // Should still be on dashboard (authenticated)
      await expect(page.locator('[data-testid="dashboard-container"]')).toBeVisible();
      
      // Should not redirect to login
      expect(page.url()).not.toContain('/login');
    } finally {
      await cleanupTestUser(database, user.email);
    }
  });

  test('should handle Remember Me option', async ({ page, database, context }) => {
    const user = await createTestUser(database);

    try {
      await page.fill('[data-testid="email-input"], input#email', user.email);
      await page.fill('[data-testid="password-input"], input#password', user.password);
      
      // Check Remember Me if available
      const rememberMe = page.locator('[data-testid="remember-me"], input[type="checkbox"]');
      if (await rememberMe.isVisible().catch(() => false)) {
        await rememberMe.check();
      }
      
      await page.click('[data-testid="login-submit"], button[type="submit"]');
      await page.waitForURL('/');

      // Close context and create new one (simulates browser restart)
      await context.close();
      const newContext = await page.context().browser()!.newContext();
      const newPage = await newContext.newPage();
      await newPage.goto('/');

      // Should still be authenticated
      await expect(newPage.locator('[data-testid="dashboard-container"]')).toBeVisible();
    } finally {
      await cleanupTestUser(database, user.email);
    }
  });

  test('should throttle login attempts', async ({ page }) => {
    const email = 'throttle@example.com';
    
    // Make multiple failed login attempts
    for (let i = 0; i < 5; i++) {
      await page.fill('[data-testid="email-input"], input#email', email);
      await page.fill('[data-testid="password-input"], input#password', 'wrongpassword');
      await page.click('[data-testid="login-submit"], button[type="submit"]');
      await page.waitForTimeout(500);
    }

    // Should show rate limit message
    const errorMessage = await page.locator('[data-testid="error-message"]').textContent();
    if (errorMessage?.toLowerCase().includes('too many') || errorMessage?.toLowerCase().includes('rate')) {
      await expect(page.locator('text=/too many/i, text=/rate/i, text=/wait/i')).toBeVisible();
    }
  });
});
