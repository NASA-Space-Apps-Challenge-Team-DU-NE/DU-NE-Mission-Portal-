/** Development-only runner; the exact same TypeScript executes in the browser Worker. */
import { build } from '../frontend/node_modules/esbuild/lib/main.js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
await mkdir(path.join(root,'.cache'),{recursive:true});
const outfile=path.join(root,'.cache/ephemeris-mission-engine.mjs');
await build({stdin:{contents:"export * from './frontend/src/physics/ephemeris/mission';export * from './frontend/src/physics/ephemeris/data';export * from './frontend/src/physics/data';",resolveDir:root},outfile,bundle:true,platform:'node',format:'esm'});
const {runEphemerisMission,loadEphemeris,loadAssets}=await import(pathToFileURL(outfile).href+'?'+Date.now());
const originalFetch=globalThis.fetch;
globalThis.fetch=async input=>{const url=new URL(String(input),'https://static.test'),file=path.resolve(root,'frontend/public','.'+decodeURIComponent(url.pathname));
  if(!file.startsWith(path.join(root,'frontend/public')+path.sep))return new Response('Forbidden',{status:403});
  try{return new Response(await readFile(file));}catch{return new Response('Not found',{status:404});}};
try {
  const input={initial_orbit:'nrho',nrho:{mode:'b'},target:{latitude_deg:-89.4441,longitude_deg:-137.291,landing_time_utc:'2026-11-16T00:00:00Z'},lander:{initial_mass_kg:1500,dry_mass_kg:650,max_thrust_n:12000,min_thrust_n:0,isp_s:320},orbit:{altitude_km:100,pdi_altitude_km:15},constraints:{position_tolerance_m:100,speed_tolerance_m_s:2,horizontal_speed_tolerance_m_s:1},objective:'fuel'};
  const started=performance.now(),result=await runEphemerisMission(input,await loadAssets('/data/'),await loadEphemeris('/data/'),console.log);
  await writeFile(path.join(root,'.cache/ephemeris-mission-result.json'),JSON.stringify(result));
  const record={generated_at_utc:new Date().toISOString(),runtime:process.version,elapsed_s:(performance.now()-started)/1000,input,status:result.status,message:result.message,summary:result.summary,validation:result.validation,events:result.events,reference:result.reference,transfer:{...result.transfer_diagnostic,samples:undefined},replay_initial:result.replay_initial};
  await writeFile(path.join(root,'docs/ephemeris-validation-results.json'),JSON.stringify(record,null,2));
  console.log(JSON.stringify({status:record.status,summary:record.summary,validation:record.validation,elapsed_s:record.elapsed_s},null,2));
  if(result.status!=='VALIDATED')process.exitCode=1;
}finally{globalThis.fetch=originalFetch;}
