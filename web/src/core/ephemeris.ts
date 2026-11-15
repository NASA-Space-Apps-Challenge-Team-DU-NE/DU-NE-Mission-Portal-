// 천체력 (CLAUDE.md 6.1, 8.2)
// 1) TableEphemeris: 파이프라인이 받은 Horizons 표(MOON_ME, 직하점 경위도·거리) 보간 — 기본
// 2) AnalyticEphemeris: 표 밖 시각용 근사(저정밀 해석식). 화면에 "근사 천체력" 배지.
//    - 달 위치: Meeus『Astronomical Algorithms』47장 주요 항
//    - 태양 위치: Meeus 25장 저정밀식
//    - 달 자전: IAU WGCCRE 달 회전 모델(ME에 가까운 IAU_MOON). PA/ME 차이보다 큰 오차는 없도록 설계했지만
//      정확도는 docs/validation.md 의 검증 결과로만 말한다.
// CLAUDE.md 는 표 밖 계산에 astronomy-engine 을 적었으나, 의존성 없이 같은 역할을 하도록 core 안에 구현했다
// (docs/decisions.md 2026-11-14 항목). 바꾸려면 이 파일의 AnalyticEphemeris 만 교체하면 된다.
import { AU_KM, DEG, HOUR_MS, RAD } from './constants';
import { daysSinceJ2000TT } from './time';
import type { BodyVectors, EphemerisMeta, EphemerisSource, TimeMs, Vec3 } from './types';
import { latLonToUnit, norm, scale, sub, unit } from './vec';

export interface Ephemeris {
  bodyVectors(t: TimeMs): BodyVectors;
  /** 표가 덮는 범위 (없으면 null) */
  coverage(): { start: TimeMs; end: TimeMs } | null;
}

// ───────────────────────── 표 보간 ─────────────────────────
export class TableEphemeris {
  readonly start: TimeMs;
  readonly stepMs: number;
  readonly count: number;
  /** 원본 float32[count][2][3] (sub_lon_deg, sub_lat_deg, dist_km)를 [ux,uy,uz,dist]×2 로 바꾼 값 */
  private readonly cache: Float64Array;

  constructor(meta: Pick<EphemerisMeta, 'start_utc' | 'step_h' | 'count'>, rows: Float32Array) {
    if (rows.length < meta.count * 6) throw new Error('천체력 표 길이가 manifest 와 다르다');
    this.start = Date.parse(meta.start_utc);
    this.stepMs = meta.step_h * HOUR_MS;
    this.count = meta.count;
    // 미리 단위 벡터·거리로 바꿔 둔다: [ux,uy,uz,dist] × 2 bodies
    this.cache = new Float64Array(meta.count * 8);
    for (let i = 0; i < meta.count; i++) {
      for (let b = 0; b < 2; b++) {
        const o = i * 6 + b * 3;
        const u = latLonToUnit(rows[o + 1], rows[o]);
        const c = i * 8 + b * 4;
        this.cache[c] = u[0];
        this.cache[c + 1] = u[1];
        this.cache[c + 2] = u[2];
        this.cache[c + 3] = rows[o + 2];
      }
    }
  }

  get end(): TimeMs {
    return this.start + (this.count - 1) * this.stepMs;
  }

  covers(t: TimeMs): boolean {
    return t >= this.start && t <= this.end;
  }

  /** 단위 벡터를 선형 보간 후 정규화, 거리는 선형 보간 (경도 직접 보간 금지) */
  bodyVectors(t: TimeMs): BodyVectors {
    const f = (t - this.start) / this.stepMs;
    const i0 = Math.max(0, Math.min(this.count - 2, Math.floor(f)));
    const w = Math.max(0, Math.min(1, f - i0));
    const out: Vec3[] = [];
    for (let b = 0; b < 2; b++) {
      const a = i0 * 8 + b * 4;
      const c = (i0 + 1) * 8 + b * 4;
      const v: Vec3 = [
        this.cache[a] * (1 - w) + this.cache[c] * w,
        this.cache[a + 1] * (1 - w) + this.cache[c + 1] * w,
        this.cache[a + 2] * (1 - w) + this.cache[c + 2] * w,
      ];
      const d = this.cache[a + 3] * (1 - w) + this.cache[c + 3] * w;
      out.push(scale(unit(v), d));
    }
    return { sun: out[0], earth: out[1], source: 'table' };
  }
}

// ───────────────────────── 해석적 근사 ─────────────────────────
const sinD = (x: number) => Math.sin(x * DEG);
const cosD = (x: number) => Math.cos(x * DEG);
const OBLIQUITY_J2000 = 23.4392911;
/** 일반 세차 (°/율리우스 세기) — 날짜 분점 황경 → J2000 근사 변환 */
const PRECESSION_DEG_PER_CENTURY = 1.3969713;

