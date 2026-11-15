import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';

const data = (file: string) => JSON.parse(fs.readFileSync(new URL(`../public/data/${file}`, import.meta.url), 'utf8'));
async function loaded(page: Page) {
  await page.goto('/?site=connecting_ridge&t=2026-12-02T00:00:00Z', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: '순위 CSV', exact: true })).toBeEnabled();
}
const card = (page: Page, title: string) => page.locator('section.card').filter({ has: page.locator('h2').filter({ hasText: title }) }).first();

test('레이어 목록 누락은 정상 준비 상태로 표시하지 않는다', async ({ page }) => {
  await page.route('**/data/grid/layers.json*', route => route.fulfill({ status: 404, body: 'missing' }));
  await loaded(page);
  await expect(page.locator('header.top')).toContainText('일부 자료 없음');
  await expect(page.locator('header.top')).not.toContainText('데이터 준비됨');
  await expect(page.locator('header.top span[title*="grid/layers.json"]')).toBeVisible();
});

test('깨진 manifest가 정상 카탈로그와 격자의 로딩까지 오염시키지 않는다', async ({ page }) => {
  await page.route('**/data/manifest.json*', route => route.fulfill({ json: { schema: 'luna.manifest.v1' } }));
  await loaded(page);
  await expect(page.locator('header.top')).toContainText('일부 자료 없음');
  await page.locator('nav.side .step').nth(1).click();
  await expect(page.locator('main')).toContainText('착륙지 고르기');
  await expect(page.locator('body')).not.toContainText("reading 'find'");
});

test('검증 표의 null 행은 해당 카드에만 자료 없음으로 표시한다', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const env = data('validation/catalog_sites.json'); env.data = [null];
  await page.route('**/data/validation/catalog_sites.json*', route => route.fulfill({ json: env }));
  await loaded(page); await page.locator('nav.side .step').nth(8).click();
  await expect(card(page, '착륙지 좌표 대조')).toContainText('자료 없음');
  await expect(page.locator('nav.side .step')).toHaveCount(9);
  await page.locator('nav.side .step').nth(1).click();
  await expect(page.locator('.phead h1')).toHaveText('착륙지 고르기');
  expect(errors).toEqual([]);
});

test('좌표 구성 필드가 빠진 격자는 근사 대체 사실을 표시한다', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const env = data('grid/manifest.json'); delete env.data.nx;
  await page.route('**/data/grid/manifest.json*', route => route.fulfill({ json: env }));
  await loaded(page);
  await expect(page.locator('header.top')).toContainText('일부 자료 없음');
  await expect(page.locator('.vleg')).toContainText('근사, 지형 미반영');
  expect(errors).toEqual([]);
});

test('음수 부하는 실행을 차단하고 올바른 입력에서 1년 계산을 완료한다', async ({ page }) => {
  await loaded(page); await page.locator('nav.side .step').nth(4).click();
  const c = card(page, '1년 기지 운용');
  const load = c.getByLabel('거주 부하 (kW)');
  await load.fill('-1');
  await expect(c.getByRole('button', { name: '1년 시뮬레이션 실행', exact: true })).toBeDisabled();
  await expect(c).toContainText('0 이상');
  await load.fill('10');
  await c.getByRole('button', { name: '1년 시뮬레이션 실행', exact: true }).click();
  await expect(c.locator('.kpis')).toBeVisible({ timeout: 30000 });
  await expect(c).not.toContainText('NaN');
});

test('범위 밖 전력 계산은 SPICE 표 대신 근사 천체력을 표시한다', async ({ page }) => {
  await page.goto('/?site=connecting_ridge&t=2040-01-01T00:00:00Z', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: '순위 CSV', exact: true })).toBeEnabled();
  await page.locator('nav.side .step').nth(4).click();
  const c = card(page, '전력 계산');
  await expect(c.locator('.hd')).toContainText('근사 천체력');
  await expect(c.locator('.hd')).not.toContainText('SPICE 표');
});

test('격자 Worker 중단 후 다시 시도하면 초기화를 재전송하고 복구한다', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    const registry: Worker[] = [];
    const replies: number[] = [];
    (window as unknown as { auditGridWorkers: Worker[] }).auditGridWorkers = registry;
    (window as unknown as { auditGridReplies: number[] }).auditGridReplies = replies;
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        if (String(url).includes('grid.worker')) {
          const index = registry.length; registry.push(this); replies[index] = 0;
          this.addEventListener('message', e => { if (e.data.kind === 'result') replies[index]++; });
        }
      }
    };
  });
  await loaded(page);
  await page.evaluate(() => {
    const w = (window as unknown as { auditGridWorkers: Worker[] }).auditGridWorkers[0];
    w.dispatchEvent(new ErrorEvent('error', { message: 'audit forced worker failure', cancelable: true }));
  });
  // 실행 요청이 있을 때 새 Worker가 생긴다. 조건 변경으로 같은 사용 경로를 재현한다.
  const duration = page.getByText('임무 기간 · 통신 여유각', { exact: false });
  await expect(duration.first()).toBeVisible();
  await page.getByRole('button', { name: '30일', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { auditGridWorkers: Worker[] }).auditGridWorkers.length)).toBe(2);
  await expect.poll(() => page.evaluate(() => (window as unknown as { auditGridReplies: number[] }).auditGridReplies[1])).toBeGreaterThanOrEqual(2);
  await expect(page.getByRole('button', { name: '순위 CSV', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: '격자 계산 실패 · 다시 시도', exact: true })).toHaveCount(0);
});

test('첫 Worker 스크립트 로딩 실패도 다시 시도 버튼으로 복구한다', async ({ page }) => {
  let attempts = 0;
  await page.route('**/assets/grid.worker-*.js', route => ++attempts === 1 ? route.abort('failed') : route.continue());
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: '격자 계산 실패 · 다시 시도', exact: true }).click();
  await expect(page.getByRole('button', { name: '순위 CSV', exact: true })).toBeEnabled();
  expect(attempts).toBeGreaterThanOrEqual(2);
  await expect(page.getByRole('button', { name: '격자 계산 실패 · 다시 시도', exact: true })).toHaveCount(0);
});

test('과거 검증 결과는 재검증 완료로 오인하지 않게 표시한다', async ({ page }) => {
  await loaded(page); await page.locator('nav.side .step').nth(8).click();
  await expect(card(page, '지평선 마스크')).toContainText('과거 참고 자료');
  await expect(card(page, '지평선 마스크')).toContainText('재검증 아님');
  await expect(card(page, 'PA → ME 변환').locator('tbody')).toContainText('✓');
});

test('모바일 기본 화면은 가로로 넘치지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loaded(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
