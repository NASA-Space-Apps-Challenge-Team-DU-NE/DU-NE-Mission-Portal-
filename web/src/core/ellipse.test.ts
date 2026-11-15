import { describe, expect, it } from 'vitest';
import { circleStats, ellipseStats, ellipseTest, NODATA, type EllipsePatch } from './ellipse';

// 10 m 격자 1200² 패치, 북 = 위(+y), 동 = 오른쪽(+x)
function patch(fill: (i: number, j: number) => number): EllipsePatch {
  const size = 1200, data = new Uint8Array(size * size);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) data[j * size + i] = fill(i, j);
  return { res_m: 10, size, center_px: [600, 600], east_xy: [1, 0], north_xy: [0, 1], data };
}

describe('착륙 오차 타원', () => {
  it('장축 방위 0° 는 남북으로 길다', () => {
    const p = patch(() => 0);
    const inside = ellipseTest(p, 10, 5, 0);
    expect(inside(600, 600 - 450)).toBe(true); // 북쪽 4.5 km
    expect(inside(600 + 450, 600)).toBe(false); // 동쪽 4.5 km (단축 반지름 2.5 km 밖)
    const turned = ellipseTest(p, 10, 5, 90);
    expect(turned(600 + 450, 600)).toBe(true);
  });
  it('면적은 π·a·b/4 와 맞는다', () => {
    const s = ellipseStats(patch(() => 10), 10, 5, 30, 15);
    expect(s.n * 100 / 1e6).toBeCloseTo((Math.PI * 10 * 5) / 4, 0);
    expect(s.ok_frac).toBe(1);
  });
  it('경사 한계와 관측 비트를 따로 센다', () => {
    // 왼쪽 절반: 경사 20°(×2=40) 관측 없음, 오른쪽 절반: 경사 5°(×2=10) 관측 있음
    const s = ellipseStats(patch((i) => (i < 600 ? 40 : 10 | 128)), 10, 5, 0, 15);
    expect(s.ok_frac).toBeCloseTo(0.5, 2);
    expect(s.observed_frac).toBeCloseTo(0.5, 2);
    expect(s.ok_observed_frac).toBe(1);
  });
  it('자료 없음은 비율 분모에서 뺀다', () => {
    const s = ellipseStats(patch((i) => (i < 600 ? NODATA : 10)), 10, 5, 0, 15);
    expect(s.nodata_frac).toBeCloseTo(0.5, 2);
    expect(s.ok_frac).toBe(1);
  });
  it('원(반경) 면적은 π·r² 와 맞고 방향과 무관하다', () => {
    const s = circleStats(patch(() => 10), 3, 15);
    expect(s.n * 100 / 1e6).toBeCloseTo(Math.PI * 9, 0);
    // 동쪽 절반만 가파름 → 비율 절반
    const h = circleStats(patch((i) => (i >= 600 ? 60 : 10)), 3, 15);
    expect(h.ok_frac).toBeCloseTo(0.5, 2);
  });
});
