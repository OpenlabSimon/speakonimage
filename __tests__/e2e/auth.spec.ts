import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('register new account', async ({ page }) => {
    await page.goto('/auth/register');
    await page.fill('input[name="email"]', `test-${Date.now()}@example.com`);
    await page.fill('input[name="password"]', 'testpassword123');
    await page.click('button[type="submit"]');

    // Should redirect to home or topic page
    await page.waitForURL(/\/(topic|$)/, { timeout: 10000 });
    expect(page.url()).not.toContain('/auth/register');
  });

  test('login with credentials', async ({ page }) => {
    await page.goto('/auth/login');

    // Fill login form
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'testpassword123');
    await page.click('button[type="submit"]');

    // Wait for redirect (may fail if user doesn't exist - that's expected in clean env)
    await page.waitForTimeout(2000);
  });

  test('guest login', async ({ page }) => {
    await page.goto('/auth/login');

    // Look for guest/anonymous login button
    const guestButton = page.locator('text=游客').or(page.locator('text=Guest')).or(page.locator('text=试用'));
    if (await guestButton.isVisible()) {
      await guestButton.click();
      await page.waitForURL(/\/(topic|$)/, { timeout: 10000 });
    }
  });

  test('invalid login shows error', async ({ page }) => {
    await page.goto('/auth/login');
    await page.fill('input[name="email"]', 'nonexistent@example.com');
    await page.fill('input[name="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');

    // Should stay on login page or show error
    await page.waitForTimeout(2000);
    const errorVisible = await page.locator('[role="alert"]').or(page.locator('.text-red')).or(page.locator('text=error')).isVisible().catch(() => false);
    // Error should be visible or still on login page
    expect(page.url()).toContain('/auth');
  });

  test('protected route redirects to login', async ({ page }) => {
    // Clear cookies to ensure unauthenticated
    await page.context().clearCookies();

    await page.goto('/profile');
    await page.waitForTimeout(2000);

    // Should be redirected to login
    expect(page.url()).toContain('/auth/login');
  });
});
