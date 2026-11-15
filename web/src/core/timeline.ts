// 기간 표본·요약·다음 이벤트 (CLAUDE.md 8.3)
import { DARK_FRAC, HOUR_MS } from './constants';
import type { Ephemeris } from './ephemeris';
import type { MaskLike } from './horizon';
import { skyState } from './sky';
import type { NextEvents, Summary, TimeMs, TimelineSample } from './types';
import type { LocalFrame } from './vec';

export interface SiteContext {
  frame: LocalFrame;
  mask: MaskLike;
  eph: Ephemeris;
  margin_deg: number;
}

export function sampleTimeline(ctx: SiteContext, start: TimeMs, end: TimeMs, step_h: number): TimelineSample[] {
  const out: TimelineSample[] = [];
  const step = step_h * HOUR_MS;
  for (let t = start; t <= end + 1; t += step) out.push(skyState(ctx.frame, ctx.mask, ctx.eph, t, ctx.margin_deg));
  return out;
}

/** 조건이 참인 연속 구간 중 가장 긴 길이(h) */
export function longestRun(flags: ArrayLike<boolean>, step_h: number): number {
  let best = 0, cur = 0;
  for (let i = 0; i < flags.length; i++) {
    cur = flags[i] ? cur + 1 : 0;
    if (cur > best) best = cur;
  }
  return best * step_h;
}

export function summarize(samples: TimelineSample[], step_h: number): Summary {
  const n = samples.length;
  if (n === 0) throw new Error('표본이 없다');
  let fracSum = 0, lit = 0, comm = 0, irr = 0;
  const dark: boolean[] = new Array(n);
  const noComm: boolean[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const s = samples[i];
    fracSum += s.sun_frac;
    if (s.sun_frac > DARK_FRAC) lit++;
    if (s.earth_visible) comm++;
    irr += s.irr_vertical_w_m2;
    dark[i] = s.sun_frac <= DARK_FRAC;
    noComm[i] = !s.earth_visible;
  }
  // 하루 창별 교신 시간의 최솟값 (기간이 하루보다 짧으면 전체 기간 기준)
  const perDay = Math.max(1, Math.round(24 / step_h));
  let dailyMin = Infinity;
  if (n < perDay) dailyMin = comm * step_h;
  else {
    let w = 0;
    for (let i = 0; i < perDay; i++) if (samples[i].earth_visible) w++;
    dailyMin = w;
    for (let i = perDay; i < n; i++) {
      if (samples[i].earth_visible) w++;
      if (samples[i - perDay].earth_visible) w--;
      if (w < dailyMin) dailyMin = w;
    }
    dailyMin *= step_h;
  }
  return {
    start: samples[0].t,
    end: samples[n - 1].t,
    step_h,
    illum_frac: fracSum / n,
    sunlit_frac: lit / n,
    comm_frac: comm / n,
    daily_comm_h_min: dailyMin,
    longest_dark_h: longestRun(dark, step_h),
    longest_no_comm_h: longestRun(noComm, step_h),
    mean_irr_vertical_w_m2: irr / n,
  };
}

/** f(t) 가 0 을 지나는 시각을 선형 보간 */
export function crossingTime(t0: TimeMs, f0: number, t1: TimeMs, f1: number): TimeMs {
  if (f1 === f0) return t0;
  return t0 + ((0 - f0) / (f1 - f0)) * (t1 - t0);
}

/** 다음 일몰·일출·지구몰·지구돋이 (0.25 h 간격 재표본, 최대 max_days) */
export function nextEvents(ctx: SiteContext, from: TimeMs, max_days = 60, step_h = 0.25): NextEvents {
  const out: NextEvents = {};
  const step = step_h * HOUR_MS;
  const end = from + max_days * 24 * HOUR_MS;
  let prev = skyState(ctx.frame, ctx.mask, ctx.eph, from, ctx.margin_deg);
  for (let t = from + step; t <= end; t += step) {
    const cur = skyState(ctx.frame, ctx.mask, ctx.eph, t, ctx.margin_deg);
    const fs0 = prev.sun_frac - 0.5, fs1 = cur.sun_frac - 0.5;
    if (fs0 > 0 && fs1 <= 0 && out.next_sunset === undefined) out.next_sunset = crossingTime(prev.t, fs0, cur.t, fs1);
    if (fs0 <= 0 && fs1 > 0 && out.next_sunrise === undefined) out.next_sunrise = crossingTime(prev.t, fs0, cur.t, fs1);
    const fe0 = prev.earth.el_deg - (prev.horizon_earth_deg + ctx.margin_deg);
    const fe1 = cur.earth.el_deg - (cur.horizon_earth_deg + ctx.margin_deg);
    if (fe0 > 0 && fe1 <= 0 && out.next_earthset === undefined) out.next_earthset = crossingTime(prev.t, fe0, cur.t, fe1);
    if (fe0 <= 0 && fe1 > 0 && out.next_earthrise === undefined) out.next_earthrise = crossingTime(prev.t, fe0, cur.t, fe1);
    if (out.next_sunset !== undefined && out.next_sunrise !== undefined && out.next_earthset !== undefined && out.next_earthrise !== undefined) break;
    prev = cur;
  }
  return out;
}

/** 착륙 시각 이전 마지막 일출 이후 경과 h (최대 720 h 거슬러). 계속 밝거나 계속 어두우면 null */
export function hoursSinceSunrise(ctx: SiteContext, t: TimeMs, max_back_h = 720, step_h = 1): number | null {
  const now = skyState(ctx.frame, ctx.mask, ctx.eph, t, ctx.margin_deg);
  if (now.sun_frac <= DARK_FRAC) return null;
  for (let h = step_h; h <= max_back_h; h += step_h) {
    const s = skyState(ctx.frame, ctx.mask, ctx.eph, t - h * HOUR_MS, ctx.margin_deg);
    if (s.sun_frac <= DARK_FRAC) return h - step_h / 2;
  }
  return null;
}
