/** Development runner. Uses exactly the browser TypeScript, no runtime server. */
import { build } from '../frontend/node_modules/esbuild/lib/main.js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';
const root=fileURLToPath(new URL('../',import.meta.url));
const args=Object.fromEntries(process.argv.slice(2).map(x=>x.replace(/^--/,'').split('=')));
const degree=args.degree==='point'?'point':Number(args.degree??30),scenario=args.scenario??'default',budget=Number(args.budget??180);
if(degree!=='point'&&![0,20,30,60,90].includes(degree))throw Error('degree must be point,0,20,30,60,90');
await mkdir(path.join(root,'.cache'),{recursive:true});
const outfile=path.join(root,`.cache/gravity-engine-${degree}-${scenario}.mjs`);
await build({stdin:{contents:"export * from './frontend/src/physics/ephemeris/mission';export * from './frontend/src/physics/ephemeris/data';export * from './frontend/src/physics/gravity/model';export * from './frontend/src/physics/data';",resolveDir:root},outfile,bundle:true,platform:'node',format:'esm'});
const {runEphemerisMission,loadEphemeris,Ephemeris,GrailGravityModel,loadGravityData,loadAssets}=await import(pathToFileURL(outfile).href+'?'+Date.now());
const originalFetch=globalThis.fetch;
globalThis.fetch=async input=>{const url=new URL(String(input),'https://static.test'),file=path.resolve(root,'frontend/public','.'+decodeURIComponent(url.pathname));
  if(!file.startsWith(path.join(root,'frontend/public')+path.sep))return new Response('Forbidden',{status:403});
  try{return new Response(await readFile(file));}catch{return new Response('Not found',{status:404});}};
try{
  const input={initial_orbit:'nrho',nrho:{mode:'b',gravity_model:degree==='point'?'point_mass':'grail',gravity_degree:degree==='point'?30:degree,max_computation_seconds:budget},target:{latitude_deg:-89.4441,longitude_deg:-137.291,landing_time_utc:'2026-11-16T00:00:00Z'},lander:{initial_mass_kg:1500,dry_mass_kg:650,max_thrust_n:12000,min_thrust_n:0,isp_s:320},orbit:{altitude_km:100,pdi_altitude_km:15},constraints:{position_tolerance_m:100,speed_tolerance_m_s:2,horizontal_speed_tolerance_m_s:1},objective:'fuel'};
  if(scenario==='pole')input.target.latitude_deg=-89.99;
  if(scenario==='thrust')input.lander.max_thrust_n=100;
  if(scenario==='fuel'){input.lander.initial_mass_kg=700;input.nrho.mass_basis='nrho';}
  if(scenario==='coverage')input.target.landing_time_utc='2026-12-02T00:00:00Z';
  if(scenario==='budget')input.nrho.max_computation_seconds=1;
  if(scenario==='iterations')input.nrho.max_iterations=1;
  const before=process.memoryUsage(),started=performance.now();
  let eph=await loadEphemeris('/data/');
  if(degree!=='point')eph=new Ephemeris(eph.data,new GrailGravityModel(await loadGravityData('/data/'),eph.frames,degree));
  let result;try{result=await runEphemerisMission(input,await loadAssets('/data/'),eph,message=>console.log(message));}
  catch(e){result={status:'ERROR',message:e.message,trajectory:[],summary:{},validation:{}};}
  const suffix=scenario==='default'?`${degree}`:`${degree}-${scenario}`;
  await writeFile(path.join(root,`.cache/gravity-mission-${suffix}.json`),JSON.stringify(result));
  const record={generated_at_utc:new Date().toISOString(),runtime:process.version,platform:process.platform,cpu:os.cpus()[0]?.model,logical_cpus:os.cpus().length,elapsed_s:(performance.now()-started)/1000,memory_before:before,memory_after:process.memoryUsage(),benchmark_notes:'Single Node run per scenario; includes loading, optimizing and validating. Browser measurement is separate. Memory is process usage, not an isolated gravity allocation.',input,status:result.status,message:result.message,summary:result.summary,validation:result.validation,events:result.events,reference:result.reference,transfer:{...result.transfer_diagnostic,samples:undefined},landing_trials:result.landing_diagnostic?.candidates,replay_initial:result.replay_initial,gravity_stats:eph.lunarGravity?.stats};
  await writeFile(path.join(root,`docs/gravity-mission-${suffix}.json`),JSON.stringify(record,null,2));
  console.log(JSON.stringify({status:record.status,message:record.message,summary:record.summary,validation:record.validation,elapsed_s:record.elapsed_s,gravity_stats:record.gravity_stats},null,2));
  const expectedSuccess=['default','pole'].includes(scenario);
  if(expectedSuccess?result.status!=='VALIDATED':result.status==='VALIDATED'||result.trajectory.length>0)process.exitCode=1;
}finally{globalThis.fetch=originalFetch;}
