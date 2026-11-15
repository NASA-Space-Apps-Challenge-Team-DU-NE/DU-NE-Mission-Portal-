import type { Config, Sample, SimulationResult } from '../types';
import { DataUnavailable, latLon, surfacePosition, type Assets } from './data';
import { add, circularParameters, cross, descentOrbit, dot, G0, gravity, integrate, matVec, MU, norm, position, R_MOON, rk4, scale, solveLinear, sub, unit, velocity, type State, type V3 } from './math';

export interface Control { start_s: number; duration_s: number; acceleration_m_s2: V3; thrust_start_n: number; thrust_end_n: number }
interface RawPoint { t: number; state: State; phase: string; thrust: number }
interface Candidate {
  duration: number; heading: number; phaseFactor: number; beta: number; controls: V3[]; initial: State; doiBefore: State; doiAfter: State; pdi: State; final: State;
  residualPosition: number; residualVelocity: number; iterations: number; fuel: number; maxThrust: number; minThrust: number; deltaV: number; poweredDv: number;
  points?: RawPoint[]; samples?: Sample[]; checks?: Record<string, unknown>; terrainValid?: boolean; missingTerrain?: number;
}
const ZERO: V3 = [0, 0, 0];
const CIRCULAR_DURATION = 180;
const SEGMENTS = 24;
const TERRAIN_TOLERANCE_M = .02;

export function validateConfig(c: Config): void {
  const numbers = [c.target.latitude_deg, c.target.longitude_deg, ...Object.values(c.lander), ...Object.values(c.orbit), ...Object.values(c.constraints)];
  if (numbers.some(x => !Number.isFinite(x))) throw new Error('All coordinates, lander parameters and limits must be finite numbers.');
  if (Math.abs(c.target.latitude_deg) > 90 || Math.abs(c.target.longitude_deg) > 180) throw new Error('Latitude must be -90…90° and longitude -180…180°.');
  if (!(c.lander.initial_mass_kg > c.lander.dry_mass_kg && c.lander.dry_mass_kg > 0)) throw new Error('Initial mass must exceed positive dry mass.');
  if (!(c.lander.isp_s > 0 && c.lander.max_thrust_n > 0 && c.lander.min_thrust_n >= 0 && c.lander.max_thrust_n >= c.lander.min_thrust_n)) throw new Error('Enter positive Isp and maximum thrust, with 0 ≤ minimum ≤ maximum thrust.');
  if (!(c.orbit.altitude_km > c.orbit.pdi_altitude_km && c.orbit.pdi_altitude_km > 0)) throw new Error('Initial altitude must exceed a positive PDI altitude.');
  if (c.orbit.altitude_km > 1000 || c.orbit.pdi_altitude_km > 100 || c.orbit.pdi_altitude_km < 3) throw new Error('This solver supports initial altitude ≤1000km and PDI altitude 3…100km.');
  if (Object.values(c.constraints).some(v => v <= 0)) throw new Error('Landing tolerances must be positive.');
  if (!Number.isFinite(Date.parse(c.target.landing_time_utc))) throw new Error('Enter a valid UTC landing time.');
}

/** Initial cubic Hermite *acceleration guess* followed by actual ODE shooting.
 * The seed curve is never used as a returned trajectory or as validation.
 */
