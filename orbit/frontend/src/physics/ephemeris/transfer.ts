import { add, cross, dot, norm, position, R_MOON, scale, solveLinear, sub, unit, velocity, type V3 } from '../math';
import { CalculationCancelled, CalculationTimeout, IntegrationError } from '../errors';
import { lambertSeed } from '../lambert';
import { propagateEphemeris, type EphemerisForces, type EphemerisPropagationOptions, type EphemerisSample } from './dynamics';
import type { FiniteTransferSeed } from './finiteBurn';

export interface TransferSeedCandidate extends FiniteTransferSeed {
  tof_s: number; branch: 'short' | 'long'; total_delta_v_m_s: number;
}

export interface EphemerisTransferCandidate {
  departure_time_s: number; arrival_time_s: number; tof_days: number; branch: 'short' | 'long';
  converged: boolean; valid: boolean; iterations: number; position_error_m?: number;
  departure_delta_v_m_s?: number; insertion_delta_v_m_s?: number; total_delta_v_m_s?: number;
  min_altitude_km?: number; error?: string;
}
export interface EphemerisTransferOptions {
  ephemeris: EphemerisForces;
  departureState(t: number): number[];
  arrival_state: number[]; arrival_time_s: number;
  tof_days: [number, number]; max_delta_v_m_s: number; max_iterations: number;
  deadline_ms?: number; objective: 'delta_v' | 'time' | 'balanced';
  tof_samples?: number; position_tolerance_m?: number; is_cancelled?: () => boolean;
  tof_values_days?: number[];
}
export interface EphemerisTransferResult {
  status: 'TRANSFER VALIDATED' | 'TRANSFER NOT CONVERGED' | 'TRANSFER CANCELLED';
  message: string; departure_state?: number[]; post_departure_state?: number[]; pre_insertion_state?: number[];
  departure_dv_m_s?: V3; insertion_dv_m_s?: V3; total_delta_v_m_s?: number;
  departure_time_s?: number; arrival_time_s: number; tof_s?: number;
  samples: EphemerisSample[]; validation: Record<string, unknown>; candidates: EphemerisTransferCandidate[];
  timed_out: boolean; elapsed_ms: number;
  /** Impulsive initial guesses only. Each must be retargeted with finite burns. */
  seeds?: TransferSeedCandidate[];
}
export interface EphemerisShootingOptions {
  iterations: number; tolerance_m: number; deadline_ms?: number; is_cancelled?: () => boolean;
}

/** Differential position targeting with an integrated, nonautonomous STM.
 * Exploratory iterates may enter the conservative transfer exclusion envelope;
 * only the independent strict replay can become a returned trajectory. */
export function shootEphemerisTransfer(departure: number[], target: number[], start: number, tof: number, seedVelocity: V3,
  eph: EphemerisForces, options: EphemerisShootingOptions) {
  let v = [...seedVelocity] as V3, final = departure.slice(0, 6), lastError = Infinity, iterations = 0;
  const settings: EphemerisPropagationOptions = { rtol: 2e-11, atol_position_m: 1e-4, atol_velocity_m_s: 1e-7,
    max_step_s: 600, collect_samples: false, collision_radius_m: R_MOON * .05, deadline_ms: options.deadline_ms, is_cancelled: options.is_cancelled };
  for (; iterations < options.iterations; iterations++) {
    const initial = [...position(departure), ...v];
    const propagated = propagateEphemeris(initial, start, tof, eph, { ...settings, with_stm: true });
    final = propagated.final;
    const error = sub(position(final), position(target)), residual = norm(error); lastError = residual;
    if (residual <= options.tolerance_m) return { initial, final, converged: true, iterations: iterations + 1, position_error_m: residual };
    let correction: V3;
    try { correction = solveLinear(propagated.stm!.slice(0, 3).map(row => row.slice(3, 6)), scale(error, -1)) as V3; } catch { break; }
    const magnitude = norm(correction);
    if (magnitude > 1500) correction = scale(correction, 1500 / magnitude);
    let accepted = false;
    for (const alpha of [1, .5, .25, .125, .0625, .03125]) {
      const trialVelocity = add(v, scale(correction, alpha));
      try {
        const trial = propagateEphemeris([...position(departure), ...trialVelocity], start, tof, eph, settings);
        if (norm(sub(position(trial.final), position(target))) < residual) { v = trialVelocity; accepted = true; break; }
      } catch (e) { if (e instanceof CalculationCancelled || e instanceof CalculationTimeout || /GRAVITY_DATA|GRAVITY_NUMERICS/.test(String(e))) throw e; }
    }
    if (!accepted) break;
  }
  return { initial: [...position(departure), ...v], final, converged: false, iterations, position_error_m: lastError };
}

/** Fixed landing epoch -> arrival epoch -> date-specific departure states.
 * The phase of a dated reference cannot be independently rotated as in CR3BP. */
