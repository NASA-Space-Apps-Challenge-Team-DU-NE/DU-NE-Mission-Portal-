import { orbitDefaults, parseConfig, type OrbitSettings, type Config as OrbitConfig } from '../orbit/model';
// 앱 상태 (Zustand, ARCHITECTURE 6.4). 계산 결과는 넣지 않는다 — 파생값은 hooks 의 셀렉터·useMemo.
import { create } from 'zustand';
import { DEFAULT_LANDER_EXTRA, DEFAULT_POWER_SOURCE, POWER_KINDS, DEFAULT_SITE_ID, type LanderExtra, type PowerSource, DEFAULT_LANDING_UTC, DEFAULT_FILTERS, DEFAULT_MAP_WEIGHTS, DEFAULT_REQUIREMENTS, DEFAULT_SCENARIO_WEIGHTS, DEFAULTS, PROFILES, type ProfileId } from '../config';
import type { BaseElement } from '../core/hazards';
import type { Criterion, HardFilters, Lander, LayerName, Requirements, Scenario, ScenarioWeights, Station, TimeMs } from '../core/types';

/** 단계 (UI 예시의 왼쪽 사이드바 순서 = 설정 순서) */
export type PageId = 'cond' | 'site' | 'base' | 'sim' | 'orbit' | 'delay' | 'compare' | 'missions' | 'valid';
export const PAGES: PageId[] = ['cond', 'site', 'base', 'sim', 'orbit', 'delay', 'compare', 'missions', 'valid'];
/** 옛 주소 호환: 전력 계획·통신은 임무 분석 안 탭으로, 착륙 날짜는 착륙지·날짜 고르기로 합쳤다 */
const PAGE_ALIAS: Record<string, PageId> = { power: 'sim', comm: 'sim', date: 'site' };
export type ProfileSel = ProfileId | 'custom';

export type SiteRef = { kind: 'catalog'; id: string } | { kind: 'custom'; lat: number; lon: number } | { kind: 'cell'; cell: number };
export type FailMode = 'dim' | 'hide' | 'show';
export type RightTab = 'sky' | 'alerts' | 'sources';

export interface ConditionSet {
  weights: Record<Criterion, number>;
  filters: HardFilters;
}

export interface AppState {
  page: PageId;
  visited: PageId[];
  /** 지구 3D 에서 찍은 가정 지상국 (저장하지 않음) */
  customStations: Station[];
  /** 06 일정 변경: 밀린 일수 */
  shift_days: number;
  overlay: { site: import('../core/types').Site; landing: number } | null;
  customWeights: Record<Criterion, number>;
  siteRef: SiteRef | null;
  t: TimeMs;
  landing: TimeMs;
  duration_h: number;
  playing: boolean;
  speed_h: number;
  margin_deg: number;
  req: Requirements;
  scenarioWeights: ScenarioWeights;
  delay_days: number;
  profile: ProfileSel;
  mapWeights: Record<Criterion, number>;
  filters: HardFilters;
  mapLayer: LayerName;
  colorOn: boolean;
  opacity: number;
  failMode: FailMode;
  rankMode: 'grid' | 'catalog';
  scenarios: Scenario[];
  abSets: { A?: ConditionSet; B?: ConditionSet };
  bases: BaseElement[];
  landerId: string | null;
  landerEdits: Partial<Lander>;
  /** 발전 방식 (기본 태양전지) */
  powerSource: PowerSource;
  /** 착륙선 질량·추진 (궤도 분석용 입력) */
  landerExtra: LanderExtra;
  orbitSettings: OrbitSettings;
  setOrbitSettings(value: OrbitSettings): void;
  applyOrbitConfig(value: OrbitConfig, siteRef?: SiteRef): void;
  rightTab: RightTab;
  fullscreen: boolean;
  presentation: boolean;
  overlayScenarioId: string | null;
  /** 오른쪽(3D 달·현장 뷰)에서만 바꾼 값. null 이면 계획(왼쪽 대시보드) 값을 따른다.
   *  오른쪽에서 바꿔도 계획은 그대로이고, 계획을 바꾸면 해당 값의 오른쪽 덮어쓰기는 지워진다. */
  viewRef: SiteRef | null;
  viewLanding: TimeMs | null;
  viewMargin: number | null;

