// 3D 달은 세 지역(남극 5 km · 북극 5 km · 전역 15 km)을 함께 칠한다.
// 지도 지역(mapRegion)은 기존 useGridRun 결과를 쓰고, 나머지 지역은 여기서 지역마다 따로 Worker 로 같은 조건의 점수를 계산한다.
// 순위·필터·점수 근거는 여전히 지도 지역만 본다 (이 결과는 3D 색칠 전용).
import { useEffect, useMemo, useState } from 'react';
import { create } from 'zustand';
import { DEFAULTS } from '../config';
import type { GridGeometry, GridRegion } from '../core/gridScore';
import { gridWorkerFor, isCancelled } from '../workers/client';
import type { GridScoreReq, GridScoreRes } from '../workers/grid.worker';
import { gridSources } from './calculationSource';
import { useData } from './data';
import { useGridRun } from './gridRun';
import { normLayer, type NormLayer } from './layerNorm';
import { useApp } from './store';

type Run = { res: GridScoreRes; sources: ReturnType<typeof gridSources> };
interface GlobeRunState {
  results: Partial<Record<GridRegion, Run>>;
  running: Partial<Record<GridRegion, boolean>>;
}
export const useGlobeRuns = create<GlobeRunState>(() => ({ results: {}, running: {} }));
const put = (r: GridRegion, v: Partial<{ res: Run | null; running: boolean }>) =>
  useGlobeRuns.setState((s) => {
    const results = { ...s.results }, running = { ...s.running };
    if ('res' in v) { if (v.res) results[r] = v.res; else delete results[r]; }
    if ('running' in v) running[r] = !!v.running;
    return { results, running };
  });

export const GLOBE_REGIONS: GridRegion[] = ['south', 'north', 'global'];

function useRegionRun(r: GridRegion) {
  const rd = useData((s) => s.regionData[r]);
  const active = useData((s) => s.mapRegion === r);
  const ephRows = useData((s) => s.ephRows);
  const ephMeta = useData((s) => s.ephMeta);
  const sites = useData((s) => s.sites.items);
  const regions = useData((s) => s.artemisRegions);
  const landing = useApp((s) => s.landing);
  const duration = useApp((s) => s.duration_h);
  const t = useApp((s) => s.t);
  const margin = useApp((s) => s.margin_deg);
  const weights = useApp((s) => s.mapWeights);
  const filters = useApp((s) => s.filters);
  const nowHour = Math.floor(t / 3_600_000);

  // 격자·천체력이 바뀔 때만 Worker 초기화 (전역 지평선 24 MB 를 조건마다 다시 보내지 않는다)
  const [ready, setReady] = useState<unknown>(null);
  useEffect(() => {
    setReady(null);
    if (!rd) { put(r, { res: null, running: false }); return; }
    let alive = true;
    gridWorkerFor(`globe-${r}`)
      .request('init', { region: rd.raw.region, manifest: rd.raw.env.data, cells: rd.raw.cells, horizon: rd.raw.horizon, layers: rd.layers, eph: { meta: ephMeta, rows: ephRows } }, { latestOnly: false })
      .then(() => { if (alive) setReady(rd); })
      .catch((e) => { if (alive && !isCancelled(e)) console.warn('globe init', r, e); });
    return () => { alive = false; };
  }, [r, rd, ephRows, ephMeta]);

  useEffect(() => {
    if (!ready || active) return;
    let alive = true;
    // 시간 막대를 끄는 동안 무거운 전역 계산이 줄줄이 돌지 않게 지도 지역보다 길게 기다린다
    const timer = setTimeout(() => {
      const req: GridScoreReq = {
        start: landing, duration_h: duration, step_h: DEFAULTS.grid_step_h, now: nowHour * 3_600_000, margin_deg: margin, weights, filters,
        artemis: sites.filter((s) => s.category === 'artemis'), artemis_radius_km: 0, artemis_regions: regions.map((x) => ({ rings: x.rings })), explain_cell: null,
      };
      put(r, { running: true });
      gridWorkerFor(`globe-${r}`)
        .request<GridScoreRes>('score', req)
        .then((res) => { if (alive) put(r, { res: { res, sources: gridSources(ephMeta, landing, duration, DEFAULTS.grid_step_h, nowHour * 3_600_000) }, running: false }); })
        .catch((e) => { if (alive && !isCancelled(e)) { console.warn('globe run', r, e); put(r, { res: null, running: false }); } });
    }, 600);
    return () => { alive = false; clearTimeout(timer); };
  }, [r, ready, active, ephMeta, landing, duration, nowHour, margin, weights, filters, sites, regions]);
}

/** App 최상위에서 한 번: 북극·전역 자료를 미리 읽고, 지도 지역이 아닌 지역의 점수를 계산한다 */
export function useGlobeRunner() {
  const regionRaw = useData((s) => s.regionRaw);
  const ensureRegion = useData((s) => s.ensureRegion);
  const southReady = useData((s) => !!s.regionData.south);
  useEffect(() => {
    // 남극(첫 화면)이 먼저 뜨도록 그다음에 읽는다
    if (!southReady) return;
    for (const r of ['north', 'global'] as const) if (regionRaw[r]) void ensureRegion(r);
  }, [regionRaw, ensureRegion, southReady]);
  useRegionRun('south');
  useRegionRun('north');
  useRegionRun('global');
}

export interface GlobeLayer { region: GridRegion; grid: GridGeometry; nl: NormLayer; pending: boolean }

/** 3D 달이 칠할 지역별 정규화 레이어 (지도 지역은 useGridRun 결과, 나머지는 useGlobeRuns 결과) */
export function useGlobeLayers(): GlobeLayer[] {
  const name = useApp((s) => s.mapLayer);
  const mapRegion = useData((s) => s.mapRegion);
  const regionData = useData((s) => s.regionData);
  const activeRes = useGridRun((g) => g.result);
  const activeSrc = useGridRun((g) => g.sources);
  const results = useGlobeRuns((s) => s.results);
  return useMemo(() => {
    const out: GlobeLayer[] = [];
    for (const r of GLOBE_REGIONS) {
      const rd = regionData[r];
      if (!rd) continue;
      const run = r === mapRegion ? (activeRes ? { res: activeRes, sources: activeSrc! } : null) : results[r] ?? null;
      const nl = normLayer(name, rd.geo, rd.layers, rd.metas, rd.approx, run?.res ?? null, run?.sources ?? null);
      out.push({ region: r, grid: rd.geo, nl, pending: !run });
    }
    return out;
  }, [name, mapRegion, regionData, activeRes, activeSrc, results]);
}
