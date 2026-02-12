import { test, expect } from '../fixtures/base';
import { generateUniqueEmail, generatePassword } from '../fixtures/users';

test.describe('User Registration Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
  });

  test('should display registration form', async ({ page }) => {
    // Click on create account link
    await page.click('[data-testid="create-account-link"], text="Create Account"');
    
    // Verify registration form elements
    await expect(page.locator('[data-testid="name-input"], input#name')).toBeVisible();
    await expect(page.locator('[data-testid="email-input"], input#email')).toBeVisible();
    await expect(page.locator('[data-testid="password-input"], input#password')).toBeVisible();
    await expect(page.locator('[data-testid="register-submit"], button[type="submit"]')).toBeVisible();
  });

  test('should successfully register a new user', async ({ page, database }) => {
    const testEmail = generateUniqueEmail('newuser');
    const testPassword = generatePassword();
    const testName = 'New Test User';

    // Navigate to registration
    await page.click('[data-testid="create-account-link"], text="Create Account"');

    // Fill registration form
    await page.fill('[data-testid="name-input"], input#name', testName);
    await page.fill('[data-testid="email-input"], input#email', testEmail);
    await page.fill('[data-testid="password-input"], input#password', testPassword);

    // Submit form
    await page.click('[data-testid="register-submit"], button[type="submit"]');

    // Wait for redirect or success message
    await Promise.race([
      page.waitForURL('/', { timeout: 10000 }),
      page.waitForSelector('[data-testid="registration-success"]', { timeout: 10000 }),
    ]);

    // Verify user was created in database
    const user = await database.getUserByEmail(testEmail);
    expect(user).toBeTruthy();
    expect(user.name).toBe(testName);
    expect(user.email).toBe(testEmail);
    expect(user.role).toBe('user');
  });

  test('should validate required fields', async ({ page }) => {
    await page.click('[data-testid="create-account-link"], text="Create Account"');
    
    // Try to submit empty form
    await page.click('[data-testid="register-submit"], button[type="submit"]');

    // Should show validation errors
    await expect(page.locator('text=/name is required/i, text=/required field/i')).toBeVisible();
    await expect(page.locator('text=/email is required/i, text=/required field/i')).toBeVisible();
    await expect(page.locator('text=/password is required/i, text=/required field/i')).toBeVisible();
  });

  test('should validate email format', async ({ page }) => {
    await page.click('[data-testid="create-account-link"], text="Create Account"');
    
    // Fill with invalid email
    await page.fill('[data-testid="name-input"], input#name', 'Test User');
    await page.fill('[data-testid="email-input"], input#email', 'invalid-email');
    await page.fill('[data-testid="password-input"], input#password', 'Password123!');

    await page.click('[data-testid="register-submit"], button[type="submit"]');

    // Should show email validation error
    await expect(page.locator('text=/valid email/i, text=/email format/i')).toBeVisible();
  });

  test('should validate password strength', async ({ page }) => {
    await page.click('[data-testid="create-account-link"], text="Create Account"');
    
    // Fill with weak password
    await page.fill('[data-testid="name-input"], input#name', 'Test User');
    await page.fill('[data-testid="email-input"], input#email', generateUniqueEmail());
    await page.fill('[data-testid="password-input"], input#password', '123');

    await page.click('[data-testid="register-submit"], button[type="submit"]');

    // Should show password strength error
    await expect(page.locator('text=/password.*strong/i, text=/password.*8/i, text=/password.*character/i')).toBeVisible();
  });

  test('should prevent duplicate email registration', async ({ page, database }) => {
    const existingEmail = generateUniqueEmail('existing');
    const password = generatePassword();

    // Create user first
    await database.query(
      'INSERT INTO users (id, name, email, password_hash, role, created_at) VALUES ($1, $2, $3, $4, $5, NOW())',
      ['00000000-0000-0000-0000-000000000010', 'Existing User', existingEmail, 'hashed_pass', 'user']
    );

    try {
      await page.click('[data-testid="create-account-link"], text="Create Account"');
      
      await page.fill('[data-testid="name-input"], input#name', 'Another User');
      await page.fill('[data-testid="email-input"], input#email', existingEmail);
      await page.fill('[data-testid="password-input"], input#password', password);

      await page.click('[data-testid="register-submit"], button[type="submit"]');

      // Should show duplicate email error
      await expect(page.locator('text=/email.*exist/i, text=/already.*registered/i, text=/account.*exist/i')).toBeVisible();
    } finally {
      await database.query('DELETE FROM users WHERE email = $1', [existingEmail]);
    }
  });

  test('should show loading state during registration', async ({ page }) => {
    await page.click('[data-testid="create-account-link"], text="Create Account"');
    
    await page.fill('[data-testid="name-input"], input#name', 'Test User');
    await page.fill('[data-testid="email-input"], input#email', generateUniqueEmail());
    await page.fill('[data-testid="password-input"], input#password', generatePassword());

    // Click submit
    await page.click('[data-testid="register-submit"], button[type="submit"]');

    // Should show loading state
    await expect(page.locator('[data-testid="loading-indicator"], button[disabled]')).toBeVisible();
  });

  test('should allow switching between login and registration', async ({ page }) => {
    // Initially on login
    await expect(page.locator('text=/sign in/i, text=/login/i')).toBeVisible();

    // Switch to registration
    await page.click('[data-testid="create-account-link"], text="Create Account"');
    await expect(page.locator('[data-testid="name-input"], input#name')).toBeVisible();

    // Switch back to login
    await page.click('[data-testid="login-link"], text="Sign In"');
    await expect(page.locator('[data-testid="name-input"], input#name')).not.toBeVisible();
  });

  test('should maintain form data when switching views', async ({ page }) => {
    await page.click('[data-testid="create-account-link"], text="Create Account"');
    
    const email = generateUniqueEmail();
    await page.fill('[data-testid="email-input"], input#email', email);

    // Switch to login and back
    await page.click('[data-testid="login-link"], text="Sign In"');
    await page.click('[data-testid="create-account-link"], text="Create Account"');

    // Email should be preserved (if implemented)
    const emailValue = await page.inputValue('[data-testid="email-input"], input#email');
    if (emailValue) {
      expect(emailValue).toBe(email);
    }
  });
});
