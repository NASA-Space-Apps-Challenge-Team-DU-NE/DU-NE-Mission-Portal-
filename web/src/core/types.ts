// 공용 계약 (CLAUDE.md 8.1, ARCHITECTURE 5절)
// pipeline/luna/contracts.py 와 같은 내용이다. 바꾸려면 CLAUDE.md 12.5 절차를 따른다.
// JSON 필드는 snake_case + 단위 접미사. 좌표는 모두 MOON_ME(평균 지구-극), 동경 +, (−180, 180].

export type Deg = number;
export type ISOTime = string;
/** UTC 밀리초 (core 내부 시간 표현) */
export type TimeMs = number;
export type Vec3 = [number, number, number];

// ───────── 품질·출처 ─────────
/** Drive 목록 엑셀의 품질 상태 */
export type Quality =
  | 'VALIDATED'
  | 'LIMITED_USE'
  | 'REVIEW_REQUIRED'
  | 'REFERENCE_ONLY'
  | 'VALIDATION_FAILED'
  | 'NO_DATA';
/** 값의 종류: 실제 / 근사 / 가정값 / 자료 없음 */
export type DataKind = 'real' | 'approx' | 'assumed' | 'missing';

export interface Provenance {
  drive_path: string;
  sha256: string;
  quality: Quality;
  role: string;
  source_crs?: string;
  transform?: string;
  lon_convention?: string;
}

/** 모든 JSON 산출물의 최상위 형식 */
export interface Envelope<T> {
  schema: string;
  generated_utc: ISOTime;
  provenance: Provenance[];
  kind: DataKind;
  quality: Quality;
  notes: string[];
  data: T;
}

export interface SourceEntry {
  key: string;
  name: string;
  url?: string;
  resolution?: string;
  description?: string;
  kind: DataKind;
  quality?: Quality;
  drive_paths?: string[];
}

export interface QualityEntry {
  kind: DataKind;
  quality: Quality;
  caution?: string | null;
}

// ───────── 위치·카탈로그 ─────────
export interface LatLon {
  lat_deg: Deg;
  lon_deg: Deg;
  elevation_m?: number;
}

export type SiteCategory = 'apollo' | 'clps' | 'international' | 'artemis' | 'other' | 'custom' | 'cell';
export type TerrainKind = 'site' | 'grid' | 'flat';

export interface Site extends LatLon {
  id: string;
  name: string;
  name_en?: string;
  category: SiteCategory;
  terrain: TerrainKind;
  mask?: string | null;
  source_keys: string[];
  verified: boolean;
  note?: string;
}

export type Outcome = 'success' | 'partial' | 'failure';
export interface Mission {
  id: string;
  name: string;
  agency: string;
  landing_utc: ISOTime;
  lat_deg: Deg;
  lon_deg: Deg;
  site_id?: string | null;
  duration_h: number | null;
  outcome: Outcome;
  outcome_reason: string;
  power: 'solar' | 'solar_heater' | 'rtg' | 'battery' | 'unknown';
  comm: 'dte' | 'relay' | 'unknown';
  approach: 'lunar_orbit' | 'direct' | 'unknown';
  ephemeris?: string | null;
  source_keys: string[];
  verified: boolean;
}

export type PanelMount = 'horizontal' | 'vertical_fixed' | 'vertical_tracking';
export interface Lander {
  id: string;
  name: string;
  panel_area_m2: number;
  efficiency: number;
  mount: PanelMount;
  panel_azimuth_deg?: number;
  battery_wh: number;
  battery_min_fraction: number;
  load_active_w: number;
  load_idle_w: number;
  load_survival_w: number;
  rate_kbps: number;
  dust_class: 'small' | 'medium' | 'large';
  approximate: true;
  source_keys: string[];
}

export interface AntennaMask {
  az_step_deg: number;
  elevation_deg: number[];
}
export interface Antenna {
  id: string;
  diameter_m?: number;
  lat_deg?: Deg;
  lon_deg?: Deg;
  height_m?: number;
  horizon_mask?: AntennaMask | null;
}
export interface Station {
  id: string;
  name: string;
  network: 'DSN' | 'KDSN' | 'other';
  lat_deg: Deg;
  lon_deg: Deg;
  height_m: number;
  antennas: Antenna[];
  min_elev_deg: Deg;
  source_keys: string[];
  verified: boolean;
}

export interface PowerRef {
  id: string;
  name: string;
  value: number;
  unit: string;
  note?: string;
  source_keys: string[];
}

// ───────── 지평선·천체력 ─────────
export interface HorizonMask {
  site_id: string;
  lat_deg: Deg;
  lon_deg: Deg;
  ground_elev_m: number;
  observer_height_m: number;
  az_step_deg: number;
  /** index 0 = 방위 0° (북), 시계 방향 */
  elevation_deg: number[];
  max_range_km?: number[];
  terrain: TerrainKind;
  dem_used?: string[];
  compare_drive?: { rms_deg: number; max_deg: number } | null;
}

export interface MastMasks {
  site_id: string;
  heights_m: number[];
  masks: HorizonMask[];
}

