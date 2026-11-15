import { describe, expect, it } from 'vitest';
import { aeqdForward, aeqdInverse, dot, greatCircleKm, latLonToUnit, localFrame, normAz, normLon, topocentric, vecToLatLon } from './vec';

describe('vec', () => {
  it('ENU 직교', () => {
    const f = localFrame(-89.5, 123, 0);
    expect(Math.abs(dot(f.u, f.e))).toBeLessThan(1e-12);
    expect(Math.abs(dot(f.u, f.n))).toBeLessThan(1e-12);
    expect(Math.abs(dot(f.e, f.n))).toBeLessThan(1e-12);
  });
  it('방위 정규화 −10° → 350°', () => {
    expect(normAz(-10)).toBeCloseTo(350, 9);
    expect(normAz(720)).toBe(0);
  });
  it('경도 범위 (−180, 180]', () => {
    expect(normLon(190)).toBeCloseTo(-170, 9);
    expect(normLon(-180)).toBe(180);
    expect(normLon(359.5)).toBeCloseTo(-0.5, 9);
  });
  it('위경도 ↔ 벡터 왕복', () => {
    const ll = vecToLatLon(latLonToUnit(-85.3, -170.2));
    expect(ll.lat_deg).toBeCloseTo(-85.3, 9);
    expect(ll.lon_deg).toBeCloseTo(-170.2, 9);
  });
  it('천정 방향 대상은 고도 90°, 북쪽 지평선 대상은 방위 0°', () => {
    const f = localFrame(0, 0, 0);
    expect(topocentric(f, [1e6, 0, 0]).el_deg).toBeCloseTo(90, 6);
    const north = topocentric(f, [f.p[0], 0, 1e6]);
    expect(north.az_deg).toBeCloseTo(0, 6);
    const east = topocentric(f, [f.p[0], 1e6, 0]);
    expect(east.az_deg).toBeCloseTo(90, 6);
  });
  it('AEQD 왕복 오차', () => {
    for (const [lat, lon] of [[-89.9, 10], [-80, -170], [-75, 179.9], [-86.2, 45]]) {
      const p = aeqdForward(lat, lon);
      const q = aeqdInverse(p.x_km, p.y_km);
      expect(q.lat_deg).toBeCloseTo(lat, 9);
      expect(Math.abs(normLon(q.lon_deg - lon))).toBeLessThan(1e-9);
    }
  });
  it('대원 거리: 남극에서 1° 위도 ≈ 30.32 km', () => {
    expect(greatCircleKm(-90, 0, -89, 0)).toBeCloseTo(30.323, 2);
  });
});