// [D, M, M', F, Σl(1e-6°), Σr(1e-3 km)]
const LR: number[][] = [
  [0, 0, 1, 0, 6288774, -20905355], [2, 0, -1, 0, 1274027, -3699111], [2, 0, 0, 0, 658314, -2955968],
  [0, 0, 2, 0, 213618, -569925], [0, 1, 0, 0, -185116, 48888], [0, 0, 0, 2, -114332, -3149],
  [2, 0, -2, 0, 58793, 246158], [2, -1, -1, 0, 57066, -152138], [2, 0, 1, 0, 53322, -170733],
  [2, -1, 0, 0, 45758, -204586], [0, 1, -1, 0, -40923, -129620], [1, 0, 0, 0, -34720, 108743],
  [0, 1, 1, 0, -30383, 104755], [2, 0, 0, -2, 15327, 10321], [0, 0, 1, 2, -12528, 0],
  [0, 0, 1, -2, 10980, 79661], [4, 0, -1, 0, 10675, -34782], [0, 0, 3, 0, 10034, -23210],
  [4, 0, -2, 0, 8548, -21636], [2, 1, -1, 0, -7888, 24208], [2, 1, 0, 0, -6766, 30824],
  [1, 0, -1, 0, -5163, -8379], [1, 1, 0, 0, 4987, -16675], [2, -1, 1, 0, 4036, -12831],
  [2, 0, 2, 0, 3994, -10445], [4, 0, 0, 0, 3861, -11650], [2, 0, -3, 0, 3665, 14403],
  [0, 1, -2, 0, -2689, -7003], [2, 0, -1, 2, -2602, 0], [2, -1, -2, 0, 2390, 10056],
  [1, 0, 1, 0, -2348, 6322], [2, -2, 0, 0, 2236, -9884],
];
// [D, M, M', F, Σb(1e-6°)]
const B: number[][] = [
  [0, 0, 0, 1, 5128122], [0, 0, 1, 1, 280602], [0, 0, 1, -1, 277693], [2, 0, 0, -1, 173237],
  [2, 0, -1, 1, 55413], [2, 0, -1, -1, 46271], [2, 0, 0, 1, 32573], [0, 0, 2, 1, 17198],
  [2, 0, 1, -1, 9266], [0, 0, 2, -1, 8822], [2, -1, 0, -1, 8216], [2, 0, -2, -1, 4324],
  [2, 0, 1, 1, 4200], [2, 1, 0, -1, -3359], [2, -1, -1, 1, 2463], [2, -1, 0, 1, 2211],
  [2, -1, -1, -1, 2065], [0, 1, -1, -1, -1870], [4, 0, -1, -1, 1828], [0, 1, 0, 1, -1794],
];

function eclToEqJ2000(lonDeg: number, latDeg: number, dist: number): Vec3 {
  const cl = cosD(latDeg);
  const x = dist * cl * cosD(lonDeg);
  const y = dist * cl * sinD(lonDeg);
  const z = dist * sinD(latDeg);
  const ce = cosD(OBLIQUITY_J2000), se = sinD(OBLIQUITY_J2000);
  return [x, y * ce - z * se, y * se + z * ce];
}

/** 지구 중심 달 위치 (J2000 적도, km) */
export function moonGeocentricJ2000(t: TimeMs): Vec3 {
  const T = daysSinceJ2000TT(t) / 36525;
  const Lp = 218.3164477 + 481267.88123421 * T;
  const D = 297.8501921 + 445267.1114034 * T;
  const M = 357.5291092 + 35999.0502909 * T;
  const Mp = 134.9633964 + 477198.8675055 * T;
  const F = 93.272095 + 483202.0175233 * T;
  const E = 1 - 0.002516 * T - 0.0000074 * T * T;
  const A1 = 119.75 + 131.849 * T, A2 = 53.09 + 479264.29 * T, A3 = 313.45 + 481266.484 * T;
  let sl = 0, sr = 0, sb = 0;
  for (const [d, m, mp, f, l, r] of LR) {
    const arg = d * D + m * M + mp * Mp + f * F;
    const e = Math.abs(m) === 1 ? E : Math.abs(m) === 2 ? E * E : 1;
    sl += l * e * sinD(arg);
    sr += r * e * cosD(arg);
  }
  for (const [d, m, mp, f, b] of B) {
    const e = Math.abs(m) === 1 ? E : Math.abs(m) === 2 ? E * E : 1;
    sb += b * e * sinD(d * D + m * M + mp * Mp + f * F);
  }
  sl += 3958 * sinD(A1) + 1962 * sinD(Lp - F) + 318 * sinD(A2);
  sb += -2235 * sinD(Lp) + 382 * sinD(A3) + 175 * sinD(A1 - F) + 175 * sinD(A1 + F) + 127 * sinD(Lp - Mp) - 115 * sinD(Lp + Mp);
  const lon = Lp + sl / 1e6 - PRECESSION_DEG_PER_CENTURY * T;
  const lat = sb / 1e6;
  const dist = 385000.56 + sr / 1000;
  return eclToEqJ2000(lon, lat, dist);
}

