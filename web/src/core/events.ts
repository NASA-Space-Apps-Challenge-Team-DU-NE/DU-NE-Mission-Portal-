// 알림 목록·착륙 윈도 (P1-17, P1-21)
import { DARK_FRAC, WINDOW_SUN_FRAC } from './constants';
import { crossingTime } from './timeline';
import type { LandingWindow, SkyEvent, TimelineSample } from './types';

/** 표본에서 일출·일몰·지구 뜸·짐 이벤트 (보간 시각). 일출·일몰 기준은 원반 50% */
export function findEvents(samples: TimelineSample[], margin_deg: number): SkyEvent[] {
  const ev: SkyEvent[] = [];
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i];
    const s0 = a.sun_frac - 0.5, s1 = b.sun_frac - 0.5;
    if (s0 <= 0 && s1 > 0) ev.push({ t: crossingTime(a.t, s0, b.t, s1), kind: 'sunrise', text_key: 'event.sunrise' });
    if (s0 > 0 && s1 <= 0) ev.push({ t: crossingTime(a.t, s0, b.t, s1), kind: 'sunset', text_key: 'event.sunset' });
    const e0 = a.earth.el_deg - (a.horizon_earth_deg + margin_deg);
    const e1 = b.earth.el_deg - (b.horizon_earth_deg + margin_deg);
    if (e0 <= 0 && e1 > 0) ev.push({ t: crossingTime(a.t, e0, b.t, e1), kind: 'earthrise', text_key: 'event.earthrise' });
    if (e0 > 0 && e1 <= 0) ev.push({ t: crossingTime(a.t, e0, b.t, e1), kind: 'earthset', text_key: 'event.earthset' });
  }
  return ev;
}

/** 태양 원반 ≥ 50% 이고 지구 보이는 구간이 min_h 이상 이어지는 구간 */
export function landingWindows(samples: TimelineSample[], step_h: number, min_h: number, sun_min = WINDOW_SUN_FRAC): LandingWindow[] {
  const out: LandingWindow[] = [];
  let startIdx = -1;
  const close = (endIdx: number) => {
    if (startIdx < 0) return;
    const hours = (endIdx - startIdx + 1) * step_h;
    if (hours >= min_h) out.push({ start: samples[startIdx].t, end: samples[endIdx].t, hours });
    startIdx = -1;
  };
  for (let i = 0; i < samples.length; i++) {
    const ok = samples[i].sun_frac >= sun_min && samples[i].earth_visible;
    if (ok && startIdx < 0) startIdx = i;
    if (!ok) close(i - 1);
  }
  close(samples.length - 1);
  return out;
}

export function windowEvents(windows: LandingWindow[]): SkyEvent[] {
  return windows.flatMap((w) => [
    { t: w.start, kind: 'window_open' as const, text_key: 'event.window_open', data: { hours: w.hours } },
    { t: w.end, kind: 'window_close' as const, text_key: 'event.window_close', data: { hours: w.hours } },
  ]);
}

export function darkFlags(samples: TimelineSample[]): boolean[] {
  return samples.map((s) => s.sun_frac <= DARK_FRAC);
}

export function sortEvents(ev: SkyEvent[]): SkyEvent[] {
  return [...ev].sort((a, b) => a.t - b.t);
}
