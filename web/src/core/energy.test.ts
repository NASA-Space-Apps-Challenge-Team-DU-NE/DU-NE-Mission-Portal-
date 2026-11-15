import { describe, expect, it } from 'vitest';
import { simulate, simulateBase, stopCause, type SimSystem } from './energy';
import { powerPlan } from './power';
import type { TimelineSample } from './types';

const s = (lit: boolean, comm: boolean, i: number): TimelineSample => ({
  t: i * 3_600_000,
  sun: { az_deg: 0, el_deg: lit ? 1 : -5, dist_km: 149597870.7, ang_radius_deg: 0.27 },
  earth: { az_deg: 0, el_deg: 5, dist_km: 3.84e5, ang_radius_deg: 0.95 },
  sun_frac: lit ? 1 : 0, earth_visible: comm, horizon_sun_deg: 0, horizon_earth_deg: 0,
  irr_horizontal_w_m2: 0, irr_vertical_w_m2: lit ? 1361 : 0, earth_phase: 0.5, source: 'table',
});
const sys: SimSystem = { panel_area_m2: 1, efficiency: 0.3, loss: 0, mount: 'vertical_tracking', battery_wh: 1000, battery_min_fraction: 0.2, load_active_w: 100, load_idle_w: 50, load_survival_w: 10, rate_kbps: 100 };

describe('energy', () => {
  it('발전 0 이면 소비만큼 줄고 하한에서 멈춘다 (원인: 일조 차단)', () => {
    const r = simulate(Array.from({ length: 20 }, (_, i) => s(false, true, i)), 1, sys, { min_ops_h: 1, data_mb: 1 });
    expect(r.soc[0]).toBeCloseTo(0.7, 6); // 800 − 100 Wh
    expect(r.stop_index).toBe(5); // 6번째 표본에서 800 − 6·100 = 200 = 하한
    expect(r.stop_cause).toBe('sun_blocked');
  });
  it('상한 고정과 충족 판정', () => {
    const r = simulate(Array.from({ length: 10 }, (_, i) => s(true, true, i)), 1, sys, { min_ops_h: 5, data_mb: 1 });
    expect(Math.max(...r.soc)).toBeLessThanOrEqual(1);
    expect(r.verdict).toBe('met');
  });
  it('원인 분류: 지구 가림', () => {
    const samples = Array.from({ length: 12 }, (_, i) => s(true, false, i));
    expect(stopCause(samples, 11, 1)).toBe('earth_blocked');
  });
  it('1년 기지: 발전 없으면 정전', () => {
    const r = simulateBase(Array.from({ length: 10 }, (_, i) => s(false, true, i)), 1, { habitat_kw: 1, isru_kw: 1, constant_kw: 0 }, { panel_area_m2: 10, efficiency: 0.3, loss: 0, battery_kwh: 2, isru_off_below: 0.2, isru_on_above: 0.5 });
    expect(r.blackout_h).toBeGreaterThan(0);
    expect(r.events.some((e) => e.kind === 'isru_off')).toBe(true);
  });
});

describe('power', () => {
  const samples = Array.from({ length: 48 }, (_, i) => s(i % 24 < 12, true, i));
  it('수요 0 이면 면적 0', () => {
    expect(powerPlan(samples, 1, 0, 0.3, 0, 0).panel_area_m2).toBe(0);
  });
  it('이분 탐색 단조성: 수요가 크면 면적도 크다', () => {
    const a = powerPlan(samples, 1, 1, 0.3, 0, 0).panel_area_m2;
    const b = powerPlan(samples, 1, 2, 0.3, 0, 0).panel_area_m2;
    expect(b).toBeGreaterThan(a);
    expect(b / a).toBeCloseTo(2, 3);
  });
  it('항상 어두우면 불가능', () => {
    expect(powerPlan(samples.map((_x, i) => s(false, true, i)), 1, 1, 0.3, 0, 0).feasible).toBe(false);
  });
});
