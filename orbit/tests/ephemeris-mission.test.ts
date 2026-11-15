import test from 'node:test';
import assert from 'node:assert/strict';
import type { Config } from '../frontend/src/types';
import { loadAssets } from '../frontend/src/physics/data';
import { defaultMission } from '../frontend/src/defaultMission';
import { Ephemeris } from '../frontend/src/physics/ephemeris/data';
import { GrailGravityModel, loadGravityData } from '../frontend/src/physics/gravity/model';
import { norm, sub, G0 } from '../frontend/src/physics/math';
import { loadEphemeris } from '../frontend/src/physics/ephemeris/data';
import { runEphemerisMission } from '../frontend/src/physics/ephemeris/mission';
import { DEFAULT_NRHO } from '../frontend/src/physics/ephemeris/settings';
import { installStaticFetch, readJson } from './static-assets';
async function setup(){const baseline=await readJson('docs/default-trajectory.json');const config:Config={...baseline.input,initial_orbit:'nrho',nrho:{...DEFAULT_NRHO,mode:'b'}};return {config,assets:await loadAssets('/data/'),eph:await loadEphemeris('/data/')};}

test('the exact default GRAIL mission is recomputed and passes all unchanged terminal constraints',async()=>{
  const f=installStaticFetch();try{
    const config=defaultMission(),assets=await loadAssets('/data/');let eph=await loadEphemeris('/data/');
    eph=new Ephemeris(eph.data,new GrailGravityModel(await loadGravityData('/data/'),eph.frames,30));
    const result=await runEphemerisMission(config,assets,eph);
    assert.equal(result.status,'VALIDATED',result.message);assert.ok(result.trajectory.length>1000);
    const reference=result.reference as {departure_state_source:string;reference_seed:{epoch_t_s:number;state:number[]}};
    const departure=(result.transfer_diagnostic as {departure_time_s:number}).departure_time_s;
    assert.equal(reference.departure_state_source,'NASA SPK type-9 direct lookup');assert.equal(reference.reference_seed.epoch_t_s,departure);
    assert.deepEqual(reference.reference_seed.state,eph.referenceState(departure));
    for(const [key,value] of Object.entries(result.validation))assert.equal(value.passed,true,key);
    assert.equal((result.reference?.terminal_descent as {version:string}).version,'demo-terminal-v1');
    assert.equal(result.summary.powered_descent_duration_s,880);assert.equal(result.summary.selected_heading_deg,180);
    const last=result.trajectory.at(-1)!;assert.ok(Math.abs(last.altitude_m!-2)<.02);assert.ok(last.thrust_tilt_deg!<5);
    assert.ok(last.horizontal_speed_m_s<.5);assert.ok(last.vertical_speed_m_s<0&&last.vertical_speed_m_s>=-1);
    assert.ok(result.events?.some(e=>e.name==='TOUCHDOWN'));
    const insertion=result.trajectory.filter(p=>p.phase==='INSERTION_BURN'),llo=result.trajectory.find(p=>p.phase==='CIRCULAR')!;
    assert.deepEqual(insertion.at(-1)!.position_m,llo.position_m);assert.deepEqual(insertion.at(-1)!.velocity_m_s,llo.velocity_m_s);
    const burn=result.events!.find(e=>e.name==='LLO_INSERTION')!;
    assert.ok(Math.abs(insertion[0].mass_kg*Math.exp(-burn.delta_v_m_s!/(config.lander.isp_s*G0))-llo.mass_kg)<1e-6);
    assert.ok(norm(sub(insertion[0].position_m,llo.position_m))>1000);
    assert.ok(result.trajectory.every(p=>p.mass_kg>=config.lander.dry_mass_kg&&p.thrust_n<=config.lander.max_thrust_n+1e-6));
    for(let i=1;i<result.trajectory.length;i++){
      const a=result.trajectory[i-1],b=result.trajectory[i];assert.ok(b.time_s>=a.time_s);
      if(a.time_s===b.time_s){assert.deepEqual(a.position_m,b.position_m);assert.deepEqual(a.velocity_m_s,b.velocity_m_s);assert.ok(Math.abs(a.mass_kg-b.mass_kg)<1e-7);}
    }
    const search=result.joint_search as {candidates:Array<{validated:boolean;score:number}>;selected_candidate:{score:number};validated_candidates:number};
    assert.ok(search.validated_candidates>=1);assert.equal(search.selected_candidate.score,Math.min(...search.candidates.filter(c=>c.validated).map(c=>c.score)));
    const controls=result.controls as Array<{start_s:number;duration_s:number}>;assert.equal(controls.length,96);
    for(let i=1;i<controls.length;i++)assert.ok(Math.abs(controls[i-1].start_s+controls[i-1].duration_s-controls[i].start_s)<1e-7);
  }finally{f.restore();}
});

test('a shorter noncompliant example and malformed explicit duration/heading cannot bypass the guard',async()=>{
  const f=installStaticFetch();try{
    const {config,assets,eph}=await setup();config.nrho={...config.nrho!,powered_descent_duration_s:440,approach_heading_deg:180};
    const result=await runEphemerisMission(config,assets,eph);assert.notEqual(result.status,'VALIDATED');assert.equal(result.trajectory.length,0);
    const rows=(result.landing_diagnostic as {candidates:Array<{terminal_constraints_passed:boolean}>}).candidates;
    assert.ok(rows.some(r=>r.terminal_constraints_passed===false));
    for(const bad of [259,1201,NaN])await assert.rejects(runEphemerisMission({...config,nrho:{...config.nrho!,powered_descent_duration_s:bad}},assets,eph),/Powered descent duration/);
    for(const bad of [-1,360,NaN])await assert.rejects(runEphemerisMission({...config,nrho:{...config.nrho!,approach_heading_deg:bad}},assets,eph),/Approach heading/);
  }finally{f.restore();}
});

test('Mode B cannot return success when transfer delta-V, fuel or supported dates fail',async()=>{
  const f=installStaticFetch();try{
    const {config,assets,eph}=await setup();config.nrho={...config.nrho!,transfer_tof_min_days:3,transfer_tof_max_days:3,max_computation_seconds:30,powered_descent_duration_s:880,approach_heading_deg:180};
    const limit={...config,nrho:{...config.nrho!,max_transfer_delta_v_m_s:1,transfer_tof_min_days:1.65,transfer_tof_max_days:1.65}};
    const fail=await runEphemerisMission(limit,assets,eph);assert.equal(fail.status,'TRANSFER NOT CONVERGED');assert.equal(fail.trajectory.length,0);
    const fuel=await runEphemerisMission({...config,lander:{...config.lander,initial_mass_kg:700},nrho:{...config.nrho!,mass_basis:'nrho'}},assets,eph);
    assert.notEqual(fuel.status,'VALIDATED');assert.equal(fuel.trajectory.length,0);
    await assert.rejects(runEphemerisMission({...config,target:{...config.target,landing_time_utc:'2027-02-01T00:00:00Z'}},assets,eph),/EPHEMERIS COVERAGE/);
    await assert.rejects(runEphemerisMission({...config,target:{...config.target,landing_time_utc:'2026-10-31T23:59:59Z'}},assets,eph),/EPHEMERIS COVERAGE/);
  }finally{f.restore();}
});
