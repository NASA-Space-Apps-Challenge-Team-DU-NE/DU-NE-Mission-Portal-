// 전력 계산·패널 위치 추천 (P1-30·31, CLAUDE.md 8.9)
import { CHARGE_EFF } from './energy';
import { intervalHours } from './timeline';
import type { TimelineSample } from './types';

export const DEPTH_OF_DISCHARGE = 0.8;

export interface PowerPlan {
  /** 1 m² 평균 발전 (W/m², 수직 추적, 효율·손실 반영) */
  mean_w_per_m2: number;
  panel_area_m2: number;
  battery_kwh: number;
  /** 시간별 1 m² 발전 W */
  per_m2_w: Float32Array;
  feasible: boolean;
}

/** 면적 A 로 수요를 버틸 때 배터리 최대 감소량(Wh) — 순수지 ≥ 0 이면 Infinity 아님 */
export function maxDrawdownWh(perM2: Float32Array, area: number, demand_w: number, step_h: number | ArrayLike<number>): { drawdown: number; netWh: number } {
  let E = 0, minE = 0, net = 0;
  for (let i = 0; i < perM2.length; i++) {
    const h = typeof step_h === 'number' ? step_h : step_h[i];
    const d = perM2[i] * area - demand_w;
    const de = d * h * (d > 0 ? CHARGE_EFF : 1);
    E += de;
    net += de;
    if (E > 0) E = 0; // 배터리는 가득 찬 상태에서 넘치면 버린다
    if (E < minE) minE = E;
  }
  return { drawdown: -minE, netWh: net };
}

export function powerPlan(samples: TimelineSample[], _step_h: number, demand_kw: number, efficiency: number, loss: number, margin: number): PowerPlan {
  const per = new Float32Array(samples.length);
  const w = intervalHours(samples);
  let sum = 0, tot = 0;
  for (let i = 0; i < samples.length; i++) {
    per[i] = samples[i].irr_vertical_w_m2 * efficiency * (1 - loss);
    sum += per[i] * w[i];
    tot += w[i];
  }
  const mean = tot > 0 ? sum / tot : samples.length ? per[0] : 0;
  const demand = demand_kw * 1000;
  if (demand <= 0) return { mean_w_per_m2: mean, panel_area_m2: 0, battery_kwh: 0, per_m2_w: per, feasible: true };
  if (mean <= 0) return { mean_w_per_m2: 0, panel_area_m2: Infinity, battery_kwh: Infinity, per_m2_w: per, feasible: false };
  // 남는 전력 × 0.9 ≥ 모자라는 전력 이 되는 최소 면적을 이분 탐색
  const ok = (A: number) => {
    let surplus = 0, deficit = 0;
    for (let i = 0; i < per.length; i++) {
      const d = (per[i] * A - demand) * w[i];
      if (d > 0) surplus += d; else deficit -= d;
    }
    return surplus * CHARGE_EFF >= deficit;
  };
  let lo = 0, hi = Math.max(1, (demand / mean) * 2);
  let guard = 0;
  while (!ok(hi) && guard++ < 40) hi *= 2;
  if (!ok(hi)) return { mean_w_per_m2: mean, panel_area_m2: Infinity, battery_kwh: Infinity, per_m2_w: per, feasible: false };
  for (let k = 0; k < 50; k++) {
    const mid = (lo + hi) / 2;
    if (ok(mid)) hi = mid; else lo = mid;
  }
  const area = hi * (1 + margin);
  const { drawdown } = maxDrawdownWh(per, area, demand, w);
  return { mean_w_per_m2: mean, panel_area_m2: area, battery_kwh: drawdown / DEPTH_OF_DISCHARGE / 1000, per_m2_w: per, feasible: true };
}

export interface PanelPick {
  cell: number;
  lat_deg: number;
  lon_deg: number;
  distance_km: number;
  panel_area_m2: number;
  battery_kwh: number;
}

/** 후보 칸 목록(이미 각자 계획 계산됨)에서 배터리·면적이 작은 순으로 서로 min_sep_km 이상인 k 곳 */
export function pickPanels(cands: Array<PanelPick & { x_km: number; y_km: number }>, k = 5, min_sep_km = 4): PanelPick[] {
  const sorted = [...cands].filter((c) => Number.isFinite(c.battery_kwh)).sort((a, b) => a.battery_kwh - b.battery_kwh || a.panel_area_m2 - b.panel_area_m2);
  const out: Array<PanelPick & { x_km: number; y_km: number }> = [];
  for (const c of sorted) {
    if (out.length >= k) break;
    if (out.some((o) => Math.hypot(o.x_km - c.x_km, o.y_km - c.y_km) < min_sep_km)) continue;
    out.push(c);
  }
  return out.map(({ x_km: _x, y_km: _y, ...rest }) => rest);
}
