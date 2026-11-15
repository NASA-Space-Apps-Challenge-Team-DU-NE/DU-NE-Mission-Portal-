// 남극 격자 점수 (묶음 B, CLAUDE.md 8.5). Worker 에서 돈다.
import { DARK_FRAC, DEG, HOUR_MS, R_MOON_KM, RAD } from './constants';
import type { Ephemeris } from './ephemeris';
import { diskFraction } from './horizon';
import { fastFrame, fastTopo, type FastFrame } from './sky';
import { intervalHours, sampleTimes } from './timeline';
import type { Criterion, Deg, GridManifest, HardFilters, MapWeights, StaticLayerName, TimeMs, Vec3 } from './types';
import { aeqdForward, aeqdInverse, clamp, greatCircleKm, localFrame, normLon } from './vec';
import type { BandTerrainManifest, PolarTerrainManifest } from './terrainGrids';

/** 지도·점수 격자 지역: 남극 5 km AEQD, 북극 5 km AEQD, 75°S–75°N 15 km 위도 띠 */
export type GridRegion = 'south' | 'north' | 'global';

export interface GridGeometry {
  region: GridRegion;
  /** 극 격자는 실제 manifest. 위도 띠 격자는 nx=ny=0 인 요약(cell_km·horizon·observer_height_m 만 의미 있음) — 원본은 band */
  manifest: GridManifest;
  band?: BandTerrainManifest;
  /** 유효 칸 → row*nx+col */
  cells: Uint32Array;
  /** int16 [n_cells][n_az] × scale */
  horizon: Int16Array;
  lat: Float32Array;
  lon: Float32Array;
  /** 극 격자의 평면 좌표 (남극 y=ρ·cosλ, 북극 y=−ρ·cosλ). 위도 띠 격자는 NaN — 거리는 cellDistKm 로 */
  x_km: Float32Array;
  y_km: Float32Array;
  /** 위경도 → 칸 순번 (밖이면 −1) */
  locate(lat: Deg, lon: Deg): number;
}

export function buildGeometry(manifest: GridManifest, cells: Uint32Array, horizon: Int16Array): GridGeometry {
  const n = cells.length;
  const lat = new Float32Array(n), lon = new Float32Array(n), x = new Float32Array(n), y = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const row = Math.floor(cells[i] / manifest.nx);
    const col = cells[i] % manifest.nx;
    const cx = manifest.x0_km + (col + 0.5) * manifest.cell_km;
    const cy = manifest.y0_km - (row + 0.5) * manifest.cell_km;
    const ll = aeqdInverse(cx, cy);
    lat[i] = ll.lat_deg;
    lon[i] = ll.lon_deg;
    x[i] = cx;
    y[i] = cy;
  }
  const slot = slotsOf(manifest.nx * manifest.ny, cells);
  const locate = (la: Deg, lo: Deg) => {
    if (!(la <= manifest.lat_limit_deg)) return -1;
    const p = aeqdForward(la, lo);
    return polarSlot(manifest, slot, p.x_km, p.y_km);
  };
  return { region: 'south', manifest, cells, horizon, lat, lon, x_km: x, y_km: y, locate };
}

function slotsOf(size: number, cells: Uint32Array): Int32Array {
  const s = new Int32Array(size).fill(-1);
  for (let i = 0; i < cells.length; i++) if (cells[i] < size) s[cells[i]] = i;
  return s;
}
function polarSlot(m: { nx: number; ny: number; x0_km: number; y0_km: number; cell_km: number }, slot: Int32Array, x: number, y: number): number {
  const col = Math.floor((x - m.x0_km) / m.cell_km), row = Math.floor((m.y0_km - y) / m.cell_km);
  if (!(col >= 0 && col < m.nx && row >= 0 && row < m.ny)) return -1;
  return slot[row * m.nx + col];
}