  setPage(p: PageId): void;
  setSite(r: SiteRef | null): void;
  setT(t: TimeMs): void;
  setLanding(t: TimeMs): void;
  setDuration(h: number): void;
  togglePlay(): void;
  setSpeed(h: number): void;
  setMargin(d: number): void;
  setViewSite(r: SiteRef): void;
  setViewLanding(t: TimeMs): void;
  setViewMargin(d: number): void;
  resetView(): void;
  setReq(p: Partial<Requirements>): void;
  setScenarioWeights(p: Partial<ScenarioWeights>): void;
  setDelayDays(d: number): void;
  setProfile(p: ProfileSel): void;
  addStation(s: Station): void;
  removeStation(id: string): void;
  setStationMin(id: string, v: number): void;
  setShift(d: number): void;
  setOverlayAlt(o: AppState['overlay']): void;
  setWeight(c: Criterion, v: number): void;
  setFilter<K extends keyof HardFilters>(k: K, v: HardFilters[K] | undefined): void;
  setMap(p: Partial<Pick<AppState, 'mapLayer' | 'colorOn' | 'opacity' | 'failMode' | 'rankMode'>>): void;
  addScenario(s: Scenario): void;
  removeScenario(id: string): void;
  renameScenario(id: string, name: string): void;
  saveAB(which: 'A' | 'B'): void;
  addBase(b: BaseElement): void;
  removeBase(id: string): void;
  setLander(id: string | null): void;
  editLander(p: Partial<Lander>): void;
  setPowerSource(p: Partial<PowerSource>): void;
  setLanderExtra(p: Partial<LanderExtra>): void;
  /** 입력값(조건·착륙선·날짜)을 기본값으로 되돌린다. 페이지·비교 목록·기지는 그대로 */
  resetInputs(): void;
  setRightTab(t: RightTab): void;
  setFullscreen(v: boolean): void;
  setPresentation(v: boolean): void;
  setOverlay(id: string | null): void;
}


