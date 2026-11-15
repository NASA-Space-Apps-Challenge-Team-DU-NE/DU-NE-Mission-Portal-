import type { Lander } from '../../types';
import { G0, norm, position, R_MOON, scale, solveLinear, sub, velocity, type State, type V3 } from '../math';
import { CalculationCancelled, CalculationTimeout, IntegrationError } from '../errors';
import { gravity, propagateEphemeris, type EphemerisForces, type EphemerisPropagationOptions, type EphemerisSample } from './dynamics';

export interface FiniteBurn {
  name: 'NRHO_DEPARTURE' | 'LLO_INSERTION' | 'DOI';
  start_s: number;
  duration_s: number;
  thrust_vector_n: V3;
  thrust_n: number;
  delta_v_m_s: number;
  propellant_kg: number;
  initial_state: State;
  final_state: State;
}
export interface FiniteTransferSeed {
  departure_time_s: number;
  departure_state: number[];
  departure_dv_m_s: V3;
  insertion_dv_m_s: V3;
}
export interface FiniteTransferOptions {
  ephemeris: EphemerisForces;
  seed: FiniteTransferSeed;
  arrival_state: number[];
  arrival_time_s: number;
  lander: Lander;
  mass_basis: 'llo' | 'nrho';
  max_delta_v_m_s: number;
  max_iterations: number;
  deadline_ms?: number;
  is_cancelled?: () => boolean;
}
export interface FiniteSample extends EphemerisSample { phase: string; thrust_n: number }
export interface FiniteTransferResult {
  status: 'TRANSFER VALIDATED' | 'TRANSFER NOT CONVERGED';
  message: string;
  departure_time_s: number;
  arrival_time_s: number;
  tof_s: number;
  iterations: number;
  total_delta_v_m_s: number;
  initial_state?: State;
  final_state?: State;
  burns: FiniteBurn[];
  samples: FiniteSample[];
  validation: Record<string, unknown> & { passed: boolean };
}

/** Characteristic velocity parameterizes burn duration; velocity is never jumped.
 * T is held at the configured maximum, inertial direction is fixed per burn.
 * The ODE integrates r, v and m with a=g+T/m and m'=-|T|/(Isp*g0). */
export function burnDuration(initialMass: number, deltaV: number, thrust: number, isp: number): number {
  if (![initialMass, deltaV, thrust, isp].every(Number.isFinite) || initialMass <= 0 || deltaV < 0 || thrust <= 0 || isp <= 0) throw new IntegrationError('Invalid finite-burn mass, delta-V, thrust or Isp.');
  return -initialMass * Math.expm1(-deltaV / (isp * G0)) * isp * G0 / thrust;
}

export function propagateBurn(initial: State, start: number, vector: V3, engine: Lander, eph: EphemerisForces,
  options: EphemerisPropagationOptions = {}, name: FiniteBurn['name'] = 'DOI') {
  const dv = norm(vector), duration = burnDuration(initial[6], dv, engine.max_thrust_n, engine.isp_s);
  const expectedMass = initial[6] * Math.exp(-dv / (engine.isp_s * G0));
  if (engine.min_thrust_n > engine.max_thrust_n || expectedMass < engine.dry_mass_kg) throw new IntegrationError('Finite burn exceeds engine or available propellant limits.');
  const force: V3 = dv > 0 ? scale(vector, engine.max_thrust_n / dv) : [0, 0, 0];
  const propagation = propagateEphemeris(initial, start, duration, eph, {
    ...options, acceleration_m_s2: undefined, thrust_n: force, isp_s: engine.isp_s,
    max_step_s: Math.min(options.max_step_s ?? 2, 2),
  });
  const final = propagation.final as State;
  const burn: FiniteBurn = { name, start_s: start, duration_s: duration, thrust_vector_n: force,
    thrust_n: dv > 0 ? engine.max_thrust_n : 0, delta_v_m_s: dv,
    propellant_kg: initial[6] - final[6], initial_state: [...initial], final_state: [...final] };
  return { ...propagation, burn };
}

/** Six-parameter finite-burn targeting. The long coast is differentiated with its
 * STM including moving start/end times. Short burns are centrally differenced,
 * including mass and duration changes. No endpoint state is replaced by a target. */
