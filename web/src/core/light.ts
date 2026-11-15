// 3순위 분석: 빛 쌍둥이(P3-04), 빛 릴레이(P3-02), 착륙 오차 확률(P3-05), 마스트 높이 비교(P3-01)
import type { GridGeometry } from './gridScore';
import { powerPlan } from './power';
import { evaluateWindow, failedRequirements } from './scenario';
import type { SiteContext } from './timeline';
import { sampleTimeline, summarize } from './timeline';
import type { Requirements, Summary, TimeMs } from './types';
import { HOUR_MS } from './constants';

/** 두 이진 패턴(칸 a, b)의 해밍 거리 비율 0~1 */
export function hamming(bits: Uint8Array, m: number, a: number, b: number): number {
  let d = 0;
  for (let k = 0; k < m; k++) if (bits[a * m + k] !== bits[b * m + k]) d++;
  return d / m;
}

/** 햇빛·교신 패턴이 비슷한 다른 칸 상위 k (min_km 이상 떨어진 곳) */
export function lightTwins(g: GridGeometry, lit: Uint8Array, comm: Uint8Array, m: number, cell: number, k = 3, min_km = 20) {
  const out: Array<{ cell: number; distance: number; km: number }> = [];
  for (let i = 0; i < g.cells.length; i++) {
    if (i === cell) continue;
    const km = Math.hypot(g.x_km[i] - g.x_km[cell], g.y_km[i] - g.y_km[cell]);
    if (km < min_km) continue;
    out.push({ cell: i, distance: (hamming(lit, m, cell, i) + hamming(comm, m, cell, i)) / 2, km });
  }
  out.sort((a, b) => a.distance - b.distance);
  return out.slice(0, k);
}

/** 빛 릴레이: 두 칸 중 하나라도 밝은 비율과, 둘 다 어두운 최장 시간 */
export function relayPair(lit: Uint8Array, m: number, a: number, b: number, step_h: number) {
  let either = 0, run = 0, best = 0;
  for (let k = 0; k < m; k++) {
    const on = lit[a * m + k] || lit[b * m + k];
    if (on) { either++; run = 0; } else { run++; if (run > best) best = run; }
  }
  return { either_lit_frac: either / m, longest_both_dark_h: best * step_h };
}

/** 기준 칸 반경 안에서 릴레이 짝 상위 k (둘 다 어두운 시간이 짧은 순) */
export function relayCandidates(g: GridGeometry, lit: Uint8Array, m: number, cell: number, radius_km: number, step_h: number, k = 5) {
  const out: Array<{ cell: number; km: number; either_lit_frac: number; longest_both_dark_h: number }> = [];
  for (let i = 0; i < g.cells.length; i++) {
    if (i === cell) continue;
    const km = Math.hypot(g.x_km[i] - g.x_km[cell], g.y_km[i] - g.y_km[cell]);
    if (km > radius_km) continue;
    out.push({ cell: i, km, ...relayPair(lit, m, cell, i, step_h) });
  }
  out.sort((a, b) => a.longest_both_dark_h - b.longest_both_dark_h || b.either_lit_frac - a.either_lit_frac);
  return out.slice(0, k);
}

/** 오차 타원 안 점들 (중심 기준 동·북 km 오프셋). 장축 방위 rot_deg */
export function ellipsePoints(a_km: number, b_km: number, rot_deg: number, n_ring = 4, n_ang = 12): Array<[number, number]> {
  const pts: Array<[number, number]> = [[0, 0]];
  const r = (rot_deg * Math.PI) / 180;
  for (let i = 1; i <= n_ring; i++) {
    const f = i / n_ring;
    for (let j = 0; j < n_ang; j++) {
      const th = (2 * Math.PI * j) / n_ang;
      const x = a_km * f * Math.cos(th), y = b_km * f * Math.sin(th);
      // 장축이 북에서 시계 방향 rot_deg
      pts.push([x * Math.sin(r) + y * Math.cos(r), x * Math.cos(r) - y * Math.sin(r)]);
    }
  }
  return pts;
}

/** 타원 안 지점별 요구 조건 만족 비율 (ctxs 는 각 지점의 실제 국지 지형 기반 컨텍스트) */
export function ellipseSuccess(ctxs: SiteContext[], landing: TimeMs, duration_h: number, req: Requirements): { ratio: number; n: number } {
  let ok = 0;
  for (const c of ctxs) if (failedRequirements(evaluateWindow(c, landing, duration_h, 2), req).length === 0) ok++;
  return { ratio: ctxs.length ? ok / ctxs.length : NaN, n: ctxs.length };
}

export interface MastRow {
  height_m: number;
  summary: Summary;
  panel_area_m2: number;
  battery_kwh: number;
}
/** 관측 높이별 마스크(파이프라인 계산)로 같은 기간을 평가 */
export function mastComparison(ctxs: Array<{ height_m: number; ctx: SiteContext }>, start: TimeMs, duration_h: number, demand_kw: number, eff: number, loss: number, margin: number): MastRow[] {
  return ctxs.map(({ height_m, ctx }) => {
    const s = sampleTimeline(ctx, start, start + duration_h * HOUR_MS, 1);
    const plan = powerPlan(s, 1, demand_kw, eff, loss, margin);
    return { height_m, summary: summarize(s, 1), panel_area_m2: plan.panel_area_m2, battery_kwh: plan.battery_kwh };
  });
}