/** 북극 5 km AEQD (x=ρ·sinλ, y=−ρ·cosλ). 칸 번호 규칙은 파이프라인 GridSpec(pole=NORTH) 과 같다 */
export function buildNorthGeometry(m: PolarTerrainManifest, cells: Uint32Array, horizon: Int16Array): GridGeometry {
  const n = cells.length;
  const lat = new Float32Array(n), lon = new Float32Array(n), x = new Float32Array(n), y = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const row = Math.floor(cells[i] / m.nx), col = cells[i] % m.nx;
    const cx = m.x0_km + (col + 0.5) * m.cell_km, cy = m.y0_km - (row + 0.5) * m.cell_km;
    const rho = Math.hypot(cx, cy);
    lat[i] = 90 - (rho / R_MOON_KM) * RAD;
    lon[i] = rho === 0 ? 0 : normLon(Math.atan2(cx, -cy) * RAD);
    x[i] = cx;
    y[i] = cy;
  }
  const slot = slotsOf(m.nx * m.ny, cells);
  const locate = (la: Deg, lo: Deg) => {
    if (!(la >= m.lat_limit_deg)) return -1;
    const rho = R_MOON_KM * (90 - la) * DEG;
    return polarSlot(m, slot, rho * Math.sin(lo * DEG), -rho * Math.cos(lo * DEG));
  };
  return { region: 'north', manifest: { ...m }, cells, horizon, lat, lon, x_km: x, y_km: y, locate };
}

/** 75°S–75°N 위도 띠 격자 (남쪽 띠부터, 경도 −180° 부터). 칸 번호 규칙은 파이프라인 BandGridSpec 과 같다 */
export function buildBandGeometry(m: BandTerrainManifest, cells: Uint32Array, horizon: Int16Array): GridGeometry {
  const n = cells.length;
  const rowOffset = new Int32Array(m.n_rows + 1);
  for (let r = 0; r < m.n_rows; r++) rowOffset[r + 1] = rowOffset[r] + m.n_lon[r];
  const lat = new Float32Array(n), lon = new Float32Array(n);
  const x = new Float32Array(n).fill(NaN), y = new Float32Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    const id = cells[i];
    let lo = 0, hi = m.n_rows - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (rowOffset[mid] <= id) lo = mid; else hi = mid - 1; }
    const col = id - rowOffset[lo];
    lat[i] = -m.lat_max_deg + (lo + 0.5) * m.dlat_deg;
    lon[i] = -180 + ((col + 0.5) * 360) / m.n_lon[lo];
  }
  const slot = slotsOf(m.n_cells_total, cells);
  const locate = (la: Deg, lo: Deg) => {
    if (!Number.isFinite(la) || !Number.isFinite(lo)) return -1;
    const row = Math.floor((la + m.lat_max_deg) / m.dlat_deg);
    if (row < 0 || row >= m.n_rows) return -1;
    const k = m.n_lon[row];
    const col = Math.min(k - 1, Math.floor((((normLon(lo) + 180) % 360) / 360) * k));
    return slot[rowOffset[row] + col];
  };
  const manifest: GridManifest = {
    projection: m.projection, cell_km: m.cell_km, nx: 0, ny: 0, x0_km: 0, y0_km: 0, lat_limit_deg: m.lat_max_deg,
    n_cells: m.n_cells, cells: m.cells, horizon: m.horizon, observer_height_m: m.observer_height_m,
  };
  return { region: 'global', manifest, band: m, cells, horizon, lat, lon, x_km: x, y_km: y, locate };
}

/** 지역별 manifest → 격자 기하 */
export function geometryFor(region: GridRegion, manifest: GridManifest | PolarTerrainManifest | BandTerrainManifest, cells: Uint32Array, horizon: Int16Array): GridGeometry {
  if (region === 'global') return buildBandGeometry(manifest as BandTerrainManifest, cells, horizon);
  if (region === 'north') return buildNorthGeometry(manifest as PolarTerrainManifest, cells, horizon);
  return buildGeometry(manifest as GridManifest, cells, horizon);
}

/** 두 칸 사이 거리 (km): 극 격자는 평면 거리(기존 동작), 위도 띠는 대권 거리 */
export function cellDistKm(g: GridGeometry, i: number, j: number): number {
  if (g.region === 'global') return greatCircleKm(g.lat[i], g.lon[i], g.lat[j], g.lon[j]);
  return Math.hypot(g.x_km[i] - g.x_km[j], g.y_km[i] - g.y_km[j]);
}

/** 패널 추천 후보: 중심 칸 반경 안의 칸 (경사 상한 적용). x/y 는 후보 간 간격 판정용 평면 좌표:
 *  극 격자는 격자 평면, 위도 띠는 중심 칸 기준 국지 평면 (반경 수십 km) */
