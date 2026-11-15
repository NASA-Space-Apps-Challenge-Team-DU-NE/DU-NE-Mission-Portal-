// 불러온 산출물 (ARCHITECTURE 6.3·6.4). 화면은 status 가 'missing' 이면 "자료 없음"을 보여 준다.
import { create } from 'zustand';
import {
  gridDir, loadArtemisRegions, loadCatalog, loadEphemeris, loadGrid, loadLayers, loadManifest, loadMask, loadQuality, loadSources, loadTerrainGrid, loadTextures,
  type ArtemisRegion, type DataManifest, type GridLoaded, type TextureSet,
} from '../adapters/data';
import { CombinedEphemeris, TableEphemeris } from '../core/ephemeris';
import { buildGeometry, geometryFor, nearestCell, type GridGeometry, type GridRegion, type StaticLayers } from '../core/gridScore';
import { locateTerrainCell, type TerrainGrid } from '../core/terrainGrids';
import { DEG, R_MOON_KM } from '../core/constants';
import { sphereDipDeg } from '../core/horizon';
import { DEFAULTS } from '../config';
import { setCellResolver } from './store';
import type {
  Envelope, GridManifest, HorizonMask, LayerMeta, Lander, Mission, PowerRef, QualityEntry, Quality, Site, SourceEntry, Station,
} from '../core/types';

/** ready = 필수 자료 모두 읽음, degraded = 일부 누락·근사로 대체, missing = 필수 자료 없음, failed = 불러오기 중 예외 */
export type LoadStatus = 'idle' | 'loading' | 'ready' | 'degraded' | 'missing' | 'failed';

export interface CatalogItem<T> {
  items: T[];
  env: Envelope<T[]> | null;
  reason?: string;
}
const emptyCat = <T,>(reason = ''): CatalogItem<T> => ({ items: [], env: null, reason });

/** 지역 하나의 지도·점수 자료 (격자 기하 + 정적 레이어) */
export interface RegionData {
  raw: GridLoaded;
  geo: GridGeometry;
  approx: boolean;
  layers: StaticLayers;
  metas: LayerMeta[];
  layerReasons: Partial<Record<string, string>>;
}

export interface DataState {
  status: LoadStatus;
  manifest: DataManifest | null;
  missingReasons: string[];
  sources: SourceEntry[];
  quality: Record<string, QualityEntry>;
  sites: CatalogItem<Site>;
  missions: CatalogItem<Mission>;
  landers: CatalogItem<Lander>;
  stations: CatalogItem<Station>;
  powerRefs: CatalogItem<PowerRef>;
  eph: CombinedEphemeris;
  ephEnv: Envelope<unknown> | null;
  ephRows: Float32Array | null;
  ephMeta: { start_utc: string; step_h: number; count: number; source?: string } | null;
  /** 천체력 교체(미션 표 추가 등)마다 증가. 캐시 키에 넣는다 */
  ephRev: number;
  /** 지도·점수·순위·필터가 쓰는 "지금 고른 지역" 격자 (mapRegion). 아래 gridRaw·layers·layerMetas 도 같은 지역 */
  grid: GridGeometry | null;
  /** 지도 지역: 남극 5 km · 북극 5 km · 전역 15 km (75°S–75°N) */
  mapRegion: GridRegion;
  /** 지역 전환 중 (레이어 불러오는 중) */
  regionLoading: GridRegion | null;
  /** 불러온 지역별 자료 */
  regionData: Partial<Record<GridRegion, RegionData>>;
  /** 북극·전역 격자 원자료 (지역을 처음 고를 때 레이어를 읽는다) */
  regionRaw: Partial<Record<GridRegion, GridLoaded>>;
  /** 남극 격자 (지점 지평선 해석은 지도 지역과 무관하게 이 격자를 먼저 본다) */
  southGrid: GridGeometry | null;
  southLayers: StaticLayers;
  southApprox: boolean;
  setMapRegion(r: GridRegion): Promise<void>;
  /** 지역 자료(격자 기하 + 레이어)를 화면 지역은 바꾸지 않고 불러온다. 격자가 없으면 null */
  ensureRegion(r: GridRegion): Promise<RegionData | null>;
  /** 파이프라인 격자가 없어 브라우저에서 만든 근사 격자 (구면 지평선, 지형 미반영) */
  gridApprox: boolean;
  gridRaw: GridLoaded | null;
  layers: StaticLayers;
  layerMetas: LayerMeta[];
  /** 레이어별 불러오기 실패 사유 */
  layerReasons: Partial<Record<string, string>>;
  /** 남극 격자 밖 지평선 격자 (북극 5 km, 75°S–75°N 15 km). 지점 지평선 해석용 (지도는 regionData) */
  terrainGrids: TerrainGrid[];
  textures: TextureSet | null;
  /** USGS 2024 Artemis III 후보 9지역 공식 경계 (없으면 빈 배열 → 대표점 반경 근사) */
  artemisRegions: ArtemisRegion[];
  masks: Record<string, Envelope<HorizonMask> | 'missing'>;
  missionEph: Record<string, TableEphemeris | 'missing'>;
  unverified: boolean;
  loadAll(): Promise<void>;
  ensureMask(path: string): Promise<Envelope<HorizonMask> | null>;
  ensureMissionEph(m: Mission): Promise<TableEphemeris | null>;
}

