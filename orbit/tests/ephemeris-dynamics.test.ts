import test from 'node:test';
import assert from 'node:assert/strict';
import { gravity, gravityJacobian, propagateEphemeris, type EphemerisForces } from '../frontend/src/physics/ephemeris/dynamics';
import { solveEphemerisTransfer } from '../frontend/src/physics/ephemeris/transfer';
import { G0, MU, norm, position, R_MOON, sub, type V3 } from '../frontend/src/physics/math';
import { Ephemeris } from '../frontend/src/physics/ephemeris/data';
import { readJson } from './static-assets';

const central: EphemerisForces = { gm: { moon: MU, earth: 0, sun: 0 }, coverage: [-2e6, 2e6],
  at: () => ({ earth: [384_000_000, 0, 0, 0, 0, 0], sun: [1.5e11, 0, 0, 0, 0, 0] }) };
const dated: EphemerisForces = { ...central, gm: { moon: MU, earth: 3.986004355e14, sun: 1.32712440018e20 },
  at(t) { const a = t / 100_000, s = t / 500_000; return {
    earth: [384e6 * Math.cos(a), 384e6 * Math.sin(a), 2e7, -3840 * Math.sin(a), 3840 * Math.cos(a), 0],
    sun: [1.5e11 * Math.cos(s), 1.5e11 * Math.sin(s), -1e10, -3e5 * Math.sin(s), 3e5 * Math.cos(s), 0] }; } };

test('Mode B force uses third-body tides and geometric stage time, not absolute Earth acceleration', () => {
  const r: V3 = [1000, 0, 0], tide: EphemerisForces = { ...central, gm: { moon: 0, earth: 3.986004355e14, sun: 0 },
    at: () => ({ earth: [1e9, 0, 0, 0, 0, 0], sun: [1.5e11, 0, 0, 0, 0, 0] }) };
  const actual = gravity(0, r, tide), linearTide = 2 * tide.gm.earth * r[0] / 1e27;
  assert.ok(Math.abs(actual[0] / linearTide - 1) < 2e-6);
  assert.equal(actual[1], 0); assert.equal(actual[2], 0);
  const far: V3 = [5e7, 2e7, -1e7];
  assert.ok(norm(sub(gravity(0, far, dated), gravity(50_000, far, dated))) > 1e-5);
});

test('Mode B adaptive propagation reproduces an analytic circular orbit, backwards state, and rocket mass', () => {
  const radius = R_MOON + 100_000, speed = Math.sqrt(MU / radius), period = 2 * Math.PI * Math.sqrt(radius ** 3 / MU);
  const initial = [radius, 0, 0, 0, speed, 0];
  const p = propagateEphemeris(initial, 1234, period, central, { rtol: 2e-12, atol_position_m: 1e-5, atol_velocity_m_s: 1e-8 });
  assert.ok(norm(sub(position(p.final), position(initial))) < .003);
  assert.equal(p.samples[0].t, 1234); assert.equal(p.samples.at(-1)!.t, 1234 + period);
  const back = propagateEphemeris(p.final, 1234 + period, -period, central, { rtol: 2e-12, atol_position_m: 1e-5, atol_velocity_m_s: 1e-8 });
  assert.ok(norm(sub(position(back.final), position(initial))) < .005);
  const burn = propagateEphemeris([...initial, 1500], 0, 50, dated, { acceleration_m_s2: [.1, -.2, .3], isp_s: 320, max_step_s: 1 });
  assert.ok(Math.abs(burn.final[6] - 1500 * Math.exp(-Math.sqrt(.14) * 50 / (320 * G0))) < 1e-8);
});

test('Mode B integrated STM agrees with finite perturbations of time-dependent propagation', () => {
  const initial = [8e6, 2e6, -1e6, -100, 800, 20], start = 40_000, duration = 4000;
  const p = propagateEphemeris(initial, start, duration, dated, { with_stm: true, rtol: 1e-12 });
  for (let j = 3; j < 6; j++) {
    const plus = [...initial], minus = [...initial], h = .01; plus[j] += h; minus[j] -= h;
    const a = propagateEphemeris(plus, start, duration, dated, { rtol: 1e-12 });
    const b = propagateEphemeris(minus, start, duration, dated, { rtol: 1e-12 });
    for (let i = 0; i < 3; i++) assert.ok(Math.abs((a.final[i] - b.final[i]) / (2 * h) - p.stm![i][j]) < .003);
  }
  const jac = gravityJacobian(start, position(initial), dated);
  for (let j = 0; j < 3; j++) {
    const plus = position(initial), minus = position(initial); plus[j] += 1; minus[j] -= 1;
    const a = gravity(start, plus, dated), b = gravity(start, minus, dated);
    for (let i = 0; i < 3; i++) assert.ok(Math.abs((a[i] - b[i]) / 2 - jac[i][j]) < 1e-15);
  }
});

