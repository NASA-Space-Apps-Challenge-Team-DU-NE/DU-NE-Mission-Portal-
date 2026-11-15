/** Development-only representative date audit of the browser's actual engine. */
import {build} from '../frontend/node_modules/esbuild/lib/main.js';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
await mkdir(path.join(root,'.cache'),{recursive:true});
const outfile=path.join(root,'.cache/expanded-ephemeris-engine.mjs');
await build({stdin:{contents:"export * from './frontend/src/defaultMission';export * from './frontend/src/physics/ephemeris/mission';export * from './frontend/src/physics/ephemeris/data';export * from './frontend/src/physics/gravity/model';export * from './frontend/src/physics/data';",resolveDir:root},outfile,bundle:true,platform:'node',format:'esm'});
const api=await import(pathToFileURL(outfile));
globalThis.fetch=async input=>{const u=new URL(String(input),'https://static.test'),file=path.resolve(root,'frontend/public','.'+decodeURIComponent(u.pathname));
 if(!file.startsWith(path.join(root,'frontend/public')+path.sep))return new Response('Forbidden',{status:403});
 try{return new Response(await readFile(file));}catch{return new Response('Missing',{status:404});}};
const base=await api.loadEphemeris('/data/'),eph=new api.Ephemeris(base.data,new api.GrailGravityModel(await api.loadGravityData('/data/'),base.frames,30));
const assets=await api.loadAssets('/data/'),cases=[];
for(const utc of ['2026-11-01T00:00:00Z','2026-11-16T00:00:00Z','2026-12-02T00:00:00Z','2027-01-01T00:00:00Z','2027-01-31T23:59:59.999Z']){
 const input=api.defaultMission();input.target.landing_time_utc=utc;
 const start=performance.now();let result;
 try{result=await api.runEphemerisMission(input,assets,eph);}catch(e){result={status:'ERROR',message:e.message,trajectory:[]};}
 const tag=utc.slice(0,10),json=JSON.stringify(result);
 await writeFile(path.join(root,`.cache/expanded-mission-${tag}.json`),json);
 const passed=result.status==='VALIDATED'?Object.values(result.validation).every(v=>v.passed)&&result.trajectory.length>0:result.trajectory.length===0&&!/COVERAGE|REFERENCE|ERROR/.test(result.status+' '+result.message);
 const row={landing_utc:utc,status:result.status,passed,elapsed_s:(performance.now()-start)/1000,message:result.message,trajectory_samples:result.trajectory.length,result_sha256:createHash('sha256').update(json).digest('hex'),input,summary:result.summary,validation:result.validation,reference:result.reference,joint_search:result.joint_search};
 cases.push(row);console.log(JSON.stringify({utc,status:row.status,passed,elapsed_s:row.elapsed_s,summary:row.summary}));
 await writeFile(path.join(root,'docs/ephemeris-expansion-validation.json'),JSON.stringify({schema:'lunar.ephemeris.expansion-validation.v1',generated_at_utc:new Date().toISOString(),scope:'Representative dates, unchanged default spacecraft and terminal constraints. Physical success is not assumed for every date.',runtime_metrics_scope:'elapsed_s is per case; shared gravity-model counters accumulate across cases.',asset_sha256:createHash('sha256').update(await readFile(path.join(root,'frontend/public/data/ephemeris/index.json'))).digest('hex'),landing_coverage_utc:eph.data.landing_coverage_utc,cases,passed:cases.length===5&&cases.every(c=>c.passed)&&cases.find(c=>c.landing_utc==='2026-11-16T00:00:00Z')?.status==='VALIDATED'},null,2));
}
if(!cases.every(c=>c.passed)||cases.find(c=>c.landing_utc==='2026-11-16T00:00:00Z').status!=='VALIDATED')process.exitCode=1;