const LOW: Quality[] = ['REVIEW_REQUIRED', 'REFERENCE_ONLY'];

/** 75°S 이남 15 km 근사 격자, 지평선 = 관측 높이 2 m 구면 지평선 (CLAUDE.md 3-2: 근사로 표시, 합성 지형 아님) */
function approxGrid(): GridLoaded {
  const cell = 15, latLimit = -75;
  const radius = R_MOON_KM * (90 + latLimit) * DEG;
  const n = Math.ceil((2 * radius) / cell);
  const half = (n * cell) / 2;
  const cells: number[] = [];
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      const x = -half + (c + 0.5) * cell, y = half - (r + 0.5) * cell;
      if (Math.hypot(x, y) <= radius) cells.push(r * n + c);
    }
  const nAz = 72;
  const dip = Math.round(sphereDipDeg(DEFAULTS.observer_height_m) / 0.01);
  const manifest: GridManifest = {
    projection: 'AEQD south pole (browser approximation, sphere horizon)', cell_km: cell, nx: n, ny: n, x0_km: -half, y0_km: half,
    lat_limit_deg: latLimit, n_cells: cells.length, cells: '', horizon: { file: '', az_step_deg: 5, n_az: nAz, scale: 0.01 }, observer_height_m: DEFAULTS.observer_height_m,
  };
  return {
    region: 'south',
    env: { schema: 'luna.grid.v1', generated_utc: '', provenance: [], kind: 'approx', quality: 'REFERENCE_ONLY', notes: ['근사 격자 · 지형 미반영'], data: manifest },
    cells: Uint32Array.from(cells),
    horizon: new Int16Array(cells.length * nAz).fill(dip),
    layersEnv: null,
  };
}

type SetFn = (p: Partial<DataState>) => void;
type GetFn = () => DataState;