export interface PanelCand { cell: number; lat_deg: Deg; lon_deg: Deg; distance_km: number; x_km: number; y_km: number; elev_m: number; mask: { az_step_deg: number; elevation_deg: number[] } }
export function panelCandidates(g: GridGeometry, st: StaticLayers, c0: number, radius_km: number, max_slope_deg: number | null): PanelCand[] {
  const out: PanelCand[] = [];
  if (!(c0 >= 0 && c0 < g.cells.length)) return out;
  for (let i = 0; i < g.cells.length; i++) {
    const d = cellDistKm(g, i, c0);
    if (!(d <= radius_km)) continue;
    if (max_slope_deg !== null && st.slope_p90_deg && !(st.slope_p90_deg[i] <= max_slope_deg)) continue;
    const [x, y] = g.region === 'global'
      ? [R_MOON_KM * normLon(g.lon[i] - g.lon[c0]) * DEG * Math.cos(g.lat[c0] * DEG), R_MOON_KM * (g.lat[i] - g.lat[c0]) * DEG]
      : [g.x_km[i], g.y_km[i]];
    const e = st.elev_m?.[i];
    out.push({ cell: i, lat_deg: g.lat[i], lon_deg: g.lon[i], distance_km: d, x_km: x, y_km: y, elev_m: e != null && Number.isFinite(e) ? e : 0, mask: cellMask(g, i) });
  }
  return out;
}

export function cellHorizonAt(g: GridGeometry, cell: number, az: number): number {
  const nAz = g.manifest.horizon.n_az;
  const step = g.manifest.horizon.az_step_deg;
  const f = az / step;
  const i0 = Math.floor(f) % nAz;
  const i1 = (i0 + 1) % nAz;
  const w = f - Math.floor(f);
  const o = cell * nAz;
  return (g.horizon[o + i0] * (1 - w) + g.horizon[o + i1] * w) * g.manifest.horizon.scale;
}

export function cellMask(g: GridGeometry, cell: number) {
  const nAz = g.manifest.horizon.n_az;
  const el = new Array<number>(nAz);
  for (let i = 0; i < nAz; i++) el[i] = g.horizon[cell * nAz + i] * g.manifest.horizon.scale;
  return { az_step_deg: g.manifest.horizon.az_step_deg, elevation_deg: el };
}

/** 한 번 계산하면 재사용하는 칸별 국지 좌표계 */
export function cellFrames(g: GridGeometry, elev?: Float32Array | null): FastFrame[] {
  const out: FastFrame[] = new Array(g.cells.length);
  for (let i = 0; i < g.cells.length; i++) {
    const h = elev && Number.isFinite(elev[i]) ? elev[i] : 0;
    out[i] = fastFrame(localFrame(g.lat[i], g.lon[i], h, g.manifest.observer_height_m));
  }
  return out;
}

export interface DynamicRequest {
  start: TimeMs;
  duration_h: number;
  step_h: number;
  now: TimeMs;
  margin_deg: number;
}
export interface DynamicLayers {
  illum_mission: Float32Array;
  comm_mission: Float32Array;
  sun_now: Float32Array;
  dark_h: Float32Array;
  /** 칸별 햇빛·교신 이진 패턴 (빛 쌍둥이·릴레이용) */
  lit_bits: Uint8Array;
  comm_bits: Uint8Array;
  n_samples: number;
  /** 표본별 실제 적분 시간. 종료 표본은 0 h (릴레이에도 같은 기간 사용). */
  sample_hours: Float64Array;
}

