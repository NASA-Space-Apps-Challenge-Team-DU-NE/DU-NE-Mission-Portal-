// 시간 변환. core 는 UTC 밀리초(TimeMs)를 쓰고 저장·화면은 ISO 8601 UTC.
import { DAY_MS, HOUR_MS } from './constants';
import type { ISOTime, TimeMs } from './types';

export const toMs = (iso: ISOTime): TimeMs => {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) throw new Error(`잘못된 시각: ${iso}`);
  return t;
};
/** 2027-01-02T06:00:00Z 형식 (초 단위) */
export const toIso = (t: TimeMs): ISOTime => new Date(Math.round(t / 1000) * 1000).toISOString().replace('.000Z', 'Z');
export const addHours = (t: TimeMs, h: number): TimeMs => t + h * HOUR_MS;
export const addDays = (t: TimeMs, d: number): TimeMs => t + d * DAY_MS;
export const hoursBetween = (a: TimeMs, b: TimeMs): number => (b - a) / HOUR_MS;

/** J2000.0 (TT) 기준 일수. TT ≈ UTC + 69.184 s (2020년대 근사, 근사 천체력용) */
export const TT_MINUS_UTC_S = 69.184;
const J2000_MS = Date.UTC(2000, 0, 1, 12, 0, 0);
export const daysSinceJ2000TT = (t: TimeMs): number => (t + TT_MINUS_UTC_S * 1000 - J2000_MS) / DAY_MS;
export const daysSinceJ2000UT = (t: TimeMs): number => (t - J2000_MS) / DAY_MS;

/** 시각을 step 시간 격자에 맞춘 배열 [start, end] */
export function timeGrid(start: TimeMs, end: TimeMs, step_h: number): TimeMs[] {
  const out: TimeMs[] = [];
  const step = step_h * HOUR_MS;
  for (let t = start; t <= end + 1; t += step) out.push(t);
  return out;
}
