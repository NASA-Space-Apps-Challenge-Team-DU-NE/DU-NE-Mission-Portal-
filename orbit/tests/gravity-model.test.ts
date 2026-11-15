import test from 'node:test';
import assert from 'node:assert/strict';
import { GrailGravityModel, loadGravityData, paToInertialRotation } from '../frontend/src/physics/gravity/model';
import { Ephemeris, loadEphemeris } from '../frontend/src/physics/ephemeris/data';
import { gravity, gravityJacobian, propagateEphemeris } from '../frontend/src/physics/ephemeris/dynamics';
import { norm, sub, matVec, type V3 } from '../frontend/src/physics/math';
import { installStaticFetch, readJson } from './static-assets';

test('GRAIL static loader rejects missing, same-size corrupted and incompatible convention data without fallback',async()=>{
 const f=installStaticFetch();try{
  const data=await loadGravityData('/data/'),eph=await loadEphemeris('/data/');
  for(const replacement of [{normalization:'unnormalized'},{csphase:-1},{frame:'MOON_ME'},{fixed_frame:'MOON_ME_DE430'},{gm_m3_s2:1},{reference_radius_m:1737400},{pa_to_me_rotation:[-1,0,0,0,1,0,0,0,1]}])assert.throws(()=>new GrailGravityModel({...data,...replacement},eph.frames,30),/GRAVITY_DATA/);
  assert.throws(()=>new GrailGravityModel(data,eph.frames,40),/GRAVITY_DATA/);
  const fetch0=globalThis.fetch;
  globalThis.fetch=async()=>new Response('missing',{status:404});await assert.rejects(loadGravityData('/data/'),/GRAVITY_DATA/);
  globalThis.fetch=async input=>{const response=await fetch0(input);const bytes=new Uint8Array(await response.arrayBuffer());bytes[100]^=1;return new Response(bytes);};
  await assert.rejects(loadGravityData('/data/'),/integrity hash mismatch/);
 }finally{f.restore();}
});

test('GRAIL PA to J2000 matches independent SPICE and preserves same-GM degree-zero acceleration',async()=>{
 const f=installStaticFetch();try{
  const data=await loadGravityData('/data/'),eph=await loadEphemeris('/data/'),fixture=await readJson('data/gravity/reference-fixtures.json');
  for(const row of fixture.frame_validation.golden){
   const R=paToInertialRotation(eph.frames,data.pa_to_me_rotation,(fixture.frame_validation.epoch_et-eph.data.epoch_et)+row.t_s);
   assert.ok(Math.max(...R.map((v,i)=>Math.abs(v-row.pa_to_j2000[i])))<2e-12);
  }
  const model=new GrailGravityModel(data,eph.frames,0),r:V3=[1230000,456000,1270000],t=12345;
  const a=model.evaluate(t,r,true);assert.ok(norm(sub(a.acceleration_m_s2,r.map(v=>-data.gm_m3_s2*v/norm(r)**3) as V3))<1e-12);
 }finally{f.restore();}
});

test('Rotated full GRAIL forces and STM use the same Hessian while retaining Earth/Sun indirect gravity',async()=>{
 const f=installStaticFetch();try{
  const data=await loadGravityData('/data/'),point=await loadEphemeris('/data/'),model=new GrailGravityModel(data,point.frames,30),eph=new Ephemeris(point.data,model),t=123456,r:V3=[1837400,50000,-100000];
  const H=gravityJacobian(t,r,eph),h=2;
  for(let j=0;j<3;j++){const lo=[...r] as V3,hi=[...r] as V3;lo[j]-=h;hi[j]+=h;const a=gravity(t,hi,eph),b=gravity(t,lo,eph);for(let i=0;i<3;i++)assert.ok(Math.abs(H[i][j]-(a[i]-b[i])/(2*h))<2e-14);}
  const initial=[...r,0,Math.sqrt(eph.gm.moon/norm(r)),30],options={collision_radius_m:0,collect_samples:false,rtol:2e-13,atol_position_m:1e-7,atol_velocity_m_s:1e-10,max_step_s:5};
  const base=propagateEphemeris(initial,t,300,eph,{...options,with_stm:true});
  const shifted=[...initial],minus=[...initial];shifted[3]+=.05;minus[3]-=.05;
  const plus=propagateEphemeris(shifted,t,300,eph,options),lower=propagateEphemeris(minus,t,300,eph,options);
  for(let i=0;i<6;i++)assert.ok(Math.abs((plus.final[i]-lower.final[i])/.1-base.stm![i][3])<(i<3?1e-4:1e-6),`STM row ${i}`);
  assert.ok(model.stats.hessian_calls>0);assert.equal(eph.gm.moon,data.gm_m3_s2);assert.equal(point.gm.moon,point.data.gm.moon);
  const R=paToInertialRotation(eph.frames,data.pa_to_me_rotation,t),body:V3=[0,0,-1737400],inertial=matVec(R,body);assert.ok(gravity(t,inertial,eph).every(Number.isFinite));
 }finally{f.restore();}
});