/** 임무 기간 동적 레이어 (최대 60일, 6 h 간격 기본) */
export function computeDynamic(
  g: GridGeometry,
  frames: FastFrame[],
  eph: Ephemeris,
  req: DynamicRequest,
  onProgress?: (f: number) => void,
): DynamicLayers {
  const n = g.cells.length;
  const dur = Math.min(req.duration_h, 60 * 24);
  // 표본 시각과 적분 구간 분리: 표본 k 는 [t_k, t_{k+1}) 을 대표, 마지막(종료) 표본은 0 h
  const times: TimeMs[] = sampleTimes(req.start, req.start + dur * HOUR_MS, req.step_h);
  const m = times.length;
  const sampleHours = intervalHours(times);
  const wt = sampleHours.slice();
  let wTot = 0;
  for (let k = 0; k < m; k++) wTot += wt[k];
  const wNorm = wTot > 0 ? wTot : 1;
  if (wTot === 0) wt[0] = 1;
  const bodies = times.map((t) => eph.bodyVectors(t));
  const sunDirs = bodies.map((b) => {
    const d = Math.hypot(b.sun[0], b.sun[1], b.sun[2]);
    return { v: [b.sun[0] / d, b.sun[1] / d, b.sun[2] / d] as Vec3, r: Math.asin(695700 / d) * RAD };
  });
  const nowB = eph.bodyVectors(req.now);
  const nowD = Math.hypot(...nowB.sun);
  const nowDir: Vec3 = [nowB.sun[0] / nowD, nowB.sun[1] / nowD, nowB.sun[2] / nowD];
  const nowR = Math.asin(695700 / nowD) * RAD;

  const illum = new Float32Array(n), comm = new Float32Array(n), sunNow = new Float32Array(n), dark = new Float32Array(n);
  const litBits = new Uint8Array(n * m), commBits = new Uint8Array(n * m);
  for (let i = 0; i < n; i++) {
    const f = frames[i];
    let fs = 0, cv = 0, run = 0, best = 0;
    for (let k = 0; k < m; k++) {
      const s = sunDirs[k];
      const x = s.v[0] * f.ex + s.v[1] * f.ey;
      const y = s.v[0] * f.nx + s.v[1] * f.ny + s.v[2] * f.nz;
      const z = s.v[0] * f.ux + s.v[1] * f.uy + s.v[2] * f.uz;
      let az = Math.atan2(x, y) * RAD;
      if (az < 0) az += 360;
      const el = Math.asin(z) * RAD;
      const fr = diskFraction(el, cellHorizonAt(g, i, az), s.r);
      fs += fr * wt[k];
      if (fr <= DARK_FRAC) {
        run += wt[k];
        if (run > best) best = run;
      } else {
        run = 0;
        litBits[i * m + k] = 1;
      }
      const [eaz, eel] = fastTopo(f, bodies[k].earth);
      if (eel > cellHorizonAt(g, i, eaz) + req.margin_deg) {
        cv += wt[k];
        commBits[i * m + k] = 1;
      }
    }
    illum[i] = fs / wNorm;
    comm[i] = cv / wNorm;
    dark[i] = wTot > 0 ? best : 0;
    {
      const x = nowDir[0] * f.ex + nowDir[1] * f.ey;
      const y = nowDir[0] * f.nx + nowDir[1] * f.ny + nowDir[2] * f.nz;
      const z = nowDir[0] * f.ux + nowDir[1] * f.uy + nowDir[2] * f.uz;
      let az = Math.atan2(x, y) * RAD;
      if (az < 0) az += 360;
      sunNow[i] = diskFraction(Math.asin(z) * RAD, cellHorizonAt(g, i, az), nowR);
    }
    if (onProgress && i % 2000 === 0) onProgress(i / n);
  }
  return { illum_mission: illum, comm_mission: comm, sun_now: sunNow, dark_h: dark, lit_bits: litBits, comm_bits: commBits, n_samples: m, sample_hours: sampleHours };
}

// ───────── 기준 정규화·종합 점수 ─────────
export type StaticLayers = Partial<Record<StaticLayerName, Float32Array>>;

export interface CriterionInfo {
  criterion: Criterion;
  /** 0~1 또는 NaN (자료 없음) */
  values: Float32Array;
  available: boolean;
  /** 계산에 쓴 레이어 이름 (화면 표시) */
  uses: string[];
}

const SAFETY_SLOPE_REF_DEG = 16; // PROVISIONAL (CLAUDE.md 8.5)
const WATER_REF_KM = 50; // PROVISIONAL: PSR 까지 0 km → 1, 50 km 이상 → 0
const FEO_REF_WT = 20; // PROVISIONAL
const TIO2_REF_WT = 10; // PROVISIONAL

function finiteCount(a?: Float32Array): number {
  if (!a) return 0;
  let c = 0;
  for (let i = 0; i < a.length; i++) if (Number.isFinite(a[i])) c++;
  return c;
}
const has = (a?: Float32Array) => finiteCount(a) > 0;