async function loadAllInner(set: SetFn, get: GetFn) {
    const reasons: string[] = [];
    const man = await loadManifest();
    if (man.status !== 'ok') reasons.push(man.reason);
    const [src, q, sites, missions, landers, stations, powerRefs, eph, tex, art] = await Promise.all([
      loadSources(), loadQuality(), loadCatalog('sites'), loadCatalog('missions'), loadCatalog('landers'), loadCatalog('stations'),
      loadCatalog('power_refs'), loadEphemeris('ephemeris/range.json'), loadTextures(), loadArtemisRegions(),
    ]);
    for (const r of [src, q, tex, art]) if (r.status === 'missing') reasons.push(r.reason);
    const cat = <T,>(r: Awaited<ReturnType<typeof loadCatalog>>): CatalogItem<T> => {
      if (r.status === 'ok') return { items: r.value.data as unknown as T[], env: r.value as unknown as Envelope<T[]> };
      reasons.push(r.reason);
      return emptyCat<T>(r.reason);
    };
    let combined = new CombinedEphemeris();
    let ephEnv: Envelope<unknown> | null = null;
    let ephRows: Float32Array | null = null;
    let ephMeta: DataState['ephMeta'] = null;
    if (eph.status === 'ok') {
      combined = combined.withTable(new TableEphemeris(eph.value.env.data, eph.value.rows));
      ephEnv = eph.value.env;
      ephRows = eph.value.rows;
      ephMeta = { start_utc: eph.value.env.data.start_utc, step_h: eph.value.env.data.step_h, count: eph.value.env.data.count, source: eph.value.env.data.source };
    } else reasons.push(eph.reason);
    const siteCat = cat<Site>(sites);
    const unverified =
      !ephEnv ||
      siteCat.items.some((s) => !s.verified) ||
      [ephEnv, siteCat.env].some((e) => e && LOW.includes(e.quality));
    set({
      manifest: man.status === 'ok' ? man.value : null,
      sources: src.status === 'ok' ? src.value.data : [],
      quality: q.status === 'ok' ? q.value.data : {},
      sites: siteCat,
      missions: cat<Mission>(missions),
      landers: withLanderPresets(cat<Lander>(landers)),
      stations: cat<Station>(stations),
      powerRefs: cat<PowerRef>(powerRefs),
      eph: combined,
      ephRev: get().ephRev + 1,
      ephEnv,
      ephRows,
      ephMeta,
      textures: tex.status === 'ok' ? tex.value.data : null,
      artemisRegions: art.status === 'ok' ? art.value.data : [],
      missingReasons: reasons,
      unverified,
      // 천체력·카탈로그 중 하나라도 없으면 필수 자료 없음, manifest 등 나머지만 없으면 일부 누락
      status: !ephEnv || !siteCat.env ? 'missing' : reasons.length ? 'degraded' : 'ready',
    });
    // 격자는 뒤에서 (첫 화면 3초 목표, CLAUDE.md 8.11)
    const g = await loadGrid();
    if (g.status === 'ok') {
      const geo = buildGeometry(g.value.env.data as GridManifest, g.value.cells, g.value.horizon);
      const metas = g.value.layersEnv?.data ?? [];
      const { layers, reasons: lr } = await loadLayers(metas, geo.cells.length);
      const extra = [...(g.value.layersReason ? [g.value.layersReason] : []), ...Object.values(lr)] as string[];
      const st = get().status;
      const rd: RegionData = { raw: g.value, geo, approx: false, layers, metas, layerReasons: { ...lr, ...(g.value.layersReason ? { 'grid/layers.json': g.value.layersReason } : {}) } };
      set({
        regionData: { ...get().regionData, south: rd }, southGrid: geo, southLayers: layers, southApprox: false,
        ...(get().mapRegion === 'south' ? activeOf(rd) : {}),
        missingReasons: [...get().missingReasons, ...extra],
        status: st === 'ready' && extra.length ? 'degraded' : st,
      });
    } else {
      // 근사 격자: 계산 기능(점수·순위·지도 색)을 데이터 없이도 쓸 수 있게. 지형 미반영으로 표시한다.
      const raw = approxGrid();
      const st = get().status;
      const geo = buildGeometry(raw.env.data as GridManifest, raw.cells, raw.horizon);
      const rd: RegionData = { raw, geo, approx: true, layers: {}, metas: [], layerReasons: {} };
      set({
        missingReasons: [...get().missingReasons, g.reason], regionData: { ...get().regionData, south: rd }, southGrid: geo, southLayers: {}, southApprox: true,
        ...(get().mapRegion === 'south' ? activeOf(rd) : {}), status: st === 'ready' ? 'degraded' : st,
      });
    }
    // 북극·전역 지평선 격자 (전역 23.6 MB). 남극 격자 다음에 뒤에서 읽는다. 없으면 그 범위는 구면 지평선으로 계산한다
    const tg = await Promise.all([loadTerrainGrid('north'), loadTerrainGrid('global')]);
    const tgBad = tg.flatMap((r) => (r.status === 'missing' ? [r.reason] : []));
    const st2 = get().status;
    const regionRaw: DataState['regionRaw'] = {};
    for (const r of tg) if (r.status === 'ok') regionRaw[r.value.raw.region] = r.value.raw;
    set({
      regionRaw,
      terrainGrids: tg.flatMap((r) => (r.status === 'ok' ? [r.value.grid] : [])),
      missingReasons: [...get().missingReasons, ...tgBad],
      status: st2 === 'ready' && tgBad.length ? 'degraded' : st2,
    });
  }

