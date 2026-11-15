import test from 'node:test';
import assert from 'node:assert/strict';
import {lambertSeed} from '../frontend/src/physics/lambert';
import {IntegrationError} from '../frontend/src/physics/errors';
import {propagateEphemeris, type EphemerisForces} from '../frontend/src/physics/ephemeris/dynamics';
import {normalizeNRHOSettings, DEFAULT_NRHO} from '../frontend/src/physics/ephemeris/settings';
import {defaultMission} from '../frontend/src/defaultMission';
import {runEphemerisMission} from '../frontend/src/physics/ephemeris/mission';
import {MU,R_MOON,norm,sub,position} from '../frontend/src/physics/math';
import type {NRHOSettings,Config} from '../frontend/src/types';
import type {Assets} from '../frontend/src/physics/data';
import type {Ephemeris} from '../frontend/src/physics/ephemeris/data';

test('shared Lambert short/long seeds reproduce analytic lunar circular transfers and actual integrated endpoints',()=>{
 const r=R_MOON+100_000,v=Math.sqrt(MU/r),period=2*Math.PI*Math.sqrt(r**3/MU);
 const forces:EphemerisForces={gm:{moon:MU,earth:0,sun:0},coverage:[0,period],at:()=>({earth:[384e6,0,0,0,0,0],sun:[1.5e11,0,0,0,0,0]})};
 for(const [fraction,longWay,direction] of [[.25,false,1],[.75,true,-1]] as const){
  const seed=lambertSeed([r,0,0],[0,r,0],period*fraction,MU,longWay);
  assert.ok(norm(sub(seed,[0,direction*v,0]))<1e-8);
  const actual=propagateEphemeris([r,0,0,...seed],0,period*fraction,forces,{rtol:2e-12,atol_position_m:1e-5,atol_velocity_m_s:1e-8});
  assert.ok(norm(sub(position(actual.final),[0,r,0]))<.003);
 }
 assert.throws(()=>lambertSeed([r,0,0],[-r,0,0],1000,MU),IntegrationError);
});

test('NRHO settings select only dated Mode B and discard unused phase inputs without mutating the request',async()=>{
 assert.equal(normalizeNRHOSettings().mode,'b');
 assert.equal(normalizeNRHOSettings().gravity_model,'point_mass');
 const legacy={...defaultMission().nrho!,reference_id:'old-unselected-reference',departure_phase_mode:'manual',departure_phase:.7};
 const before=structuredClone(legacy),clean=normalizeNRHOSettings(legacy);
 assert.deepEqual(clean,defaultMission().nrho);assert.deepEqual(legacy,before);
 for(const mode of ['a','unknown',null]){
  assert.throws(()=>normalizeNRHOSettings({...DEFAULT_NRHO,mode} as unknown as NRHOSettings),/UNSUPPORTED MISSION MODEL/);
  const input={...defaultMission(),nrho:{...defaultMission().nrho!,mode}} as unknown as Config;
  await assert.rejects(runEphemerisMission(input,undefined as unknown as Assets,undefined as unknown as Ephemeris),/UNSUPPORTED MISSION MODEL/);
 }
});
