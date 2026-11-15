import { expect, test, type Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
const example=JSON.parse(readFileSync('../orbit/docs/portal-orbit-default-input.json','utf8'));
test.setTimeout(120_000);
test.beforeEach(async({page})=>{await page.addInitScript(()=>{localStorage.setItem('dune.lang','ko');Object.assign(window,{orbitTestResults:[]});window.addEventListener('message',e=>{if(e.origin===location.origin&&e.data?.protocol==='dune-orbit-bridge.v1'&&e.data.type==='RESULT'){const r=e.data.result;(window as unknown as {orbitTestResults:unknown[]}).orbitTestResults.push({status:r.status,trajectoryLength:r.trajectory.length,input:e.data.input,summary:r.summary,validation:r.validation,buildId:e.data.buildId});}});});});
async function boot(page:Page){await page.goto('/?p=orbit',{waitUntil:'domcontentloaded'});await expect(page.getByTestId('orbit-run')).toBeEnabled({timeout:30000});}
async function loadMission(page:Page,config:unknown){await page.getByRole('button',{name:'01 질량·궤도 설정',exact:true}).click();await page.locator('input[type=file]').setInputFiles({name:'mission.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({schema:'dune.orbit-mission.v1',config}))});await expect(page.getByText('임무 입력을 불러왔습니다. 계산은 05에서 실행하세요.')).toBeVisible();await page.locator('nav.side .step').nth(4).click();await expect(page.getByTestId('orbit-run')).toBeEnabled();}
async function result(page:Page){await page.waitForFunction(()=>(window as unknown as {orbitTestResults:unknown[]}).orbitTestResults.length>0,{},{timeout:85000});return page.evaluate(()=>(window as unknown as {orbitTestResults:Array<{status:string;trajectoryLength:number;input:typeof example;summary:Record<string,unknown>;validation:Record<string,{passed:boolean}>}>}).orbitTestResults.at(-1)!);}
test('complete default plan reaches a real validated Mode B trajectory',async({page,context},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await boot(page);
 await expect(page.locator('.rail')).toHaveCount(0);await expect(page.frameLocator('iframe').locator('.setup-panel')).toHaveCount(0);
 const originalFrame=page.frames().find(f=>f.url().includes('/orbit/index.html'))!;
 await page.getByTestId('orbit-run').click();await page.getByRole('button',{name:'EN',exact:true}).click();
 await expect(page.frameLocator('iframe').locator('html')).toHaveAttribute('lang','en');expect(page.frames()).toContain(originalFrame);
 await expect(page.locator('main.dash .help').first()).toContainText('Uses the planned inputs');
 const r=await result(page);
 expect(r.status).toBe('VALIDATED');expect(r.trajectoryLength).toBeGreaterThan(1000);expect(Object.keys(r.validation)).toHaveLength(20);expect(Object.values(r.validation).every(x=>x.passed===true)).toBe(true);
 expect(r.input.lander).toEqual(example.lander);expect(r.input.nrho).toEqual(example.nrho);expect(Date.parse(r.input.target.landing_time_utc)).toBe(Date.parse(example.target.landing_time_utc));
 await expect(page.getByTestId('orbit-result-status')).toHaveText('VALIDATED');
 await expect(page.frameLocator('iframe').locator('.viewport-heading b').filter({hasText:'3D trajectory'})).toBeVisible();
 await context.grantPermissions(['clipboard-read','clipboard-write']);await page.getByRole('button',{name:'Copy report',exact:true}).click();
 const report=await page.evaluate(()=>navigator.clipboard.readText());expect(report).toContain('Orbit mission · Mode B');expect(report).toContain('VALIDATED');expect(report).toContain('20/20');expect(report).toContain('max_thrust_n');expect(report).toContain('## Selected site');writeFileSync(info.outputPath('integrated-report.txt'),report);
 await info.attach('integrated-report',{body:report,contentType:'text/plain'});
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Ranking CSV',exact:true}).click();
 const stream=await(await download).createReadStream();const chunks:Buffer[]=[];for await(const chunk of stream)chunks.push(Buffer.from(chunk));const csv=Buffer.concat(chunks).toString('utf8');
 expect(csv).toContain('orbit_status');expect(csv).toContain(',current_plan,VALIDATED,');expect(csv).toContain(',ranked_candidate,NOT_CALCULATED,');expect(csv).toContain('orbit_validation_json');writeFileSync(info.outputPath('integrated-ranking.csv'),csv);await info.attach('integrated-ranking',{body:csv,contentType:'text/csv'});
 await page.screenshot({path:info.outputPath('english.png')});
 await page.getByRole('button',{name:'KR',exact:true}).click();await expect(page.frameLocator('iframe').locator('html')).toHaveAttribute('lang','ko');expect(page.frames()).toContain(originalFrame);await expect(page.getByTestId('orbit-result-status')).toHaveText('VALIDATED');
 await expect(page.frameLocator('iframe').locator('.viewport-heading b').filter({hasText:'3D 궤도'})).toBeVisible();
 writeFileSync(info.outputPath('calculated-result.json'),JSON.stringify(r,null,2));
 await info.attach('calculated-result',{body:JSON.stringify(r,null,2),contentType:'application/json'});
 await page.locator('iframe').scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('default.png')});expect(errors).toEqual([]);

});
test('January representative date is honestly non-convergent with no path',async({page},info)=>{await boot(page);const c=structuredClone(example);c.target.landing_time_utc='2027-01-01T00:00:00Z';await loadMission(page,c);await page.getByTestId('orbit-run').click();const r=await result(page);expect(r.status).toBe('TRANSFER NOT CONVERGED');expect(r.trajectoryLength).toBe(0);await expect(page.frameLocator('iframe').getByRole('alertdialog')).toBeVisible();await info.attach('nonconvergent-result',{body:JSON.stringify(r,null,2),contentType:'application/json'});});
test('cancel and tab departure terminate Workers and cannot publish stale results',async({page})=>{let closed=0;page.on('worker',w=>{if(w.url().includes('simulation.worker'))w.on('close',()=>closed++);});await boot(page);await page.getByTestId('orbit-run').click();await page.waitForTimeout(750);await page.getByRole('button',{name:'계산 취소',exact:true}).click();await expect.poll(()=>closed).toBeGreaterThan(0);await expect(page.getByTestId('orbit-status')).toContainText('계산 취소');await page.getByTestId('orbit-run').click();await page.waitForTimeout(750);await page.getByRole('button',{name:'01 질량·궤도 설정',exact:true}).click();await expect.poll(()=>closed).toBeGreaterThan(1);await page.locator('nav.side .step').nth(4).click();await expect(page.getByTestId('orbit-run')).toBeEnabled();expect(await page.evaluate(()=>(window as unknown as {orbitTestResults:unknown[]}).orbitTestResults.length)).toBe(0);});
test('missing GRAIL data fails without substituting a different model',async({page,context})=>{await context.route('**/orbit/data/gravity/index.json',r=>r.fulfill({status:404,body:'Missing test asset'}));await boot(page);await page.getByTestId('orbit-run').click();const r=await result(page);expect(r.status).toBe('DATA UNAVAILABLE');expect(r.trajectoryLength).toBe(0);await expect(page.frameLocator('iframe').getByRole('alertdialog')).toBeVisible();});
test('plan fields and import/export are editable, invalid values block execution',async({page})=>{await boot(page);await page.getByRole('button',{name:'01 질량·궤도 설정',exact:true}).click();await page.getByLabel('최소 엔진 추력 (N)',{exact:true}).fill('20000');await page.locator('nav.side .step').nth(4).click();await expect(page.getByTestId('orbit-run')).toBeDisabled();await expect(page.getByRole('alert')).toContainText('최소');await page.getByRole('button',{name:'01 질량·궤도 설정',exact:true}).click();await page.getByRole('button',{name:'검증 예제 전체 적용',exact:true}).click();await page.getByLabel('최소 엔진 추력 (N)',{exact:true}).fill('0');await page.locator('nav.side .step').nth(4).click();await expect(page.getByTestId('orbit-run')).toBeEnabled();});
test('390 px layout, source-only Mode B UI and view-only dates stay separate',async({page})=>{
 await page.setViewportSize({width:390,height:844});await boot(page);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const frame=page.frames().find(f=>f.url().includes('/orbit/index.html'))!;expect(await frame.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await expect(page.frameLocator('iframe').locator('body')).not.toContainText('Mode A');
 await page.setViewportSize({width:1440,height:1000});await page.getByRole('button',{name:'02 착륙지·날짜',exact:true}).click();
 await page.locator('.rail input#landing').fill('2026-12-02T00:00');await page.locator('.rail input#landing').press('Tab');
 await page.locator('nav.side .step').nth(4).click();await expect(page.getByTestId('orbit-run')).toBeEnabled();await expect(page.locator('.orbit-summary')).toContainText('2026-11-16');
});
