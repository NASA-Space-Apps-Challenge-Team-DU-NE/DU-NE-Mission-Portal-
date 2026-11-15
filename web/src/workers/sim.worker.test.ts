import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BaseLoads, BaseSimResult, BaseSystem } from '../core/energy';
import type { TimelineSample } from '../core/types';

interface BaseRequest {
  eph: object; site: object; margin_deg: number; start: number; days: number;
  loads: BaseLoads; sys: BaseSystem; auto: boolean; eff: number; loss: number; margin: number;
}
type BaseHandler = (p: BaseRequest, api: { progress(v: number): void }) => { res: BaseSimResult; sys: BaseSystem; plan: { feasible: boolean } | null };
const harness = vi.hoisted(() => ({ base: null as BaseHandler | null, samples: [] as TimelineSample[] }));
vi.mock('./runtime', () => ({
  serve: (handlers: { base: BaseHandler }) => { harness.base = handlers.base; },
  ephFrom: () => ({}), ctxFrom: () => ({}),
}));
vi.mock('../core/timeline', async (original) => ({
  ...await original<typeof import('../core/timeline')>(), sampleTimeline: () => harness.samples,
}));
import './sim.worker';

const H = 3_600_000;
const payload: BaseRequest = {
  eph: {}, site: {}, margin_deg: 0, start: 0, days: 365, auto: true, eff: 0.3, loss: 0, margin: 0.1,
  loads: { habitat_kw: 1, isru_kw: 0, constant_kw: 0 },
  sys: { panel_area_m2: 0, efficiency: 0.3, loss: 0, battery_kwh: 0, isru_off_below: 0.2, isru_on_above: 0.5 },
};
beforeEach(() => {
  // 첫 30일의 마지막 한 시간에만 일조. 720 h 이후는 다음 계획 기간이다.
  harness.samples = Array.from({ length: 745 }, (_, i) => ({
    t: i * H, sun: { az_deg: 0, el_deg: 0, dist_km: 149597870.7, ang_radius_deg: 0.27 },
    earth: { az_deg: 0, el_deg: 5, dist_km: 384400, ang_radius_deg: 0.95 },
    sun_frac: i === 719 ? 1 : 0, earth_visible: true, horizon_sun_deg: 0, horizon_earth_deg: 0,
    irr_horizontal_w_m2: 0, irr_vertical_w_m2: i === 719 ? 1361 : 0, earth_phase: 0.5, source: 'table',
  }));
});

describe('R03·R15 기지 Worker', () => {
  it('첫 30일은 [0,720]의 721개 표본으로 720 h를 설계한다', () => {
    const result = harness.base!(payload, { progress() {} });
    expect(result.plan?.feasible).toBe(true);
    expect(Number.isFinite(result.sys.panel_area_m2)).toBe(true);
    // 발전 1 h와 암흑 719 h: 충전 효율 0.9를 반영한 순수지에 10% 여유.
    expect(result.sys.panel_area_m2).toBeCloseTo(((719 / 0.9 + 1) * 1000 / (1361 * 0.3)) * 1.1, 3);
  });
  it('720 h 이후의 일조를 첫 30일 설계에 포함하지 않는다', () => {
    harness.samples[719].irr_vertical_w_m2 = 0;
    harness.samples[720].irr_vertical_w_m2 = 1361;
    expect(harness.base!(payload, { progress() {} }).plan?.feasible).toBe(false);
  });
  it('자동 계획 전에 음수 부하와 비유한 효율을 거부한다', () => {
    expect(() => harness.base!({ ...payload, loads: { ...payload.loads, habitat_kw: -1 } }, { progress() {} })).toThrow(RangeError);
    expect(() => harness.base!({ ...payload, eff: NaN }, { progress() {} })).toThrow(RangeError);
  });
});
