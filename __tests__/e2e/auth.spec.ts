import { test, expect, type Page } from '@playwright/test';

const TEST_PASSWORD = 'testpassword123';

function createTestEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

async function registerWithEmail(page: Page, email: string) {
  await page.goto('/auth/register');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(TEST_PASSWORD);
  await page.locator('#confirmPassword').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: '创建账号' }).click();
}

async function loginWithEmail(page: Page, email: string) {
  await page.goto('/auth/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: '登录' }).click();
}

test.describe('Authentication', () => {
  test('register new account', async ({ page }) => {
    const email = createTestEmail('register');

    await registerWithEmail(page, email);

    await expect(page).toHaveURL('http://localhost:3000/', { timeout: 10000 });
  });

  test('login with credentials', async ({ page }) => {
    const email = createTestEmail('login');

    await registerWithEmail(page, email);
    await expect(page).toHaveURL('http://localhost:3000/', { timeout: 10000 });

    await page.context().clearCookies();
    await page.evaluate(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });

    await loginWithEmail(page, email);

    await expect(page).toHaveURL('http://localhost:3000/', { timeout: 10000 });
  });

  test('guest login', async ({ page }) => {
    await page.goto('/auth/login');
    await page.getByRole('button', { name: '先看看 → 游客体验' }).click();
    await expect(page).toHaveURL('http://localhost:3000/', { timeout: 10000 });
  });

  test('invalid login shows error', async ({ page }) => {
    await page.goto('/auth/login');
    await page.locator('#email').fill('nonexistent@example.com');
    await page.locator('#password').fill('wrongpassword');
    await page.getByRole('button', { name: '登录' }).click();

    await expect(page).toHaveURL('http://localhost:3000/auth/login', { timeout: 10000 });
    await expect(page.getByTestId('auth-form-error')).toContainText('邮箱或密码不正确');
  });

  test('profile renders in local mode without forced login', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/profile');

    await expect(page).toHaveURL('http://localhost:3000/profile', { timeout: 10000 });
    await expect(page.getByText('当前是本地测试模式。这里优先展示最近会话和练习记录，不强制依赖登录。')).toBeVisible();
  });
});