export const useApp = create<AppState>((set, get) => ({
  page: 'cond',
  visited: ['cond'],
  customStations: [],
  shift_days: 14,
  overlay: null,
  customWeights: DEFAULT_MAP_WEIGHTS,
  siteRef: null,
  t: Date.parse(DEFAULT_LANDING_UTC),
  landing: Date.parse(DEFAULT_LANDING_UTC),
  duration_h: DEFAULTS.duration_h,
  playing: false,
  speed_h: 6,
  margin_deg: DEFAULTS.comm_margin_deg,
  req: DEFAULT_REQUIREMENTS,
  scenarioWeights: DEFAULT_SCENARIO_WEIGHTS,
  delay_days: DEFAULTS.delay_days,
  profile: 'custom',
  mapWeights: DEFAULT_MAP_WEIGHTS,
  filters: DEFAULT_FILTERS,
  mapLayer: 'composite',
  colorOn: true,
  opacity: 0.75,
  failMode: 'dim',
  rankMode: 'grid',
  scenarios: [],
  abSets: {},
  bases: [],
  landerId: 'small_solar',
  landerEdits: {},
  powerSource: DEFAULT_POWER_SOURCE,
  landerExtra: { ...DEFAULT_LANDER_EXTRA },
  orbitSettings: orbitDefaults(),
  setOrbitSettings: (orbitSettings) => set({ orbitSettings }),
  applyOrbitConfig: (input, preferred) => {
    const c = parseConfig(input);
    if (!orbitSiteResolver) throw new Error('착륙지 자료 연결이 준비되지 않았습니다.');
    const siteRef = orbitSiteResolver(c.target, get().siteRef, preferred);
    const landing = Date.parse(c.target.landing_time_utc);
    set({ landing, t: landing, siteRef, viewRef: null, viewLanding: null, playing: false,
      landerExtra: { dry_mass_kg: c.lander.dry_mass_kg, prop_mass_kg: c.lander.initial_mass_kg-c.lander.dry_mass_kg, thrust_n: c.lander.max_thrust_n, min_thrust_n: c.lander.min_thrust_n, isp_s: c.lander.isp_s },
      orbitSettings: structuredClone({ nrho:c.nrho, orbit:c.orbit, constraints:c.constraints, objective:c.objective }) });
  },
  rightTab: 'sky',
  fullscreen: false,
  presentation: false,
  overlayScenarioId: null,
  viewRef: null,
  viewLanding: null,
  viewMargin: null,

  setPage: (page) => set({ page, visited: get().visited.includes(page) ? get().visited : [...get().visited, page] }),
  setSite: (siteRef) => set({ siteRef: siteRef?.kind === 'cell' && cellResolver ? cellResolver(siteRef.cell) : siteRef, viewRef: null }),
  setT: (t) => set({ t }),
  // 착륙 시각이 바뀌면 보는 시각도 착륙 시각으로 옮긴다 (위쪽 시간 막대를 없앴으므로 현장 뷰가 새 착륙 조건을 바로 보이게)
  setLanding: (landing) => set({ landing, t: landing, viewLanding: null }),
  // 지도·순위와 같은 상한(60일)을 URL·프리셋에도 강제한다
  setDuration: (duration_h) => { if (Number.isFinite(duration_h)) set({ duration_h: Math.max(1, Math.min(MAX_DURATION_H, duration_h)) }); },
  togglePlay: () => set({ playing: !get().playing }),
  setSpeed: (speed_h) => set({ speed_h }),
  setMargin: (margin_deg) => set({ margin_deg, viewMargin: null }),
  setViewSite: (viewRef) => set({ viewRef: viewRef?.kind === 'cell' && cellResolver ? cellResolver(viewRef.cell) : viewRef }),
  setViewLanding: (viewLanding) => set({ viewLanding, t: viewLanding }),
  setViewMargin: (viewMargin) => set({ viewMargin }),
  // 오른쪽을 계획 값으로 되돌린다 (보는 시각도 계획 착륙 시각으로)
  resetView: () => set({ viewRef: null, viewLanding: null, viewMargin: null, t: get().landing }),
  setReq: (p) => set({ req: { ...get().req, ...p } }),
  setScenarioWeights: (p) => set({ scenarioWeights: { ...get().scenarioWeights, ...p } }),
  setDelayDays: (delay_days) => set({ delay_days }),
  setProfile: (profile) => set(profile === 'custom' ? { profile, mapWeights: { ...get().customWeights } } : { profile, mapWeights: { ...PROFILES[profile].weights } }),
  addStation: (st) => set({ customStations: [...get().customStations, st] }),
  removeStation: (id) => set({ customStations: get().customStations.filter((x) => x.id !== id) }),
  setStationMin: (id, v) => set({ customStations: get().customStations.map((x) => (x.id === id ? { ...x, min_elev_deg: v } : x)) }),
  setShift: (shift_days) => set({ shift_days }),
  setOverlayAlt: (overlay) => set({ overlay }),
  setWeight: (c, v) => { const w = { ...get().mapWeights, [c]: v }; set({ mapWeights: w, customWeights: w, profile: 'custom' }); },
  setFilter: (k, v) => {
    const f = { ...get().filters };
    if (v === undefined || v === false) delete f[k];
    else f[k] = v;
    set({ filters: f });
  },
  setMap: (p) => set(p),
  addScenario: (s) => set({ scenarios: [...get().scenarios.filter((x) => x.id !== s.id), s].slice(-4) }),
  removeScenario: (id) => set({ scenarios: get().scenarios.filter((x) => x.id !== id) }),
  renameScenario: (id, name) => set({ scenarios: get().scenarios.map((x) => (x.id === id ? { ...x, name } : x)) }),
  saveAB: (which) => set({ abSets: { ...get().abSets, [which]: { weights: { ...get().mapWeights }, filters: { ...get().filters } } } }),
  addBase: (b) => set({ bases: [...get().bases, b] }),
  removeBase: (id) => set({ bases: get().bases.filter((b) => b.id !== id) }),
  // 프리셋 4종은 모두 태양전지 착륙선 유형이라, 고르면 발전 방식도 태양전지로 맞춘다 (출력·연료 값은 그대로)
  setLander: (landerId) => set({ landerId, landerEdits: {}, powerSource: { ...get().powerSource, kind: 'solar' } }),
  editLander: (p) => set({ landerEdits: { ...get().landerEdits, ...p } }),
  setPowerSource: (p) => set({ powerSource: { ...get().powerSource, ...p } }),
  setLanderExtra: (p) => set({ landerExtra: { ...get().landerExtra, ...p } }),
  resetInputs: () => {
    const landing = Date.parse(DEFAULT_LANDING_UTC);
    set({
      siteRef: { kind: 'catalog', id: DEFAULT_SITE_ID }, orbitSettings: orbitDefaults(),
      landing, t: landing, viewRef: null, viewLanding: null, viewMargin: null, playing: false, duration_h: DEFAULTS.duration_h, margin_deg: DEFAULTS.comm_margin_deg, req: DEFAULT_REQUIREMENTS,
      scenarioWeights: DEFAULT_SCENARIO_WEIGHTS, delay_days: DEFAULTS.delay_days, profile: 'custom', mapWeights: DEFAULT_MAP_WEIGHTS, customWeights: DEFAULT_MAP_WEIGHTS,
      filters: DEFAULT_FILTERS, shift_days: 14, landerId: 'small_solar', landerEdits: {}, powerSource: DEFAULT_POWER_SOURCE, landerExtra: DEFAULT_LANDER_EXTRA,
    });
  },
  setRightTab: (rightTab) => set({ rightTab }),
  setFullscreen: (fullscreen) => set({ fullscreen, presentation: fullscreen ? get().presentation : false }),
  setPresentation: (presentation) => set({ presentation }),
  setOverlay: (overlayScenarioId) => set({ overlayScenarioId }),
}));

/** 임무 기간 상한 (h). computeDynamic 의 평가 상한과 같다 */
export const MAX_DURATION_H = 60 * 24;

