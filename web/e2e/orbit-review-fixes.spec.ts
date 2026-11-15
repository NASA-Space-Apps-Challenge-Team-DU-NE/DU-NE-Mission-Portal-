import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
const example=JSON.parse(readFileSync('../orbit/docs/portal-orbit-default-input.json','utf8'));
test.beforeEach(async({page})=>{await page.addInitScript(()=>localStorage.setItem('dune.lang','ko'));});
const planCard=(page:Page)=>page.locator('section.card').filter({has:page.getByRole('heading',{name:'지금 계획',exact:true})});
async function siteReady(page:Page){await page.goto('/?p=site');await expect(page.getByRole('button',{name:'순위 CSV',exact:true})).toBeEnabled();await expect(planCard(page).locator('.hd')).toContainText('지형 반영');}
async function settings(page:Page){await page.locator('nav.side .step').nth(0).click();await page.getByRole('tab',{name:'착륙선 정보',exact:true}).click();}
async function upload(page:Page,config:unknown,site_ref?:unknown){await page.locator('input[type=file]').setInputFiles({name:'mission.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({schema:'dune.orbit-mission.v1',config,...(site_ref?{site_ref}:{})}))});await expect(page.getByText('임무 입력을 불러왔습니다. 계산은 05에서 실행하세요.')).toBeVisible();}
test('catalog candidate restore, example and JSON retain the same surface assessment',async({page})=>{
 await siteReady(page);const before=await planCard(page).locator('.kpis').innerText();
 await planCard(page).getByRole('button',{name:'비교에 추가',exact:true}).click();await page.locator('nav.side .step').nth(6).click();await page.getByRole('button',{name:'이 안으로 바꾸기',exact:true}).click();
 await page.locator('nav.side .step').nth(1).click();await expect(planCard(page).locator('.hd')).toContainText('지형 반영');expect(await planCard(page).locator('.kpis').innerText()).toBe(before);await expect(page).toHaveURL(/site=connecting_ridge/);
 await settings(page);await page.getByRole('button',{name:'검증 예제 전체 적용',exact:true}).click();
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'임무 JSON 저장',exact:true}).click();const stream=await (await download).createReadStream();const chunks:Buffer[]=[];for await(const chunk of stream)chunks.push(Buffer.from(chunk));const saved=JSON.parse(Buffer.concat(chunks).toString('utf8'));expect(saved.site_ref).toEqual({kind:'catalog',id:'connecting_ridge'});
 await upload(page,example,{kind:'custom',lat:example.target.latitude_deg,lon:example.target.longitude_deg});
 await upload(page,saved.config,saved.site_ref);await page.locator('nav.side .step').nth(1).click();expect(await planCard(page).locator('.kpis').innerText()).toBe(before);
 await settings(page);await upload(page,example);await page.locator('nav.side .step').nth(1).click();await expect(planCard(page).locator('.hd')).toContainText('지형 반영');expect(await planCard(page).locator('.kpis').innerText()).toBe(before);
});
test('reconnect recovers a portal metadata failure without reloading the page',async({page})=>{
 let fail=true,portalRequests=0;await page.route('**/orbit/integration/capabilities.json',r=>{if(!r.request().frame().parentFrame())portalRequests++;return fail?r.fulfill({status:503,body:'temporary'}):r.continue();});
 await page.goto('/?p=orbit');await expect(page.getByRole('alert')).toContainText('503');await expect(page.getByTestId('orbit-run')).toBeDisabled();
 fail=false;const before=portalRequests;await page.getByRole('button',{name:'다시 연결',exact:true}).click();await expect(page.getByTestId('orbit-run')).toBeEnabled({timeout:30000});expect(portalRequests).toBeGreaterThan(before);await expect(page.getByRole('alert')).toHaveCount(0);
 await page.locator('nav.side .step').nth(1).click();await expect(page.getByText('입력 범위 확인됨 · 전체 비행 구간과 실제 지형·착륙 제약은 계산 시 검증합니다.')).toBeVisible();
});
test('Escape closes the portal help from Orbit and other tabs',async({page})=>{
 await page.goto('/?p=orbit');await expect(page.getByTestId('orbit-run')).toBeEnabled();
 for(const index of [4,0]){await page.locator('nav.side .step').nth(index).click();await page.getByRole('button',{name:'도움말',exact:true}).click();await expect(page.getByRole('dialog',{name:'사용법'})).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog',{name:'사용법'})).toHaveCount(0);await expect(page.locator('.app')).toHaveClass(/mode-plan/);}
});

test('English failure guidance and controls follow the portal language',async({page,context})=>{
 await context.route('**/orbit/data/gravity/index.json',r=>r.fulfill({status:404,body:'Missing test asset'}));
 await page.goto('/?p=orbit');await expect(page.getByTestId('orbit-run')).toBeEnabled();await page.getByRole('button',{name:'EN',exact:true}).click();
 await expect(page.frameLocator('iframe').locator('html')).toHaveAttribute('lang','en');await page.getByTestId('orbit-run').click();
 const dialog=page.frameLocator('iframe').getByRole('alertdialog');await expect(dialog).toBeVisible({timeout:30000});await expect(dialog.getByRole('button',{name:'Review settings',exact:true})).toBeVisible();
 const frame=page.frames().find(f=>f.url().includes('/orbit/index.html'))!;
 const untranslated=await frame.evaluate(()=>{const out:string[]=[];const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);for(let n=walker.nextNode();n;n=walker.nextNode()){const p=n.parentElement;if(p&&!p.closest('pre,code,script,style')&&p.getClientRects().length&&/[가-힣]/.test(n.textContent??''))out.push(n.textContent??'');}return out;});expect(untranslated).toEqual([]);
 await page.getByRole('button',{name:'KR',exact:true}).click();await expect(dialog.getByRole('button',{name:'설정 확인하기',exact:true})).toBeVisible();
});
