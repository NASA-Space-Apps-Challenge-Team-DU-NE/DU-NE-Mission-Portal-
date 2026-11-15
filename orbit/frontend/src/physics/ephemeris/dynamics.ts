import { G0, R_MOON, type V3 } from '../math';
import { CalculationCancelled, CalculationTimeout, IntegrationError } from '../errors';
import type { LunarGravityModel } from '../gravity/model';

/** Geometric, Moon-relative J2000 states; metres, seconds, m^3/s^2.
 * Time is elapsed TDB seconds from the ephemeris file's epoch, never Unix UTC. */
export interface EphemerisForces {
  gm: { moon: number; earth: number; sun: number };
  coverage: [number, number];
  at(t: number): { earth: number[]; sun: number[] };
  earth_radius_m?: number;
  lunarGravity?: LunarGravityModel;
}
export interface EphemerisPropagationOptions {
  acceleration_m_s2?: V3; isp_s?: number;
  /** Constant inertial force. Mutually exclusive with acceleration commands. */
  thrust_n?: V3;
  rtol?: number; atol_position_m?: number; atol_velocity_m_s?: number;
  max_step_s?: number; max_steps?: number; with_stm?: boolean;
  collect_samples?: boolean; deadline_ms?: number; is_cancelled?: () => boolean;
  collision_radius_m?: number;
}
export interface EphemerisSample { t: number; state: number[] }
export interface EphemerisPropagation {
  final: number[]; samples: EphemerisSample[]; stm?: number[][];
  stats: { steps: number; rejected: number; evaluations: number; min_moon_distance_m: number; min_earth_distance_m: number };
}

/** Relative acceleration includes the acceleration of the lunar origin.
 * a_j = mu_j ((R_j-r)/|R_j-r|^3 - R_j/|R_j|^3).
 * Prescribed DE440 positions are sampled at the integration stage time. */
export function gravity(t: number, r: V3, eph: EphemerisForces): V3 {
  const radius = Math.hypot(...r);
  if (!(radius > 0)) throw new IntegrationError('Mode B lunar gravity singularity.');
  const bodies = eph.at(t);
  const a = eph.lunarGravity ? eph.lunarGravity.evaluate(t, r).acceleration_m_s2 : r.map(x => -eph.gm.moon * x / radius ** 3) as V3;
  for (const body of ['earth', 'sun'] as const) {
    if (!eph.gm[body]) continue;
    const R = bodies[body], d = [R[0] - r[0], R[1] - r[1], R[2] - r[2]];
    const distance = Math.hypot(...d), originDistance = Math.hypot(R[0], R[1], R[2]);
    if (!(distance > 0 && originDistance > 0)) throw new IntegrationError('Mode B third-body gravity singularity.');
    for (let k = 0; k < 3; k++) a[k] += eph.gm[body] * (d[k] / distance ** 3 - R[k] / originDistance ** 3);
  }
  return a;
}

/** d(acceleration)/d(position); the indirect acceleration has no r derivative. */
export function gravityJacobian(t: number, r: V3, eph: EphemerisForces): number[][] {
  const bodies = eph.at(t), jacobian = Array.from({ length: 3 }, () => Array(3).fill(0));
  const add = (d: number[], gm: number) => {
    if (!gm) return;
    const radius = Math.hypot(...d);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) jacobian[i][j] += gm * (3 * d[i] * d[j] / radius ** 5 - (i === j ? 1 / radius ** 3 : 0));
  };
  if(eph.lunarGravity) {
    const lunar=eph.lunarGravity.evaluate(t,r,true).jacobian_s2!;
    for(let i=0;i<3;i++)for(let j=0;j<3;j++)jacobian[i][j]=lunar[i][j];
  }else add(r, eph.gm.moon);
  for (const body of ['earth', 'sun'] as const) add([bodies[body][0] - r[0], bodies[body][1] - r[1], bodies[body][2] - r[2]], eph.gm[body]);
  return jacobian;
}

/** One harmonic recurrence supplies both acceleration and Hessian to the STM. */
function gravityWithJacobian(t:number,r:V3,eph:EphemerisForces):{a:V3;j:number[][]} {
  if(!eph.lunarGravity)return {a:gravity(t,r,eph),j:gravityJacobian(t,r,eph)};
  const value=eph.lunarGravity.evaluate(t,r,true),a=value.acceleration_m_s2,j=value.jacobian_s2!,bodies=eph.at(t);
  for(const body of ['earth','sun'] as const){
    const mu=eph.gm[body];if(!mu)continue;
    const R=bodies[body],d=[R[0]-r[0],R[1]-r[1],R[2]-r[2]],radius=Math.hypot(...d),origin=Math.hypot(R[0],R[1],R[2]);
    if(!(radius>0&&origin>0))throw new IntegrationError('Mode B third-body gravity singularity.');
    for(let i=0;i<3;i++){
      a[i]+=mu*(d[i]/radius**3-R[i]/origin**3);
      for(let k=0;k<3;k++)j[i][k]+=mu*(3*d[i]*d[k]/radius**5-(i===k?1/radius**3:0));
    }
  }
  return {a,j};
}

