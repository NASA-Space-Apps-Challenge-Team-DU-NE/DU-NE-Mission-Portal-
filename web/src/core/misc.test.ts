import { describe, expect, it } from 'vitest';
import { toCsv } from './export';
import { dustCheck } from './hazards';
import { gmstDeg, moonAzElFromStation } from './stations';
import { pairStats } from './validationStats';
import type { Site } from './types';

const site = (id: string, lat: number, lon: number): Site => ({ id, name: id, lat_deg: lat, lon_deg: lon, category: 'other', terrain: 'flat', source_keys: [], verified: true });

describe('hazards', () => {
  it('먼지 반경 경계', () => {
    const w = dustCheck({ id: 'a', lat_deg: -89, lon_deg: 0 }, 30.4, [site('b', -90, 0), site('c', -87.5, 0)], [], 0);
    expect(w.map((x) => x.target_id)).toEqual(['b']);
  });
});
describe('stations', () => {
  it('GMST 기준값 (2000-01-01 12:00 UT ≈ 280.46°)', () => {
    expect(gmstDeg(Date.UTC(2000, 0, 1, 12))).toBeCloseTo(280.46, 1);
  });
  it('달 고도는 −90~90', () => {
    const r = moonAzElFromStation(35.4, -116.9, 1000, Date.UTC(2027, 0, 1));
    expect(Math.abs(r.el_deg)).toBeLessThanOrEqual(90);
  });
});
describe('validationStats', () => {
  it('평균 차이·RMSE·상관', () => {
    const r = pairStats([1, 2, 3, NaN], [1, 2, 4, 1]);
    expect(r.n).toBe(3);
    expect(r.mean_diff).toBeCloseTo(-1 / 3, 9);
    expect(r.rmse).toBeCloseTo(Math.sqrt(1 / 3), 9);
    expect(r.r!).toBeGreaterThan(0.9);
  });
});
describe('export', () => {
  it('CSV 따옴표 처리', () => {
    expect(toCsv(['a', 'b'], [['x,y', 1.23456789]])).toBe('a,b\n"x,y",1.234568\n');
  });
});
