import { describe, expect, it } from 'vitest';
import { diskFraction, earthVisible, horizonAt, sphereDipDeg } from './horizon';

const mask = { az_step_deg: 1, elevation_deg: Array.from({ length: 360 }, (_, i) => (i === 359 ? 2 : i === 0 ? 0 : 1)) };

describe('horizon', () => {
  it('격자점 정확값과 중간 보간', () => {
    expect(horizonAt(mask, 10)).toBe(1);
    expect(horizonAt({ az_step_deg: 5, elevation_deg: [0, 10, 20, 30, ...new Array(68).fill(0)] }, 7.5)).toBeCloseTo(15, 9);
  });
  it('359.5° 감싸기', () => {
    expect(horizonAt(mask, 359.5)).toBeCloseTo(1, 9); // 359°=2, 0°=0 의 중간
    expect(horizonAt(mask, -0.5)).toBeCloseTo(1, 9);
  });
  it('원반 노출률 x=1→1, 0→0.5, −1→0', () => {
    expect(diskFraction(1, 0, 0.25)).toBeCloseTo(1, 9);
    expect(diskFraction(0, 0, 0.25)).toBeCloseTo(0.5, 9);
    expect(diskFraction(-1, 0, 0.25)).toBeCloseTo(0, 9);
  });
  it('교신 판정은 여유각을 더한다', () => {
    const e = { az_deg: 10, el_deg: 2.5, dist_km: 4e5, ang_radius_deg: 0.9 };
    expect(earthVisible(e, mask, 1)).toBe(true);
    expect(earthVisible(e, mask, 2)).toBe(false);
  });
  it('관측 높이 2 m 구면 지평선은 약 −0.087°', () => {
    expect(sphereDipDeg(2)).toBeCloseTo(-0.0870, 3);
  });
});