export interface EphemerisMeta {
  frame: 'MOON_ME';
  start_utc: ISOTime;
  step_h: number;
  count: number;
  bodies: ['sun', 'earth'];
  /** float32[count][2][3] = (sub_lon_deg, sub_lat_deg, dist_km) */
  layout: string;
  bin: string;
  source: string;
}

export interface AzEl {
  az_deg: Deg;
  el_deg: Deg;
  dist_km: number;
  ang_radius_deg: Deg;
}

export type EphemerisSource = 'table' | 'analytic';
export interface BodyVectors {
  /** 달 중심 MOON_ME km */
  sun: Vec3;
  earth: Vec3;
  source: EphemerisSource;
}

export interface SkyState {
  t: TimeMs;
  sun: AzEl;
  earth: AzEl;
  sun_frac: number;
  earth_visible: boolean;
  horizon_sun_deg: Deg;
  horizon_earth_deg: Deg;
  irr_horizontal_w_m2: number;
  irr_vertical_w_m2: number;
  earth_phase: number;
  source: EphemerisSource;
}

export type TimelineSample = SkyState;

export interface Summary {
  start: TimeMs;
  end: TimeMs;
  step_h: number;
  illum_frac: number;
  sunlit_frac: number;
  comm_frac: number;
  daily_comm_h_min: number;
  longest_dark_h: number;
  longest_no_comm_h: number;
  mean_irr_vertical_w_m2: number;
}

export interface NextEvents {
  next_sunset?: TimeMs;
  next_sunrise?: TimeMs;
  next_earthset?: TimeMs;
  next_earthrise?: TimeMs;
}

export type EventKind =
  | 'sunrise'
  | 'sunset'
  | 'earthrise'
  | 'earthset'
  | 'window_open'
  | 'window_close'
  | 'warning';
export interface SkyEvent {
  t: TimeMs;
  kind: EventKind;
  text_key: string;
  data?: Record<string, number | string>;
}

export interface LandingWindow {
  start: TimeMs;
  end: TimeMs;
  hours: number;
}

// ───────── 요구 조건·시나리오 ─────────
export interface Requirements {
  min_illum_frac: number;
  min_daily_comm_h: number;
  max_dark_h: number;
  min_ops_h: number;
  data_mb: number;
}
export interface ScenarioWeights {
  power: number;
  comm: number;
  robustness: number;
}

export type ScenarioOrigin = 'user' | 'alternative' | 'template' | 'mission' | 'search';
export interface Scenario {
  id: string;
  name: string;
  site: Site;
  landing_utc: ISOTime;
  duration_h: number;
  comm_margin_deg: number;
  lander_id?: string;
  origin: ScenarioOrigin;
}

export interface ScenarioScore {
  total: number;
  power: number;
  comm: number;
  robustness: number;
  meets_requirements: boolean;
  failed: Array<keyof Requirements>;
  reason: string;
}

// ───────── 남극 격자 ─────────
export interface GridManifest {
  projection: string;
  cell_km: number;
  nx: number;
  ny: number;
  /** 왼쪽 모서리 x (km) */
  x0_km: number;
  /** 위쪽 모서리 y (km) */
  y0_km: number;
  lat_limit_deg: Deg;
  n_cells: number;
  cells: string;
  horizon: { file: string; az_step_deg: number; n_az: number; scale: number };
  observer_height_m: number;
}

export type StaticLayerName =
  | 'elev_m'
  | 'slope_mean_deg'
  | 'slope_p90_deg'
  | 'illum_avg'
  | 'earth_vis_avg'
  | 'psr_frac'
  | 'psr_dist_km'
  | 'h_ppm'
  | 'feo_wt'
  | 'tio2_wt'
  | 'feo_wt_kaguya'
  | 'feo_kaguya_valid_frac'
  | 'tio2_wt_jaxa'
  | 'tio2_jaxa_ge2_frac'
  | 'tio2_jaxa_valid_frac'
  | 'scarp_dist_km'
  | 'rockfall_density'
  | 'wac_ill_pct'
  | 'sky_sr';
export type DynamicLayerName = 'illum_mission' | 'comm_mission' | 'sun_now' | 'dark_h';
export type DerivedLayerName = 'composite' | 'safety' | 'geo_hazard' | 'water' | 'metal';
export type LayerName = StaticLayerName | DynamicLayerName | DerivedLayerName;

export interface LayerMeta {
  name: StaticLayerName;
  file: string;
  unit: string;
  kind: DataKind;
  quality: Quality;
  nodata: 'NaN';
  stat: string;
  source_keys: string[];
  coverage: { valid_cells: number; lat_range_deg: [number, number] };
  caution: string | null;
}

export type Criterion = 'power' | 'comm' | 'water' | 'metal' | 'safety' | 'geo';
export type MapWeights = Record<Criterion, number>;

export interface HardFilters {
  min_illum_frac?: number;
  min_comm_frac?: number;
  max_slope_deg?: number;
  max_water_km?: number;
  max_dark_h?: number;
  avoid_faults_km?: number;
  artemis_only?: boolean;
}

// ───────── 검증 ─────────
export interface ValidationResult {
  metric: string;
  n: number;
  mean_diff: number;
  rmse: number;
  r: number | null;
  max_abs: number;
  conditions: Record<string, string | number>;
  worst: Array<{ id: string; diff: number }>;
  pass: boolean | null;
  threshold: number | null;
}
