import type { Config } from './types';

/** Recomputed in the browser; no saved trajectory or safety-limit override. */
export function defaultMission(): Config {
  return {
    initial_orbit: 'nrho',
    nrho: {
      mode: 'b', gravity_model: 'grail', gravity_degree: 30,
      transfer_tof_min_days: 3, transfer_tof_max_days: 3, max_transfer_delta_v_m_s: 2500,
      parking_revolutions: 0, objective: 'delta_v', max_iterations: 40,
      max_computation_seconds: 60, mass_basis: 'llo', powered_descent_duration_s: 880, approach_heading_deg: 180,
    },
    target: { latitude_deg: -89.4441, longitude_deg: -137.291, landing_time_utc: '2026-11-16T00:00:00Z' },
    lander: { initial_mass_kg: 1500, dry_mass_kg: 650, max_thrust_n: 12000, min_thrust_n: 0, isp_s: 320 },
    orbit: { altitude_km: 100, pdi_altitude_km: 15 },
    constraints: { position_tolerance_m: 100, speed_tolerance_m_s: 2, horizontal_speed_tolerance_m_s: 1 },
    objective: 'fuel',
  };
}