/** 'cell' 칸 번호는 남극 격자 기준. 지도 지역이 북극·전역일 때 순위표·지도에서 고른 칸은 좌표로 바꾼다 (data.ts 가 등록) */
let cellResolver: ((cell: number) => SiteRef) | null = null;
export function setCellResolver(f: (cell: number) => SiteRef) { cellResolver = f; }

type OrbitSiteResolver = (target: OrbitConfig['target'], current: SiteRef | null, preferred?: SiteRef) => SiteRef;
let orbitSiteResolver: OrbitSiteResolver | null = null;
export function setOrbitSiteResolver(resolve: OrbitSiteResolver) { orbitSiteResolver = resolve; }

// ───────── URL 동기화 (?site=&t=&d=&p=) ─────────
export function siteRefToParam(r: SiteRef | null): string | null {
  if (!r) return null;
  if (r.kind === 'catalog') return r.id;
  if (r.kind === 'cell') return `cell_${r.cell}`;
  return `${r.lat.toFixed(4)},${r.lon.toFixed(4)}`;
}
export function paramToSiteRef(s: string | null): SiteRef | null {
  if (!s) return null;
  const m = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(s);
  if (m) {
    const lat = Number(m[1]), lon = Number(m[2]);
    // 입력 폼과 같은 범위 검사. 범위 밖이면 무시(현재 지점 유지)
    return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { kind: 'custom', lat, lon } : null;
  }
  const c = /^cell_(\d+)$/.exec(s);
  if (c) return Number.isSafeInteger(Number(c[1])) ? { kind: 'cell', cell: Number(c[1]) } : null;
  return { kind: 'catalog', id: s };
}

export function initFromUrl() {
  const q = new URLSearchParams(window.location.search);
  const st = useApp.getState();
  const site = paramToSiteRef(q.get('site'));
  if (site) st.setSite(site);
  const t = q.get('t');
  if (t && !Number.isNaN(Date.parse(t))) {
    st.setT(Date.parse(t));
    st.setLanding(Date.parse(t));
  }
  const d = Number(q.get('d'));
  if (d > 0) st.setDuration(d);
  const raw = q.get('p');
  const p = (raw && (PAGE_ALIAS[raw] ?? raw)) as PageId | null;
  if (p && PAGES.includes(p)) st.setPage(p);
}

let urlTimer: number | undefined;
export function syncUrl() {
  useApp.subscribe((s) => {
    window.clearTimeout(urlTimer);
    urlTimer = window.setTimeout(() => {
      const q = new URLSearchParams();
      const site = siteRefToParam(s.siteRef);
      if (site) q.set('site', site);
      q.set('t', new Date(s.landing).toISOString().replace('.000Z', 'Z'));
      q.set('d', String(s.duration_h));
      q.set('p', s.page);
      window.history.replaceState(null, '', `?${q.toString()}`);
    }, 300);
  });
}

// ───────── 발전 방식에 따른 실효 입력 ─────────
/** 발전에 햇빛이 필요한가 (태양전지만 true) */
export const needsSun = (s: Pick<AppState, 'powerSource'>) => POWER_KINDS[s.powerSource.kind].needsSun;
/** 시나리오 점수 가중치: 햇빛이 필요 없는 발전이면 전력 항목을 뺀다 */
export function scoreWeights(s: Pick<AppState, 'powerSource' | 'scenarioWeights'>): ScenarioWeights {
  return needsSun(s) ? s.scenarioWeights : { ...s.scenarioWeights, exclude_power: true };
}
/** 지도 종합 점수 가중치: 햇빛이 필요 없는 발전이면 발전(일조) 가중치 0 */
export function effMapWeights(s: Pick<AppState, 'powerSource' | 'mapWeights'>): Record<Criterion, number> {
  return needsSun(s) ? s.mapWeights : { ...s.mapWeights, power: 0 };
}
/** 필수 조건: 햇빛이 필요 없는 발전이면 일조율·최장 그늘 조건을 뺀다 */
export function effFilters(s: Pick<AppState, 'powerSource' | 'filters'>): HardFilters {
  if (needsSun(s)) return s.filters;
  const f = { ...s.filters };
  delete f.min_illum_frac; delete f.max_dark_h;
  return f;
}

/** 오른쪽(3D 달·현장 뷰)이 실제로 보는 값: 오른쪽에서 바꾼 값이 있으면 그것, 없으면 계획 값 */
export const viewRefOf = (s: AppState) => s.viewRef ?? s.siteRef;
export const viewLandingOf = (s: AppState) => s.viewLanding ?? s.landing;
export const viewMarginOf = (s: AppState) => s.viewMargin ?? s.margin_deg;
/** 오른쪽이 계획과 다른 값을 보고 있는가 */
export const viewDiffers = (s: AppState) => s.viewRef !== null || s.viewLanding !== null || s.viewMargin !== null;