export function solveFiniteTransfer(o: FiniteTransferOptions): FiniteTransferResult {
  const { ephemeris: eph, seed, lander, arrival_state: target, arrival_time_s: arrival } = o;
  const departure = seed.departure_time_s, tof = arrival - departure, ve = lander.isp_s * G0;
  const base = { departure_time_s: departure, arrival_time_s: arrival, tof_s: tof };
  const failed = (message: string, iterations = 0, dv = Infinity): FiniteTransferResult => ({ ...base,
    status: 'TRANSFER NOT CONVERGED', message, iterations, total_delta_v_m_s: dv, burns: [], samples: [], validation: { passed: false } });
  if (target.length !== 6 || target.some(x => !Number.isFinite(x)) || !(tof > 0)) return failed('Finite-burn targeting requires a finite six-state target and positive flight time.');
  const check = () => {
    if (o.is_cancelled?.()) throw new CalculationCancelled();
    if (o.deadline_ms !== undefined && performance.now() >= o.deadline_ms) throw new CalculationTimeout();
  };
  const options: EphemerisPropagationOptions = { rtol: 2e-11, atol_position_m: 1e-4, atol_velocity_m_s: 1e-7,
    max_step_s: 600, collision_radius_m: R_MOON + 12_000, collect_samples: false, deadline_ms: o.deadline_ms, is_cancelled: o.is_cancelled };
  const schedule = (q: number[]) => {
    const v0 = q.slice(0, 3) as V3, v1 = q.slice(3, 6) as V3, d0 = norm(v0), d1 = norm(v1);
    const m0 = o.mass_basis === 'llo' ? lander.initial_mass_kg * Math.exp((d0 + d1) / ve) : lander.initial_mass_kg;
    const m1 = m0 * Math.exp(-d0 / ve), mf = m1 * Math.exp(-d1 / ve);
    if (![m0, m1, mf].every(Number.isFinite) || mf < lander.dry_mass_kg) throw new IntegrationError('Finite transfer consumes the available propellant.');
    const t0 = burnDuration(m0, d0, lander.max_thrust_n, lander.isp_s), t1 = burnDuration(m1, d1, lander.max_thrust_n, lander.isp_s);
    if (t0 + t1 >= tof) throw new IntegrationError('Finite departure and insertion burns overlap; insufficient flight time.');
    return { v0, v1, d0, d1, m0, m1, mf, a: departure + t0, b: arrival - t1 };
  };
  const begin = (q: number[], opts = options) => {
    const s = schedule(q), initial = [...seed.departure_state.slice(0, 6), s.m0] as State;
    return { s, initial, arc: propagateBurn(initial, departure, s.v0, lander, eph, opts, 'NRHO_DEPARTURE') };
  };
  const evaluate = (q: number[], stm: boolean, opts = options) => {
    check();
    const first = begin(q, opts), { s } = first;
    const coast = propagateEphemeris(first.arc.final, s.a, s.b - s.a, eph, { ...opts, with_stm: stm });
    const last = propagateBurn(coast.final as State, s.b, s.v1, lander, eph, opts, 'LLO_INSERTION');
    const residual = last.final.slice(0, 6).map((x, i) => (x - target[i]) / (i < 3 ? 1000 : 1));
    return { ...first, coast, last, residual, error: norm(residual) };
  };
  let q = [...seed.departure_dv_m_s, ...seed.insertion_dv_m_s], iterations = 0;
  try {
    let current = evaluate(q, true);
    for (; iterations < o.max_iterations; iterations++) {
      const dp = norm(sub(position(current.last.final), position(target))), dv = norm(sub(velocity(current.last.final), velocity(target)));
      if (dp < .002 && dv < 2e-6) break;
      const fa = [...velocity(current.arc.final), ...gravity(current.s.a, position(current.arc.final), eph)];
      const fb = [...velocity(current.coast.final), ...gravity(current.s.b, position(current.coast.final), eph)];
      const jac = Array.from({ length: 6 }, () => Array(6).fill(0)), h = .01;
      for (let j = 0; j < 6; j++) {
        check();
        const qp = [...q], qm = [...q]; qp[j] += h; qm[j] -= h;
        const p = begin(qp), m = begin(qm), da = (p.s.a - m.s.a) / (2 * h), db = (p.s.b - m.s.b) / (2 * h);
        const dy = p.arc.final.slice(0, 6).map((x, i) => (x - m.arc.final[i]) / (2 * h) - fa[i] * da);
        const derivative = current.coast.stm!.map((row, i) => row.reduce((sum, a, k) => sum + a * dy[k], 0) + fb[i] * db);
        const incoming = (sign: number, mass: number) => [...current.coast.final.slice(0, 6).map((x, i) => x + sign * h * derivative[i]), mass] as State;
        const plus = propagateBurn(incoming(1, p.s.m1), p.s.b, p.s.v1, lander, eph, options, 'LLO_INSERTION');
        const minus = propagateBurn(incoming(-1, m.s.m1), m.s.b, m.s.v1, lander, eph, options, 'LLO_INSERTION');
        for (let i = 0; i < 6; i++) jac[i][j] = (plus.final[i] - minus.final[i]) / (2 * h * (i < 3 ? 1000 : 1));
      }
      let correction = solveLinear(jac, current.residual.map(x => -x));
      const magnitude = norm(correction); if (magnitude > 500) correction = correction.map(x => x * 500 / magnitude);
      let accepted = false;
      for (const alpha of [1, .5, .25, .125, .0625]) {
        const trial = q.map((x, i) => x + alpha * correction[i]);
        try {
          const next = evaluate(trial, false);
          if (next.error < current.error) { q = trial; current = evaluate(q, true); accepted = true; break; }
        } catch (e) { if (e instanceof CalculationTimeout || e instanceof CalculationCancelled || /GRAVITY_DATA|GRAVITY_NUMERICS/.test(String(e))) throw e; }
      }
      if (!accepted) return failed('Finite-burn targeting did not reduce the six-state residual.', iterations + 1, norm(q.slice(0, 3)) + norm(q.slice(3, 6)));
    }
    const refined = evaluate(q, false, { ...options, rtol: 6e-13, atol_position_m: 1e-6, atol_velocity_m_s: 1e-9, max_step_s: 90, collect_samples: true });
    const final = refined.last.final as State, dp = norm(sub(position(final), position(target))), dv = norm(sub(velocity(final), velocity(target)));
    const refinementP = norm(sub(position(final), position(current.last.final))), refinementV = norm(sub(velocity(final), velocity(current.last.final)));
    const total = refined.s.d0 + refined.s.d1, massError = Math.abs(final[6] - refined.s.mf);
    const passed = dp <= .05 && dv <= 1e-5 && refinementP <= .05 && refinementV <= 1e-5 && total <= o.max_delta_v_m_s && massError < 1e-6;
    if (!passed) return { ...failed('Finite transfer failed endpoint, delta-V, mass or refinement checks.', iterations, total), validation: {
      passed: false, position_error_m: dp, velocity_error_m_s: dv, refined_position_difference_m: refinementP,
      refined_velocity_difference_m_s: refinementV, mass_error_kg: massError, limit_total_delta_v_m_s: o.max_delta_v_m_s } };
    const decorate = (samples: EphemerisSample[], phase: string, thrust: number): FiniteSample[] => samples.map(p => ({ ...p, phase, thrust_n: thrust }));
    return { ...base, status: 'TRANSFER VALIDATED', message: 'Continuous finite departure, coast and finite insertion passed six-state and mass checks.', iterations,
      total_delta_v_m_s: total, initial_state: refined.initial, final_state: final,
      burns: [refined.arc.burn, refined.last.burn], samples: [
        ...decorate(refined.arc.samples, 'DEPARTURE_BURN', refined.arc.burn.thrust_n),
        ...decorate(refined.coast.samples, 'TRANSFER', 0),
        ...decorate(refined.last.samples, 'INSERTION_BURN', refined.last.burn.thrust_n)],
      validation: { passed: true, model: 'Finite constant inertial thrust, variable mass, same dated gravity in burns and coast',
        position_error_m: dp, velocity_error_m_s: dv, position_was_reset: false, velocity_was_reset: false,
        refined_position_difference_m: refinementP, refined_velocity_difference_m_s: refinementV, mass_error_kg: massError,
        minimum_moon_altitude_m: Math.min(refined.arc.stats.min_moon_distance_m, refined.coast.stats.min_moon_distance_m, refined.last.stats.min_moon_distance_m) - R_MOON,
        departure_duration_s: refined.arc.burn.duration_s, insertion_duration_s: refined.last.burn.duration_s,
        burn_overlap: false, maximum_thrust_n: lander.max_thrust_n, limit_total_delta_v_m_s: o.max_delta_v_m_s,
        collision_check: 'Accepted adaptive states with 12 km spherical lunar exclusion margin; not terrain certification.' } };
  } catch (e) {
    if (e instanceof CalculationTimeout || e instanceof CalculationCancelled || /GRAVITY_DATA|GRAVITY_NUMERICS/.test(String(e))) throw e;
    return failed(e instanceof Error ? e.message : String(e), iterations);
  }
}