export function safetyValues(st: StaticLayers, n: number): CriterionInfo {
  const s = st.slope_p90_deg;
  const v = new Float32Array(n).fill(NaN);
  if (s) for (let i = 0; i < n; i++) v[i] = Number.isFinite(s[i]) ? clamp(1 - s[i] / SAFETY_SLOPE_REF_DEG, 0, 1) : NaN;
  return { criterion: 'safety', values: v, available: has(s), uses: s ? ['slope_p90_deg'] : [] };
}

/** 지질: 단층 거리·급경사·낙석 밀도 중 자료가 있는 항만 곱한다 */
export function geoValues(st: StaticLayers, n: number): CriterionInfo {
  const sc = st.scarp_dist_km, sl = st.slope_p90_deg, rf = st.rockfall_density;
  let rfMax = 0;
  if (rf) for (let i = 0; i < n; i++) if (Number.isFinite(rf[i]) && rf[i] > rfMax) rfMax = rf[i];
  const uses: string[] = [];
  if (has(sc)) uses.push('scarp_dist_km');
  if (has(sl)) uses.push('slope_p90_deg');
  if (has(rf) && rfMax > 0) uses.push('rockfall_density');
  const v = new Float32Array(n).fill(NaN);
  if (uses.length)
    for (let i = 0; i < n; i++) {
      let x = 1, any = false;
      if (sc && uses.includes('scarp_dist_km') && Number.isFinite(sc[i])) { x *= clamp(1 - Math.exp(-sc[i] / 10), 0, 1); any = true; }
      if (sl && uses.includes('slope_p90_deg') && Number.isFinite(sl[i])) { x *= clamp(1 - Math.max(0, sl[i] - 15) / 15, 0, 1); any = true; }
      if (rf && uses.includes('rockfall_density') && Number.isFinite(rf[i])) { x *= 1 - rf[i] / rfMax; any = true; }
      v[i] = any ? x : NaN;
    }
  return { criterion: 'geo', values: v, available: uses.length > 0, uses };
}

export function waterValues(st: StaticLayers, n: number): CriterionInfo {
  const d = st.psr_dist_km;
  const v = new Float32Array(n).fill(NaN);
  if (d) for (let i = 0; i < n; i++) v[i] = Number.isFinite(d[i]) ? clamp(1 - d[i] / WATER_REF_KM, 0, 1) : NaN;
  return { criterion: 'water', values: v, available: has(d), uses: d ? ['psr_dist_km'] : [] };
}

export function metalValues(st: StaticLayers, n: number): CriterionInfo {
  const fe = st.feo_wt, ti = st.tio2_wt_lp; // JAXA MI 는 정량 미검증이라 점수에 쓰지 않는다
  const v = new Float32Array(n).fill(NaN);
  const uses = [has(fe) ? 'feo_wt' : '', has(ti) ? 'tio2_wt_lp' : ''].filter(Boolean);
  for (let i = 0; i < n; i++) {
    const parts: number[] = [];
    if (fe && Number.isFinite(fe[i])) parts.push(clamp(fe[i] / FEO_REF_WT, 0, 1));
    if (ti && Number.isFinite(ti[i])) parts.push(clamp(ti[i] / TIO2_REF_WT, 0, 1));
    v[i] = parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : NaN;
  }
  return { criterion: 'metal', values: v, available: uses.length > 0, uses };
}

export function criteriaFor(dyn: DynamicLayers | null, st: StaticLayers, n: number): Record<Criterion, CriterionInfo> {
  const nanArr = () => new Float32Array(n).fill(NaN);
  return {
    power: dyn ? { criterion: 'power', values: dyn.illum_mission, available: true, uses: ['illum_mission'] } : { criterion: 'power', values: nanArr(), available: false, uses: [] },
    comm: dyn ? { criterion: 'comm', values: dyn.comm_mission, available: true, uses: ['comm_mission'] } : { criterion: 'comm', values: nanArr(), available: false, uses: [] },
    water: waterValues(st, n),
    metal: metalValues(st, n),
    safety: safetyValues(st, n),
    geo: geoValues(st, n),
  };
}

export interface FilterState {
  key: keyof HardFilters;
  active: boolean;
  /** 자료가 없어서 비활성 */
  disabled: boolean;
}

