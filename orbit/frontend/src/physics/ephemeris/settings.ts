import type { NRHOSettings } from '../../types';

/** Engine defaults. The verified opening scenario is defined in defaultMission. */
export const DEFAULT_NRHO: Readonly<NRHOSettings> = Object.freeze({
  mode: 'b', gravity_model: 'point_mass', gravity_degree: 30,
  transfer_tof_min_days: .3, transfer_tof_max_days: 3, max_transfer_delta_v_m_s: 2500,
  parking_revolutions: 0, objective: 'delta_v', max_iterations: 20,
  max_computation_seconds: 60, mass_basis: 'llo',
});

/** Keep the supported Mode B contract. Legacy phase/reference fields are unused.
 * Reject an explicit retired model rather than silently reinterpreting its mission. */
export function normalizeNRHOSettings(input?: Partial<NRHOSettings>): NRHOSettings {
  if (input?.mode !== undefined && input.mode !== 'b') {
    throw new Error('UNSUPPORTED MISSION MODEL — only Mode B dated ephemeris is supported. Load the current default mission and select a supported landing UTC.');
  }
  const settings: NRHOSettings = { ...DEFAULT_NRHO };
  const keys = [...Object.keys(DEFAULT_NRHO), 'powered_descent_duration_s', 'approach_heading_deg'] as Array<keyof NRHOSettings>;
  for (const key of keys) {
    if (input?.[key] !== undefined) (settings as unknown as Record<string, unknown>)[key] = input[key];
  }
  return settings;
}