export function shootPowered(initial: State, desired: number[], duration: number, isp: number, segmentCount = SEGMENTS) {
  const p0 = position(initial), v0 = velocity(initial), pf = position(desired), vf = velocity(desired);
  const c2 = scale(sub(scale(sub(pf, p0), 3), scale(add(scale(v0, 2), vf), duration)), 1 / duration ** 2);
  const c3 = scale(add(scale(sub(p0, pf), 2), scale(add(v0, vf), duration)), 1 / duration ** 3);
  const dt = duration / segmentCount;
  const seed: V3[] = [];
  for (let i = 0; i < segmentCount; i++) {
    const t = (i + .5) * dt;
    const p = add(add(p0, scale(v0, t)), add(scale(c2, t * t), scale(c3, t ** 3)));
    seed.push(sub(add(scale(c2, 2), scale(c3, 6 * t)), gravity(p)));
  }
  const controls = (q: number[]): V3[] => seed.map((a, i) => add(a, add(q.slice(0, 3) as V3, scale(q.slice(3, 6) as V3, (i + .5) / segmentCount - .5))));
  const propagate = (cs: V3[], step = 2): State => cs.reduce((y, a) => integrate(y, dt, a, step, isp), [...initial] as State);
  const residual = (q: number[]): number[] => propagate(controls(q)).slice(0, 6).map((x, i) => (x - desired[i]) / (i < 3 ? 1000 : 10));
  let q = [0, 0, 0, 0, 0, 0], res = residual(q), iterations = 0;
  for (; iterations < 9 && norm(res) > 1e-7; iterations++) {
    const jac = Array.from({ length: 6 }, () => Array(6).fill(0));
    for (let j = 0; j < 6; j++) {
      const shifted = [...q]; shifted[j] += 1e-4; const r = residual(shifted);
      for (let i = 0; i < 6; i++) jac[i][j] = (r[i] - res[i]) / 1e-4;
    }
    const dq = solveLinear(jac, res.map(x => -x));
    let accepted = false;
    for (const alpha of [1, .5, .25, .125]) {
      const trial = q.map((x, i) => x + alpha * dq[i]), rr = residual(trial);
      if (norm(rr) < norm(res)) { q = trial; res = rr; accepted = true; break; }
    }
    if (!accepted) break;
  }
  const cs = controls(q), final = propagate(cs, .5);
  return { controls: cs, final, iterations, positionError: norm(sub(position(final), pf)), velocityError: norm(sub(velocity(final), vf)), coefficients: q };
}

function createCandidate(c: Config, target: number[], radial: V3, tangent: V3, duration: number, heading: number, phaseFactor: number): Candidate {
  const orbit = descentOrbit(c.orbit.altitude_km * 1000, c.orbit.pdi_altitude_km * 1000);
  const circ = circularParameters(c.orbit.altitude_km * 1000);
  const beta = orbit.vp * duration / (2 * orbit.rp) * phaseFactor;
  const pericenterDirection = add(scale(radial, Math.cos(beta)), scale(tangent, -Math.sin(beta)));
  const pericenterTangent = add(scale(radial, Math.sin(beta)), scale(tangent, Math.cos(beta)));
  const apoDirection = scale(pericenterDirection, -1), apoTangent = scale(pericenterTangent, -1);
  const theta = circ.speed_m_s / orbit.ra * CIRCULAR_DURATION;
  const r0 = scale(add(scale(apoDirection, Math.cos(theta)), scale(apoTangent, -Math.sin(theta))), orbit.ra);
  const v0 = scale(add(scale(apoDirection, Math.sin(theta)), scale(apoTangent, Math.cos(theta))), circ.speed_m_s);
  const initial: State = [...r0, ...v0, c.lander.initial_mass_kg];
  const doiBefore = integrate(initial, CIRCULAR_DURATION, ZERO, 2, c.lander.isp_s);
  const actualTangent = unit(velocity(doiBefore));
  const dv = scale(actualTangent, -orbit.deltaV);
  const doiAfter: State = [...position(doiBefore), ...add(velocity(doiBefore), dv), doiBefore[6] * Math.exp(-orbit.deltaV / (c.lander.isp_s * G0))];
  const pdi = integrate(doiAfter, orbit.coastTime, ZERO, 2, c.lander.isp_s);
  const shot = shootPowered(pdi, target, duration, c.lander.isp_s);
  let m = pdi[6], maxThrust = 0, minThrust = Infinity, poweredDv = 0;
  for (const a of shot.controls) {
    const am = norm(a), dv = am * duration / SEGMENTS;
    maxThrust = Math.max(maxThrust, m * am);
    m *= Math.exp(-dv / (c.lander.isp_s * G0));
    minThrust = Math.min(minThrust, m * am); poweredDv += dv;
  }
  return { duration, heading, phaseFactor, beta, controls: shot.controls, initial, doiBefore, doiAfter, pdi, final: shot.final,
    residualPosition: shot.positionError, residualVelocity: shot.velocityError, iterations: shot.iterations,
    fuel: c.lander.initial_mass_kg - shot.final[6], maxThrust, minThrust, deltaV: orbit.deltaV, poweredDv };
}

