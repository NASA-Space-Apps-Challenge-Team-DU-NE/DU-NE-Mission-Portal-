export type Vec3 = [number, number, number];
export type ViewMode = 'moon' | 'orbit' | 'descent' | 'site' | 'follow' | 'system' | 'nrho' | 'transfer';
export interface NRHOSettings {
  mode?: 'b';
  gravity_model?: 'point_mass' | 'grail';
  gravity_degree?: 0 | 20 | 30 | 60 | 90;
  transfer_tof_min_days: number;
  transfer_tof_max_days: number;
  max_transfer_delta_v_m_s: number;
  parking_revolutions: number;
  objective: 'delta_v' | 'time' | 'balanced';
  max_iterations: number;
  max_computation_seconds: number;
  mass_basis: 'llo' | 'nrho';
  /** Optional fixed powered descent time; omitted uses the bounded duration search. */
  powered_descent_duration_s?: number;
  /** North-clockwise approach direction; omitted explores four directions. */
  approach_heading_deg?: number;
}
export interface NRHOSource {
  reference_id: string; label?: string; api_url: string; signature_version: string;
}
export interface NRHOResult {
  mode: 'EPHEMERIS';
  gravity?: { model: 'point_mass' | 'grail'; degree: number; gm_m3_s2: number; reference_radius_m?: number; frame: string; source_url?: string };
  ephemeris?: { coverage_utc: [string, string]; epoch_utc: string; reference_epoch_utc: string };
  source: NRHOSource;
  reference_path_fixed_m: Vec3[];
  system: { earth_position_fixed_m: Vec3; earth_radius_m: number;
    body_path?: Array<{ time_s: number; earth_position_fixed_m: Vec3; sun_position_fixed_m: Vec3 }> };
  transfer?: {
    status: string; departure_time_s?: number; arrival_time_s?: number; duration_s?: number;
    departure_delta_v_m_s?: number; insertion_delta_v_m_s?: number;
    position_error_m?: number; velocity_error_m_s?: number; parking_duration_s?: number;
  };
  mass_basis: 'llo' | 'nrho';
}
export interface Sample {
  time_s: number; phase: string; position_m: Vec3; velocity_m_s: Vec3; fixed_position_m: Vec3;
  altitude_m: number | null; speed_m_s: number; horizontal_speed_m_s: number; vertical_speed_m_s: number;
  mass_kg: number; thrust_n: number; distance_to_target_m: number;
  /** Mode B: radial contact proxy and thrust direction, not measured gear/body attitude. */
  contact_clearance_m?: number | null; thrust_tilt_deg?: number | null;
}
export interface Site {
  id: string; name: string; name_en?: string; latitude_deg?: number; longitude_deg?: number;
  lat_deg?: number; lon_deg?: number; latitude?: number; longitude?: number; elevation_m?: number | null;
  verified?: boolean; note?: string; notes?: string; coordinate_type?: string; category?: string;
  source_url?: string; source?: string; source_keys?: string[];
}
export interface Lander { initial_mass_kg: number; dry_mass_kg: number; max_thrust_n: number; min_thrust_n: number; isp_s: number }
export interface Config {
  initial_orbit?: 'llo' | 'nrho';
  nrho?: NRHOSettings;
  target: { latitude_deg: number; longitude_deg: number; landing_time_utc: string };
  lander: Lander;
  orbit: { altitude_km: number; pdi_altitude_km: number };
  constraints: { position_tolerance_m: number; speed_tolerance_m_s: number; horizontal_speed_tolerance_m_s: number };
  objective: 'fuel' | 'time';
}
export interface SimulationResult {
  nrho?: NRHOResult;
  status: string; trajectory: Sample[];
  summary: Record<string, number | string | null | boolean>;
  validation: Record<string, unknown> | Array<Record<string, unknown>>;
  events?: Array<{ name?: string; phase?: string; time_s: number; fixed_position_m?: Vec3; delta_v_m_s?: number; delta_v_fixed_m_s?: Vec3; [key: string]: unknown }>;
  target?: { latitude_deg: number; longitude_deg: number; elevation_m?: number; fixed_position_m?: Vec3 };
  reference?: Record<string, unknown>; message?: string; warnings?: string[];
  circular_orbit?: Vec3[]; orbit_preview?: Sample[];
}
export interface Terrain {
  status?: string; positions_m?: Vec3[]; indices?: number[]; width?: number; height?: number;
  vertices_m?: Vec3[]; source?: string; vertical_exaggeration?: number;
  elevations_m?: (number | null)[][]; latitude_deg?: number; longitude_deg?: number;
  [key: string]: unknown;
}
export interface Job { id: string; status: string; progress?: string | number | Record<string, unknown>; result?: SimulationResult; error?: string }