const C = [0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1, 1];
const A = [[], [1 / 5], [3 / 40, 9 / 40], [44 / 45, -56 / 15, 32 / 9], [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729], [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656], [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84]];
const B5 = [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84, 0];
const B4 = [5179 / 57600, 0, 7571 / 16695, 393 / 640, -92097 / 339200, 187 / 2100, 1 / 40];

/** Adaptive Dormand–Prince 5(4) integrating actual time-dependent dynamics.
 * Constant inertial acceleration commands imply T=m|a| and dm/dt=-T/(Isp*g0).
 * Constant inertial force instead gives a=F/m and dm/dt=-|F|/(Isp*g0).
 * STM is the 6-state position/velocity derivative at fixed initial mass and
 * controls. Mass sensitivities are handled separately by finite-burn targeting. */
export function propagateEphemeris(initial: number[], start: number, duration: number, eph: EphemerisForces,
  options: EphemerisPropagationOptions = {}): EphemerisPropagation {
  if (![6, 7].includes(initial.length) || initial.some(x => !Number.isFinite(x)) || !Number.isFinite(start) || !Number.isFinite(duration)) throw new IntegrationError('Mode B requires finite six- or seven-state input and finite times.');
  if (!(eph.gm.moon > 0 && eph.gm.earth >= 0 && eph.gm.sun >= 0)) throw new IntegrationError('Invalid Mode B gravitational parameters.');
  const end = start + duration;
  if (Math.min(start, end) < eph.coverage[0] - 1e-7 || Math.max(start, end) > eph.coverage[1] + 1e-7) throw new IntegrationError('Mode B ephemeris does not cover the complete flight interval.');
  const rtol = options.rtol ?? 2e-11, posAtol = options.atol_position_m ?? 1e-4, velAtol = options.atol_velocity_m_s ?? 1e-7;
  const maxStep = options.max_step_s ?? 600, collision = options.collision_radius_m ?? R_MOON + 12_000;
  const acceleration = options.acceleration_m_s2 ?? [0, 0, 0], accelerationMagnitude = Math.hypot(...acceleration), isp = options.isp_s ?? 320;
  const force = options.thrust_n, forceMagnitude = force ? Math.hypot(...force) : 0;
  if (force && (initial.length !== 7 || options.acceleration_m_s2 !== undefined || force.some(x => !Number.isFinite(x)))) throw new IntegrationError('Finite burn requires a seven-state mass and one finite force command, not simultaneous acceleration.');
  if (!(rtol > 0 && posAtol > 0 && velAtol > 0 && maxStep > 0 && collision >= 0 && isp > 0) || acceleration.some(x => !Number.isFinite(x))) throw new IntegrationError('Invalid Mode B integration tolerances, thrust, or step settings.');
  if (initial.length === 7 && initial[6] <= 0) throw new IntegrationError('Mode B mass must remain positive.');
  const n = initial.length, withSTM = options.with_stm ?? false, sign = duration >= 0 ? 1 : -1, finish = Math.abs(duration);
  let y = [...initial], elapsed = 0, h = Math.min(maxStep, Math.max(.001, finish / 100)), steps = 0, rejected = 0, evaluations = 0;
  if (withSTM) for (let i = 0; i < 36; i++) y.push(i % 7 === 0 ? 1 : 0);
  let minMoon = Math.hypot(...initial.slice(0, 3)), minEarth = Infinity;
  const samples: EphemerisSample[] = [{ t: start, state: [...initial] }];
  const inspect = (t: number, state: number[]) => {
    const R = eph.at(t).earth;
    const moonDistance = Math.hypot(...state.slice(0, 3)), earthDistance = Math.hypot(R[0] - state[0], R[1] - state[1], R[2] - state[2]);
    minMoon = Math.min(minMoon, moonDistance); minEarth = Math.min(minEarth, earthDistance);
    if (moonDistance < collision) throw new IntegrationError('Mode B trajectory intersects the Moon collision envelope.');
    if (earthDistance < (eph.earth_radius_m ?? 6_378_136.6)) throw new IntegrationError('Mode B trajectory intersects the Earth collision envelope.');
    if (n === 7 && state[6] <= 0) throw new IntegrationError('Mode B mass must remain positive.');
  };
  const rhs = (t: number, state: number[]) => {
    evaluations++;
    const r = state.slice(0, 3) as V3, pair = withSTM ? gravityWithJacobian(t,r,eph) : undefined, g = pair?.a ?? gravity(t, r, eph);
    if (n === 7 && !(state[6] > 0)) throw new IntegrationError('Mode B mass must remain positive at every integration stage.');
    const a = force ? force.map(x => x / state[6]) : acceleration;
    const d = [state[3], state[4], state[5], g[0] + a[0], g[1] + a[1], g[2] + a[2]];
    if (n === 7) d.push(force ? -forceMagnitude / (isp * G0) : -state[6] * accelerationMagnitude / (isp * G0));
    if (withSTM) {
      const jacobian = pair!.j;
      for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
        let q = i < 3 ? state[n + (i + 3) * 6 + j] : 0;
        if (i >= 3) for (let k = 0; k < 3; k++) q += jacobian[i - 3][k] * state[n + k * 6 + j];
        d.push(q);
      }
    }
    return d;
  };
  if (options.is_cancelled?.()) throw new CalculationCancelled();
  if (options.deadline_ms !== undefined && performance.now() >= options.deadline_ms) throw new CalculationTimeout();
  inspect(start, y);
  while (elapsed < finish) {
    if (options.is_cancelled?.()) throw new CalculationCancelled();
    if (options.deadline_ms !== undefined && performance.now() >= options.deadline_ms) throw new CalculationTimeout();
    if (steps + rejected >= (options.max_steps ?? 300_000)) throw new IntegrationError('Mode B adaptive integration step budget reached.');
    const remaining = finish - elapsed;
    if (remaining < Math.max(1e-9, finish * 2e-16)) break;
    const moonDistance = Math.hypot(...y.slice(0, 3)), speed = Math.hypot(...y.slice(3, 6));
    h = Math.min(h, maxStep, remaining, .02 * moonDistance / Math.max(1, speed));
    if (h < 1e-7) throw new IntegrationError('Mode B adaptive integration minimum step reached.');
    const t = start + sign * elapsed, hs = sign * h;
    const ks: number[][] = [rhs(t, y)];
    for (let stage = 1; stage < 7; stage++) {
      const state = y.map((v, j) => { let s = 0; for (let k = 0; k < stage; k++) s += A[stage][k] * ks[k][j]; return v + hs * s; });
      // Avoid a floating-point one-ulp excursion beyond a static table boundary.
      const ts = Math.max(eph.coverage[0], Math.min(eph.coverage[1], t + C[stage] * hs));
      ks.push(rhs(ts, state));
    }
    const next = y.map((v, j) => v + hs * B5.reduce((sum, b, i) => sum + b * ks[i][j], 0));
    let error = 0;
    for (let j = 0; j < y.length; j++) {
      const err = h * Math.abs(B5.reduce((sum, b, i) => sum + (b - B4[i]) * ks[i][j], 0));
      const atol = j < 3 ? posAtol : j < 6 ? velAtol : j < n ? 1e-9 : 1e-9;
      error = Math.max(error, err / (atol + rtol * Math.max(Math.abs(y[j]), Math.abs(next[j]))));
    }
    if (!Number.isFinite(error) || next.some(v => !Number.isFinite(v))) throw new IntegrationError('Nonfinite Mode B adaptive integration state.');
    if (error <= 1) {
      elapsed = Math.min(finish, elapsed + h); y = next; steps++;
      const sampleTime = elapsed === finish ? end : start + sign * elapsed;
      inspect(sampleTime, y);
      if (options.collect_samples !== false) samples.push({ t: sampleTime, state: y.slice(0, n) });
    } else rejected++;
    h *= error === 0 ? 4 : Math.max(.15, Math.min(4, .9 * error ** -.2));
  }
  const final = y.slice(0, n);
  // The omitted remainder is below representable integration resolution.
  if (samples.at(-1)!.t !== end) samples.push({ t: end, state: [...final] });
  return { final, samples, stm: withSTM ? Array.from({ length: 6 }, (_, i) => y.slice(n + i * 6, n + (i + 1) * 6)) : undefined,
    stats: { steps, rejected, evaluations, min_moon_distance_m: minMoon, min_earth_distance_m: minEarth } };
}
