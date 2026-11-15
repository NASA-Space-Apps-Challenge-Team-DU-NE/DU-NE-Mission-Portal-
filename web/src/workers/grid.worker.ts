// 격자 Worker: 동적 레이어·종합 점수·순위·빛 쌍둥이/릴레이 (패널 추천은 지점 지역 격자로 sim Worker) (묶음 B·E)
import { HOUR_MS } from '../core/constants';
import { geometryFor, cellFrames, computeDynamic, explainCell, rankCells, scoreGrid, type DynamicLayers, type GridGeometry, type GridRegion, type ScoreInput, type StaticLayers } from '../core/gridScore';
import { lightTwins, relayCandidates } from '../core/light';
import type { GridManifest, HardFilters, MapWeights } from '../core/types';
import type { BandTerrainManifest, PolarTerrainManifest } from '../core/terrainGrids';
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
  region: GridRegion;
  manifest: GridManifest | PolarTerrainManifest | BandTerrainManifest;
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
    g = geometryFor(p.region, p.manifest, p.cells, p.horizon);
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
  twins(p: { cell: number }) {
    if (!g || !dyn) throw new Error('먼저 점수 계산');
    return lightTwins(g, dyn.lit_bits, dyn.comm_bits, dyn.n_samples, p.cell, 3, 20);
  },
  relay(p: { cell: number; radius_km: number; step_h: number }) {
    if (!g || !dyn) throw new Error('먼저 점수 계산');
    return relayCandidates(g, dyn.lit_bits, dyn.n_samples, p.cell, p.radius_km, dyn.sample_hours, 5);
  },
});