export async function solveEphemerisTransfer(options: EphemerisTransferOptions, onProgress: (message: string) => void = () => {}): Promise<EphemerisTransferResult> {
  const started = performance.now(), { ephemeris: eph, arrival_state: target, arrival_time_s: arrival } = options;
  if (target.length !== 6 || target.some(v => !Number.isFinite(v)) || !Number.isFinite(arrival)) throw new IntegrationError('Mode B transfer target must contain six finite SI states and a finite arrival epoch.');
  if (!(options.tof_days[0] > 0 && options.tof_days[1] >= options.tof_days[0] && options.max_delta_v_m_s > 0 && options.max_iterations >= 1)) throw new IntegrationError('Mode B transfer needs ordered positive flight-time, delta-V and iteration limits.');
  const candidates: EphemerisTransferCandidate[] = [];
  const seeds: TransferSeedCandidate[] = [];
  const count = options.tof_days[0] === options.tof_days[1] ? 1 : options.tof_samples ?? 9;
  const times = options.tof_values_days ?? Array.from({ length: count }, (_, i) => options.tof_days[0] + (options.tof_days[1] - options.tof_days[0]) * (count === 1 ? 0 : i / (count - 1)));
  if(!times.length||times.some(t=>!Number.isFinite(t)||t<options.tof_days[0]||t>options.tof_days[1]))throw new IntegrationError('Transfer seed times must be finite and inside the declared interval.');
  const tolerance = options.position_tolerance_m ?? .05;
  type Best = { candidate: EphemerisTransferCandidate; departure: number[]; initial: number[]; final: number[]; samples: EphemerisSample[]; dv0: V3; dv1: V3; validation: Record<string, unknown> };
  let best: Best | undefined, timedOut = false, cancelled = false;
  const better = (a: EphemerisTransferCandidate, b: EphemerisTransferCandidate) => {
    if (options.objective === 'time' && a.tof_days !== b.tof_days) return a.tof_days < b.tof_days;
    const score = (c: EphemerisTransferCandidate) => c.total_delta_v_m_s! + (options.objective === 'balanced' ? c.tof_days * 100 : 0);
    return score(a) < score(b) || (score(a) === score(b) && a.tof_days < b.tof_days);
  };
  try {
    for (const days of times) {
      if (options.is_cancelled?.()) throw new CalculationCancelled();
      if (options.deadline_ms !== undefined && performance.now() >= options.deadline_ms) throw new CalculationTimeout();
      const tof = days * 86400, departureTime = arrival - tof;
      let departure: number[] | undefined, departureError: unknown;
      try { departure = options.departureState(departureTime).slice(0, 6); } catch (e) { departureError = e; }
      for (const longWay of [false, true]) {
        if (options.is_cancelled?.()) throw new CalculationCancelled();
        if (options.deadline_ms !== undefined && performance.now() >= options.deadline_ms) throw new CalculationTimeout();
        if (departureError instanceof CalculationCancelled || departureError instanceof CalculationTimeout || /GRAVITY_DATA|GRAVITY_NUMERICS/.test(String(departureError))) throw departureError;
        const candidate: EphemerisTransferCandidate = { departure_time_s: departureTime, arrival_time_s: arrival, tof_days: days,
          branch: longWay ? 'long' : 'short', converged: false, valid: false, iterations: 0 };
        candidates.push(candidate);
        onProgress(`Mode B dated transfer ${candidates.length}/${times.length * 2}: ${days.toFixed(3)} d, ${candidate.branch}`);
        try {
          if (departureError) throw departureError;
          if (!departure || departure.length !== 6 || departure.some(x => !Number.isFinite(x))) throw new IntegrationError('Invalid dated NRHO departure state.');
          if (departureTime < eph.coverage[0] || arrival > eph.coverage[1]) throw new IntegrationError('Mode B ephemeris does not cover this transfer interval.');
          const seed = lambertSeed(position(departure), position(target), tof, eph.gm.moon, longWay);
          const shot = shootEphemerisTransfer(departure, target, departureTime, tof, seed, eph, { iterations: options.max_iterations,
            tolerance_m: Math.min(.002, tolerance / 10), deadline_ms: options.deadline_ms, is_cancelled: options.is_cancelled });
          candidate.iterations = shot.iterations; candidate.converged = shot.converged; candidate.position_error_m = shot.position_error_m;
          if (shot.converged) {
            const refined = propagateEphemeris(shot.initial, departureTime, tof, eph, { rtol: 8e-13, atol_position_m: 1e-5,
              atol_velocity_m_s: 1e-8, max_step_s: 180, collision_radius_m: R_MOON + 12_000,
              deadline_ms: options.deadline_ms, is_cancelled: options.is_cancelled });
            const dp = norm(sub(position(refined.final), position(target))), refinedDifference = norm(sub(position(refined.final), position(shot.final)));
            const dv0 = sub(velocity(shot.initial), velocity(departure)), dv1 = sub(velocity(target), velocity(refined.final));
            const totalDv = norm(dv0) + norm(dv1), postVelocity = add(velocity(refined.final), dv1);
            const actualR = position(refined.final), targetR = position(target), h = cross(actualR, postVelocity), targetH = cross(targetR, velocity(target));
            const eccentricity = norm(sub(scale(cross(postVelocity, h), 1 / eph.gm.moon), unit(actualR)));
            const targetEccentricity = norm(sub(scale(cross(velocity(target), targetH), 1 / eph.gm.moon), unit(targetR)));
            const planeError = Math.atan2(norm(cross(h, targetH)), dot(h, targetH));
            candidate.position_error_m = dp; candidate.departure_delta_v_m_s = norm(dv0); candidate.insertion_delta_v_m_s = norm(dv1);
            candidate.total_delta_v_m_s = totalDv; candidate.min_altitude_km = (refined.stats.min_moon_distance_m - R_MOON) / 1000;
            candidate.valid = dp <= tolerance && refinedDifference <= Math.max(.1, tolerance) && totalDv <= options.max_delta_v_m_s && planeError <= 1e-6 && Math.abs(eccentricity - targetEccentricity) <= 1e-6;
            if (candidate.valid) seeds.push({departure_time_s: departureTime, departure_state: departure, departure_dv_m_s: dv0, insertion_dv_m_s: dv1, tof_s: tof, branch: candidate.branch, total_delta_v_m_s: totalDv});
            if (candidate.valid && (!best || better(candidate, best.candidate))) best = { candidate, departure, initial: shot.initial, final: refined.final, samples: refined.samples, dv0, dv1,
              validation: { passed: true, position_error_m: dp, position_tolerance_m: tolerance, post_insertion_velocity_error_m_s: norm(sub(postVelocity, velocity(target))),
                refined_position_difference_m: refinedDifference, post_insertion_eccentricity: eccentricity, target_eccentricity: targetEccentricity, orbit_plane_error_rad: planeError,
                actual_llo_altitude_lola_km: (norm(actualR) - R_MOON) / 1000, target_llo_altitude_lola_km: (norm(targetR) - R_MOON) / 1000,
                minimum_moon_altitude_km: candidate.min_altitude_km, minimum_earth_altitude_km: (refined.stats.min_earth_distance_m - (eph.earth_radius_m ?? 6_378_136.6)) / 1000,
                collision_envelope_radius_km: (R_MOON + 12_000) / 1000, position_was_reset: false, limit_total_delta_v_m_s: options.max_delta_v_m_s,
                model: `Date-dependent ${eph.lunarGravity?`GL1800F degree ${eph.lunarGravity.metadata.degree} DE440 PA lunar gravity`:'lunar central gravity'} plus geometric Earth/Sun differential accelerations, J2000 axes.`,
                collision_check: 'Accepted adaptive states; maximum step travel 2% of lunar radius vector. 12 km spherical margin, not terrain certification.',
                accepted_steps: refined.stats.steps, rejected_steps: refined.stats.rejected } };
          }
        } catch (e) {
          if (e instanceof CalculationCancelled || e instanceof CalculationTimeout || /GRAVITY_DATA|GRAVITY_NUMERICS/.test(String(e))) throw e;
          candidate.error = e instanceof Error ? e.message : String(e);
        }
        await new Promise<void>(resolve => setTimeout(resolve, 0));
      }
    }
  } catch (e) {
    if (e instanceof CalculationCancelled) cancelled = true;
    else if (e instanceof CalculationTimeout) timedOut = true;
    else throw e;
  }
  seeds.sort((a,b)=>options.objective==='time'?a.tof_s-b.tof_s||a.total_delta_v_m_s-b.total_delta_v_m_s:(a.total_delta_v_m_s-b.total_delta_v_m_s)+(options.objective==='balanced'?(a.tof_s-b.tof_s)/864:0));
  const base = { arrival_time_s: arrival, candidates, seeds, timed_out: timedOut, elapsed_ms: performance.now() - started };
  if (cancelled) return { ...base, status: 'TRANSFER CANCELLED', message: 'User cancelled the Mode B dated transfer calculation.', samples: [], validation: {} };
  if (!best) return { ...base, status: 'TRANSFER NOT CONVERGED', message: `${timedOut ? 'Time budget reached. ' : ''}No date-specific transfer passed endpoint, delta-V, collision and integration refinement checks in the attempted set. This is not proof of physical impossibility.`, samples: [], validation: {} };
  return { ...base, status: 'TRANSFER VALIDATED', message: `${timedOut ? 'Time budget reached; returning a fully verified candidate. ' : ''}Date-specific transfer passed the declared ephemeris force-model checks.`,
    departure_state: best.departure, post_departure_state: best.initial, pre_insertion_state: best.final,
    departure_dv_m_s: best.dv0, insertion_dv_m_s: best.dv1, total_delta_v_m_s: best.candidate.total_delta_v_m_s,
    departure_time_s: best.candidate.departure_time_s, tof_s: best.candidate.tof_days * 86400, samples: best.samples, validation: best.validation };
}
