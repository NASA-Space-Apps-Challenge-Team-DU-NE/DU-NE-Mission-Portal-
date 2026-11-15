// 한 시각의 하늘 상태 (묶음 A). pipeline/luna/sky.py 와 같은 수식 — 교차 테스트로 확인.
import { DEG, R_EARTH_KM, R_SUN_KM, RAD } from './constants';
import type { Ephemeris } from './ephemeris';
import { earthVisible, horizonAt, irradiance, sunFraction, type MaskLike } from './horizon';
import type { AzEl, BodyVectors, SkyState, TimeMs, Vec3 } from './types';
import { dot, type LocalFrame, norm, sub, topocentric, unit } from './vec';

export function azElOf(frame: LocalFrame, target: Vec3, bodyRadiusKm: number): AzEl {
  const t = topocentric(frame, target);
  return { ...t, ang_radius_deg: Math.asin(Math.min(1, bodyRadiusKm / t.dist_km)) * RAD };
}

/** 지구 위상 (달에서 본 지구의 밝은 부분 비율 0~1) */
export function earthPhase(b: BodyVectors): number {
  // 지구에서 본 태양과 달 방향의 각 → 위상각
  const earthToMoon = unit([-b.earth[0], -b.earth[1], -b.earth[2]]);
  const earthToSun = unit(sub(b.sun, b.earth));
  const phaseAngle = Math.acos(Math.max(-1, Math.min(1, dot(earthToMoon, earthToSun))));
  return (1 + Math.cos(phaseAngle)) / 2;
}

export function skyFromVectors(frame: LocalFrame, mask: MaskLike, b: BodyVectors, t: TimeMs, margin_deg: number): SkyState {
  const sun = azElOf(frame, b.sun, R_SUN_KM);
  const earth = azElOf(frame, b.earth, R_EARTH_KM);
  const frac = sunFraction(sun, mask);
  const irr = irradiance(sun, frac);
  return {
    t,
    sun,
    earth,
    sun_frac: frac,
    earth_visible: earthVisible(earth, mask, margin_deg),
    horizon_sun_deg: horizonAt(mask, sun.az_deg),
    horizon_earth_deg: horizonAt(mask, earth.az_deg),
    irr_horizontal_w_m2: irr.horizontal_w_m2,
    irr_vertical_w_m2: irr.vertical_tracking_w_m2,
    earth_phase: earthPhase(b),
    source: b.source,
  };
}

export function skyState(frame: LocalFrame, mask: MaskLike, eph: Ephemeris, t: TimeMs, margin_deg: number): SkyState {
  return skyFromVectors(frame, mask, eph.bodyVectors(t), t, margin_deg);
}

// ───────── 격자용 빠른 경로 (Worker) ─────────
// 태양은 아주 멀어서 방향만 쓰고(지점 차이 무시), 지구는 지점 기준으로 계산한다.
export interface FastFrame {
  px: number; py: number; pz: number;
  ux: number; uy: number; uz: number;
  ex: number; ey: number;
  nx: number; ny: number; nz: number;
}
export function fastFrame(f: LocalFrame): FastFrame {
  return {
    px: f.p[0], py: f.p[1], pz: f.p[2],
    ux: f.u[0], uy: f.u[1], uz: f.u[2],
    ex: f.e[0], ey: f.e[1],
    nx: f.n[0], ny: f.n[1], nz: f.n[2],
  };
}
/** dir 은 단위 벡터. [az_deg, el_deg] */
export function fastAzEl(f: FastFrame, dx: number, dy: number, dz: number): [number, number] {
  const x = dx * f.ex + dy * f.ey;
  const y = dx * f.nx + dy * f.ny + dz * f.nz;
  const z = dx * f.ux + dy * f.uy + dz * f.uz;
  let az = Math.atan2(x, y) * RAD;
  if (az < 0) az += 360;
  return [az, Math.asin(z > 1 ? 1 : z < -1 ? -1 : z) * RAD];
}
export function fastTopo(f: FastFrame, target: Vec3): [number, number, number] {
  const dx = target[0] - f.px, dy = target[1] - f.py, dz = target[2] - f.pz;
  const d = Math.hypot(dx, dy, dz);
  const [az, el] = fastAzEl(f, dx / d, dy / d, dz / d);
  return [az, el, d];
}
export const sunAngRadius = (dist_km: number) => Math.asin(R_SUN_KM / dist_km) * RAD;
export const DEG2RAD = DEG;
export { norm };
