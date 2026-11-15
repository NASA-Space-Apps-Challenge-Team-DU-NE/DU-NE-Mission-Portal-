import { describe, expect, it } from 'vitest';
import { baseInputError, simulateBase, type BaseLoads, type BaseSystem } from './energy';
import { relayPair } from './light';
import { dailyMinHours, intervalHours, intervalSpans, sampleTimes } from './timeline';
import type { TimelineSample } from './types';

const H = 3_600_000;
// 감사 재현용 합성 입력. 화면 데이터에 사용하지 않는다.
const sample = (h: number, bright = false): TimelineSample => ({
  t: h * H, sun: { az_deg: 0, el_deg: bright ? 0 : -20, dist_km: 149597870.7, ang_radius_deg: 0.27 },
  earth: { az_deg: 0, el_deg: 5, dist_km: 384400, ang_radius_deg: 0.95 },
  sun_frac: Number(bright), earth_visible: true, horizon_sun_deg: 0, horizon_earth_deg: 0,
  irr_horizontal_w_m2: 0, irr_vertical_w_m2: bright ? 1000 : 0, earth_phase: 0.5, source: 'table',
});
const base: BaseSystem = { panel_area_m2: 0, efficiency: 1, loss: 0, battery_kwh: 1, isru_off_below: 0.2, isru_on_above: 0.5 };
const loads: BaseLoads = { habitat_kw: 1, isru_kw: 0, constant_kw: 0 };

describe('R01 릴레이 실제 구간 적분', () => {
  it.each([0, 24, 25, 240])('%s h를 초과해서 공동 암흑을 누적하지 않는다', (hours) => {
    const times = sampleTimes(0, hours * H, 6);
    const result = relayPair(new Uint8Array(times.length * 2), times.length, 0, 1, intervalHours(times));
    expect(result.longest_both_dark_h).toBe(hours);
    expect(result.either_lit_frac).toBe(0);
  });
  it('종료 순간의 밝음은 시간 비율에 더하지 않고 마지막 짧은 구간만 가중한다', () => {
    const times = sampleTimes(0, 25 * H, 6);
    const bits = new Uint8Array(times.length * 2);
    bits[5] = 1;
    expect(relayPair(bits, 6, 0, 1, intervalHours(times)).either_lit_frac).toBe(0);
    bits[4] = 1;
    const result = relayPair(bits, 6, 0, 1, intervalHours(times));
    expect(result.either_lit_frac).toBeCloseTo(1 / 25, 12);
    expect(result.longest_both_dark_h).toBe(24);
  });
});

describe('R02 기지 SOC 시각과 부분 정전', () => {
  it('0.8 kWh / 1 kW는 0.8 h 뒤 고갈한다', () => {
    const result = simulateBase([sample(0), sample(1), sample(2)], 1, loads, base);
    expect(result.soc[0]).toBeCloseTo(0.8, 6);
    expect(result.soc[1]).toBe(0);
    expect(result.blackout_h).toBeCloseTo(1.2, 12);
    expect(result.uptime).toBeCloseTo(0.4, 12);
    expect(result.events.filter((e) => e.kind === 'blackout_start')).toEqual([{ t: 0.8 * H, kind: 'blackout_start' }]);
  });
  it('거친 표본·부분 마지막 구간에서도 같은 에너지 수지와 고갈 시각', () => {
    const result = simulateBase([sample(0), sample(2.5)], 2.5, loads, base);
    expect(result.blackout_h).toBeCloseTo(1.7, 12);
    expect(result.uptime * 2.5).toBeCloseTo(0.8, 12);
    expect(result.events.find((e) => e.kind === 'blackout_start')?.t).toBe(0.8 * H);
    expect(result.soc[1]).toBe(0);
  });
  it('공급이 부하를 다시 충족하면 해당 구간 시작에 복구한다', () => {
    const result = simulateBase([sample(0), sample(1), sample(2, true), sample(3, true), sample(4, true)], 1, loads, { ...base, panel_area_m2: 1 });
    expect(result.blackout_h).toBeCloseTo(1.2, 12);
    expect(result.uptime).toBeCloseTo(0.7, 12);
    expect(result.events.find((e) => e.kind === 'blackout_end')?.t).toBe(2 * H);
  });
  it('종료 시각에 정확히 소진되면 그 앞의 가동시간을 잃지 않는다', () => {
    const result = simulateBase([sample(0), sample(1)], 1, loads, { ...base, battery_kwh: 1.25 });
    expect(result.blackout_h).toBe(0);
    expect(result.uptime).toBe(1);
    expect(result.soc[1]).toBe(0);
  });
  it('구간 내 정전 이벤트와 구간 시작 교신 이벤트를 시간순으로 기록한다', () => {
    const result = simulateBase([{ ...sample(0), earth_visible: false }, sample(1)], 1, loads, base);
    expect(result.events.slice(0, 2)).toEqual([{ t: 0, kind: 'comm_lost' }, { t: 0.8 * H, kind: 'blackout_start' }]);
  });
});

