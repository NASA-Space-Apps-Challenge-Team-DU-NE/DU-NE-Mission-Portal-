import test from 'node:test';
import assert from 'node:assert/strict';
import { Ephemeris } from '../frontend/src/physics/ephemeris/data';
import { NrhoReference } from '../frontend/src/physics/ephemeris/reference';
import { norm } from '../frontend/src/physics/math';
import { readJson } from './static-assets';

test('direct NRHO departure states match original SPICE at off-grid dates and segment boundaries',async()=>{
  const eph=new Ephemeris(await readJson('frontend/public/data/ephemeris/index.json'));
  const truth=(await readJson('docs/ephemeris-data-validation.json')).nrho_reference;
  assert.ok(truth.golden_states.length>300);
  for(const g of truth.golden_states){
    const earth=eph.reference.state(g.t_s),moon=eph.referenceState(g.t_s);
    assert.ok(norm(earth.slice(0,3).map((v,i)=>v-g.earth_state[i]))<.001,`Earth position at ${g.utc}`);
    assert.ok(norm(earth.slice(3).map((v,i)=>v-g.earth_state[i+3]))<1e-6,`Earth velocity at ${g.utc}`);
    assert.ok(norm(moon.slice(0,3).map((v,i)=>v-g.moon_state[i]))<.05,`Moon position at ${g.utc}`);
    assert.ok(norm(moon.slice(3).map((v,i)=>v-g.moon_state[i+3]))<1e-5,`Moon velocity at ${g.utc}`);
  }
});

test('landing date bounds include November and all of January but padding is not a landing date extension',async()=>{
  const eph=new Ephemeris(await readJson('frontend/public/data/ephemeris/index.json'));
  for(const utc of ['2026-11-01T00:00:00Z','2026-11-16T00:00:00Z','2026-12-02T00:00:00Z','2027-01-01T00:00:00Z','2027-01-31T23:59:59.999Z']) {
    const t=eph.landingTime(utc);
    assert.ok(eph.referenceState(t-3*86400).every(Number.isFinite));
    assert.ok(eph.referenceState(t-15*86400).every(Number.isFinite));
    assert.ok(Math.abs(Date.parse(eph.utc(t))-Date.parse(utc))<=1);
  }
  for(const utc of ['2026-10-31T23:59:59.999Z','2027-02-01T00:00:00Z','invalid'])assert.throws(()=>eph.landingTime(utc),/EPHEMERIS COVERAGE/);
  assert.throws(()=>eph.referenceState(eph.coverage[0]-.001),/REFERENCE COVERAGE/);
  assert.throws(()=>eph.referenceState(eph.coverage[1]+.001),/REFERENCE COVERAGE/);
});

test('source gaps are rejected and shared endpoints retain SPK segment priority',async()=>{
  const eph=new Ephemeris(await readJson('frontend/public/data/ephemeris/index.json')),ref=eph.reference;
  assert.ok(ref.data.gaps_s.length>0);
  for(const [a,b] of ref.data.gaps_s){assert.equal(ref.supports((a+b)/2),false);assert.throws(()=>ref.state((a+b)/2),/REFERENCE GAP/);assert.ok(ref.state(a).every(Number.isFinite));assert.ok(ref.state(b).every(Number.isFinite));}
  for(let i=1;i<ref.data.segments.length;i++){
    const a=ref.data.segments[i-1],b=ref.data.segments[i];
    if(a.end_s===b.start_s)assert.equal(ref.segmentAt(b.start_s).source_priority,Math.max(a.source_priority,b.source_priority));
  }
  const bad=structuredClone(ref.data);bad.segments[0].times_s[1]=bad.segments[0].times_s[0];assert.throws(()=>new NrhoReference(bad),/invalid/);
  const gapless=structuredClone(ref.data);gapless.gaps_s=[];assert.throws(()=>new NrhoReference(gapless),/invalid/);
});
