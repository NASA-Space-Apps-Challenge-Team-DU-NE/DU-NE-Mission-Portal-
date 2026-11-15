// 격자 Worker: 동적 레이어·종합 점수·순위·패널 추천·빛 쌍둥이/릴레이 (묶음 B·E)
import { HOUR_MS } from '../core/constants';
import { buildGeometry, cellFrames, cellMask, computeDynamic, explainCell, rankCells, scoreGrid, type DynamicLayers, type GridGeometry, type ScoreInput, type StaticLayers } from '../core/gridScore';
import { lightTwins, relayCandidates } from '../core/light';
import { pickPanels, powerPlan } from '../core/power';
import { siteContext } from '../core/scenario';
import { sampleTimeline } from '../core/timeline';
import type { GridManifest, HardFilters, MapWeights } from '../core/types';
import type { EphPayload } from './protocol';
import { ephFrom, serve } from './runtime';
import type { FastFrame } from '../core/sky';
import type { CombinedEphemeris } from '../core/ephemeris';

let g: GridGeometry | null = null;
let frames: FastFrame[] = [];
let st: StaticLayers = {};
let eph: CombinedEphemeris = ephFrom({ meta: null, rows: null });
let dyn: DynamicLayers | null = null;
let dynKey = '';

export interface GridInit {
  manifest: GridManifest;
  cells: Uint32Array;
  horizon: Int16Array;
  layers: StaticLayers;
  eph: EphPayload;
}
export interface GridScoreReq {
  start: number;
  duration_h: number;
  step_h: number;
  now: number;
  margin_deg: number;
  weights: MapWeights;
  filters: HardFilters;
  artemis: Array<{ lat_deg: number; lon_deg: number }>;
  artemis_radius_km: number;
  artemis_regions: Array<{ rings: Array<Array<[number, number]>> }>;
  explain_cell: number | null;
}
export interface GridScoreRes {
  dyn: Pick<DynamicLayers, 'illum_mission' | 'comm_mission' | 'sun_now' | 'dark_h'>;
  composite: Float32Array;
  pass: Uint8Array;
  passCount: number;
  used: string[];
  missing: string[];
  filters: ReturnType<typeof scoreGrid>['filters'];
  top: ReturnType<typeof rankCells>;
  explain: ReturnType<typeof explainCell> | null;
  ms: number;
}

serve({
  init(p: GridInit) {
    g = buildGeometry(p.manifest, p.cells, p.horizon);
    st = p.layers;
    frames = cellFrames(g, st.elev_m ?? null);
    eph = ephFrom(p.eph);
    dyn = null;
    dynKey = '';
    return { n: g.cells.length };
  },
  async score(p: GridScoreReq, api) {
    if (!g) throw new Error('격자 없음');
    const t0 = performance.now();
    const key = `${p.start}|${p.duration_h}|${p.step_h}|${p.margin_deg}|${Math.floor(p.now / HOUR_MS)}`;
    if (key !== dynKey) {
      dyn = computeDynamic(g, frames, eph, { start: p.start, duration_h: p.duration_h, step_h: p.step_h, now: p.now, margin_deg: p.margin_deg }, api.progress);
      dynKey = key;
    }
    const inp: ScoreInput = { g, dyn, st, weights: p.weights, filters: p.filters, artemisPoints: p.artemis, artemisRadiusKm: p.artemis_radius_km, artemisRegions: p.artemis_regions };
    const r = scoreGrid(inp);
    const res: GridScoreRes = {
      dyn: { illum_mission: dyn!.illum_mission, comm_mission: dyn!.comm_mission, sun_now: dyn!.sun_now, dark_h: dyn!.dark_h },
      composite: r.composite,
      pass: r.pass,
      passCount: r.passCount,
      used: r.usedCriteria,
      missing: r.missingCriteria,
      filters: r.filters,
      top: rankCells(g, r, 15, 8),
      explain: p.explain_cell !== null && p.explain_cell >= 0 ? explainCell(inp, p.explain_cell) : null,
      ms: performance.now() - t0,
    };
    return res;
  },
  async panels(p: { center_cell: number; radius_km: number; demand_kw: number; eff: number; loss: number; margin: number; max_slope_deg: number | null; start: number; duration_h: number; margin_deg: number }, api) {
    if (!g) throw new Error('격자 없음');
    const cx = g.x_km[p.center_cell], cy = g.y_km[p.center_cell];
    const cands = [];
    const idx: number[] = [];
    for (let i = 0; i < g.cells.length; i++) if (Math.hypot(g.x_km[i] - cx, g.y_km[i] - cy) <= p.radius_km) idx.push(i);
    for (let k = 0; k < idx.length; k++) {
      const i = idx[k];
      if (p.max_slope_deg !== null && st.slope_p90_deg && !(st.slope_p90_deg[i] <= p.max_slope_deg)) continue;
      const elev = st.elev_m?.[i];
      const site = { id: `cell_${i}`, name: `cell ${i}`, category: 'cell' as const, lat_deg: g.lat[i], lon_deg: g.lon[i], terrain: 'grid' as const, source_keys: [], verified: true, elevation_m: Number.isFinite(elev) ? elev : 0 };
      const ctx = siteContext(site, cellMask(g, i), eph, p.margin_deg, g.manifest.observer_height_m);
      const s = sampleTimeline(ctx, p.start, p.start + p.duration_h * HOUR_MS, 2);
      const plan = powerPlan(s, 2, p.demand_kw, p.eff, p.loss, p.margin);
      cands.push({ cell: i, lat_deg: g.lat[i], lon_deg: g.lon[i], distance_km: Math.hypot(g.x_km[i] - cx, g.y_km[i] - cy), panel_area_m2: plan.panel_area_m2, battery_kwh: plan.battery_kwh, x_km: g.x_km[i], y_km: g.y_km[i] });
      if (k % 5 === 0) api.progress(k / idx.length);
    }
    return pickPanels(cands, 5, 4);
  },
  twins(p: { cell: number }) {
    if (!g || !dyn) throw new Error('먼저 점수 계산');
    return lightTwins(g, dyn.lit_bits, dyn.comm_bits, dyn.n_samples, p.cell, 3, 20);
  },
  relay(p: { cell: number; radius_km: number; step_h: number }) {
    if (!g || !dyn) throw new Error('먼저 점수 계산');
    return relayCandidates(g, dyn.lit_bits, dyn.n_samples, p.cell, p.radius_km, p.step_h, 5);
  },
});
