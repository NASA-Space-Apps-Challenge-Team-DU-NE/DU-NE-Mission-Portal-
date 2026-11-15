import type { Config, SimulationResult } from '../types';
import { normalizeNRHOSettings } from '../physics/ephemeris/settings';

export interface GravityComparisonRecord {
  id: string;
  label: string;
  model: 'point_mass' | 'grail';
  degree: number;
  totalDeltaV: number | null;
  propellant: number | null;
  positionResidual: number | null;
  speedResidual: number | null;
  elapsedMs: number;
}

const numeric = (result: SimulationResult, keys: string[]): number | null => {
  for (const key of keys) {
    const value = result.summary[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
};
const stable = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, stable(v)]));
  return value;
};

/** All other request inputs, including date, budget, vehicle and objectives,
 * must match before independently optimized missions may be compared. */
export function gravityComparisonKey(config: Config): string | null {
  if (config.initial_orbit !== 'nrho') return null;
  let settings;
  try { settings = normalizeNRHOSettings(config.nrho); } catch { return null; }
  const { gravity_model: _model, gravity_degree: _degree, ...nrho } = settings;
  return JSON.stringify(stable({ ...config, nrho }));
}

export function gravitySelectionId(config: Config): string {
  if (config.initial_orbit !== 'nrho') return 'llo';
  let settings;
  try { settings = normalizeNRHOSettings(config.nrho); } catch { return 'unsupported'; }
  return settings.gravity_model === 'grail' ? `grail:${settings.gravity_degree ?? 30}` : 'point_mass:0';
}

export function gravityComparisonRecord(config: Config, result: SimulationResult, elapsedMs: number): GravityComparisonRecord | null {
  if (!gravityComparisonKey(config) || result.status !== 'VALIDATED' || result.nrho?.mode !== 'EPHEMERIS' || !Number.isFinite(elapsedMs) || elapsedMs < 0) return null;
  // Use calculated metadata, not the selected setting, to avoid presenting a
  // stale or mismatched result as a successful run of the newly selected model.
  const gravity = result.nrho.gravity;
  if (!gravity || !Number.isInteger(gravity.degree) || gravity.degree < 0) return null;
  const id = gravity.model === 'grail' ? `grail:${gravity.degree}` : 'point_mass:0';
  if (id !== gravitySelectionId(config)) return null;
  return {
    id, model: gravity.model, degree: gravity.degree,
    label: gravity.model === 'grail' ? `GRAIL ${gravity.degree}차` : '기존 점질량',
    totalDeltaV: numeric(result, ['total_delta_v_m_s', 'total_dv_m_s']),
    propellant: numeric(result, ['propellant_consumed_kg', 'propellant_used_kg', 'fuel_used_kg']),
    positionResidual: numeric(result, ['landing_position_error_m', 'position_error_m', 'landing_error_m']),
    speedResidual: numeric(result, ['touchdown_speed_m_s', 'touchdown_velocity_m_s', 'final_speed_m_s']),
    elapsedMs,
  };
}
