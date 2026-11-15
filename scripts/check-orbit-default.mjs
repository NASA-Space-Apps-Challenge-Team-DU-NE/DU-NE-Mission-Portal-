import { chromium } from '../web/node_modules/playwright/index.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
await page.addInitScript(()=>{localStorage.setItem('dune.lang','ko');window.__orbitResults=[];window.addEventListener('message',e=>{if(e.origin!==location.origin||e.data?.protocol!=='dune-orbit-bridge.v1'||e.data?.type!=='RESULT')return;const r=e.data.result;window.__orbitResults.push({input:e.data.input,status:r.status,summary:r.summary,validation:r.validation,trajectoryLength:r.trajectory.length,first:r.trajectory[0],last:r.trajectory.at(-1),warnings:r.warnings,buildId:e.data.buildId});});});
const errors=[];page.on('pageerror',e=>errors.push(String(e)));
try {
 await page.goto('http://127.0.0.1:5175/?p=orbit',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>!document.querySelector('[data-testid="orbit-run"]')?.disabled,{timeout:30000});
 console.log('READY');await page.getByTestId('orbit-run').click();
 console.log('RUNNING');await page.waitForFunction(()=>window.__orbitResults.length>0,{timeout:85000});
 const result=await page.evaluate(()=>window.__orbitResults[0]);console.log('RESULT',result.status,result.trajectoryLength, Object.keys(result.validation).length);
 await mkdir('docs/ui',{recursive:true});await page.screenshot({path:'docs/ui/orbit-integrated-success.png',fullPage:true});
 await writeFile('docs/orbit-integration-browser-default.json',JSON.stringify({checked_at_utc:new Date().toISOString(),errors,result},null,2)+'\n');
 if(result.status!=='VALIDATED')throw new Error('Default did not pass: '+JSON.stringify(result.summary));
 console.log('GEOMETRY',await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,rail:!!document.querySelector('.rail'),iframe:document.querySelector('iframe').getBoundingClientRect().toJSON()})));
 const frame=page.frames().find(f=>f.url().includes('/orbit/index.html'));
 console.log('FRAME',await frame.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,workspace:getComputedStyle(document.querySelector('.workspace')).gridTemplateColumns,aside:[...document.querySelectorAll('aside')].map(e=>({className:e.className,rect:e.getBoundingClientRect().toJSON()}))})));
 console.log('ERRORS',errors);
} catch(e){console.error(e);await page.screenshot({path:'.cache/browser-default-error.png',fullPage:true});console.error(await page.locator('body').innerText());process.exitCode=1;} finally {await browser.close();}
