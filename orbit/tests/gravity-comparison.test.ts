import test from 'node:test';
import assert from 'node:assert/strict';
import { gravityComparisonKey, gravityComparisonRecord, gravitySelectionId } from '../frontend/src/services/gravityComparison';
import type { Config, SimulationResult } from '../frontend/src/types';

const config: Config = {
  initial_orbit: 'nrho',
  nrho: { mode: 'b', gravity_model: 'grail', gravity_degree: 30, transfer_tof_min_days: .3, transfer_tof_max_days: 3, max_transfer_delta_v_m_s: 2500, parking_revolutions: 0, objective: 'delta_v', max_iterations: 20, max_computation_seconds: 60, mass_basis: 'llo' },
  target: { latitude_deg: -89.44, longitude_deg: -137.29, landing_time_utc: '2026-11-16T00:00:00Z' },
  lander: { initial_mass_kg: 1500, dry_mass_kg: 650, max_thrust_n: 12000, min_thrust_n: 0, isp_s: 320 },
  orbit: { altitude_km: 100, pdi_altitude_km: 15 },
  constraints: { position_tolerance_m: 100, speed_tolerance_m_s: 2, horizontal_speed_tolerance_m_s: 1 }, objective: 'fuel',
};
const result: SimulationResult = {
  status: 'VALIDATED', trajectory: [], summary: { total_delta_v_m_s: 1234, propellant_consumed_kg: 700, landing_position_error_m: .2, touchdown_speed_m_s: .5 }, validation: {},
  nrho: { mode: 'EPHEMERIS', source: { reference_id: 'seed', api_url: 'test', signature_version: '1' }, mass_basis: 'llo', reference_path_fixed_m: [], system: { earth_position_fixed_m: [0,0,0], earth_radius_m: 1 }, gravity: { model: 'grail', degree: 30, gm_m3_s2: 4902800306330.2, frame: 'MOON_PA_DE440' } },
};

test('Gravity comparisons match all non-gravity mission settings regardless of object key order', () => {
  const baseline = { ...config, nrho: { ...config.nrho!, gravity_model: 'point_mass' as const, gravity_degree: 90 as const } };
  assert.equal(gravityComparisonKey(config), gravityComparisonKey(baseline));
  assert.equal(gravityComparisonKey(config), gravityComparisonKey({ ...config, target: { landing_time_utc: config.target.landing_time_utc, longitude_deg: config.target.longitude_deg, latitude_deg: config.target.latitude_deg } }));
  for (const changed of [
    { ...config, target: { ...config.target, landing_time_utc: '2026-11-17T00:00:00Z' } },
    { ...config, lander: { ...config.lander, initial_mass_kg: 1600 } },
    { ...config, nrho: { ...config.nrho!, max_computation_seconds: 300 } },
    { ...config, constraints: { ...config.constraints, position_tolerance_m: 10 } },
  ]) assert.notEqual(gravityComparisonKey(config), gravityComparisonKey(changed));
  assert.equal(gravityComparisonKey({ ...config, initial_orbit: 'llo' }), null);
});

test('Only validated results of the requested gravity model enter comparison history', () => {
  assert.equal(gravityComparisonRecord(config, { ...result, status: 'NOT CONVERGED' }, 400), null);
  assert.equal(gravityComparisonRecord(config, { ...result, nrho: { ...result.nrho!, gravity: undefined } }, 400), null);
  assert.equal(gravityComparisonRecord({ ...config, nrho: { ...config.nrho!, gravity_degree: 60 } }, result, 400), null);
  assert.equal(gravityComparisonRecord(config, result, Infinity), null);
  const record = gravityComparisonRecord(config, result, 400)!;
  assert.equal(record.label, 'GRAIL 30차');
  assert.equal(record.totalDeltaV, 1234);
  assert.equal(record.elapsedMs, 400);
  assert.ok(!('trajectory' in record));
});

test('Missing gravity setting is the legacy point-mass selection and retired models are unsupported', () => {
  assert.equal(gravitySelectionId({ ...config, nrho: { ...config.nrho!, gravity_model: undefined } }), 'point_mass:0');
  assert.equal(gravitySelectionId({ ...config, nrho: { ...config.nrho!, mode: 'a' } } as unknown as Config), 'unsupported');
});