test('Mode B dated targeting returns only refined actual trajectories and respects DV/time/cancel failure', async () => {
  const initial = [6e6, 0, 0, 0, Math.sqrt(MU / 6e6), 0], start = 10_000, duration = 3600;
  const target = propagateEphemeris(initial, start, duration, dated, { rtol: 4e-13, atol_position_m: 1e-6, atol_velocity_m_s: 1e-9, max_step_s: 50 }).final;
  const departure = [...initial]; departure[4] -= 20;
  const options = { ephemeris: dated, departureState: () => departure, arrival_state: target, arrival_time_s: start + duration,
    tof_days: [duration / 86400, duration / 86400] as [number, number], max_delta_v_m_s: 100, max_iterations: 12, objective: 'delta_v' as const };
  const result = await solveEphemerisTransfer(options);
  assert.equal(result.status, 'TRANSFER VALIDATED', JSON.stringify(result.candidates));
  assert.ok(Math.abs(result.total_delta_v_m_s! - 20) < .001);
  assert.ok(Number(result.validation.position_error_m) < .05);
  assert.equal(result.departure_time_s, start); assert.equal(result.arrival_time_s, start + duration);
  assert.deepEqual(result.samples.at(-1)!.state, result.pre_insertion_state);
  assert.equal(result.validation.position_was_reset, false);
  const independent = propagateEphemeris(result.post_departure_state!, start, duration, dated, { rtol: 4e-13, atol_position_m: 1e-6, atol_velocity_m_s: 1e-9, max_step_s: 25 });
  assert.ok(norm(sub(position(independent.final), position(target))) < .05);
  const limited = await solveEphemerisTransfer({ ...options, max_delta_v_m_s: 1 });
  assert.equal(limited.status, 'TRANSFER NOT CONVERGED'); assert.equal(limited.samples.length, 0);
  const timeout = await solveEphemerisTransfer({ ...options, deadline_ms: performance.now() - 1 });
  assert.equal(timeout.status, 'TRANSFER NOT CONVERGED'); assert.equal(timeout.timed_out, true); assert.equal(timeout.samples.length, 0);
  const cancelled = await solveEphemerisTransfer({ ...options, is_cancelled: () => true });
  assert.equal(cancelled.status, 'TRANSFER CANCELLED'); assert.equal(cancelled.samples.length, 0);
});

test('Mode B rejects uncovered intervals, initial collisions, and invalid states before returning a path', () => {
  const initial = [R_MOON + 100_000, 0, 0, 0, 1600, 0];
  assert.throws(() => propagateEphemeris(initial, 2e6, 1, central), /cover/);
  assert.throws(() => propagateEphemeris([R_MOON, 0, 0, 0, 1600, 0], 0, 1, central), /collision/);
  assert.throws(() => propagateEphemeris([...initial, -1], 0, 1, central), /mass/);
  assert.throws(() => propagateEphemeris([NaN, ...initial.slice(1)], 0, 1, central), /finite/);
});

test('Mode B browser dynamics match independent direct-SPICE DOP853 reference states over ±1, ±3 and ±7 days', async () => {
  const data = await readJson('frontend/public/data/ephemeris/index.json'), validation = await readJson('docs/ephemeris-data-validation.json');
  const eph = new Ephemeris(data), seed = data.reference_seed;
  for (const expected of validation.golden_propagation) {
    const actual = propagateEphemeris(seed.state, seed.epoch_t_s, expected.duration_s, eph,
      { rtol: 8e-13, atol_position_m: 1e-5, atol_velocity_m_s: 1e-8, max_step_s: 180, collect_samples: false });
    const dp = norm(sub(position(actual.final), position(expected.state)));
    const dv = norm(actual.final.slice(3, 6).map((v, i) => v - expected.state[i + 3]));
    assert.ok(dp < .2, `${expected.duration_s / 86400}d position difference: ${dp} m`);
    assert.ok(dv < 5e-5, `${expected.duration_s / 86400}d velocity difference: ${dv} m/s`);
  }
});
