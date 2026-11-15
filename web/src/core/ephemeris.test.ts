import { describe, expect, it } from 'vitest';
import { AnalyticEphemeris, CombinedEphemeris, TableEphemeris } from './ephemeris';
import { azElOf } from './sky';
import { localFrame, norm, vecToLatLon } from './vec';

describe('ephemeris', () => {
  it('표 보간은 ±180° 경계를 넘어도 연속', () => {
    const rows = new Float32Array([179, 0, 1.5e8, 0, 5, 3.9e5, -179, 0, 1.5e8, 0, 5, 3.9e5]);
    const tb = new TableEphemeris({ start_utc: '2027-01-01T00:00:00Z', step_h: 1, count: 2 }, rows);
    const mid = tb.bodyVectors(Date.parse('2027-01-01T00:30:00Z'));
    const ll = vecToLatLon(mid.sun);
    expect(Math.abs(Math.abs(ll.lon_deg) - 180)).toBeLessThan(1e-4);
    expect(norm(mid.sun)).toBeCloseTo(1.5e8, -3);
  });
  it('표 밖은 근사 천체력으로 넘어간다', () => {
    const rows = new Float32Array(12);
    const tb = new TableEphemeris({ start_utc: '2027-01-01T00:00:00Z', step_h: 1, count: 2 }, rows);
    const c = new CombinedEphemeris([tb]);
    expect(c.sourceAt(Date.parse('2030-01-01T00:00:00Z'))).toBe('analytic');
    expect(c.sourceAt(Date.parse('2027-01-01T00:30:00Z'))).toBe('table');
  });
  it('근사 천체력 상식 검사: 아폴로 11호 착륙 시 태양 고도 약 10.8° (±0.5°)', () => {
    const b = new AnalyticEphemeris().bodyVectors(Date.parse('1969-07-20T20:17:40Z'));
    const sun = azElOf(localFrame(0.67408, 23.47297), b.sun, 695700);
    expect(Math.abs(sun.el_deg - 10.8)).toBeLessThan(0.5);
  });
  it('지구 거리와 직하점 범위', () => {
    const b = new AnalyticEphemeris().bodyVectors(Date.parse('2026-11-14T00:00:00Z'));
    const d = norm(b.earth);
    expect(d).toBeGreaterThan(356000);
    expect(d).toBeLessThan(407000);
    const ll = vecToLatLon(b.earth);
    expect(Math.abs(ll.lat_deg)).toBeLessThan(8);
    expect(Math.abs(ll.lon_deg)).toBeLessThan(9);
  });
});
