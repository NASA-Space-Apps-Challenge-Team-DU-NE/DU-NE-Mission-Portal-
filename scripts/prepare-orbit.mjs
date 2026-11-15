import { readFile, writeFile, mkdir, readdir, cp } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { build } from '../orbit/frontend/node_modules/esbuild/lib/main.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const read=async p=>JSON.parse(await readFile(path.join(root,p),'utf8'));
const hash=v=>createHash('sha256').update(v).digest('hex');
const packed=await build({entryPoints:[path.join(root,'orbit/frontend/src/defaultMission.ts')],bundle:true,write:false,platform:'node',format:'esm'});
const {defaultMission}=await import('data:text/javascript;base64,'+Buffer.from(packed.outputFiles[0].text).toString('base64'));
const eph=await read('orbit/frontend/public/data/ephemeris/index.json');
const baseline=await read('orbit/docs/finite-mission-30-default-mode-b-only.json');
const data={};
for(const f of ['ephemeris/index.json','gravity/index.json','terrain/index.json','manifest.json']) data[f]=hash(await readFile(path.join(root,'orbit/frontend/public/data',f)));
const digest=createHash('sha256');
async function sources(dir) { for(const e of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) { const p=path.join(dir,e.name); if(e.isDirectory()) await sources(p); else {digest.update(path.relative(root,p));digest.update(await readFile(p));} } }
await sources(path.join(root,'orbit/frontend/src'));digest.update(JSON.stringify(data));
const caps={protocol:'dune-orbit-bridge.v1',buildId:digest.digest('hex'),upstream:'7d69425493ede243ddd79ab2c87a6169e52c07bf',landing_coverage_utc:eph.landing_coverage_utc,coverage_utc:eph.coverage_utc,terrain_latitude_deg:[-90,-75],gravity_degrees:[20,30,60,90],required_checks:Object.keys(baseline.validation),terminal_policy:'demo-terminal-v1',data_sha256:data};
const out=path.join(root,'orbit/frontend/public/integration');await mkdir(out,{recursive:true});
await writeFile(path.join(out,'capabilities.json'),JSON.stringify(caps,null,2)+'\n');
await writeFile(path.join(out,'default-mission.json'),JSON.stringify(defaultMission(),null,2)+'\n');
for (const [entry,args] of [['typescript/bin/tsc',['--noEmit']],['vite/bin/vite.js',['build']]]) { const p=spawnSync(process.execPath,[path.join(root,'orbit/frontend/node_modules',entry),...args],{cwd:path.join(root,'orbit/frontend'),stdio:'inherit'});if(p.status!==0)process.exit(p.status??1); }
await mkdir(path.join(root,'web/public/orbit'),{recursive:true});
await cp(path.join(root,'orbit/dist'),path.join(root,'web/public/orbit'),{recursive:true,force:true});
console.log('Orbit static build prepared:',caps.buildId.slice(0,12));