/** 지구 중심 태양 위치 (J2000 적도, km) */
export function sunGeocentricJ2000(t: TimeMs): Vec3 {
  const T = daysSinceJ2000TT(t) / 36525;
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
  const M = 357.52911 + 35999.05029 * T - 0.0001537 * T * T;
  const e = 0.016708634 - 0.000042037 * T;
  const C = (1.914602 - 0.004817 * T) * sinD(M) + (0.019993 - 0.000101 * T) * sinD(2 * M) + 0.000289 * sinD(3 * M);
  const lon = L0 + C - PRECESSION_DEG_PER_CENTURY * T;
  const nu = M + C;
  const R = (1.000001018 * (1 - e * e)) / (1 + e * cosD(nu));
  return eclToEqJ2000(lon, 0, R * AU_KM);
}

/** IAU 달 회전 모델: J2000 적도 벡터 → 달 고정(≈ME) 벡터 */
export function j2000ToMoonFixed(t: TimeMs, v: Vec3): Vec3 {
  const d = daysSinceJ2000TT(t);
  const T = d / 36525;
  const E = [
    125.045 - 0.0529921 * d, 250.089 - 0.1059842 * d, 260.008 + 13.0120009 * d, 176.625 + 13.3407154 * d,
    357.529 + 0.9856003 * d, 311.589 + 26.4057084 * d, 134.963 + 13.064993 * d, 276.617 + 0.3287146 * d,
    34.226 + 1.7484877 * d, 15.134 - 0.1589763 * d, 119.743 + 0.0036096 * d, 239.961 + 0.1643573 * d,
    25.053 + 12.9590088 * d,
  ];
  const s = (i: number) => sinD(E[i - 1]);
  const c = (i: number) => cosD(E[i - 1]);
  const a0 = 269.9949 + 0.0031 * T - 3.8787 * s(1) - 0.1204 * s(2) + 0.07 * s(3) - 0.0172 * s(4) + 0.0072 * s(6) - 0.0052 * s(10) + 0.0043 * s(13);
  const d0 = 66.5392 + 0.013 * T + 1.5419 * c(1) + 0.0239 * c(2) - 0.0278 * c(3) + 0.0068 * c(4) - 0.0029 * c(6) + 0.0009 * c(7) + 0.0008 * c(10) - 0.0009 * c(13);
  const W =
    38.3213 + 13.17635815 * d - 1.4e-12 * d * d + 3.561 * s(1) + 0.1208 * s(2) - 0.0642 * s(3) + 0.0158 * s(4) + 0.0252 * s(5) - 0.0066 * s(6) -
    0.0047 * s(7) - 0.0046 * s(8) + 0.0028 * s(9) + 0.0052 * s(10) + 0.004 * s(11) + 0.0019 * s(12) - 0.0044 * s(13);
  // R = Rz(W) · Rx(90 − δ0) · Rz(90 + α0)
  const rz = (ang: number, x: Vec3): Vec3 => {
    const ca = cosD(ang), sa = sinD(ang);
    return [ca * x[0] + sa * x[1], -sa * x[0] + ca * x[1], x[2]];
  };
  const rx = (ang: number, x: Vec3): Vec3 => {
    const ca = cosD(ang), sa = sinD(ang);
    return [x[0], ca * x[1] + sa * x[2], -sa * x[1] + ca * x[2]];
  };
  return rz(W, rx(90 - d0, rz(90 + a0, v)));
}

export class AnalyticEphemeris implements Ephemeris {
  bodyVectors(t: TimeMs): BodyVectors {
    const moon = moonGeocentricJ2000(t);
    const sunGeo = sunGeocentricJ2000(t);
    const earthFromMoon = scale(moon, -1);
    const sunFromMoon = sub(sunGeo, moon);
    return { sun: j2000ToMoonFixed(t, sunFromMoon), earth: j2000ToMoonFixed(t, earthFromMoon), source: 'analytic' };
  }
  coverage() {
    return null;
  }
}

/** 표가 덮으면 표, 아니면 근사 */
export class CombinedEphemeris implements Ephemeris {
  private readonly tables: TableEphemeris[];
  private readonly fallback = new AnalyticEphemeris();
  constructor(tables: TableEphemeris[] = []) {
    this.tables = tables;
  }
  withTable(t: TableEphemeris): CombinedEphemeris {
    return new CombinedEphemeris([...this.tables, t]);
  }
  sourceAt(t: TimeMs): EphemerisSource {
    return this.tables.some((x) => x.covers(t)) ? 'table' : 'analytic';
  }
  bodyVectors(t: TimeMs): BodyVectors {
    for (const tb of this.tables) if (tb.covers(t)) return tb.bodyVectors(t);
    return this.fallback.bodyVectors(t);
  }
  coverage() {
    if (!this.tables.length) return null;
    return { start: Math.min(...this.tables.map((x) => x.start)), end: Math.max(...this.tables.map((x) => x.end)) };
  }
}

/** 태양·지구 직하점 (마커용) */
export function subPoints(b: BodyVectors) {
  const toLL = (v: Vec3) => {
    const r = norm(v);
    return { lat_deg: Math.asin(v[2] / r) * RAD, lon_deg: Math.atan2(v[1], v[0]) * RAD };
  };
  return { sun: toLL(b.sun), earth: toLL(b.earth) };
}
