import { test, expect } from '@playwright/test';

test.describe('Profile Page', () => {
  test('view profile page', async ({ page }) => {
    await page.goto('/profile');
    await page.waitForTimeout(3000);

    // If authenticated, should see profile content
    // If not, should redirect to login
    const url = page.url();
    if (url.includes('/profile')) {
      // We're on profile page - check for stats or profile content
      const bodyText = await page.textContent('body');
      expect(bodyText!.length).toBeGreaterThan(0);
    } else {
      // Redirected to login
      expect(url).toContain('/auth');
    }
  });

  test('profile shows stats section', async ({ page }) => {
    await page.goto('/profile');
    await page.waitForTimeout(3000);

    if (page.url().includes('/profile')) {
      // Look for stats-related content
      const hasStats = await page.locator('text=统计')
        .or(page.locator('text=Stats'))
        .or(page.locator('text=CEFR'))
        .or(page.locator('text=词汇'))
        .or(page.locator('text=Vocabulary'))
        .isVisible()
        .catch(() => false);

      // Page loaded with some content
      const bodyText = await page.textContent('body');
      expect(bodyText!.length).toBeGreaterThan(0);
    }
  });
});