export interface ScoreResult {
  composite: Float32Array;
  pass: Uint8Array;
  passCount: number;
  /** 가중치가 0 이 아니고 자료가 있는 기준 */
  usedCriteria: Criterion[];
  missingCriteria: Criterion[];
  filters: FilterState[];
}

export interface ScoreInput {
  g: GridGeometry;
  dyn: DynamicLayers | null;
  st: StaticLayers;
  weights: MapWeights;
  filters: HardFilters;
  /** 아르테미스 후보 대표점 (artemis_only 필터, 공식 경계가 없을 때만 반경 근사) */
  artemisPoints?: Array<{ lat_deg: number; lon_deg: number }>;
  artemisRadiusKm?: number;
  /** 아르테미스 III 후보 지역 공식 경계 (경위도 고리 [lon, lat][]). 있으면 반경 근사 대신 쓴다 */
  artemisRegions?: Array<{ rings: Array<Array<[number, number]>> }>;
}

/** 경위도 고리 → 남극 방위 등거리 평면 (극·경도 ±180 경계를 피하려고 평면에서 판정) */
export function ringToAeqd(ring: Array<[number, number]>): Array<[number, number]> {
  return ring.map(([lon, lat]) => { const p = aeqdForward(lat, lon); return [p.x_km, p.y_km]; });
}

/** 짝홀 규칙 점-다각형 판정 (평면 좌표) */
export function pointInRing(x: number, y: number, ring: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function scoreGrid(inp: ScoreInput): ScoreResult {
  const n = inp.g.cells.length;
  const crit = criteriaFor(inp.dyn, inp.st, n);
  const keys = Object.keys(inp.weights) as Criterion[];
  const used = keys.filter((k) => inp.weights[k] > 0 && crit[k].available);
  const missing = keys.filter((k) => inp.weights[k] > 0 && !crit[k].available);
  const composite = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0, w = 0;
    for (const k of used) {
      const v = crit[k].values[i];
      if (Number.isFinite(v)) { s += v * inp.weights[k]; w += inp.weights[k]; }
    }
    composite[i] = w > 0 ? s / w : NaN;
  }
  const f = inp.filters;
  const st = inp.st, dyn = inp.dyn;
  const filters: FilterState[] = [
    { key: 'min_illum_frac', active: f.min_illum_frac !== undefined, disabled: !dyn },
    { key: 'min_comm_frac', active: f.min_comm_frac !== undefined, disabled: !dyn },
    { key: 'max_slope_deg', active: f.max_slope_deg !== undefined, disabled: !has(st.slope_p90_deg) },
    { key: 'max_water_km', active: f.max_water_km !== undefined, disabled: !has(st.psr_dist_km) },
    { key: 'max_dark_h', active: f.max_dark_h !== undefined, disabled: !dyn },
    { key: 'avoid_faults_km', active: f.avoid_faults_km !== undefined, disabled: !has(st.scarp_dist_km) },
    { key: 'artemis_only', active: !!f.artemis_only, disabled: !(inp.artemisRegions?.length || inp.artemisPoints?.length) },
  ];
  const on = (k: keyof HardFilters) => filters.find((x) => x.key === k)!;
  const pass = new Uint8Array(n);
  let passCount = 0;
  const artR = inp.artemisRadiusKm ?? 15;
  // 아르테미스 후보 경계·지점은 남극에만 있다 (평면 판정도 남극 AEQD)
  const regionRings = inp.g.region === 'south' ? (inp.artemisRegions ?? []).flatMap((r) => r.rings.map(ringToAeqd)) : [];
  const inArtemis = (i: number) =>
    inp.g.region !== 'south' ? false : regionRings.length
      ? regionRings.some((ring) => pointInRing(inp.g.x_km[i], inp.g.y_km[i], ring))
      : inp.artemisPoints!.some((p) => greatCircleKm(p.lat_deg, p.lon_deg, inp.g.lat[i], inp.g.lon[i]) <= artR);
  for (let i = 0; i < n; i++) {
    let ok = Number.isFinite(composite[i]);
    if (ok && on('min_illum_frac').active && !on('min_illum_frac').disabled) ok = dyn!.illum_mission[i] >= f.min_illum_frac!;
    if (ok && on('min_comm_frac').active && !on('min_comm_frac').disabled) ok = dyn!.comm_mission[i] >= f.min_comm_frac!;
    if (ok && on('max_slope_deg').active && !on('max_slope_deg').disabled) ok = st.slope_p90_deg![i] <= f.max_slope_deg!;
    if (ok && on('max_water_km').active && !on('max_water_km').disabled) ok = st.psr_dist_km![i] <= f.max_water_km!;
    if (ok && on('max_dark_h').active && !on('max_dark_h').disabled) ok = dyn!.dark_h[i] <= f.max_dark_h!;
    if (ok && on('avoid_faults_km').active && !on('avoid_faults_km').disabled) ok = Number.isFinite(st.scarp_dist_km![i]) && st.scarp_dist_km![i] >= f.avoid_faults_km!;
    if (ok && on('artemis_only').active && !on('artemis_only').disabled)
      ok = inArtemis(i);
    pass[i] = ok ? 1 : 0;
    if (ok) passCount++;
  }
  return { composite, pass, passCount, usedCriteria: used, missingCriteria: missing, filters };
}

