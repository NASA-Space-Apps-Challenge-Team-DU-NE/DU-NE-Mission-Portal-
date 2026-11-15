import type { Config, Sample, Vec3 } from '../../types';
import { norm, scale } from '../math';

/** Demonstration design envelope, NOT measured vehicle limits or NASA criteria.
 * Heights are clearance of a radial support point 2 m below the propagated COM.
 * This is a 3-DOF contact proxy; it does not model legs, slope or attitude. */
export const TERMINAL_DESCENT_POLICY = Object.freeze({
  version: 'demo-terminal-v1',
  assumed_parameters: true,
  contact_model: 'radial_support_point',
  center_to_contact_m: 2,
  contact_tolerance_m: .02,
  contact_window_s: .05,
  minimum_terminal_duration_s: 10,
  maximum_sample_interval_s: .25,
  maximum_ascent_speed_m_s: 0,
  bands: Object.freeze([
    Object.freeze({ clearance_m: 10, horizontal_m_s: .5, descent_m_s: 1, tilt_deg: 5 }),
    Object.freeze({ clearance_m: 100, horizontal_m_s: 5, descent_m_s: 5, tilt_deg: 15 }),
    Object.freeze({ clearance_m: 1000, horizontal_m_s: 50, descent_m_s: 30, tilt_deg: 45 }),
  ]),
});

export function contactPoint(center: Vec3): Vec3 {
  return scale(center, 1 - TERMINAL_DESCENT_POLICY.center_to_contact_m / norm(center));
}

/** Inspect full integration samples, including BOTH sides of control boundaries.
 * Never use display-decimated samples for this acceptance gate. */
export function validateTerminalDescent(samples: readonly Sample[], limits: Config['constraints']) {
  const policy = TERMINAL_DESCENT_POLICY;
  const last = samples.at(-1);
  const violations: Array<{ rule: string; time_s: number; clearance_m: number | null; actual: number | null; limit: number }> = [];
  const record = (rule: string, s: Sample, actual: number | null, limit: number) => {
    if (!violations.some(v => v.rule === rule)) violations.push({ rule, time_s: s.time_s, clearance_m: s.altitude_m === null ? null : s.altitude_m - policy.center_to_contact_m, actual, limit });
  };
  let invalid = 0, speedFailures = 0, tiltFailures = 0, ascentFailures = 0, penetration = 0, earlyContact = 0;
  let terminalStart: number | null = null, firstContact: number | null = null, maxGap = 0, maximumTilt = 0;
  const counts = policy.bands.map(() => 0);
  let previous: Sample | undefined;
  for (const s of samples) {
    const h = s.altitude_m === null ? null : s.altitude_m - policy.center_to_contact_m;
    if (h === null || ![h, s.time_s, s.horizontal_speed_m_s, s.vertical_speed_m_s, s.thrust_n].every(Number.isFinite) || s.horizontal_speed_m_s < 0 || (previous && s.time_s < previous.time_s)) {
      invalid++; record('invalid_sample', s, null, 0); previous = s; continue;
    }
    if (h < -policy.contact_tolerance_m) { penetration++; record('contact_penetration', s, h, -policy.contact_tolerance_m); }
    if (h <= policy.contact_tolerance_m) {
      firstContact ??= s.time_s;
      if (last && s.time_s < last.time_s - policy.contact_window_s - 1e-7) { earlyContact++; record('premature_contact', s, last.time_s - s.time_s, policy.contact_window_s); }
    }
    if (h <= 1000) {
      terminalStart ??= s.time_s;
      if (previous) maxGap = Math.max(maxGap, s.time_s - previous.time_s);
      if (s.phase !== 'POWERED_DESCENT' || s.vertical_speed_m_s > policy.maximum_ascent_speed_m_s + 1e-6) {
        ascentFailures++; record('terminal_descent_direction', s, s.vertical_speed_m_s, policy.maximum_ascent_speed_m_s);
      }
      for (let i = 0; i < policy.bands.length; i++) {
        const band = policy.bands[i];
        if (h > band.clearance_m) continue;
        counts[i]++;
        if (s.horizontal_speed_m_s > band.horizontal_m_s + 1e-6) { speedFailures++; record(`horizontal_below_${band.clearance_m}m`, s, s.horizontal_speed_m_s, band.horizontal_m_s); }
        if (-s.vertical_speed_m_s > band.descent_m_s + 1e-6) { speedFailures++; record(`descent_below_${band.clearance_m}m`, s, -s.vertical_speed_m_s, band.descent_m_s); }
        const tilt = s.thrust_tilt_deg;
        if (tilt === undefined || tilt === null || !Number.isFinite(tilt) || tilt < 0 || tilt > 180 || s.thrust_n <= 1e-6 || tilt > band.tilt_deg + 1e-6) {
          tiltFailures++; record(`thrust_tilt_below_${band.clearance_m}m`, s, tilt ?? null, band.tilt_deg);
        }
        if (tilt !== undefined && tilt !== null && Number.isFinite(tilt)) maximumTilt = Math.max(maximumTilt, tilt);
      }
    }
    previous = s;
  }
  const finalClearance = last?.altitude_m == null ? null : last.altitude_m - policy.center_to_contact_m;
  const duration = last && terminalStart !== null ? last.time_s - terminalStart : 0;
  const coverage = invalid === 0 && counts.every(n => n > 0) && maxGap <= policy.maximum_sample_interval_s + 1e-7;
  const terminal = coverage && duration >= policy.minimum_terminal_duration_s && ascentFailures === 0;
  const contact = Boolean(last && finalClearance !== null && Number.isFinite(finalClearance) && Math.abs(finalClearance) <= policy.contact_tolerance_m && last.vertical_speed_m_s < 0 && -last.vertical_speed_m_s <= Math.min(1, limits.speed_tolerance_m_s) + 1e-6 && last.horizontal_speed_m_s <= Math.min(.5, limits.horizontal_speed_tolerance_m_s) + 1e-6 && penetration === 0 && earlyContact === 0 && invalid === 0);
  const checks = {
    terminal_descent: { passed: terminal, duration_s: duration, minimum_duration_s: policy.minimum_terminal_duration_s, checked_samples_by_band: counts, maximum_sample_interval_s: maxGap, invalid_samples: invalid, ascent_or_unpowered_samples: ascentFailures, violations: violations.filter(v => /invalid|direction/.test(v.rule)) },
    low_altitude_speed: { passed: coverage && speedFailures === 0, violation_count: speedFailures, violations: violations.filter(v => /horizontal|descent_below/.test(v.rule)) },
    thrust_tilt: { passed: coverage && tiltFailures === 0, maximum_terminal_tilt_deg: maximumTilt, violation_count: tiltFailures, reference: 'Outward radial vertical; thrust vector, not body attitude', violations: violations.filter(v => /thrust_tilt/.test(v.rule)) },
    contact: { passed: contact, model: policy.contact_model, center_to_contact_m: policy.center_to_contact_m, final_dem_clearance_m: last?.altitude_m ?? null, final_contact_clearance_m: finalClearance, clearance_tolerance_m: policy.contact_tolerance_m, vertical_speed_m_s: last?.vertical_speed_m_s ?? null, first_contact_tolerance_time_s: firstContact, premature_contact_samples: earlyContact, penetration_samples: penetration, violations: violations.filter(v => /contact/.test(v.rule)) },
  };
  return { passed: Object.values(checks).every(c => c.passed), checks, policy };
}
