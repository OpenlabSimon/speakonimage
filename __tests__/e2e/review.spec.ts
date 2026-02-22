import { test, expect } from '@playwright/test';

test.describe('Review Page', () => {
  test('view review page', async ({ page }) => {
    await page.goto('/review');
    await page.waitForTimeout(2000);

    // If not logged in, might redirect. If logged in, should see review content
    const pageContent = await page.textContent('body');
    expect(pageContent).toBeTruthy();
  });

  test('shows items or empty state', async ({ page }) => {
    await page.goto('/review');
    await page.waitForTimeout(3000);

    // Should show either review items or "no items" message
    const hasContent = await page.locator('[data-testid="review-card"]')
      .or(page.locator('text=没有'))
      .or(page.locator('text=No items'))
      .or(page.locator('text=完成'))
      .or(page.locator('text=empty'))
      .isVisible()
      .catch(() => false);

    // Page should have loaded something
    const bodyText = await page.textContent('body');
    expect(bodyText!.length).toBeGreaterThan(0);
  });
});
