// 스모크 (CLAUDE.md 13절): 9개 단계 열기, 시간 재생, 콘솔 에러 0
import { expect, test } from '@playwright/test';

test('9개 단계와 기본 조작', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !m.text().includes('404') && errors.push(m.text()));
  await page.goto('/');
  const steps = page.locator('nav.side .step');
  await expect(steps).toHaveCount(9);
  for (let i = 0; i < 9; i++) {
    await steps.nth(i).click();
    await expect(page.locator('.phead h1')).toBeVisible();
  }
  await steps.first().click();
  await page.keyboard.press('Space');
  await page.waitForTimeout(500);
  await page.keyboard.press('Space');
  expect(errors).toEqual([]);
});
