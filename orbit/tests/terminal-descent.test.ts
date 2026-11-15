import test from 'node:test';
import assert from 'node:assert/strict';
import type { Config, Sample, Vec3 } from '../frontend/src/types';
import { validateTerminalDescent, contactPoint } from '../frontend/src/physics/ephemeris/terminalDescent';
import { gravity, norm, position, scale, dot, unit, rk4, R_MOON, type State } from '../frontend/src/physics/math';
import { landingStep } from '../frontend/src/physics/ephemeris/landing';
import { loadAssets, latLon } from '../frontend/src/physics/data';
import { Ephemeris, loadEphemeris } from '../frontend/src/physics/ephemeris/data';
import { GrailGravityModel, loadGravityData } from '../frontend/src/physics/gravity/model';
import { installStaticFetch, readJson } from './static-assets';
const limits:Config['constraints']={position_tolerance_m:100,speed_tolerance_m_s:2,horizontal_speed_tolerance_m_s:1};
// Real point-mass ODE integration: vertical 0.5 m/s descent, gravity-compensating
// thrust, 101 m support-point clearance to contact. This is a validator fixture,
// not an NRHO mission or an alternative path fabricated for display.
function verticalDescent():Sample[]{
  let y:State=[R_MOON+103,0,0,-.5,0,0,1500];const points:Sample[]=[];
  for(let i=0;i<=808;i++){
    const a=scale(gravity([y[0]-.0625,0,0]),-1);
    points.push({time_s:i*.25,phase:'POWERED_DESCENT',position_m:position(y),velocity_m_s:[y[3],0,0],fixed_position_m:position(y),altitude_m:y[0]-R_MOON,speed_m_s:Math.abs(y[3]),horizontal_speed_m_s:0,vertical_speed_m_s:y[3],mass_kg:y[6],thrust_n:y[6]*norm(a),thrust_tilt_deg:0,distance_to_target_m:Math.abs(y[0]-R_MOON-2)});
    if(i<808)y=rk4(y,.25,a,320);
  }
  return points;
}
const safe=verticalDescent();
test('ODE-integrated upright terminal descent passes with COM above the surface and decreasing mass',()=>{
  const result=validateTerminalDescent(safe,limits);assert.equal(result.passed,true,JSON.stringify(result.checks));
  assert.ok(Math.abs(safe.at(-1)!.altitude_m!-2)<1e-4);assert.ok(safe.at(-1)!.mass_kg<safe[0].mass_kg);
  assert.ok(Math.abs(norm(contactPoint(safe.at(-1)!.fixed_position_m))-R_MOON)<1e-4);
});
test('endpoint success cannot hide a low-altitude horizontal or vertical speed excursion',()=>{
  for(const key of ['horizontal_speed_m_s','vertical_speed_m_s'] as const){
    const points=structuredClone(safe);points[780][key]=key==='horizontal_speed_m_s'?11.66:-3;
    const r=validateTerminalDescent(points,limits);assert.equal(r.passed,false);assert.equal(r.checks.low_altitude_speed.passed,false);
    assert.ok(r.checks.low_altitude_speed.violations.length>0);assert.equal(r.checks.contact.passed,true);
  }
});
test('both sides of a zero-time control boundary must pass the thrust-tilt limit',()=>{
  const points=structuredClone(safe);points.splice(780,0,{...points[780],thrust_tilt_deg:70.8});
  const r=validateTerminalDescent(points,limits);assert.equal(r.checks.thrust_tilt.passed,false);assert.equal(r.checks.contact.passed,true);
  assert.ok(r.checks.thrust_tilt.violations.some(v=>v.actual===70.8));
});
test('all three altitude boundaries are inclusive and limits cannot be relaxed by large endpoint tolerances',()=>{
  for(const [h,speed,tilt] of [[1000,50,45],[100,5,15],[10,.5,5]]){
    const points=structuredClone(safe);points[100]={...points[100],altitude_m:h+2,horizontal_speed_m_s:speed+.01,thrust_tilt_deg:tilt+.01};
    const r=validateTerminalDescent(points,{position_tolerance_m:1e6,speed_tolerance_m_s:1e6,horizontal_speed_tolerance_m_s:1e6});
    assert.equal(r.checks.low_altitude_speed.passed,false);assert.equal(r.checks.thrust_tilt.passed,false);
    assert.ok(r.checks.low_altitude_speed.violations.some(v=>v.rule===`horizontal_below_${h}m`));
  }
});
test('early contact or penetration followed by an acceptable endpoint is rejected',()=>{
  for(const altitude of [2,1.5]){
    const points=structuredClone(safe);points[500].altitude_m=altitude;
    const r=validateTerminalDescent(points,limits);assert.equal(r.checks.contact.passed,false);assert.ok(r.checks.contact.premature_contact_samples>0);
  }
});
test('upward motion and missing, sparse or non-finite inspection data fail closed',()=>{
  const up=structuredClone(safe);up[400].vertical_speed_m_s=.1;assert.equal(validateTerminalDescent(up,limits).checks.terminal_descent.passed,false);
  const missing=structuredClone(safe);missing[400].altitude_m=null;assert.equal(validateTerminalDescent(missing,limits).passed,false);
  const nan=structuredClone(safe);nan[400].thrust_tilt_deg=NaN;assert.equal(validateTerminalDescent(nan,limits).passed,false);
  const reversed=structuredClone(safe);reversed[400].time_s=-1;assert.equal(validateTerminalDescent(reversed,limits).passed,false);
  assert.equal(validateTerminalDescent(safe.filter((_,i)=>i%4===0),limits).passed,false);
  assert.equal(validateTerminalDescent([],limits).passed,false);
  assert.equal(validateTerminalDescent([safe.at(-1)!],limits).passed,false);
});
test('zero/unknown thrust direction, final ascent and stricter user contact limits are rejected',()=>{
  for(const change of [{thrust_tilt_deg:null},{thrust_n:0},{thrust_tilt_deg:undefined},{vertical_speed_m_s:.01}]){
    const points=structuredClone(safe);Object.assign(points.at(-1)!,change);assert.equal(validateTerminalDescent(points,limits).passed,false);
  }
  assert.equal(validateTerminalDescent(safe,{...limits,speed_tolerance_m_s:.1}).checks.contact.passed,false);
});
test('historical GRAIL success replay is now rejected for the observed dangerous approach, not just missing data',async()=>{
  const fetch=installStaticFetch();try{
    const legacy=await readJson('tests/fixtures/unsafe-terminal-grail30.json');
    let eph=await loadEphemeris('/data/');eph=new Ephemeris(eph.data,new GrailGravityModel(await loadGravityData('/data/'),eph.frames,30));
    const assets=await loadAssets('/data/'),states:Array<{t:number;y:State;a:Vec3}>=[];
    let y=legacy.pdi as State;
    for(const c of legacy.controls){
      const start=(legacy.epoch_et-eph.data.epoch_et)+legacy.start_et_offset_s+c.start_s,n=Math.ceil(c.duration_s/.25),h=c.duration_s/n;
      states.push({t:start,y:[...y],a:c.acceleration_m_s2});
      for(let i=0;i<n;i++){y=landingStep(y,start+i*h,h,c.acceleration_m_s2,eph,legacy.input.lander.isp_s);states.push({t:start+(i+1)*h,y:[...y],a:c.acceleration_m_s2});}
    }
    const fixed=states.map(p=>eph.frames.toFixed(p.y,p.t)),coords=fixed.map(p=>latLon(position(p)));await assets.terrain.prepare(coords);
    const samples=states.map((p,i):Sample=>{
      const fp=position(fixed[i]),v=fixed[i].slice(3,6) as Vec3,vertical=dot(v,unit(fp)),e=assets.terrain.elevation(...coords[i]);
      return {time_s:p.t,phase:'POWERED_DESCENT',position_m:position(p.y),velocity_m_s:p.y.slice(3,6) as Vec3,fixed_position_m:fp,altitude_m:e.height===null?null:norm(fp)-R_MOON-e.height,speed_m_s:norm(v),horizontal_speed_m_s:Math.sqrt(Math.max(0,dot(v,v)-vertical**2)),vertical_speed_m_s:vertical,mass_kg:p.y[6],thrust_n:p.y[6]*norm(p.a),thrust_tilt_deg:Math.acos(Math.max(-1,Math.min(1,dot(unit(p.a),unit(position(p.y))))))*180/Math.PI,distance_to_target_m:0};
    });
    const r=validateTerminalDescent(samples,limits),last=samples.at(-1)!;
    assert.equal(r.passed,false);assert.equal(r.checks.low_altitude_speed.passed,false);assert.equal(r.checks.thrust_tilt.passed,false);assert.equal(r.checks.contact.passed,false);
    assert.equal(r.checks.terminal_descent.invalid_samples,0);assert.ok(r.checks.terminal_descent.maximum_sample_interval_s<=.250001);
    assert.ok(Math.abs(last.thrust_tilt_deg!-70.8045)<.01);assert.ok(Math.abs(last.speed_m_s-.5)<.001);
    assert.ok(r.checks.low_altitude_speed.violation_count>0);assert.ok(r.checks.contact.penetration_samples>0);
  }finally{fetch.restore();}
});
