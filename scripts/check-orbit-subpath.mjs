import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '../web/node_modules/playwright/index.mjs';
const root=path.resolve('.cache/subpath-dist'), prefix='/mission-portal/';
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.bin':'application/octet-stream'};
const unexpected=[];
const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');if(!url.pathname.startsWith(prefix)){unexpected.push(url.pathname);res.writeHead(404);res.end();return;}let file=path.resolve(root,decodeURIComponent(url.pathname.slice(prefix.length))||'index.html');if(file!==root&&!file.startsWith(root+path.sep))throw Error('outside root');if((await stat(file)).isDirectory())file=path.join(file,'index.html');res.setHeader('Content-Type',mime[path.extname(file)]??'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}${prefix}`;
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[],requests=[];page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>requests.push(r.url()));
await page.addInitScript(()=>localStorage.setItem('dune.lang','ko'));
try{
 await page.goto(base+'?p=orbit');await page.waitForFunction(()=>!document.querySelector('[data-testid="orbit-run"]')?.disabled,{timeout:30000});
 const eph=page.waitForResponse(r=>r.url().includes('/orbit/data/ephemeris/index.json')&&r.status()===200,{timeout:20000});
 await page.getByTestId('orbit-run').click();await eph;await page.getByRole('button',{name:'계산 취소',exact:true}).click();
 const passed=errors.length===0&&requests.some(x=>x.includes('/mission-portal/orbit/assets/simulation.worker-'))&&unexpected.filter(p=>p!=='/favicon.ico').length===0;
 const result={checked_at_utc:new Date().toISOString(),passed,basePath:prefix,errors,unexpected,workerLoaded:requests.some(x=>x.includes('/mission-portal/orbit/assets/simulation.worker-')),ephemerisLoaded:true,requests:requests.filter(x=>x.includes('/orbit/')).map(x=>new URL(x).pathname)};
 await writeFile('docs/orbit-integration-subpath.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({...result,requests:result.requests.length}));if(!passed)throw Error('Subpath verification failed');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
