// 벡터·MOON_ME 위경도·지평 좌표 (CLAUDE.md 8.2). 입출력은 도(°).
import { DEG, R_MOON_KM, RAD } from './constants';
import type { Deg, Vec3 } from './types';

export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
export const norm = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
export const unit = (a: Vec3): Vec3 => {
  const n = norm(a);
  return n === 0 ? [0, 0, 0] : [a[0] / n, a[1] / n, a[2] / n];
};
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);

/** 방위를 [0, 360) 으로 */
export function normAz(az: Deg): Deg {
  const a = az % 360;
  return a < 0 ? a + 360 : a;
}
/** 경도를 (−180, 180] 으로 */
export function normLon(lon: Deg): Deg {
  let l = ((lon + 180) % 360 + 360) % 360 - 180;
  if (l === -180) l = 180;
  return l;
}

/** 위경도 → 단위 벡터 (MOON_ME) */
export function latLonToUnit(lat: Deg, lon: Deg): Vec3 {
  const p = lat * DEG;
  const l = lon * DEG;
  return [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)];
}
/** 벡터 → 위경도 (planetocentric) */
export function vecToLatLon(v: Vec3): { lat_deg: Deg; lon_deg: Deg; r: number } {
  const r = norm(v);
  return {
    lat_deg: Math.asin(clamp(v[2] / r, -1, 1)) * RAD,
    lon_deg: normLon(Math.atan2(v[1], v[0]) * RAD),
    r,
  };
}

export interface LocalFrame {
  /** 위치 km */
  p: Vec3;
  /** 천정(up) */
  u: Vec3;
  /** 동 */
  e: Vec3;
  /** 북 */
  n: Vec3;
}

/** 착륙지 국지 좌표계. 고도 m 는 기준 구면 1737.4 km 대비 */
export function localFrame(lat: Deg, lon: Deg, elevation_m = 0, observer_height_m = 0): LocalFrame {
  const p = lat * DEG;
  const l = lon * DEG;
  const sp = Math.sin(p), cp = Math.cos(p), sl = Math.sin(l), cl = Math.cos(l);
  const u: Vec3 = [cp * cl, cp * sl, sp];
  const r = R_MOON_KM + (elevation_m + observer_height_m) / 1000;
  return {
    p: [u[0] * r, u[1] * r, u[2] * r],
    u,
    e: [-sl, cl, 0],
    n: [-sp * cl, -sp * sl, cp],
  };
}

/** 국지 좌표계에서 본 대상 위치의 방위·고도. target 은 달 중심 km */
export function topocentric(frame: LocalFrame, target: Vec3): { az_deg: Deg; el_deg: Deg; dist_km: number } {
  const d = sub(target, frame.p);
  const dist = norm(d);
  const x = dot(d, frame.e) / dist;
  const y = dot(d, frame.n) / dist;
  const z = dot(d, frame.u) / dist;
  return { az_deg: normAz(Math.atan2(x, y) * RAD), el_deg: Math.asin(clamp(z, -1, 1)) * RAD, dist_km: dist };
}

/** 대원 거리 km */
export function greatCircleKm(lat1: Deg, lon1: Deg, lat2: Deg, lon2: Deg): number {
  const a = latLonToUnit(lat1, lon1);
  const b = latLonToUnit(lat2, lon2);
  return R_MOON_KM * Math.acos(clamp(dot(a, b), -1, 1));
}

/** 두 방향 사이 각거리 (°) */
export function angularSeparation(az1: Deg, el1: Deg, az2: Deg, el2: Deg): Deg {
  const a = latLonToUnit(el1, az1);
  const b = latLonToUnit(el2, az2);
  return Math.acos(clamp(dot(a, b), -1, 1)) * RAD;
}

// ───────── 남극 방위 등거리(AEQD) — 격자 정의 (ARCHITECTURE 5.4) ─────────
// x = ρ·sin(λ), y = ρ·cos(λ), ρ = R·(90° + φ) [rad]. 남극에서 내려다본 평면.
export function aeqdForward(lat: Deg, lon: Deg): { x_km: number; y_km: number } {
  const rho = R_MOON_KM * (90 + lat) * DEG;
  const l = lon * DEG;
  return { x_km: rho * Math.sin(l), y_km: rho * Math.cos(l) };
}
export function aeqdInverse(x_km: number, y_km: number): { lat_deg: Deg; lon_deg: Deg } {
  const rho = Math.hypot(x_km, y_km);
  const lat = rho / R_MOON_KM * RAD - 90;
  const lon = rho === 0 ? 0 : normLon(Math.atan2(x_km, y_km) * RAD);
  return { lat_deg: lat, lon_deg: lon };
}