function candidateRollout(c: Config, cand: Candidate): RawPoint[] {
  const coastTime = descentOrbit(c.orbit.altitude_km * 1000, c.orbit.pdi_altitude_km * 1000).coastTime;
  const points: RawPoint[] = [{ t: 0, state: [...cand.initial], phase: 'CIRCULAR', thrust: 0 }];
  let y = [...cand.initial] as State, time = 0;
  const propagateSegment = (duration: number, acceleration: V3, phase: string, dense: boolean) => {
    let elapsed = 0;
    while (elapsed < duration - 1e-9) {
      // Powered trajectory sampled at <=120m path spacing and <=0.5s.
      // Coast propagation uses <=2s; visible output is decimated afterward.
      const step = Math.min(duration - elapsed, dense ? Math.min(.5, 120 / Math.max(1, norm(velocity(y)))) : 2);
      y = rk4(y, step, acceleration, c.lander.isp_s); elapsed += step; time += step;
      points.push({ t: time, state: [...y], phase, thrust: y[6] * norm(acceleration) });
    }
  };
  propagateSegment(CIRCULAR_DURATION, ZERO, 'CIRCULAR', false);
  const dv = scale(unit(velocity(y)), -cand.deltaV);
  y = [...position(y), ...add(velocity(y), dv), y[6] * Math.exp(-cand.deltaV / (c.lander.isp_s * G0))];
  points.push({ t: time, state: [...y], phase: 'COAST', thrust: 0 });
  propagateSegment(coastTime, ZERO, 'COAST', false);
  for (const a of cand.controls) propagateSegment(cand.duration / SEGMENTS, a, 'POWERED_DESCENT', true);
  return points;
}

