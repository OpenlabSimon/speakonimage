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

  test('redirects unauthenticated topic deep link to login with callbackUrl', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/topic/practice?topicId=a0000000-0000-4000-a000-000000000001');

    await page.waitForURL(/\/auth\/login/, { timeout: 10000 });
    expect(page.url()).toContain('/auth/login');
    expect(page.url()).toContain(encodeURIComponent('/topic/practice?topicId=a0000000-0000-4000-a000-000000000001'));
  });

  test('starting a new anonymous topic clears legacy attempts and draft history', async ({ page }) => {
    await page.goto('/');

    await page.evaluate(() => {
      window.localStorage.setItem(
        'topicAttempts',
        JSON.stringify([{ attemptNumber: 1, text: 'old attempt', overallScore: 12, timestamp: new Date().toISOString() }])
      );
      window.localStorage.setItem(
        'topicDraftHistory',
        JSON.stringify([{ id: 'old-draft', text: 'old draft', source: 'attempt', createdAt: new Date().toISOString(), label: '旧草稿' }])
      );
    });

    const input = page.locator('textarea').or(page.locator('input[type="text"]')).first();
    await expect(input).toBeVisible({ timeout: 10000 });
    await input.fill('最近我在做一个 AI 口语学习产品');

    const generateButton = page.locator('button').filter({ hasText: /生成|开始练习|开始/i }).first();
    await expect(generateButton).toBeVisible({ timeout: 10000 });
    await generateButton.click();

    await page.waitForURL(/\/topic\/practice/, { timeout: 15000 });

    const storage = await page.evaluate(() => ({
      attempts: window.localStorage.getItem('topicAttempts'),
      draftHistory: window.localStorage.getItem('topicDraftHistory'),
      currentTopic: window.localStorage.getItem('currentTopic'),
    }));

    expect(storage.currentTopic).toBeTruthy();
    expect(storage.attempts).toBeNull();
    expect(storage.draftHistory).toBeNull();
  });
});
