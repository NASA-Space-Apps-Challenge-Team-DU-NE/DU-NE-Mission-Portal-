// JSON 경계에서 계산·화면에 쓰는 구조를 확인한다. 출처의 null(미상)은 숫자 0으로 바꾸지 않는다.
import type { StaticLayerName } from '../core/types';
export type Check = (value: unknown) => string | null;
export type JsonObject = Record<string, unknown>;
export const object = (v: unknown): v is JsonObject => !!v && typeof v === 'object' && !Array.isArray(v);
export const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const num = (v: unknown, min = -Infinity, max = Infinity): v is number => finite(v) && v >= min && v <= max;
const integer = (v: unknown, min = 0) => num(v, min) && Number.isSafeInteger(v);
const nullable = (v: unknown, check: (x: unknown) => boolean) => v == null || check(v);
const texts = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === 'string');
const date = (v: unknown) => text(v) && Number.isFinite(Date.parse(v));
const oneOf = (v: unknown, values: readonly string[]) => typeof v === 'string' && values.includes(v);
const coord = (v: JsonObject) => num(v.lat_deg, -90, 90) && num(v.lon_deg, -180, 180);
export const quality = (v: unknown) => oneOf(v, ['VALIDATED', 'LIMITED_USE', 'REVIEW_REQUIRED', 'REFERENCE_ONLY', 'VALIDATION_FAILED', 'NO_DATA']);
const kind = (v: unknown) => oneOf(v, ['real', 'approx', 'assumed', 'missing']);
export const relativeFile = (v: unknown): v is string => text(v) && !/[\\?#:]/.test(v) && !v.startsWith('/') && v.split('/').every((p) => p !== '..' && p !== '.' && p !== '');

export function rows(value: unknown, check: (row: JsonObject) => string | null, uniqueKey?: string): string | null {
  if (!Array.isArray(value)) return 'data 가 배열이 아니다';
  const seen = new Set<unknown>();
  for (let i = 0; i < value.length; i++) {
    const row = value[i];
    if (!object(row)) return `${i + 1}행이 객체가 아니다`;
    const bad = check(row);
    if (bad) return `${i + 1}행: ${bad}`;
    if (uniqueKey && seen.has(row[uniqueKey])) return `${i + 1}행: ${uniqueKey} 중복`;
    if (uniqueKey) seen.add(row[uniqueKey]);
  }
  return null;
}

export const manifestCheck: Check = (v) => {
  if (!object(v) || v.schema !== 'luna.manifest.v1' || !date(v.generated_utc) || !integer(v.total_bytes) || typeof v.budget_ok !== 'boolean') return 'manifest 구조 또는 스키마가 다르다';
  return rows(v.files, (f) => relativeFile(f.path) && integer(f.bytes) && typeof f.sha256 === 'string' && /^[a-f0-9]{64}$/i.test(f.sha256) ? null : '파일 경로·길이·SHA-256 형식이 다르다', 'path');
};

const basicCatalog = (r: JsonObject) => text(r.id) && text(r.name) && texts(r.source_keys);
const siteCheck = (r: JsonObject) => coord(r) && typeof r.verified === 'boolean' && oneOf(r.category, ['apollo', 'clps', 'international', 'artemis', 'other', 'custom', 'cell']) && oneOf(r.terrain, ['site', 'grid', 'flat']) && nullable(r.elevation_m, finite) && nullable(r.mask, relativeFile) && nullable(r.name_en, (v) => typeof v === 'string') && nullable(r.note, (v) => typeof v === 'string') && nullable(r.coord_kind, (v) => oneOf(v, ['landing_point', 'candidate_point', 'region_point', 'unknown'])) && nullable(r.coord_evidence, (v) => oneOf(v, ['official', 'peer_reviewed', 'inside_official_region', 'none'])) && nullable(r.coord_source_url, text) && nullable(r.coord_uncertainty_m, (v) => num(v, 0));
export function catalogCheck(name: string): Check {
  return (v) => rows(v, (r) => {
    if (!basicCatalog(r)) return 'id·name·source_keys 형식이 다르다';
    if (name === 'sites') return siteCheck(r) ? null : '착륙지 좌표·지형·선택 필드 형식이 다르다';
    if (name === 'missions') {
      if (!(coord(r) && typeof r.verified === 'boolean' && text(r.agency) && date(r.landing_utc) && 'duration_h' in r && nullable(r.duration_h, (x) => num(x, 0)) && typeof r.outcome_reason === 'string' && oneOf(r.outcome, ['success', 'partial', 'failure']) && oneOf(r.power, ['solar', 'solar_heater', 'rtg', 'battery', 'unknown']) && oneOf(r.comm, ['dte', 'relay', 'unknown']) && oneOf(r.approach, ['lunar_orbit', 'direct', 'unknown']) && nullable(r.ephemeris, relativeFile) && nullable(r.site_id, text))) return '미션 좌표·시각·분류 형식이 다르다';
      if (!nullable(r.lighting_related, (v) => oneOf(v, ['yes', 'no', 'unknown'])) || !nullable(r.landing_precision, (v) => oneOf(v, ['second', 'minute', 'date', 'unknown']))) return '미션 근거 분류 형식이 다르다';
      if (r.lighting_evidence != null && (!object(r.lighting_evidence) || !nullable(r.lighting_evidence.quote, (x) => typeof x === 'string') || !text(r.lighting_evidence.reason) || !nullable(r.lighting_evidence.source_url, text))) return '조명 근거 형식이 다르다';
      if (r.evidence != null && (!object(r.evidence) || !Object.values(r.evidence).every((e) => object(e) && text(e.level) && typeof e.source_url === 'string'))) return '미션 필드 근거 형식이 다르다';
      return null;
    }
    if (name === 'landers') {
      // 카탈로그의 null 제원은 state/data의 명시적 근사 프리셋 또는 사용자 입력으로 채운다.
      const fields = ['panel_area_m2', 'battery_wh', 'load_active_w', 'load_idle_w', 'load_survival_w', 'rate_kbps'];
      return fields.every((k) => k in r && nullable(r[k], (x) => num(x, 0))) && 'efficiency' in r && nullable(r.efficiency, (x) => num(x, 0, 1)) && 'battery_min_fraction' in r && nullable(r.battery_min_fraction, (x) => num(x, 0, 1)) && nullable(r.panel_azimuth_deg, finite) && nullable(r.dust_class, (x) => oneOf(x, ['small', 'medium', 'large'])) && r.approximate === true && oneOf(r.mount, ['horizontal', 'vertical_fixed', 'vertical_tracking']) ? null : '착륙선 제원 형식이 다르다';
    }
    if (name === 'power_refs') return finite(r.value) && text(r.unit) && nullable(r.note, (x) => typeof x === 'string') ? null : '전력 참고값 형식이 다르다';
    if (name === 'stations') {
      if (!coord(r) || !finite(r.height_m) || !num(r.min_elev_deg, -90, 90) || typeof r.verified !== 'boolean' || !oneOf(r.network, ['DSN', 'KDSN', 'other'])) return '지상국 좌표·고도 형식이 다르다';
      return rows(r.antennas, (a) => text(a.id) && nullable(a.lat_deg, (x) => num(x, -90, 90)) && nullable(a.lon_deg, (x) => num(x, -180, 180)) && nullable(a.height_m, finite) && nullable(a.diameter_m, (x) => num(x, 0)) && (a.horizon_mask == null || maskAnglesCheck(a.horizon_mask) === null) ? null : '안테나 또는 지평선 형식이 다르다', 'id');
    }
    return '지원하지 않는 카탈로그';
  }, 'id');
}

export const maskAnglesCheck: Check = (v) => {
  if (!object(v) || !Array.isArray(v.elevation_deg) || !num(v.az_step_deg, Number.MIN_VALUE, 360) || v.elevation_deg.length < 2) return '방위 표본과 간격 형식이 다르다';
  // DSN 원자료는 360° 종단 표본을 포함한다. 경계의 실측값 차이도 보정하지 않고 보존한다.
  const closed = Math.abs((v.elevation_deg.length - 1) * v.az_step_deg - 360) < 1e-8;
  if (Math.abs(v.elevation_deg.length * v.az_step_deg - 360) > 1e-8 && !closed) return '방위 표본과 간격이 360° 와 맞지 않는다';
  return v.elevation_deg.every((x) => num(x, -90, 90)) ? null : '고도각 값이 범위를 벗어난다';
};
export const maskCheck: Check = (v) => {
  if (!object(v) || !text(v.site_id) || !coord(v) || !finite(v.ground_elev_m) || !num(v.observer_height_m, 0) || !oneOf(v.terrain, ['site', 'grid', 'flat'])) return '지평선 위치·높이·지형 형식이 다르다';
  return maskAnglesCheck(v);
};
export const mastCheck: Check = (v) => {
  if (!object(v) || !text(v.site_id) || !Array.isArray(v.heights_m) || !Array.isArray(v.masks) || !v.masks.length || v.masks.length !== v.heights_m.length || !v.heights_m.every((h) => num(h, 0))) return '높이와 마스크 목록이 맞지 않는다';
  for (let i = 0; i < v.masks.length; i++) {
    const m = v.masks[i], bad = maskCheck(m);
    if (bad) return `마스크 ${i + 1}: ${bad}`;
    if (m.site_id !== v.site_id || m.observer_height_m !== v.heights_m[i]) return '마스크 위치·관측 높이가 목록과 다르다';
  }
  return null;
};
export const ephemerisCheck: Check = (v) => {
  if (!object(v) || !relativeFile(v.bin) || !integer(v.count, 2) || !num(v.step_h, Number.MIN_VALUE) || !date(v.start_utc)) return '천체력 시각·행 수·간격 형식이 다르다';
  if (v.frame !== 'MOON_ME' || !Array.isArray(v.bodies) || v.bodies.join(',') !== 'sun,earth' || v.layout !== 'float32[count][2][3] (sub_lon_deg, sub_lat_deg, dist_km)' || !text(v.source)) return '지원하지 않는 천체력 프레임·천체·배열 형식';
  const end = Date.parse(v.start_utc as string) + ((v.count as number) - 1) * (v.step_h as number) * 3600000;
  return Number.isFinite(new Date(end).getTime()) ? null : '천체력 종료 시각이 유효하지 않다';
};
export function ephemerisRowsCheck(v: Float32Array): string | null {
  for (let i = 0; i < v.length; i += 3) if (!num(v[i], -180, 180) || !num(v[i + 1], -90, 90) || !num(v[i + 2], Number.MIN_VALUE)) return `천체력 ${Math.floor(i / 6) + 1}행: 좌표·거리가 유효하지 않다`;
  return null;
}
export const gridCheck: Check = (v) => {
  if (!object(v) || !text(v.projection) || !relativeFile(v.cells) || !integer(v.nx, 1) || !integer(v.ny, 1) || !integer(v.n_cells, 1) || !finite(v.x0_km) || !finite(v.y0_km) || !num(v.cell_km, Number.MIN_VALUE) || !num(v.lat_limit_deg, -90, 0) || !num(v.observer_height_m, 0)) return '격자 크기·원점·좌표 형식이 다르다';
  if (!Number.isSafeInteger((v.nx as number) * (v.ny as number)) || (v.n_cells as number) > (v.nx as number) * (v.ny as number)) return '격자 칸 개수가 범위를 벗어난다';
  if (!finite(v.x0_km + (v.nx as number) * v.cell_km) || !finite(v.y0_km - (v.ny as number) * v.cell_km)) return '격자 범위 계산이 유효하지 않다';
  const h = v.horizon;
  return object(h) && relativeFile(h.file) && integer(h.n_az, 2) && num(h.az_step_deg, Number.MIN_VALUE) && Math.abs((h.n_az as number) * (h.az_step_deg as number) - 360) < 1e-8 && num(h.scale, Number.MIN_VALUE) ? null : '격자 지평선 간격·배율 형식이 다르다';
};
// 유니온에 레이어가 추가되면 이 목록의 누락도 타입 검사에서 드러난다.
const staticLayers: Record<StaticLayerName, true> = {
  elev_m: true, slope_mean_deg: true, slope_p90_deg: true, illum_avg: true, earth_vis_avg: true,
  psr_frac: true, psr_dist_km: true, h_ppm: true, feo_wt: true, tio2_wt_lp: true, tio2_lp_sigma: true,
  feo_wt_kaguya: true, feo_kaguya_valid_frac: true, tio2_jaxa_mi_research: true, tio2_jaxa_mi_flags: true,
  psr_poly_dist_km: true, plains_frac: true, boulder_count: true, wac_ill_twi: true, scarp_dist_km: true,
  rockfall_density: true, rockfall_coverage: true, wac_ill_pct: true, sky_sr: true,
};
const layerName = (v: unknown) => text(v) && Object.prototype.hasOwnProperty.call(staticLayers, v);
export const layerCheck = (r: JsonObject): string | null => layerName(r.name) && relativeFile(r.file) && typeof r.unit === 'string' && kind(r.kind) && quality(r.quality) && r.nodata === 'NaN' && text(r.stat) && texts(r.source_keys) && object(r.coverage) && integer(r.coverage.valid_cells) && Array.isArray(r.coverage.lat_range_deg) && r.coverage.lat_range_deg.length === 2 && r.coverage.lat_range_deg.every((x) => num(x, -90, 90)) && nullable(r.caution, (x) => typeof x === 'string') ? null : '레이어 메타 형식이 다르다';
export const layersCheck: Check = (v) => !Array.isArray(v) || !v.length ? '레이어 목록이 비어 있거나 배열이 아니다' : rows(v, layerCheck, 'name');
export const artemisCheck: Check = (v) => rows(v, (r) => text(r.id) && text(r.name) && text(r.code) && num(r.area_km2, 0) && Array.isArray(r.rings) && r.rings.length > 0 && r.rings.every((ring) => Array.isArray(ring) && ring.length >= 3 && ring.every((p) => Array.isArray(p) && p.length === 2 && num(p[0], -180, 180) && num(p[1], -90, 90))) ? null : '지역 경계 좌표 형식이 다르다', 'id');
export const sourcesCheck: Check = (v) => rows(v, (r) => text(r.key) && text(r.name) && kind(r.kind) && nullable(r.quality, quality) && nullable(r.url, text) && nullable(r.drive_paths, texts) && ['resolution', 'description'].every((k) => nullable(r[k], (x) => typeof x === 'string')) ? null : '출처 항목 형식이 다르다', 'key');
export const qualityCheck: Check = (v) => object(v) && Object.values(v).every((r) => object(r) && kind(r.kind) && quality(r.quality) && nullable(r.caution, (x) => typeof x === 'string')) ? null : '품질 목록 형식이 다르다';

export const texturesCheck: Check = (v) => object(v) && Object.values(v).every((r) => object(r) && relativeFile(r.file) && text(r.projection) && ['size', 'width', 'height', 'radius_km'].every((k) => nullable(r[k], (x) => num(x, Number.MIN_VALUE)))) ? null : '텍스처 메타 형식이 다르다';
export const localCheck: Check = (v) => {
  if (!object(v) || !num(v.half_km, Number.MIN_VALUE) || !integer(v.size_px, 1) || !num(v.m_per_px, Number.MIN_VALUE) || !text(v.frame) || !object(v.light) || !finite(v.light.az_deg) || !num(v.light.alt_deg, -90, 90) || !object(v.sites)) return '국지 지형 메타 형식이 다르다';
  return Object.values(v.sites).every((r) => object(r) && relativeFile(r.file) && coord(r) && ['elev_center_m', 'elev_min_m', 'elev_max_m'].every((k) => finite(r[k])) && num(r.missing_frac, 0, 1)) ? null : '국지 지형 지점 형식이 다르다';
};
export const ellipseCheck: Check = (v) => {
  if (!object(v) || !num(v.half_km, Number.MIN_VALUE)) return '타원 지형 범위가 유효하지 않다';
  const pair = (x: unknown) => Array.isArray(x) && x.length === 2 && x.every(finite);
  return rows(v.sites, (r) => text(r.id) && relativeFile(r.file) && num(r.res_m, Number.MIN_VALUE) && integer(r.size, 1) && pair(r.center_px) && pair(r.east_xy) && pair(r.north_xy) && num(r.nodata_frac, 0, 1) && nullable(r.observed_frac, (x) => num(x, 0, 1)) && text(r.source) ? null : '타원 지형 지점 형식이 다르다', 'id');
};

export const validationRowsCheck: Check = (v) => rows(v, (r) => text(r.metric) && integer(r.n) && ['mean_diff', 'rmse', 'max_abs', 'r', 'threshold'].every((k) => nullable(r[k], finite)) && object(r.conditions) && Array.isArray(r.worst) && r.worst.every(object) && nullable(r.pass, (x) => typeof x === 'boolean') ? null : '검증 통계 행 형식이 다르다');

export type ExtraValidationName = 'catalog_sites' | 'catalog_missions' | 'ephemeris_spice' | 'layers_minerals';
const scalar = (x: unknown) => x == null || ['string', 'boolean'].includes(typeof x) || finite(x);
const scalarRow = (r: JsonObject) => Object.values(r).every(scalar) ? null : '표시 필드가 단일 값이 아니다';
export const extraChecks: Record<ExtraValidationName, Check> = {
  catalog_sites: (v) => rows(v, (r) => text(r.id) && text(r.name) ? scalarRow(r) : '지점 id·name이 없다'),
  catalog_missions: (v) => rows(v, (r) => text(r.mission_id) && text(r.field) ? scalarRow(r) : '미션 id·field가 없다'),
  ephemeris_spice: (v) => {
    if (!object(v)) return '천체력 대조 결과가 객체가 아니다';
    if (v.common_window_utc != null && (!Array.isArray(v.common_window_utc) || v.common_window_utc.length !== 2 || !v.common_window_utc.every(date))) return '커널 공통 기간 형식이 다르다';
    if (v.vs_horizons_range != null && !object(v.vs_horizons_range)) return '범위 표 대조 형식이 다르다';
    if (v.vs_horizons_missions != null && (!object(v.vs_horizons_missions) || !Object.values(v.vs_horizons_missions).every((r) => r == null || object(r)))) return '미션 표 대조 형식이 다르다';
    if (v.interp_error_if_step_widened != null && (!object(v.interp_error_if_step_widened) || !Object.values(v.interp_error_if_step_widened).every((r) => object(r) && Object.values(r).every(object)))) return '보간 오차 대조 형식이 다르다';
    return null;
  },
  layers_minerals: (v) => {
    if (!object(v) || !Object.values(v).every(object)) return '광물 대조 결과가 객체가 아니다';
    for (const r of Object.values(v) as JsonObject[]) {
      if (r.latitude_bands != null) { const bad = rows(r.latitude_bands, scalarRow); if (bad) return `위도대: ${bad}`; }
      for (const k of ['raw_adapter', 'orientation_check', 'vs_lp_0p5deg', 'near_duplicates_not_merged', 'confidence_0p8_sensitivity', 'vs_raster_psr_dist']) if (r[k] != null && !object(r[k])) return `${k} 대조 형식이 다르다`;
    }
    return null;
  },
};
