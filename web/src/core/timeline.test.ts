import { describe, expect, it } from 'vitest';
import { findEvents, landingWindows } from './events';
import { dailyMinHours, intervalHours, longestRun, sampleTimes, summarize } from './timeline';
import type { TimelineSample } from './types';

// 테스트용 합성 입력 (화면 노출 금지): 10 h 밝음 · 5 h 어둠 반복, 지구는 처음 30 h 만 보임
function synth(n: number): TimelineSample[] {
  return Array.from({ length: n }, (_, i) => {
    const lit = i % 15 < 10;
    return {
      t: i * 3_600_000,
      sun: { az_deg: 0, el_deg: lit ? 2 : -2, dist_km: 1.496e8, ang_radius_deg: 0.27 },
      earth: { az_deg: 0, el_deg: i < 30 ? 5 : -5, dist_km: 3.84e5, ang_radius_deg: 0.95 },
      sun_frac: lit ? 1 : 0,
      earth_visible: i < 30,
      horizon_sun_deg: 0,
      horizon_earth_deg: 0,
      irr_horizontal_w_m2: 0,
      irr_vertical_w_m2: lit ? 1000 : 0,
      earth_phase: 0.5,
      source: 'table',
    };
  });
}

describe('timeline·events', () => {
  it('일조율·최장 암흑', () => {
    // 표본 46개 = 0~45 h, 적분 구간 45개 (마지막 표본은 종료 시각)
    const s = summarize(synth(46), 1);
    expect(s.illum_frac).toBeCloseTo(30 / 45, 9);
    expect(s.longest_dark_h).toBe(5);
    expect(s.comm_frac).toBeCloseTo(30 / 45, 9);
    expect(s.longest_no_comm_h).toBe(15);
  });
  it('하루 창 최소 교신 시간', () => {
    expect(summarize(synth(49), 1).daily_comm_h_min).toBe(6); // [24, 48) 창: 30 h 까지만 보임
  });
  it('longestRun', () => {
    expect(longestRun([true, true, false, true], 2)).toBe(4);
  });
  it('일출·일몰 보간 시각', () => {
    const ev = findEvents(synth(30), 0);
    const sunset = ev.find((e) => e.kind === 'sunset')!;
    expect(sunset.t).toBeCloseTo(9.5 * 3_600_000, 0);
    expect(ev.filter((e) => e.kind === 'sunrise')).toHaveLength(1);
  });
  it('착륙 윈도: 밝음 ∩ 지구 보임 ≥ min_h', () => {
    const w = landingWindows(synth(45), 1, 8);
    expect(w).toHaveLength(2); // 0~9, 15~24 (지구는 29 까지)
    expect(w[0].hours).toBe(10);
    expect(landingWindows(synth(45), 1, 11)).toHaveLength(0);
  });
  it('표본 시각과 적분 구간 분리 (F01): 24 h → 24 h, 365일 → 8760 h', () => {
    const H = 3_600_000;
    const t24 = sampleTimes(0, 24 * H, 1);
    expect(t24).toHaveLength(25);
    expect(intervalHours(t24).reduce((a, b) => a + b, 0)).toBe(24);
    const tY = sampleTimes(0, 8760 * H, 1);
    expect(intervalHours(tY).reduce((a, b) => a + b, 0)).toBe(8760);
    // 간격으로 나누어떨어지지 않는 기간: 마지막 짧은 구간 포함
    const t10 = sampleTimes(0, 10 * H, 3);
    expect(t10.map((t) => t / H)).toEqual([0, 3, 6, 9, 10]);
    expect(intervalHours(t10).reduce((a, b) => a + b, 0)).toBe(10);
    // 0 h
    expect(sampleTimes(5, 5, 1)).toEqual([5]);
    const s0 = summarize(synth(1), 1);
    expect(s0.illum_frac).toBe(1);
    expect(s0.longest_dark_h).toBe(0);
  });
  it('24 h 내내 교신이면 하루 최소 교신 24 h, 암흑 0 h (25 h 아님)', () => {
    const s = summarize(synth(25).map((x) => ({ ...x, earth_visible: true, sun_frac: 0 })), 1);
    expect(s.daily_comm_h_min).toBe(24);
    expect(s.longest_dark_h).toBe(24);
    expect(dailyMinHours([0, 3_600_000], [1, 0], [true, true])).toBe(1);
  });
});
