import test from 'node:test';
import assert from 'node:assert/strict';
import { Frames, loadAssets, surfacePosition } from '../frontend/src/physics/data';
import { norm } from '../frontend/src/physics/math';
import { installStaticFetch, readJson } from './static-assets';

test('C/E: interpolated SPICE states match independent sxform references including velocity', async () => {
  const data = await readJson('frontend/public/data/frames.json');
  const refs = await readJson('docs/spice-reference-cases.json');
  const frames = new Frames(data);
  assert.equal(data.fixed_frame, 'MOON_ME');
  assert.equal(data.resolved_frame, 'MOON_ME_DE440_ME421');
  assert.ok(refs.spice.length >= 4);
  for (const sample of refs.spice) {
    const t = frames.time(sample.utc);
    const inertial = frames.toInertial(sample.fixed_state, t);
    const recovered = frames.toFixed(inertial, t);
    const error = inertial.map((x, i) => x - sample.inertial_state[i]);
    assert.ok(norm(error.slice(0, 3)) < .02, `SPICE position difference ${norm(error.slice(0, 3))}`);
    assert.ok(norm(error.slice(3)) < 1e-5, `SPICE velocity difference ${norm(error.slice(3))}`);
    assert.ok(norm(recovered.map((x, i) => x - sample.fixed_state[i])) < 1e-8);
  }
  const t = frames.time(refs.spice[0].utc);
  const equatorFixed = [...surfacePosition(0, 0, 0), 0, 0, 0];
  const equatorInertial = frames.toInertial(equatorFixed, t);
  // A stationary surface point is not stationary in the inertial frame.
  assert.ok(norm(equatorInertial.slice(3)) > 4);
  assert.ok(norm(frames.toFixed(equatorInertial, t).slice(3)) < 1e-9);
  assert.throws(() => frames.at(data.samples[0].t_s - 1), /cover/i);
  assert.throws(() => frames.at(data.samples.at(-1).t_s + 1), /cover/i);
});

test('G: lazy LOLA tiles reproduce independent native PDS samples with correct polar registration', async () => {
  const fake = installStaticFetch();
  try {
    const assets = await loadAssets('/data/');
    const refs = await readJson('docs/spice-reference-cases.json');
    assert.ok(refs.terrain.length >= 4);
    await assets.terrain.prepare(refs.terrain.map(p => [p.latitude_deg, p.longitude_deg]));
    for (const p of refs.terrain) {
      const value = assets.terrain.elevation(p.latitude_deg, p.longitude_deg);
      if (p.elevation_m === null) {
        assert.equal(assets.terrain.pixel(p.latitude_deg, p.longitude_deg), null);
        assert.notEqual(value.source, 'LOLA_240M');
        continue;
      }
      assert.equal(value.source, 'LOLA_240M');
      assert.ok(value.height !== null);
      assert.ok(Math.abs(value.height! - p.elevation_m) < 1e-6, `height mismatch at ${p.latitude_deg}, ${p.longitude_deg}`);
    }
    const requests = [...fake.requested];
    assert.ok(!requests.some(p => p.endsWith('.img') || p.endsWith('.bsp') || p.endsWith('.bpc')));
    assert.ok(requests.filter(p => p.endsWith('.bin')).length < 40, 'bounded ROI loads; no full DEM request');
    assert.equal(assets.terrain.pixel(0, 0), null);
  } finally { fake.restore(); }
});