export interface RankedCell {
  cell: number;
  score: number;
  lat_deg: number;
  lon_deg: number;
}

/** 통과 칸 점수순, 이미 고른 칸과 min_sep_km 안이면 건너뜀 */
export function rankCells(g: GridGeometry, r: ScoreResult, k = 15, min_sep_km = 8): RankedCell[] {
  const idx: number[] = [];
  for (let i = 0; i < r.pass.length; i++) if (r.pass[i]) idx.push(i);
  idx.sort((a, b) => r.composite[b] - r.composite[a]);
  const out: RankedCell[] = [];
  for (const i of idx) {
    if (out.length >= k) break;
    if (out.some((o) => cellDistKm(g, i, o.cell) < min_sep_km)) continue;
    out.push({ cell: i, score: r.composite[i], lat_deg: g.lat[i], lon_deg: g.lon[i] });
  }
  return out;
}

export interface Contribution {
  criterion: Criterion;
  value: number | null;
  weight: number;
  /** 종합 점수 중 이 기준이 차지하는 몫 (0~1) */
  share: number | null;
  missing: boolean;
}
/** 점수 근거: 기준별 기여, 감점 이유, 빠진 기준 */
export function explainCell(inp: ScoreInput, cell: number): { contributions: Contribution[]; weakest: Criterion | null } {
  const n = inp.g.cells.length;
  const crit = criteriaFor(inp.dyn, inp.st, n);
  const keys = (Object.keys(inp.weights) as Criterion[]).filter((k) => inp.weights[k] > 0);
  let wsum = 0;
  for (const k of keys) if (crit[k].available && Number.isFinite(crit[k].values[cell])) wsum += inp.weights[k];
  const contributions: Contribution[] = keys.map((k) => {
    const v = crit[k].values[cell];
    const ok = crit[k].available && Number.isFinite(v);
    return { criterion: k, value: ok ? v : null, weight: inp.weights[k], share: ok && wsum > 0 ? (v * inp.weights[k]) / wsum : null, missing: !ok };
  });
  let weakest: Criterion | null = null, worstLoss = -1;
  for (const c of contributions) {
    if (c.value === null) continue;
    const loss = (1 - c.value) * c.weight;
    if (loss > worstLoss) { worstLoss = loss; weakest = c.criterion; }
  }
  return { contributions, weakest };
}

/** 위경도에서 가장 가까운 유효 칸 (없으면 -1) */
export function nearestCell(g: GridGeometry, lat: number, lon: number, maxKm = 10): number {
  // 북극·위도 띠: 지점을 덮는 칸 (칸 크기 이내)
  if (g.region !== 'south') return g.locate(lat, lon);
  if (lat > g.manifest.lat_limit_deg) return -1;
  const rho = R_MOON_KM * (90 + lat) * DEG;
  const x = rho * Math.sin(lon * DEG), y = rho * Math.cos(lon * DEG);
  let best = -1, bd = Infinity;
  for (let i = 0; i < g.cells.length; i++) {
    const d = Math.hypot(g.x_km[i] - x, g.y_km[i] - y);
    if (d < bd) { bd = d; best = i; }
  }
  return bd <= maxKm ? best : -1;
}