describe('R04 최소 24 h 이동 창', () => {
  it.each([[24.5, 1, 22, 21.5], [25, 10, 20, 19]])('마지막 창을 포함한다 (%s h, step %s)', (hours, step, onUntil, expected) => {
    const times = sampleTimes(0, hours * H, step);
    expect(dailyMinHours(times, intervalHours(times), times.map((t) => t < onUntil * H))).toBeCloseTo(expected, 12);
  });
  it('불규칙 간격의 모든 이진 패턴이 독립적인 구간 교집합 계산과 일치한다', () => {
    const hours = [0, 5, 13, 24, 39, 53];
    const times = hours.map((h) => h * H);
    for (let bits = 0; bits < 32; bits++) {
      const flags = hours.map((_, i) => Boolean(bits & (1 << i)));
      let expected = Infinity;
      for (let start = 0; start <= 29; start++) {
        let visible = 0;
        for (let i = 0; i < 5; i++) if (flags[i]) visible += Math.max(0, Math.min(start + 24, hours[i + 1]) - Math.max(start, hours[i]));
        expected = Math.min(expected, visible);
      }
      expect(dailyMinHours(times, intervalHours(times), flags)).toBe(expected);
    }
  });
  it('빈 배열과 하루보다 짧은 기간을 처리한다', () => {
    expect(dailyMinHours([], [], [])).toBe(0);
    const times = [0, 2 * H, 3 * H];
    expect(dailyMinHours(times, intervalHours(times), [true, false, true])).toBe(2);
  });
});

describe('R15 기지 입력 검증', () => {
  it.each([-1, NaN, Infinity])('유효하지 않은 거주 부하 %s를 거부한다', (value) => {
    expect(() => simulateBase([sample(0), sample(2)], 1, { ...loads, habitat_kw: value }, base)).toThrow(RangeError);
  });
  it('배터리·패널·비율·히스테리시스의 잘못된 값을 거부한다', () => {
    for (const change of [{ battery_kwh: NaN }, { panel_area_m2: -1 }, { efficiency: 1.1 }, { loss: -0.1 }, { isru_off_below: 0.8, isru_on_above: 0.2 }]) {
      expect(baseInputError(loads, { ...base, ...change })).not.toBeNull();
    }
    expect(baseInputError({} as BaseLoads, base)).not.toBeNull();
    expect(baseInputError(loads, { ...base, battery_kwh: 0 })).toBeNull();
  });
});

describe('R16 통신·착륙 표의 구간', () => {
  it('표시 시작·끝의 차이가 길이와 같고 짧은 끝 구간을 보존한다', () => {
    const times = [0, 6, 12, 18, 24, 25].map((h) => h * H);
    const spans = intervalSpans(times, [true, true, false, true, true, true]);
    expect(spans.map(({ start, end, h }) => [start / H, end / H, h])).toEqual([[0, 12, 12], [18, 25, 7]]);
    for (const span of spans) expect(span.end - span.start).toBe(span.h * H);
  });
  it('종료 순간만 참인 표본은 윈도가 아니다', () => {
    expect(intervalSpans([0, H, 2 * H], [false, false, true])).toEqual([]);
    expect(intervalSpans([0], [true])).toEqual([]);
    expect(intervalSpans([], [])).toEqual([]);
  });
});
