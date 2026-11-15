import test from 'node:test';
import assert from 'node:assert/strict';
import { Ephemeris, loadEphemeris } from '../frontend/src/physics/ephemeris/data';
import { norm, position, sub } from '../frontend/src/physics/math';
import { installStaticFetch, readJson } from './static-assets';

test('Mode B static states, complete frame transforms and UTC/TDB mapping match independent off-grid SPICE',async()=>{
  const eph=new Ephemeris(await readJson('frontend/public/data/ephemeris/index.json'));
  const validation=await readJson('docs/ephemeris-data-validation.json');
  for(const g of validation.golden_states){
    const actual=eph.at(g.t_s),frame=eph.frames.at(g.t_s);
    assert.ok(norm(sub(position(actual.earth),position(g.earth)))<.05);
    assert.ok(norm(sub(position(actual.sun),position(g.sun)))<.1);
    assert.ok(Math.max(...frame.r.map((v,i)=>Math.abs(v-g.rotation[i])))<1e-10);
    assert.ok(Math.max(...frame.d.map((v,i)=>Math.abs(v-g.derivative[i])))<1e-11);
    // JavaScript dates retain milliseconds; the export's scientific UTC precision is finer.
    assert.ok(Math.abs(eph.time(g.utc)-g.t_s)<.0011);
    const state=[1.7e6,-10000,300000,2,-3,4],rotated=eph.frames.toInertial(state,g.t_s),roundtrip=eph.frames.toFixed(rotated,g.t_s);
    assert.ok(norm(roundtrip.map((v,i)=>v-state[i]))<1e-8);
  }
  assert.throws(()=>eph.time('2030-01-01T00:00:00Z'),/EPHEMERIS COVERAGE/);
  assert.throws(()=>eph.at(-1),/EPHEMERIS COVERAGE/);
  assert.throws(()=>new Ephemeris({...eph.data,samples:[eph.data.samples[1],eph.data.samples[0]]}),/EPHEMERIS DATA/);
});

test('Mode B loads only verified static ephemeris and rejects missing or corrupted files',async()=>{
  const f=installStaticFetch();
  try{
    const eph=await loadEphemeris('/data/');assert.equal(eph.data.reference_seed.epoch_utc,'2026-11-12T00:00:00Z');
    assert.ok([...f.requested].every(p=>p.startsWith('data/')));
    globalThis.fetch=async()=>new Response('missing',{status:404});await assert.rejects(loadEphemeris('/data/'),/EPHEMERIS DATA/);
    globalThis.fetch=async()=>new Response('{}');await assert.rejects(loadEphemeris('/data/'),/integrity/);
  }finally{f.restore();}
});
