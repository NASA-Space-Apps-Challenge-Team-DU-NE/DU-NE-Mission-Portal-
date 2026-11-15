import test from 'node:test';
import assert from 'node:assert/strict';
import { loadAssets, DataUnavailable } from '../frontend/src/physics/data';
import { runSimulation, validateConfig } from '../frontend/src/physics/simulator';
import { norm } from '../frontend/src/physics/math';
import type { Config } from '../frontend/src/types';
import { installStaticFetch } from './static-assets';

const config: Config = {
  target: { latitude_deg: -89.4441, longitude_deg: -137.291, landing_time_utc: '2026-11-16T00:00:00Z' },
  lander: { initial_mass_kg: 1500, dry_mass_kg: 650, max_thrust_n: 12000, min_thrust_n: 0, isp_s: 320 },
  orbit: { altitude_km: 100, pdi_altitude_km: 15 },
  constraints: { position_tolerance_m: 100, speed_tolerance_m_s: 2, horizontal_speed_tolerance_m_s: 1 }, objective: 'fuel'
};

test('D/E/F/G/H: complete browser engine validates two 3D landings against NASA terrain', async () => {
  const fake = installStaticFetch();
  try {
    const assets = await loadAssets('/data/');
    for (const target of [config.target, { ...config.target, latitude_deg: -87.9, longitude_deg: 25.1 }]) {
      const input = { ...config, target };
      const result = await runSimulation(input, assets);
      assert.equal(result.status, 'VALIDATED');
      assert.equal(result.summary.landing_success, true);
      assert.equal(result.summary.candidates_attempted, 48);
      for (const check of Object.values(result.validation)) assert.equal(check.passed, true);
      const last = result.trajectory.at(-1)!;
      assert.ok(norm(last.fixed_position_m.map((x, i) => x - result.target!.fixed_position_m![i])) <= input.constraints.position_tolerance_m);
      assert.ok(last.speed_m_s <= input.constraints.speed_tolerance_m_s);
      assert.ok(last.horizontal_speed_m_s <= input.constraints.horizontal_speed_tolerance_m_s);
      assert.ok(last.mass_kg >= input.lander.dry_mass_kg);
      assert.ok(result.trajectory.every(p => p.mass_kg >= input.lander.dry_mass_kg && p.thrust_n <= input.lander.max_thrust_n));
      assert.ok(result.trajectory.every(p => p.altitude_m !== null && p.altitude_m >= -.02));
      assert.deepEqual([...new Set(result.trajectory.map(p => p.phase))], ['CIRCULAR', 'COAST', 'POWERED_DESCENT']);
      assert.ok(result.events!.find(p => p.name === 'DOI')!.delta_v_m_s! > 19);
      assert.ok(Number(result.summary.propellant_consumed_kg) > 600);
      assert.ok(Number(result.summary.remaining_propellant_kg) > 0);
    }
  } finally { fake.restore(); }
});

test('Failure honesty: inadequate thrust and missing DEM cannot produce a validated landing', async () => {
  const fake = installStaticFetch();
  try {
    const assets = await loadAssets('/data/');
    const failure = await runSimulation({ ...config, lander: { ...config.lander, max_thrust_n: 100 } }, assets);
    assert.equal(failure.status, 'INFEASIBLE UNDER ASSUMPTIONS');
    assert.equal(failure.trajectory.length, 0);
    assert.notEqual(failure.summary.landing_success, true);
    await assert.rejects(runSimulation({ ...config, target: { ...config.target, latitude_deg: 0 } }, assets), DataUnavailable);
    await assert.rejects(runSimulation({ ...config, target: { ...config.target, landing_time_utc: '2030-01-01T00:00:00Z' } }, assets), DataUnavailable);
  } finally { fake.restore(); }
});

test('Malformed physical inputs are rejected before optimization', () => {
  assert.throws(() => validateConfig({ ...config, target: { ...config.target, latitude_deg: NaN } }), /finite/i);
  assert.throws(() => validateConfig({ ...config, lander: { ...config.lander, dry_mass_kg: 2000 } }), /mass/i);
  assert.throws(() => validateConfig({ ...config, lander: { ...config.lander, isp_s: 0 } }), /Isp/i);
});
