import { describe, expect, it } from 'vitest';
import { buildGeometry, explainCell, rankCells, scoreGrid, type DynamicLayers } from './gridScore';
import type { GridManifest } from './types';

// 테스트용 3×1 격자 (화면 노출 금지)
const manifest: GridManifest = {
  projection: 'test', cell_km: 5, nx: 3, ny: 1, x0_km: 0, y0_km: 2.5, lat_limit_deg: -75, n_cells: 3,
  cells: 'cells.u32', horizon: { file: 'h', az_step_deg: 5, n_az: 72, scale: 0.01 }, observer_height_m: 2,
};
const g = buildGeometry(manifest, new Uint32Array([0, 1, 2]), new Int16Array(3 * 72));
const dyn = (illum: number[], comm: number[]): DynamicLayers => ({
  illum_mission: Float32Array.from(illum), comm_mission: Float32Array.from(comm), sun_now: new Float32Array(3),
  dark_h: Float32Array.from([10, 50, 10]), lit_bits: new Uint8Array(3), comm_bits: new Uint8Array(3), n_samples: 1, sample_hours: new Float64Array(1),
});
const weights = { power: 40, comm: 25, water: 20, metal: 0, safety: 15, geo: 10 };

describe('gridScore', () => {
  it('자료 없는 기준은 가중치에서 빠진다', () => {
    const r = scoreGrid({ g, dyn: dyn([1, 0.5, 0], [1, 0.5, 0]), st: {}, weights, filters: {} });
    expect(r.usedCriteria).toEqual(['power', 'comm']);
    expect(r.missingCriteria).toEqual(['water', 'safety', 'geo']);
    expect(r.composite[0]).toBeCloseTo(1, 6);
    expect(r.composite[1]).toBeCloseTo(0.5, 6);
  });
  it('필터 경계와 자료 없는 필터 비활성', () => {
    const r = scoreGrid({ g, dyn: dyn([0.6, 0.59, 1], [1, 1, 1]), st: {}, weights, filters: { min_illum_frac: 0.6, max_dark_h: 20, max_slope_deg: 5 } });
    expect(Array.from(r.pass)).toEqual([1, 0, 1]);
    expect(r.filters.find((f) => f.key === 'max_slope_deg')!.disabled).toBe(true);
  });
  it('8 km 안 중복 제외', () => {
    const r = scoreGrid({ g, dyn: dyn([1, 0.9, 0.8], [1, 1, 1]), st: {}, weights, filters: {} });
    const top = rankCells(g, r, 15, 8);
    expect(top.map((x) => x.cell)).toEqual([0, 2]); // 칸 간격 5 km → 1 은 0 과 너무 가깝다
  });
  it('점수 근거: 빠진 기준 표시, 감점 이유', () => {
    const inp = { g, dyn: dyn([1, 0.2, 0], [0.4, 1, 0]), st: { slope_p90_deg: Float32Array.from([0, 0, 0]) }, weights, filters: {} };
    const ex = explainCell(inp, 0);
    expect(ex.contributions.find((c) => c.criterion === 'water')!.missing).toBe(true);
    expect(ex.weakest).toBe('comm');
  });
});
