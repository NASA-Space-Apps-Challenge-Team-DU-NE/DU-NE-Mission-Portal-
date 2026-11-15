/** Development-only runner for the same TypeScript engine used in the browser. */
import {build} from '../frontend/node_modules/esbuild/lib/main.js';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const args=Object.fromEntries(process.argv.slice(2).map(x=>x.replace(/^--/,'').split('=')));
const degree=args.degree==='point'?'point':Number(args.degree??30),scenario=args.scenario??'default',budget=Number(args.budget??180);
if(degree!=='point'&&![20,30,60,90].includes(degree))throw Error('Use degree point,20,30,60,90');
await mkdir(path.join(root,'.cache'),{recursive:true});
const outfile=path.join(root,`.cache/finite-engine-${degree}-${scenario}.mjs`);
await build({stdin:{contents:"export * from './frontend/src/defaultMission';export * from './frontend/src/physics/ephemeris/mission';export * from './frontend/src/physics/ephemeris/data';export * from './frontend/src/physics/gravity/model';export * from './frontend/src/physics/data';",resolveDir:root},outfile,bundle:true,platform:'node',format:'esm'});
const api=await import(pathToFileURL(outfile));
globalThis.fetch=async input=>{const u=new URL(String(input),'https://static.test'),file=path.resolve(root,'frontend/public','.'+decodeURIComponent(u.pathname));
 if(!file.startsWith(path.join(root,'frontend/public')+path.sep))return new Response('Forbidden',{status:403});
 try{return new Response(await readFile(file));}catch{return new Response('Missing',{status:404});}};
const input=api.defaultMission();input.nrho={...input.nrho,gravity_model:degree==='point'?'point_mass':'grail',gravity_degree:degree==='point'?30:degree,max_computation_seconds:budget};
if(scenario==='pole')input.target.latitude_deg=-89.99;
if(scenario==='thrust')input.lander.max_thrust_n=100;
if(scenario==='fuel'){input.lander.initial_mass_kg=700;input.nrho.mass_basis='nrho';}
if(scenario==='nrho-mass'){input.lander.initial_mass_kg=2600;input.nrho.mass_basis='nrho';}
if(scenario==='coverage')input.target.landing_time_utc='2027-02-01T00:00:00Z';
if(args.date)input.target.landing_time_utc=args.date;
if(scenario==='budget')input.nrho.max_computation_seconds=1;
if(scenario==='iterations')input.nrho.max_iterations=1;
if(scenario==='dv-limit')input.nrho.max_transfer_delta_v_m_s=1;
if(args.objective)input.nrho.objective=args.objective;
if(args.tof){input.nrho.transfer_tof_min_days=Number(args.tof);input.nrho.transfer_tof_max_days=Number(args.tof);}
if(args.duration)input.nrho.powered_descent_duration_s=Number(args.duration);
if(args.thrust)input.lander.max_thrust_n=Number(args.thrust);
const started=performance.now();let eph=await api.loadEphemeris('/data/');
if(degree!=='point')eph=new api.Ephemeris(eph.data,new api.GrailGravityModel(await api.loadGravityData('/data/'),eph.frames,degree));
let result;try{result=await api.runEphemerisMission(input,await api.loadAssets('/data/'),eph,s=>console.log(s));}
catch(e){result={status:'ERROR',message:e.message,trajectory:[],summary:{},validation:{}};}
const suffix=`${degree}-${scenario}${args.tag?'-'+args.tag:''}`,resultJson=JSON.stringify(result);
await writeFile(path.join(root,`.cache/finite-mission-${suffix}.json`),resultJson);
const record={generated_at_utc:new Date().toISOString(),runtime:process.version,elapsed_s:(performance.now()-started)/1000,trajectory_sample_count:result.trajectory.length,full_result_sha256:createHash('sha256').update(resultJson).digest('hex'),input,status:result.status,message:result.message,summary:result.summary,validation:result.validation,events:result.events,finite_burns:result.finite_burns,reference:result.reference,joint_search:result.joint_search,replay_initial:result.replay_initial};
await writeFile(path.join(root,`docs/finite-mission-${suffix}.json`),JSON.stringify(record,null,2));
console.log(JSON.stringify({status:result.status,message:result.message,summary:result.summary,validation:result.validation,elapsed_s:record.elapsed_s},null,2));
const expectedSuccess=['default','pole','nrho-mass'].includes(scenario);
if(args.expect==='guard-rejection' ? result.status!=='LANDING CONSTRAINT VIOLATION'||result.trajectory.length>0 : expectedSuccess?result.status!=='VALIDATED':result.status==='VALIDATED'||result.trajectory.length>0)process.exitCode=1;
