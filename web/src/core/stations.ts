// 지상국 통신 창 (묶음 F, P1-36, CLAUDE.md 8.7)
// 지구 쪽 좌표(WGS84/ITRF)는 지상국에서 본 달 고도 계산에만 쓰고 달 좌표와 섞지 않는다(4.6).
// 달 위치는 해석적 근사(ephemeris.moonGeocentricJ2000) + 세차·GMST 회전. 대기 굴절 없음 → 화면 "근사".
import { dailyMinHours, intervalHours } from './timeline';
import { DEG, RAD, WGS84_A_KM, WGS84_F } from './constants';
import { moonGeocentricJ2000 } from './ephemeris';
import { horizonAt } from './horizon';
import { daysSinceJ2000TT, daysSinceJ2000UT } from './time';
import type { Station, TimeMs, Vec3 } from './types';
import { clamp, normAz } from './vec';

const ARCSEC = DEG / 3600;

function precessJ2000ToDate(t: TimeMs, v: Vec3): Vec3 {
  const T = daysSinceJ2000TT(t) / 36525;
  const zeta = (2306.2181 * T + 0.30188 * T * T) * ARCSEC;
  const z = (2306.2181 * T + 1.09468 * T * T) * ARCSEC;
  const th = (2004.3109 * T - 0.42665 * T * T) * ARCSEC;
  const cz = Math.cos(zeta), sz = Math.sin(zeta), cZ = Math.cos(z), sZ = Math.sin(z), ct = Math.cos(th), st = Math.sin(th);
  // P = Rz(−z)·Ry(θ)·Rz(−ζ)
  const m = [
    [cZ * ct * cz - sZ * sz, -cZ * ct * sz - sZ * cz, -cZ * st],
    [sZ * ct * cz + cZ * sz, -sZ * ct * sz + cZ * cz, -sZ * st],
    [st * cz, -st * sz, ct],
  ];
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

export function gmstDeg(t: TimeMs): number {
  const d = daysSinceJ2000UT(t);
  const T = d / 36525;
  return normAz(280.46061837 + 360.98564736629 * d + 0.000387933 * T * T - (T * T * T) / 38710000);
}

/** 지구 고정(ECEF, km) 달 위치 */
export function moonEcef(t: TimeMs): Vec3 {
  const v = precessJ2000ToDate(t, moonGeocentricJ2000(t));
  const g = gmstDeg(t) * DEG;
  const c = Math.cos(g), s = Math.sin(g);
  return [c * v[0] + s * v[1], -s * v[0] + c * v[1], v[2]];
}

export function geodeticToEcef(lat: number, lon: number, h_m: number): Vec3 {
  const e2 = WGS84_F * (2 - WGS84_F);
  const p = lat * DEG, l = lon * DEG;
  const N = WGS84_A_KM / Math.sqrt(1 - e2 * Math.sin(p) ** 2);
  const h = h_m / 1000;
  return [(N + h) * Math.cos(p) * Math.cos(l), (N + h) * Math.cos(p) * Math.sin(l), (N * (1 - e2) + h) * Math.sin(p)];
}

/** 지상국에서 본 달 방위·고도 (기하, 굴절 없음) */
export function moonAzElFromStation(lat: number, lon: number, h_m: number, t: TimeMs): { az_deg: number; el_deg: number } {
  const st = geodeticToEcef(lat, lon, h_m);
  const m = moonEcef(t);
  const d: Vec3 = [m[0] - st[0], m[1] - st[1], m[2] - st[2]];
  const r = Math.hypot(d[0], d[1], d[2]);
  const p = lat * DEG, l = lon * DEG;
  const e: Vec3 = [-Math.sin(l), Math.cos(l), 0];
  const n: Vec3 = [-Math.sin(p) * Math.cos(l), -Math.sin(p) * Math.sin(l), Math.cos(p)];
  const u: Vec3 = [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)];
  const x = (d[0] * e[0] + d[1] * e[1]) / r;
  const y = (d[0] * n[0] + d[1] * n[1] + d[2] * n[2]) / r;
  const z = (d[0] * u[0] + d[1] * u[1] + d[2] * u[2]) / r;
  return { az_deg: normAz(Math.atan2(x, y) * RAD), el_deg: Math.asin(clamp(z, -1, 1)) * RAD };
}

/** 기준(CLAUDE.md 8.7): 안테나 지평선 마스크가 있으면 마스크 우선, 없으면 최소 고도각 */
export function stationSees(st: Station, t: TimeMs): { visible: boolean; el_deg: number; threshold_deg: number; uses_mask: boolean } {
  const a = st.antennas[0];
  const lat = a?.lat_deg ?? st.lat_deg, lon = a?.lon_deg ?? st.lon_deg, h = a?.height_m ?? st.height_m;
  const ae = moonAzElFromStation(lat, lon, h, t);
  const mask = a?.horizon_mask;
  const thr = mask ? horizonAt(mask, ae.az_deg) : st.min_elev_deg;
  return { visible: ae.el_deg >= thr, el_deg: ae.el_deg, threshold_deg: thr, uses_mask: !!mask };
}

export interface StationWindows {
  times: TimeMs[];
  per_station: Record<string, Uint8Array>;
  /** 착륙지에서 지구 보임 ∩ 지상국 가시 합집합 */
  link: Uint8Array;
  daily_link_h_min: number;
  link_frac: number;
}

export function stationWindows(stations: Station[], times: TimeMs[], earthVisible: ArrayLike<boolean | number>, _step_h: number): StationWindows {
  const per: Record<string, Uint8Array> = {};
  const n = times.length;
  const link = new Uint8Array(n);
  for (const s of stations) per[s.id] = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    let any = false;
    for (const s of stations) {
      const v = stationSees(s, times[i]).visible;
      per[s.id][i] = v ? 1 : 0;
      if (v) any = true;
    }
    link[i] = any && earthVisible[i] ? 1 : 0;
  }
  // 표본 i 는 [t_i, t_{i+1}) 을 대표 (마지막 표본 0 h)
  const w = intervalHours(times);
  let total = 0, tot = 0;
  for (let i = 0; i < n; i++) { tot += w[i]; if (link[i]) total += w[i]; }
  const minDay = n ? dailyMinHours(times, w, link) : 0;
  return { times, per_station: per, link, daily_link_h_min: minDay, link_frac: tot > 0 ? total / tot : n ? link[0] : 0 };
}
