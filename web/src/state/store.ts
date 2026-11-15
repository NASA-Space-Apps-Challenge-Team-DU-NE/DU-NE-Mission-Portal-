// 앱 상태 (Zustand, ARCHITECTURE 6.4). 계산 결과는 넣지 않는다 — 파생값은 hooks 의 셀렉터·useMemo.
import { create } from 'zustand';
import { DEFAULT_LANDING_UTC, DEFAULT_FILTERS, DEFAULT_MAP_WEIGHTS, DEFAULT_REQUIREMENTS, DEFAULT_SCENARIO_WEIGHTS, DEFAULTS, PROFILES, type ProfileId } from '../config';
import type { BaseElement } from '../core/hazards';
import type { Criterion, HardFilters, Lander, LayerName, Requirements, Scenario, ScenarioWeights, Station, TimeMs } from '../core/types';

/** 단계 (UI 예시의 왼쪽 사이드바 순서 = 설정 순서) */
export type PageId = 'cond' | 'site' | 'base' | 'date' | 'sim' | 'delay' | 'compare' | 'missions' | 'valid';
export const PAGES: PageId[] = ['cond', 'site', 'base', 'date', 'sim', 'delay', 'compare', 'missions', 'valid'];
/** 옛 주소 호환: 전력 계획·통신은 임무 시뮬레이션 아래로 합쳤다 */
const PAGE_ALIAS: Record<string, PageId> = { power: 'sim', comm: 'sim' };
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
  rightTab: RightTab;
  fullscreen: boolean;
  presentation: boolean;
  overlayScenarioId: string | null;

  setPage(p: PageId): void;
  setSite(r: SiteRef | null): void;
  setT(t: TimeMs): void;
  setLanding(t: TimeMs): void;
  setDuration(h: number): void;
  togglePlay(): void;
  setSpeed(h: number): void;
  setMargin(d: number): void;
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
  rightTab: 'sky',
  fullscreen: false,
  presentation: false,
  overlayScenarioId: null,

  setPage: (page) => set({ page, visited: get().visited.includes(page) ? get().visited : [...get().visited, page] }),
  setSite: (siteRef) => set({ siteRef }),
  setT: (t) => set({ t }),
  setLanding: (landing) => set({ landing }),
  // 지도·순위와 같은 상한(60일)을 URL·프리셋에도 강제한다
  setDuration: (duration_h) => { if (Number.isFinite(duration_h)) set({ duration_h: Math.max(1, Math.min(MAX_DURATION_H, duration_h)) }); },
  togglePlay: () => set({ playing: !get().playing }),
  setSpeed: (speed_h) => set({ speed_h }),
  setMargin: (margin_deg) => set({ margin_deg }),
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
  setLander: (landerId) => set({ landerId, landerEdits: {} }),
  editLander: (p) => set({ landerEdits: { ...get().landerEdits, ...p } }),
  setRightTab: (rightTab) => set({ rightTab }),
  setFullscreen: (fullscreen) => set({ fullscreen, presentation: fullscreen ? get().presentation : false }),
  setPresentation: (presentation) => set({ presentation }),
  setOverlay: (overlayScenarioId) => set({ overlayScenarioId }),
}));

/** 임무 기간 상한 (h). computeDynamic 의 평가 상한과 같다 */
export const MAX_DURATION_H = 60 * 24;

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
