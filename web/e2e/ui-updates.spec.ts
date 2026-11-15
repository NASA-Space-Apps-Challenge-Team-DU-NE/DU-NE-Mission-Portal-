// 2026-11-15 UI 수정 회귀: 착륙지·날짜 합치기(점수표·검토 조합), 입력값 초기화, 발전 방식, 탭, 레이아웃 조절
import { expect, test, type Page } from '@playwright/test';

async function loaded(page: Page) {
  await page.goto('/?site=connecting_ridge&t=2026-12-02T00:00:00Z', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: '순위 CSV', exact: true })).toBeEnabled();
}
const card = (page: Page, title: string) => page.locator('section.card').filter({ has: page.locator('h2').filter({ hasText: title }) }).first();

test('위쪽 시간 막대 대신 입력값 초기화, 정상 상태 배지는 없다', async ({ page }) => {
  await loaded(page);
  const top = page.locator('header.top');
  await expect(top.locator('input[type=range]')).toHaveCount(0);
  await expect(top).not.toContainText('일부 수치 미검증');
  await expect(top.getByRole('button', { name: '입력값 초기화' })).toBeVisible();
});

test('기간을 고르면 착륙지 × 시작일 표가 나오고, 고른 조합을 계획으로 적용한다', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (e) => errors.push(e.message));
  await loaded(page);
  await page.locator('nav.side .step').nth(1).click();
  await page.getByRole('button', { name: '기간 지정', exact: true }).click();
  const hm = card(page, '착륙지 × 시작일');
  await expect(hm.locator('.hmv').first()).toBeVisible({ timeout: 30000 });
  const cells = hm.locator('.hmv');
  expect(await cells.count()).toBeGreaterThanOrEqual(14);
  await cells.nth(16).click(); // 둘째 행 셋째 날
  const combo = card(page, '검토 중인 조합');
  await expect(combo).toContainText('기간 내 조건 충족');
  await expect(combo).toContainText('착륙 윈도');
  await combo.getByRole('button', { name: '이 조합을 계획으로 적용' }).click();
  await expect(page.locator('nav.side .plan')).toContainText('2026-12-04');
  expect(errors).toEqual([]);
});

test('발전 방식을 RTG 로 바꾸면 일조 조건이 빠지고, 초기화하면 태양전지로 돌아온다', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  await loaded(page);
  await page.getByRole('tab', { name: '착륙선 정보' }).click();
  await page.getByRole('button', { name: '동위원소 발전기 (RTG)' }).click();
  await expect(page.locator('nav.side .step').first()).toContainText('RTG');
  await page.getByRole('tab', { name: '임무 프로파일' }).click();
  await expect(page.locator('main')).toContainText('발전 방식상 제외');
  await page.getByRole('button', { name: '입력값 초기화' }).click();
  await expect(page.locator('nav.side .step').first()).toContainText('태양전지');
});

test('임무 분석은 탭으로 나뉘고 궤도 분석 자리가 있다', async ({ page }) => {
  await loaded(page);
  await page.locator('nav.side .step').nth(3).click();
  for (const t of ['임무 분석', '전력', '통신']) await expect(page.getByRole('tab', { name: t, exact: true })).toBeVisible();
  await expect(page.locator('.jump')).toHaveCount(0);
  await page.locator('nav.side .step').nth(4).click();
  await expect(page.locator('.phead h1')).toHaveText('궤도 분석');
});

test('레이아웃 손잡이로 오른쪽 폭을 바꾸되 가운데 화면 최소 폭은 지킨다', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await loaded(page);
  const h = page.locator('.rail > .rsz.v');
  const b = (await h.boundingBox())!;
  await page.mouse.move(b.x + 3, b.y + 200); await page.mouse.down();
  await page.mouse.move(b.x - 2000, b.y + 200, { steps: 5 }); await page.mouse.up();
  const main = (await page.locator('main.dash').boundingBox())!;
  expect(main.width).toBeGreaterThanOrEqual(515);
  const rail = (await page.locator('aside.rail').boundingBox())!;
  expect(rail.width).toBeGreaterThan(500);
});