async function checkCandidate(c: Config, cand: Candidate, assets: Assets, landingT: number, targetFixed: V3) {
  const points = candidateRollout(c, cand), duration = points[points.length - 1].t;
  const fixedStates = points.map(p => assets.frames.toFixed(p.state, landingT - duration + p.t));
  const coordinates = fixedStates.map(p => latLon(position(p)));
  await assets.terrain.prepare(coordinates);
  let minClearance = Infinity, missing = 0, collisionCount = 0, lowResolutionBelow12km = 0, highResolutionCount = 0, globalCount = 0;
  const samples: Sample[] = points.map((p, i) => {
    const f = fixedStates[i], fp = position(f), fv = velocity(f), [lat, lon] = coordinates[i];
    const elev = assets.terrain.elevation(lat, lon), h = elev.height === null ? null : norm(fp) - R_MOON - elev.height;
    if (h === null) missing++;
    else if (i < points.length - 1) { minClearance = Math.min(minClearance, h); if (h < -TERRAIN_TOLERANCE_M) collisionCount++; }
    if (elev.source === 'LOLA_240M') highResolutionCount++;
    if (elev.source === 'LOLA_GLOBAL') { globalCount++; if (norm(fp) - R_MOON < 12000) lowResolutionBelow12km++; }
    const vertical = dot(fv, unit(fp));
    return { time_s: p.t, phase: p.phase, position_m: position(p.state), velocity_m_s: velocity(p.state), fixed_position_m: fp,
      altitude_m: h, speed_m_s: norm(fv), horizontal_speed_m_s: Math.sqrt(Math.max(0, dot(fv, fv) - vertical ** 2)), vertical_speed_m_s: vertical,
      mass_kg: p.state[6], thrust_n: p.thrust, distance_to_target_m: norm(sub(fp, targetFixed)) };
  });
  const last = samples[samples.length - 1];
  const positionError = norm(sub(last.fixed_position_m, targetFixed));
  const maxThrust = Math.max(cand.maxThrust, ...samples.map(s => s.thrust_n));
  const finalMass = last.mass_kg;
  const doiIndex = points.findIndex((p, i) => i > 0 && Math.abs(p.t - CIRCULAR_DURATION) < 1e-7 && p.phase === 'COAST');
  const doiBefore = points[doiIndex - 1].state, doiAfter = points[doiIndex].state;
  const pdiTime = CIRCULAR_DURATION + descentOrbit(c.orbit.altitude_km * 1000, c.orbit.pdi_altitude_km * 1000).coastTime;
  const pdiPoint = points.reduce((best, p) => Math.abs(p.t - pdiTime) < Math.abs(best.t - pdiTime) ? p : best, points[0]);
  const doiPositionJump = norm(sub(position(doiAfter), position(doiBefore)));
  const doiDvDifference = Math.abs(norm(sub(velocity(doiAfter), velocity(doiBefore))) - cand.deltaV);
  const pdiPositionResidual = norm(sub(position(pdiPoint.state), position(cand.pdi)));
  const pdiVelocityResidual = norm(sub(velocity(pdiPoint.state), velocity(cand.pdi)));
  const checks = {
    position: { passed: positionError <= c.constraints.position_tolerance_m, actual_m: positionError, limit_m: c.constraints.position_tolerance_m },
    speed: { passed: last.speed_m_s <= c.constraints.speed_tolerance_m_s, actual_m_s: last.speed_m_s, limit_m_s: c.constraints.speed_tolerance_m_s },
    horizontal_speed: { passed: last.horizontal_speed_m_s <= c.constraints.horizontal_speed_tolerance_m_s, actual_m_s: last.horizontal_speed_m_s, limit_m_s: c.constraints.horizontal_speed_tolerance_m_s },
    mass: { passed: finalMass >= c.lander.dry_mass_kg, final_kg: finalMass, dry_kg: c.lander.dry_mass_kg },
    thrust: { passed: maxThrust <= c.lander.max_thrust_n + 1e-6 && cand.minThrust >= c.lander.min_thrust_n - 1e-6, maximum_n: maxThrust, minimum_powered_n: cand.minThrust, limit_n: c.lander.max_thrust_n },
    terrain: { passed: missing === 0 && collisionCount === 0 && lowResolutionBelow12km === 0, collision_samples: collisionCount, unavailable_samples: missing, low_resolution_below_12km: lowResolutionBelow12km,
      minimum_prelanding_clearance_m: Number.isFinite(minClearance) ? minClearance : null, checked_samples: points.length, high_resolution_samples: highResolutionCount, global_coarse_samples: globalCount,
      sampling: 'Powered: ≤120m path spacing and ≤0.5s. Coast: ≤2s. Validation is against the supplied DEM model; unresolved hazards are excluded.', numerical_tolerance_m: TERRAIN_TOLERANCE_M },
    continuity: { passed: doiPositionJump < 1e-6 && doiDvDifference < 1e-6 && pdiPositionResidual < .1 && pdiVelocityResidual < .001,
      position_jump_m: doiPositionJump, pdi_position_residual_m: pdiPositionResidual, pdi_velocity_jump_m_s: pdiVelocityResidual,
      doi_delta_v_residual_m_s: doiDvDifference, intentional_doi_delta_v_m_s: cand.deltaV, method: 'One continuous seven-state forward propagation; DOI velocity and rocket-equation mass impulse only.' },
    forward_propagation: { passed: norm(sub(position(points[points.length - 1].state), position(cand.final))) < .1, refined_endpoint_difference_m: norm(sub(position(points[points.length - 1].state), position(cand.final))) },
  };
  cand.points = points; cand.samples = samples; cand.checks = checks; cand.missingTerrain = missing + lowResolutionBelow12km;
  cand.terrainValid = Object.values(checks).every(v => v.passed);
  return cand;
}

