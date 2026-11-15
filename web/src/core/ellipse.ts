// 착륙 오차 범위 안 경사 조건 만족 비율 (P3-05). 원래 해상도 패치(10 m / 20 m / 30 m)를 그대로 쓴다.
// 화면은 착륙지 중심 반경(원)으로 판정한다 (2026-11-15 결정). 원은 장축 = 단축 = 지름인 타원이다.
// 패치 1바이트: 하위 7비트 = 경사×2 (126 = 63° 이상, 127 = 자료 없음), 최상위 비트 = 레이저 관측 있음(ldec ≥ 1).

export interface EllipsePatch {
  res_m: number;
  size: number;
  /** 패치 안 착륙지 위치 (픽셀 모서리 기준, 픽셀 i 의 중심 = i + 0.5) */
  center_px: [number, number];
  /** 투영 평면(x 오른쪽, y 위)에서 국지 동·북 단위 벡터 */
  east_xy: [number, number];
  north_xy: [number, number];
  data: Uint8Array;
}

export interface EllipseStats {
  /** 타원 안 픽셀 수 (자료 없음 포함) */
  n: number;
  nodata_frac: number;
  /** 자료 있는 픽셀 중 레이저 관측 픽셀 비율 */
  observed_frac: number;
  /** 자료 있는 픽셀 중 경사 ≤ 한계 비율 */
  ok_frac: number;
  /** 관측 픽셀만 따졌을 때 경사 ≤ 한계 비율 (관측 픽셀이 없으면 null) */
  ok_observed_frac: number | null;
  slope_p50: number;
  slope_p90: number;
}

export const NODATA = 127;
export const slopeOf = (b: number) => (b & 127) / 2;
export const observedOf = (b: number) => (b & 128) !== 0;

/**
 * 픽셀 (i 열, j 행) 이 타원 안인지. a_km·b_km 는 타원 전체 길이(장축·단축), az_deg 는 장축 방위(북 0°, 동 90°).
 */
export function ellipseTest(p: Pick<EllipsePatch, 'res_m' | 'center_px' | 'east_xy' | 'north_xy'>, a_km: number, b_km: number, az_deg: number) {
  const ra = (a_km * 1000) / 2, rb = (b_km * 1000) / 2;
  const c = Math.cos((az_deg * Math.PI) / 180), s = Math.sin((az_deg * Math.PI) / 180);
  return (i: number, j: number) => {
    const dx = (i + 0.5 - p.center_px[0]) * p.res_m, dy = -(j + 0.5 - p.center_px[1]) * p.res_m;
    const e = dx * p.east_xy[0] + dy * p.east_xy[1], n = dx * p.north_xy[0] + dy * p.north_xy[1];
    const along = n * c + e * s, across = -n * s + e * c;
    return (along / ra) ** 2 + (across / rb) ** 2 <= 1;
  };
}

export function ellipseStats(p: EllipsePatch, a_km: number, b_km: number, az_deg: number, max_slope_deg: number): EllipseStats {
  const inside = ellipseTest(p, a_km, b_km, az_deg);
  const half = Math.ceil((a_km * 1000) / 2 / p.res_m) + 2;
  const ci = Math.floor(p.center_px[0]), cj = Math.floor(p.center_px[1]);
  let n = 0, nod = 0, obs = 0, ok = 0, okObs = 0;
  const hist = new Uint32Array(128);
  for (let j = Math.max(0, cj - half); j < Math.min(p.size, cj + half); j++)
    for (let i = Math.max(0, ci - half); i < Math.min(p.size, ci + half); i++) {
      if (!inside(i, j)) continue;
      n++;
      const b = p.data[j * p.size + i];
      if ((b & 127) === NODATA) { nod++; continue; }
      const sl = slopeOf(b), o = observedOf(b);
      hist[b & 127]++;
      if (o) obs++;
      if (sl <= max_slope_deg) { ok++; if (o) okObs++; }
    }
  const valid = n - nod;
  const q = (f: number) => {
    let acc = 0;
    const target = f * valid;
    for (let k = 0; k < 127; k++) { acc += hist[k]; if (acc >= target) return k / 2; }
    return 63;
  };
  return {
    n,
    nodata_frac: n ? nod / n : 1,
    observed_frac: valid ? obs / valid : 0,
    ok_frac: valid ? ok / valid : 0,
    ok_observed_frac: obs ? okObs / obs : null,
    slope_p50: valid ? q(0.5) : NaN,
    slope_p90: valid ? q(0.9) : NaN,
  };
}

/** 착륙지 중심에서 반경 r_km 안 (원). 반경은 근거 없는 값이라 사용자가 입력한다. */
export function circleStats(p: EllipsePatch, r_km: number, max_slope_deg: number): EllipseStats {
  return ellipseStats(p, 2 * r_km, 2 * r_km, 0, max_slope_deg);
}
