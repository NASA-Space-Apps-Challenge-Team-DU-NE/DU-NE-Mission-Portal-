// 격자 Worker 실행과 결과 공유 (지도·3D·순위·필터가 같은 결과를 본다)
import { useEffect } from 'react';
import { create } from 'zustand';
import { DEFAULT_POWER_SOURCE, DEFAULTS } from '../config';
import { isCancelled, gridWorker } from '../workers/client';
import type { GridScoreReq, GridScoreRes } from '../workers/grid.worker';
import { useData } from './data';
import { useApp, effMapWeights, effFilters } from './store';
import { gridSources } from './calculationSource';

interface GridRunState {
  ready: boolean;
  running: boolean;
  progress: number | null;
  result: GridScoreRes | null;
  sources: ReturnType<typeof gridSources> | null;
  error: string | null;
  explainCell: number | null;
  setExplain(c: number | null): void;
  retryVersion: number;
  retry(): void;
}

export const useGridRun = create<GridRunState>((set) => ({
  ready: false,
  running: false,
  progress: null,
  result: null,
  sources: null,
  error: null,
  explainCell: null,
  setExplain: (explainCell) => set({ explainCell }),
  retryVersion: 0,
  retry: () => set((s) => ({ retryVersion: s.retryVersion + 1, ready: false, error: null })),
}));

/** App 최상위에서 한 번 호출: 격자·천체력이 준비되면 Worker 초기화, 조건이 바뀌면 다시 계산 */
export function useGridRunner() {
  const raw = useData((s) => s.gridRaw);
  const layers = useData((s) => s.layers);
  const ephRows = useData((s) => s.ephRows);
  const ephMeta = useData((s) => s.ephMeta);
  const sites = useData((s) => s.sites.items);
  const regions = useData((s) => s.artemisRegions);
  const ready = useGridRun((s) => s.ready);
  const retryVersion = useGridRun((s) => s.retryVersion);
  const explainCell = useGridRun((s) => s.explainCell);
  const landing = useApp((s) => s.landing);
  const duration = useApp((s) => s.duration_h);
  const t = useApp((s) => s.t);
  const margin = useApp((s) => s.margin_deg);
  const weights = useApp((s) => s.mapWeights);
  const filters = useApp((s) => s.filters);
  const powerKind = useApp((s) => s.powerSource.kind);

  useEffect(() => {
    if (!raw) { useGridRun.setState({ ready: false, result: null, sources: null, running: false, progress: null }); return; }
    let alive = true;
    useGridRun.setState({ ready: false, result: null, sources: null, running: false, progress: null, error: null });
    gridWorker()
      .request('init', { region: raw.region, manifest: raw.env.data, cells: raw.cells, horizon: raw.horizon, layers, eph: { meta: ephMeta, rows: ephRows } }, { latestOnly: false })
      .then(() => { if (alive) useGridRun.setState({ ready: true }); })
      .catch((e) => { if (alive && !isCancelled(e)) useGridRun.setState({ error: (e as Error).message }); });
    return () => { alive = false; };
  }, [raw, layers, ephRows, ephMeta, retryVersion]);

  const nowHour = Math.floor(t / 3_600_000);
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    const timer = setTimeout(() => {
      const req: GridScoreReq = {
        start: landing, duration_h: duration, step_h: DEFAULTS.grid_step_h, now: nowHour * 3_600_000, margin_deg: margin, weights: effMapWeights({ powerSource: { ...DEFAULT_POWER_SOURCE, kind: powerKind }, mapWeights: weights }), filters: effFilters({ powerSource: { ...DEFAULT_POWER_SOURCE, kind: powerKind }, filters }),
        artemis: sites.filter((s) => s.category === 'artemis'), artemis_radius_km: 0, artemis_regions: regions.map((r) => ({ rings: r.rings })), explain_cell: explainCell,
      };
      useGridRun.setState({ running: true, progress: 0 });
      gridWorker()
        .request<GridScoreRes>('score', req, { onProgress: (v) => { if (alive) useGridRun.setState({ progress: v }); } })
        .then((result) => { if (alive) useGridRun.setState({ result, sources: gridSources(ephMeta, landing, duration, DEFAULTS.grid_step_h, nowHour * 3_600_000), running: false, progress: null, error: null }); })
        .catch((e) => {
          if (alive && !isCancelled(e)) useGridRun.setState({ result: null, sources: null, running: false, progress: null, error: (e as Error).message });
        });
    }, 150);
    return () => { alive = false; clearTimeout(timer); };
  }, [ready, landing, duration, nowHour, margin, weights, filters, powerKind, sites, regions, explainCell, ephMeta]);
}
