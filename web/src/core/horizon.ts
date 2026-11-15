// 지평선 마스크 조회·원반 노출률·교신 판정·조도 (CLAUDE.md 8.3)
import { AU_KM, DEG, R_MOON_KM, RAD, S0_W_M2 } from './constants';
import type { AzEl, Deg, HorizonMask, PanelMount } from './types';
import { clamp, normAz } from './vec';

export interface MaskLike {
  az_step_deg: number;
  elevation_deg: ArrayLike<number>;
}

/** 방위 사이 선형 보간, 360° 감싸기 */
export function horizonAt(mask: MaskLike, az: Deg): Deg {
  const n = mask.elevation_deg.length;
  const f = normAz(az) / mask.az_step_deg;
  const i0 = Math.floor(f) % n;
  const i1 = (i0 + 1) % n;
  const w = f - Math.floor(f);
  return mask.elevation_deg[i0] * (1 - w) + mask.elevation_deg[i1] * w;
}

/** 구면 지평선 (지형 미반영): 관측 높이만큼 내려간 기하 지평선 */
export function sphereDipDeg(observer_height_m: number): Deg {
  const r = R_MOON_KM;
  return -Math.acos(r / (r + observer_height_m / 1000)) * RAD;
}

export function flatMask(site_id: string, lat: Deg, lon: Deg, observer_height_m: number, step = 5): HorizonMask {
  const dip = sphereDipDeg(observer_height_m);
  return {
    site_id,
    lat_deg: lat,
    lon_deg: lon,
    ground_elev_m: 0,
    observer_height_m,
    az_step_deg: step,
    elevation_deg: new Array(Math.round(360 / step)).fill(dip),
    terrain: 'flat',
  };
}

/** 태양 원반 노출률 0~1. x=1→1, x=0→0.5, x=−1→0 */
export function diskFraction(el: Deg, horizon: Deg, angRadius: Deg): number {
  const x = clamp((el - horizon) / angRadius, -1, 1);
  return 1 - (Math.acos(x) - x * Math.sqrt(1 - x * x)) / Math.PI;
}

export function sunFraction(sun: AzEl, mask: MaskLike): number {
  return diskFraction(sun.el_deg, horizonAt(mask, sun.az_deg), sun.ang_radius_deg);
}

/** 지구 중심 고도 > 지형 지평선 + 여유각 */
export function earthVisible(earth: AzEl, mask: MaskLike, margin_deg: number): boolean {
  return earth.el_deg > horizonAt(mask, earth.az_deg) + margin_deg;
}

export function solarConstantAt(sun_dist_km: number): number {
  const r = AU_KM / sun_dist_km;
  return S0_W_M2 * r * r;
}

export interface Irradiance {
  horizontal_w_m2: number;
  vertical_tracking_w_m2: number;
}
export function irradiance(sun: AzEl, frac: number): Irradiance {
  const S = solarConstantAt(sun.dist_km) * frac;
  return {
    horizontal_w_m2: S * Math.max(0, Math.sin(sun.el_deg * DEG)),
    vertical_tracking_w_m2: S * Math.max(0, Math.cos(sun.el_deg * DEG)),
  };
}

/** 장착 방식별 1 m² 입사량 (W/m²) */
export function mountIrradiance(sun: AzEl, frac: number, mount: PanelMount, panel_az_deg = 0): number {
  const S = solarConstantAt(sun.dist_km) * frac;
  const el = sun.el_deg * DEG;
  if (mount === 'horizontal') return S * Math.max(0, Math.sin(el));
  if (mount === 'vertical_tracking') return S * Math.max(0, Math.cos(el));
  return S * Math.max(0, Math.cos(el)) * Math.max(0, Math.cos((sun.az_deg - panel_az_deg) * DEG));
}
