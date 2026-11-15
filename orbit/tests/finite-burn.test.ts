import test from 'node:test';
import assert from 'node:assert/strict';
import { burnDuration, propagateBurn, solveFiniteTransfer } from '../frontend/src/physics/ephemeris/finiteBurn';
import { propagateEphemeris, type EphemerisForces } from '../frontend/src/physics/ephemeris/dynamics';
import { G0, MU, norm, position, sub, velocity, type State, type V3 } from '../frontend/src/physics/math';
const engine={initial_mass_kg:1800,dry_mass_kg:650,max_thrust_n:12000,min_thrust_n:500,isp_s:320};
const central:EphemerisForces={gm:{moon:MU,earth:0,sun:0},coverage:[-1e6,1e6],at:()=>({earth:[384e6,0,0,0,0,0],sun:[1.5e11,0,0,0,0,0]})};
test('finite constant force matches analytic mass, logarithmic velocity and displacement',()=>{
 const free={...central,gm:{moon:1e-30,earth:0,sun:0}},initial:State=[2e6,0,0,0,0,0,1000];
 const lander={...engine,max_thrust_n:2000,dry_mass_kg:500,isp_s:300},dv=300,ve=lander.isp_s*G0;
 const result=propagateBurn(initial,100,[0,dv,0],lander,free,{rtol:2e-13,atol_position_m:1e-7,atol_velocity_m_s:1e-10});
 const duration=result.burn.duration_s,flow=lander.max_thrust_n/ve,mf=1000*Math.exp(-dv/ve);
 const expectedPosition=ve*(duration+mf/flow*Math.log(mf/1000));
 assert.ok(duration>100);assert.ok(Math.abs(result.final[6]-mf)<1e-8);assert.ok(Math.abs(result.final[4]-dv)<1e-8);assert.ok(Math.abs(result.final[1]-expectedPosition)<1e-5);
 for(const p of result.samples)assert.ok(Math.abs(p.state[6]-(1000-flow*(p.t-100)))<1e-8);
 assert.deepEqual(result.samples[0].state,initial);assert.ok(result.samples.length>30);
 assert.throws(()=>propagateEphemeris(initial,0,1,free,{thrust_n:[1,0,0],acceleration_m_s2:[1,0,0]}),/simultaneous/);
});
function knownTransfer(){
 const start=10000,end=14000,initial:State=[6e6,0,0,0,Math.sqrt(MU/6e6),40,engine.initial_mass_kg];
 const v0:V3=[50,100,-20],v1:V3=[-35,70,15],opts={rtol:3e-13,atol_position_m:1e-6,atol_velocity_m_s:1e-9,max_step_s:10};
 const first=propagateBurn(initial,start,v0,engine,central,opts,'NRHO_DEPARTURE');
 const lastStart=end-burnDuration(first.final[6],norm(v1),engine.max_thrust_n,engine.isp_s);
 const coast=propagateEphemeris(first.final,start+first.burn.duration_s,lastStart-start-first.burn.duration_s,central,opts);
 const final=propagateBurn(coast.final as State,lastStart,v1,engine,central,opts,'LLO_INSERTION');
 return {start,end,initial,v0,v1,final:final.final};
}
test('finite targeting corrects six endpoint states with variable burn durations and continuous mass',()=>{
 const known=knownTransfer();
 const options={ephemeris:central,seed:{departure_time_s:known.start,departure_state:known.initial.slice(0,6),departure_dv_m_s:[52,99,-19] as V3,insertion_dv_m_s:[-36,71,14] as V3},arrival_state:known.final.slice(0,6),arrival_time_s:known.end,lander:engine,mass_basis:'nrho' as const,max_delta_v_m_s:500,max_iterations:15};
 const result=solveFiniteTransfer(options);assert.equal(result.status,'TRANSFER VALIDATED',JSON.stringify(result));
 assert.ok(norm(sub(position(result.final_state!),position(known.final)))<.05);assert.ok(norm(sub(velocity(result.final_state!),velocity(known.final)))<1e-5);assert.equal(result.initial_state![6],1800);
 assert.ok(result.burns[0].start_s+result.burns[0].duration_s<result.burns[1].start_s);assert.ok(Math.abs(result.burns[1].start_s+result.burns[1].duration_s-known.end)<1e-7);
 for(let i=1;i<result.samples.length;i++)if(result.samples[i].t===result.samples[i-1].t)assert.deepEqual(result.samples[i].state,result.samples[i-1].state);
 const llo=solveFiniteTransfer({...options,mass_basis:'llo',lander:{...engine,initial_mass_kg:known.final[6]}});assert.equal(llo.status,'TRANSFER VALIDATED',llo.message);assert.ok(Math.abs(llo.final_state![6]-known.final[6])<1e-6);
 const limited=solveFiniteTransfer({...options,max_delta_v_m_s:1});assert.equal(limited.status,'TRANSFER NOT CONVERGED');assert.equal(limited.samples.length,0);
});
test('finite engine rejects overlapping burns and fuel exhaustion without a successful trajectory',()=>{
 const known=knownTransfer(),seed={departure_time_s:known.start,departure_state:known.initial.slice(0,6),departure_dv_m_s:known.v0,insertion_dv_m_s:known.v1};
 const options={ephemeris:central,seed,arrival_state:known.final.slice(0,6),arrival_time_s:known.start+1,lander:engine,mass_basis:'nrho' as const,max_delta_v_m_s:2500,max_iterations:5};
 const overlap=solveFiniteTransfer(options);assert.equal(overlap.status,'TRANSFER NOT CONVERGED');assert.match(overlap.message,/overlap/);assert.equal(overlap.samples.length,0);
 const fuel=solveFiniteTransfer({...options,arrival_time_s:known.end,lander:{...engine,initial_mass_kg:660}});assert.equal(fuel.status,'TRANSFER NOT CONVERGED');assert.match(fuel.message,/propellant/);assert.equal(fuel.samples.length,0);
});