export async function runSimulation(c: Config, assets: Assets, progress: (message: string) => void = () => {}): Promise<SimulationResult & Record<string, unknown>> {
  validateConfig(c);
  const landingT = assets.frames.time(c.target.landing_time_utc);
  assets.frames.at(landingT);
  progress('Loading NASA LOLA target elevation');
  await assets.terrain.prepare([[c.target.latitude_deg, c.target.longitude_deg]]);
  const elevation = assets.terrain.elevation(c.target.latitude_deg, c.target.longitude_deg);
  if (elevation.height === null || elevation.source !== 'LOLA_240M') throw new DataUnavailable('TERRAIN DATA UNAVAILABLE — precise landing targets require the supplied south-polar LOLA 240m DEM (75°S–90°S). Global data only supports high-altitude clearance checks.');
  const targetFixed = surfacePosition(c.target.latitude_deg, c.target.longitude_deg, elevation.height);
  const targetSurface = assets.frames.toInertial([...targetFixed, 0, 0, 0], landingT);
  const radial = unit(position(targetSurface));
  // Nonzero downward contact speed prevents an artificial infinite-time hover.
  const touchdownVertical = Math.min(.5, c.constraints.speed_tolerance_m_s * .25);
  const desired = [...position(targetSurface), ...sub(velocity(targetSurface), scale(radial, touchdownVertical))];
  const lat = c.target.latitude_deg * Math.PI / 180, lon = c.target.longitude_deg * Math.PI / 180;
  const northF: V3 = [-Math.sin(lat) * Math.cos(lon), -Math.sin(lat) * Math.sin(lon), Math.cos(lat)], eastF: V3 = [-Math.sin(lon), Math.cos(lon), 0];
  const rotation = assets.frames.at(landingT).r;
  const north = unit(matVec(rotation, northF)), east = unit(matVec(rotation, eastF));
  const candidates: Candidate[] = [];
  const trials: Record<string, unknown>[] = [];
  const durations = [260, 340, 440, 560];
  const headings = [0, 90, 180, 270];
  let attempted = 0;
  for (const duration of durations) for (const heading of headings) for (const phaseFactor of [1, .9, 1.1]) {
    attempted++;
    if (attempted % 6 === 1) progress(`Shooting 3D gravity/thrust trajectories: ${attempted}/48`);
    const h = heading * Math.PI / 180, tangent = add(scale(north, Math.cos(h)), scale(east, Math.sin(h)));
    try {
      const cand = createCandidate(c, desired, radial, tangent, duration, heading, phaseFactor);
      const eligible = cand.residualPosition < .5 && cand.residualVelocity < .02 && cand.final[6] >= c.lander.dry_mass_kg && cand.maxThrust <= c.lander.max_thrust_n && cand.minThrust >= c.lander.min_thrust_n;
      trials.push({ duration_s: duration, heading_deg: heading, phase_factor: phaseFactor, position_error_m: cand.residualPosition, velocity_residual_m_s: cand.residualVelocity, propellant_kg: cand.fuel, max_thrust_n: cand.maxThrust, min_thrust_n: cand.minThrust, final_mass_kg: cand.final[6], shooting_iterations: cand.iterations, engine_constraints_passed: eligible });
      if (eligible) candidates.push(cand);
    } catch (e) { trials.push({ duration_s: duration, heading_deg: heading, phase_factor: phaseFactor, error: String(e) }); }
  }
  candidates.sort((a, b) => c.objective === 'time' ? a.duration - b.duration || a.fuel - b.fuel : a.fuel - b.fuel || a.duration - b.duration);
  if (!candidates.length) return {
    status: trials.some(t => typeof t.position_error_m === 'number' && t.position_error_m < .5 && typeof t.velocity_residual_m_s === 'number' && t.velocity_residual_m_s < .02) ? 'INFEASIBLE UNDER ASSUMPTIONS' : 'NOT CONVERGED',
    input: c, trajectory: [], summary: { candidates_attempted: attempted, admissible_candidates: 0 }, validation: {}, candidates: trials,
    message: 'No admissible solution was found in the 48-candidate search (four headings, four durations, three phases). This is a bounded-search result, not proof of physical impossibility.',
    warnings: ['Try changing thrust, propellant, Isp, or constraints. No failed path is labelled a successful landing.'],
  };
  let selected: Candidate | undefined, bestFailed: Candidate | undefined, verifiedCount = 0;
  // Stop at the best-ranked terrain-valid candidate; ranking already includes all
  // admissible numerical candidates. Expensive DEM reads are done lazily.
  for (let i = 0; i < candidates.length; i++) {
    const cand = candidates[i];
    progress(`Checking continuous flight and LOLA terrain: candidate ${i + 1}/${candidates.length}`);
    const flightDuration = CIRCULAR_DURATION + descentOrbit(c.orbit.altitude_km * 1000, c.orbit.pdi_altitude_km * 1000).coastTime + cand.duration;
    assets.frames.at(landingT - flightDuration);
    await checkCandidate(c, cand, assets, landingT, targetFixed); verifiedCount++;
    if (!bestFailed || (cand.missingTerrain ?? Infinity) < (bestFailed.missingTerrain ?? Infinity)) bestFailed = cand;
    if (cand.terrainValid) { selected = cand; break; }
  }
  const chosen = selected ?? bestFailed!;
  const samples = chosen.samples!, last = samples[samples.length - 1], orbit = descentOrbit(c.orbit.altitude_km * 1000, c.orbit.pdi_altitude_km * 1000);
  const duration = last.time_s, startT = landingT - duration, pdiTime = CIRCULAR_DURATION + orbit.coastTime;
  const controls: Control[] = []; let mass = chosen.pdi[6];
  chosen.controls.forEach((a, i) => {
    const endMass = mass * Math.exp(-norm(a) * chosen.duration / SEGMENTS / (c.lander.isp_s * G0));
    controls.push({ start_s: pdiTime + i * chosen.duration / SEGMENTS, duration_s: chosen.duration / SEGMENTS, acceleration_m_s2: a, thrust_start_n: mass * norm(a), thrust_end_n: endMass * norm(a) }); mass = endMass;
  });
  const [actualLat, actualLon] = latLon(last.fixed_position_m);
  const period = circularParameters(c.orbit.altitude_km * 1000).period_s;
  const circularOrbit: V3[] = [];
  const rU = unit(position(chosen.doiBefore)), vU = unit(velocity(chosen.doiBefore));
  for (let i = 0; i <= 256; i++) {
    const a = i * 2 * Math.PI / 256, p = scale(add(scale(rU, Math.cos(a)), scale(vU, Math.sin(a))), orbit.ra);
    circularOrbit.push(position(assets.frames.toFixed([...p, 0, 0, 0], startT + CIRCULAR_DURATION)));
  }
  const displayed = samples.filter((s, i) => i === 0 || i === samples.length - 1 || i % (s.phase === 'POWERED_DESCENT' ? 4 : 3) === 0 || (i > 0 && s.phase !== samples[i - 1].phase));
  progress('Building NASA terrain landing view');
  const terrain = await assets.terrain.roi(c.target.latitude_deg, c.target.longitude_deg);
  const landed = Boolean(selected);
  return {
    input: c,
    status: landed ? 'VALIDATED' : chosen.missingTerrain ? 'DATA UNAVAILABLE' : 'NUMERICALLY CONVERGED',
    message: landed ? 'Forward-integrated landing satisfies the configured numerical and DEM-model checks. This is not NASA certification.' : 'Shooting converged, but complete landing validation failed. Inspect the validation panel.',
    trajectory: displayed, circular_orbit: circularOrbit, terrain,
    target: { ...c.target, elevation_m: elevation.height, fixed_position_m: targetFixed },
    summary: {
      landing_position_error_m: last.distance_to_target_m, touchdown_velocity_m_s: last.speed_m_s, horizontal_touchdown_velocity_m_s: last.horizontal_speed_m_s,
      vertical_touchdown_velocity_m_s: last.vertical_speed_m_s, doi_delta_v_m_s: chosen.deltaV, powered_descent_delta_v_m_s: chosen.poweredDv, total_delta_v_m_s: chosen.deltaV + chosen.poweredDv,
      propellant_consumed_kg: c.lander.initial_mass_kg - last.mass_kg, remaining_propellant_kg: last.mass_kg - c.lander.dry_mass_kg, final_mass_kg: last.mass_kg,
      flight_duration_s: duration, powered_descent_duration_s: chosen.duration, circular_speed_m_s: circularParameters(c.orbit.altitude_km * 1000).speed_m_s, circular_period_s: period,
      target_elevation_m: elevation.height, actual_latitude_deg: actualLat, actual_longitude_deg: actualLon, maximum_thrust_n: chosen.maxThrust,
      candidates_attempted: attempted, admissible_candidates: candidates.length, terrain_checked_candidates: verifiedCount, approach_heading_deg: chosen.heading, phase_factor: chosen.phaseFactor,
      landing_success: landed, doi_finite_burn_estimate_s: (chosen.doiBefore[6] - chosen.doiAfter[6]) * c.lander.isp_s * G0 / c.lander.max_thrust_n,
      global_optimality_proven: false,
    },
    validation: chosen.checks!, controls, candidates: trials,
    events: [
      { name: 'DOI', phase: 'COAST', time_s: CIRCULAR_DURATION, fixed_position_m: position(assets.frames.toFixed(chosen.doiBefore, startT + CIRCULAR_DURATION)), delta_v_m_s: chosen.deltaV,
        delta_v_vector_m_s: sub(velocity(chosen.doiAfter), velocity(chosen.doiBefore)), propellant_kg: chosen.doiBefore[6] - chosen.doiAfter[6] },
      { name: 'PDI', phase: 'POWERED_DESCENT', time_s: pdiTime, fixed_position_m: position(assets.frames.toFixed(chosen.pdi, startT + pdiTime)), position_m: position(chosen.pdi), velocity_m_s: velocity(chosen.pdi), altitude_reference_m: norm(position(chosen.pdi)) - R_MOON },
      { name: 'TOUCHDOWN', time_s: duration, fixed_position_m: last.fixed_position_m, phase: 'POWERED_DESCENT' },
    ],
    reference: { inertial_frame: 'J2000', surface_frame: assets.frames.data.fixed_frame, resolved_surface_frame: assets.frames.data.resolved_frame,
      units: 'metres, seconds, kilograms, newtons', time: 'UTC input; seconds from flight start; SPICE-precomputed orientation interpolation', landing_time_utc: c.target.landing_time_utc,
      start_time_utc: new Date(Date.parse(c.target.landing_time_utc) - duration * 1000).toISOString(), lunar_gm_m3_s2: MU, reference_radius_m: R_MOON,
      optimizer: '3D six-moment shooting over 24 piecewise constant acceleration segments; 48 duration/heading/phase starts', integrator: 'Seven-state RK4; independently refined endpoint and dense DEM checks',
      ellipse: { semi_major_axis_m: orbit.a, eccentricity: orbit.e, time_to_pericenter_s: orbit.coastTime },
    },
    warnings: ['DEMONSTRATION LANDER — ASSUMED PARAMETERS', 'Two-body central gravity; no nonspherical gravity, third bodies, engine slew limits, plume or hazard certification.',
      'DOI is an ideal impulse. Its propellant and minimum full-thrust burn-time estimate are reported; finite-burn DOI is not simulated.',
      'Terrain checks use the supplied 240m south-polar DEM and a coarse global high-altitude model. They do not resolve rocks or subpixel slopes.',
      'Fuel/time ranking is over a bounded candidate family; no globally optimal solution is claimed.'],
  };
}