const inflight = new Map<GridRegion, Promise<RegionData>>();

export const useData = create<DataState>((set, get) => ({
  status: 'idle',
  manifest: null,
  missingReasons: [],
  sources: [],
  quality: {},
  sites: emptyCat(),
  missions: emptyCat(),
  landers: emptyCat(),
  stations: emptyCat(),
  powerRefs: emptyCat(),
  eph: new CombinedEphemeris(),
  ephEnv: null,
  ephRows: null,
  ephMeta: null,
  ephRev: 0,
  grid: null,
  mapRegion: 'south',
  regionLoading: null,
  regionData: {},
  regionRaw: {},
  southGrid: null,
  southLayers: {},
  southApprox: false,
  gridApprox: false,
  gridRaw: null,
  layers: {},
  layerMetas: [],
  layerReasons: {},
  terrainGrids: [],
  textures: null,
  artemisRegions: [],
  masks: {},
  missionEph: {},
  unverified: true,

  async loadAll() {
    set({ status: 'loading' });
    try {
      await loadAllInner(set, get);
    } catch (e) {
      // 예상 못 한 예외도 loading 에 머물지 않게: 원인을 보여 준다
      console.error('loadAll', e);
      set({ status: 'failed', missingReasons: [...get().missingReasons, `불러오기 실패: ${(e as Error)?.message ?? e}`] });
    }
  },
  async setMapRegion(r) {
    if (get().mapRegion === r && get().grid) return;
    const have = get().regionData[r];
    if (have) { set({ mapRegion: r, regionLoading: null, ...activeOf(have) }); return; }
    const raw = get().regionRaw[r];
    // 격자를 아직 못 읽었거나 없으면 지역만 바꾸고 화면은 "자료 없음"
    if (!raw) { set({ mapRegion: r, regionLoading: null, grid: null, gridRaw: null, layers: {}, layerMetas: [], layerReasons: {}, gridApprox: false }); return; }
    set({ mapRegion: r, regionLoading: r });
    const rd = await get().ensureRegion(r);
    // 그사이 다른 지역을 골랐으면 화면은 바꾸지 않는다
    if (get().mapRegion === r) set(rd ? { regionLoading: null, ...activeOf(rd) } : { regionLoading: null });
  },

  ensureRegion(r) {
    const have = get().regionData[r];
    if (have) return Promise.resolve(have);
    const raw = get().regionRaw[r];
    if (!raw) return Promise.resolve(null);
    // 같은 지역을 동시에 여러 곳(지도 전환, 지점 검사)이 요청해도 레이어는 한 번만 읽는다
    let p = inflight.get(r);
    if (!p) {
      p = (async () => {
        const geo = geometryFor(r, raw.env.data, raw.cells, raw.horizon);
        const metas = raw.layersEnv?.data ?? [];
        const { layers, reasons } = await loadLayers(metas, geo.cells.length, gridDir(r));
        const lp = `${gridDir(r)}/layers.json`;
        const rd: RegionData = { raw, geo, approx: false, layers, metas, layerReasons: { ...reasons, ...(raw.layersReason ? { [lp]: raw.layersReason } : {}) } };
        set({ regionData: { ...get().regionData, [r]: rd } });
        return rd;
      })().finally(() => inflight.delete(r));
      inflight.set(r, p);
    }
    return p;
  },

  async ensureMask(path) {
    const c = get().masks[path];
    if (c === 'missing') return null;
    if (c) return c;
    const r = await loadMask(path);
    set({ masks: { ...get().masks, [path]: r.status === 'ok' ? r.value : 'missing' } });
    return r.status === 'ok' ? r.value : null;
  },

  async ensureMissionEph(m) {
    const c = get().missionEph[m.id];
    if (c === 'missing') return null;
    if (c) return c;
    if (!m.ephemeris) {
      set({ missionEph: { ...get().missionEph, [m.id]: 'missing' } });
      return null;
    }
    const r = await loadEphemeris(m.ephemeris);
    const tb = r.status === 'ok' ? new TableEphemeris(r.value.env.data, r.value.rows) : null;
    // 미션 표를 전체 천체력에 더한다 (표가 덮는 시각은 사전 계산 표(SPICE 등), 나머지는 근사)
    set({ missionEph: { ...get().missionEph, [m.id]: tb ?? 'missing' }, eph: tb ? get().eph.withTable(tb) : get().eph, ephRev: tb ? get().ephRev + 1 : get().ephRev });
    return tb;
  },
}));

