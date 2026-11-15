// 지금 고른 지도 레이어를 칸마다 0~1 (1 = 좋은 쪽) 로 정규화. 2D 지도와 3D 달이 같이 쓴다.
import { useMemo } from 'react';
import type { LayerName } from '../core/types';
import { useData } from './data';
import { useGridRun } from './gridRun';
import { LAYER_UI } from './layerUi';
import { layerView } from './layers';
import { useApp } from './store';

export interface NormLayer {
  name: LayerName;
  /** 칸별 0~1, 자료 없음 = NaN */
  v: Float32Array | null;
  /** 종합 점수일 때 필수 조건 통과 여부 */
  pass: Uint8Array | null;
}

export function useNormLayer(): NormLayer {
  const name = useApp((s) => s.mapLayer);
  const grid = useData((d) => d.grid);
  const layers = useData((d) => d.layers);
  const metas = useData((d) => d.layerMetas);
  const approx = useData((d) => d.gridApprox);
  const res = useGridRun((g) => g.result);
  return useMemo(() => {
    if (!grid) return { name, v: null, pass: null };
    const lv = layerView(name, res, layers, metas, grid.cells.length, approx);
    if (!lv.values) return { name, v: null, pass: null };
    const ui = LAYER_UI[name];
    let [lo, hi] = lv.range ?? ui?.range ?? [Infinity, -Infinity];
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
      lo = Infinity; hi = -Infinity;
      for (const x of lv.values) if (Number.isFinite(x)) { if (x < lo) lo = x; if (x > hi) hi = x; }
    }
    const span = hi - lo || 1;
    const out = new Float32Array(lv.values.length);
    for (let i = 0; i < out.length; i++) {
      const x = lv.values[i];
      if (!Number.isFinite(x)) { out[i] = NaN; continue; }
      let f = Math.max(0, Math.min(1, (x - lo) / span));
      if (lv.invert) f = 1 - f;
      out[i] = f;
    }
    return { name, v: out, pass: name === 'composite' ? res?.pass ?? null : null };
  }, [name, grid, layers, metas, approx, res]);
}
