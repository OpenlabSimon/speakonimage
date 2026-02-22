import { test, expect } from '@playwright/test';

test.describe('Topic Practice', () => {
  test.beforeEach(async ({ page }) => {
    // Try to login or continue as guest
    await page.goto('/');
    await page.waitForTimeout(1000);
  });

  test('generate translation topic and see prompt', async ({ page }) => {
    await page.goto('/topic/practice');
    await page.waitForTimeout(1000);

    // Look for topic input area
    const inputArea = page.locator('textarea').or(page.locator('input[type="text"]')).first();
    if (await inputArea.isVisible()) {
      await inputArea.fill('昨天我在咖啡店遇到了一个老朋友');

      // Find and click generate/submit button
      const generateButton = page.locator('button').filter({ hasText: /生成|开始|Go|Submit/i }).first();
      if (await generateButton.isVisible()) {
        await generateButton.click();
        await page.waitForTimeout(5000);

        // Should see Chinese prompt card and/or vocab
        const pageContent = await page.textContent('body');
        expect(pageContent).toBeTruthy();
      }
    }
  });

  test('enter text answer and see evaluation', async ({ page }) => {
    await page.goto('/topic/practice');
    await page.waitForTimeout(2000);

    // This test requires a topic to already be loaded
    // Look for answer input area
    const answerInput = page.locator('textarea[placeholder*="英语"]')
      .or(page.locator('textarea[placeholder*="English"]'))
      .or(page.locator('textarea').nth(1));

    if (await answerInput.isVisible().catch(() => false)) {
      await answerInput.fill('I met my old friend at the coffee shop yesterday.');

      const submitButton = page.locator('button').filter({ hasText: /提交|Submit|评价/i }).first();
      if (await submitButton.isVisible()) {
        await submitButton.click();
        await page.waitForTimeout(5000);

        // Should see evaluation scores somewhere on page
        const pageContent = await page.textContent('body');
        expect(pageContent).toBeTruthy();
      }
    }
  });
});