// 북극·전역 지도에서 고른 칸 → 그 칸 중심 좌표 (지평선은 useResolvedSite 가 북극·전역 격자에서 찾는다)
setCellResolver((cell) => {
  const { mapRegion, grid } = useData.getState();
  if (mapRegion === 'south' || !grid || !(cell >= 0 && cell < grid.lat.length)) return { kind: 'cell', cell };
  return { kind: 'custom', lat: +grid.lat[cell].toFixed(4), lon: +grid.lon[cell].toFixed(4) };
});

/** 지점을 덮는 지역 격자: 남극 5 km → 북극 5 km → 전역 15 km (지점 지평선 해석과 같은 순서). 없으면 null */
export function siteRegionAt(lat: number, lon: number): GridRegion | null {
  const { southGrid, terrainGrids } = useData.getState();
  if (southGrid && nearestCell(southGrid, lat, lon, southGrid.manifest.cell_km) >= 0) return 'south';
  for (const g of terrainGrids) if (locateTerrainCell(g, lat, lon) >= 0) return g.region;
  return null;
}

function activeOf(rd: RegionData): Partial<DataState> {
  return { grid: rd.geo, gridRaw: rd.raw, layers: rd.layers, layerMetas: rd.metas, layerReasons: rd.layerReasons, gridApprox: rd.approx };
}

/** 착륙선 숫자 대체값: 2026-11-15 Drive Catalogs/landers.json 의 숫자가 null 로 바뀌어,
 *  비어 있는 칸만 5c3c666 까지 쓰던 근사값(PROVISIONAL)으로 채운다. 데이터에 숫자가 있으면 그 값을 쓴다. */
const LANDER_PRESETS: Record<string, Partial<Lander>> = {
  small_solar: { panel_area_m2: 1.5, efficiency: 0.28, battery_wh: 1200, battery_min_fraction: 0.2, load_active_w: 180, load_idle_w: 80, load_survival_w: 30, rate_kbps: 256, dust_class: 'small' },
  polar_tracker: { panel_area_m2: 3.0, efficiency: 0.29, battery_wh: 3000, battery_min_fraction: 0.2, load_active_w: 400, load_idle_w: 150, load_survival_w: 60, rate_kbps: 2000, dust_class: 'medium' },
  body_mounted: { panel_area_m2: 2.5, efficiency: 0.28, battery_wh: 2500, battery_min_fraction: 0.2, load_active_w: 300, load_idle_w: 120, load_survival_w: 50, rate_kbps: 1000, dust_class: 'medium' },
  heavy_cargo: { panel_area_m2: 12.0, efficiency: 0.3, battery_wh: 20000, battery_min_fraction: 0.2, load_active_w: 2000, load_idle_w: 800, load_survival_w: 300, rate_kbps: 10000, dust_class: 'large' },
};
function withLanderPresets(c: CatalogItem<Lander>): CatalogItem<Lander> {
  const items = c.items.map((l) => {
    const p = LANDER_PRESETS[l.id];
    if (!p) return l;
    const out = { ...l } as Record<string, unknown>;
    for (const [k, v] of Object.entries(p)) if (out[k] === null || out[k] === undefined) out[k] = v;
    return out as unknown as Lander;
  });
  return { ...c, items };
}
