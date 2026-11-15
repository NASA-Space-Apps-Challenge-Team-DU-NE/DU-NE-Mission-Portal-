// Python ↔ TS 교차 테스트 (ARCHITECTURE 1절). 기대값: pipeline/tests/make_cross_fixture.py
import { describe, expect, it } from 'vitest';
import fx from '../../../tests/fixtures/cross/sky_cases.json';
import { R_EARTH_KM, R_SUN_KM } from './constants';
import { horizonAt } from './horizon';
import { azElOf, skyFromVectors } from './sky';
import type { BodyVectors, Vec3 } from './types';
import { latLonToUnit, localFrame, scale } from './vec';

const vec = (sub: number[]): Vec3 => scale(latLonToUnit(sub[0], sub[1]), sub[2]);

describe('교차 테스트 (sky.py ↔ sky.ts)', () => {
  it('40개 경우의 방위·고도·노출률·교신·조도가 같다', () => {
    for (const c of fx.cases) {
      const f = localFrame(c.lat, c.lon, c.elev_m, c.obs_h_m);
      const b: BodyVectors = { sun: vec(c.sun_sub), earth: vec(c.earth_sub), source: 'table' };
      const s = skyFromVectors(f, fx.mask, b, 0, c.margin_deg);
      const e = c.expected;
      expect(Math.abs(s.sun.az_deg - e.sun_az_deg) % 360).toBeLessThan(1e-7);
      expect(Math.abs(s.sun.el_deg - e.sun_el_deg)).toBeLessThan(1e-7);
      expect(Math.abs(s.earth.el_deg - e.earth_el_deg)).toBeLessThan(1e-7);
      expect(Math.abs(s.sun_frac - e.sun_frac)).toBeLessThan(1e-7);
      expect(s.earth_visible).toBe(e.earth_visible);
      expect(Math.abs(s.irr_vertical_w_m2 - e.irr_vertical_w_m2)).toBeLessThan(1e-4);
      expect(Math.abs(azElOf(f, b.earth, R_EARTH_KM).ang_radius_deg - e.earth_ang_radius_deg)).toBeLessThan(1e-9);
      expect(Math.abs(azElOf(f, b.sun, R_SUN_KM).ang_radius_deg - e.sun_ang_radius_deg)).toBeLessThan(1e-9);
      expect(horizonAt(fx.mask, s.sun.az_deg)).toBeCloseTo(s.horizon_sun_deg, 9);
    }
  });
});
