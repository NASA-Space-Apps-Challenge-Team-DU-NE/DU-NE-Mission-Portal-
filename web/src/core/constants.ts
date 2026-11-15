// CLAUDE.md 7절 상수. pipeline/luna/constants.py 와 같은 값이다.
export const R_MOON_KM = 1737.4;
export const S0_W_M2 = 1361;
export const R_SUN_KM = 695700;
export const R_EARTH_KM = 6378.137;
export const AU_KM = 149597870.7;
export const SYNODIC_DAYS = 29.530588853;

/** 암흑 판정: 원반 노출률이 이 값 이하 */
export const DARK_FRAC = 0.01;
/** 착륙 윈도 태양 원반 기준 */
export const WINDOW_SUN_FRAC = 0.5;

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;
export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;

/** WGS84 (지상국) */
export const WGS84_A_KM = 6378.137;
export const WGS84_F = 1 / 298.257223563;
