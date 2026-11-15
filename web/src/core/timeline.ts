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

/** 표본 시각 목록: start 부터 step 간격, 마지막 표본은 정확히 end (짧은 마지막 구간 허용) */
export function sampleTimes(start: TimeMs, end: TimeMs, step_h: number): TimeMs[] {
  const step = step_h * HOUR_MS;
  const out: TimeMs[] = [];
  if (!(step > 0) || !(end > start)) return [start];
  for (let t = start; t < end - 1; t += step) out.push(t);
  out.push(end);
  return out;
}

export function sampleTimeline(ctx: SiteContext, start: TimeMs, end: TimeMs, step_h: number): TimelineSample[] {
  return sampleTimes(start, end, step_h).map((t) => skyState(ctx.frame, ctx.mask, ctx.eph, t, ctx.margin_deg));
}

/**
 * 표본별 적분 구간 길이(h). 표본 i 는 [t_i, t_{i+1}) 를 대표하고 마지막 표본(종료 시각)은 0 h.
 * 표본 시각과 적분 구간을 분리해 시작·종료 표본을 둘 다 한 구간씩 세지 않게 한다.
 */
export function intervalHours(times: ArrayLike<{ t: TimeMs } | TimeMs>): Float64Array {
  const n = times.length;
  const w = new Float64Array(n);
  const at = (i: number) => { const v = times[i]; return typeof v === 'number' ? v : v.t; };
  for (let i = 0; i < n - 1; i++) w[i] = Math.max(0, (at(i + 1) - at(i)) / HOUR_MS);
  return w;
}

/** 참인 표본의 실제 구간 [t_i, t_{i+1}) 을 합친다. 종료 표본만 참이면 구간이 없다. */
export function intervalSpans(times: ArrayLike<TimeMs>, flags: ArrayLike<boolean | number>) {
  const out: Array<{ start: TimeMs; end: TimeMs; h: number; start_index: number; end_index: number }> = [];
  let start = -1;
  for (let i = 0; i < times.length; i++) {
    const on = i + 1 < times.length && times[i + 1] > times[i] && !!flags[i];
    if (on && start < 0) start = i;
    if (!on && start >= 0) {
      out.push({ start: times[start], end: times[i], h: (times[i] - times[start]) / HOUR_MS, start_index: start, end_index: i });
      start = -1;
    }
  }
  return out;
}

/** 조건이 참인 연속 구간 중 가장 긴 길이(h). 두 번째 인자는 고정 간격(h) 또는 표본별 구간 길이 */
export function longestRun(flags: ArrayLike<boolean>, step_or_hours: number | ArrayLike<number>): number {
  let best = 0, cur = 0;
  for (let i = 0; i < flags.length; i++) {
    const w = typeof step_or_hours === 'number' ? step_or_hours : step_or_hours[i];
    cur = flags[i] ? cur + w : 0;
    if (cur > best) best = cur;
  }
  return best;
}

export function summarize(samples: TimelineSample[], step_h: number): Summary {
  const n = samples.length;
  if (n === 0) throw new Error('표본이 없다');
  const w = intervalHours(samples);
  let total = 0;
  for (let i = 0; i < n; i++) total += w[i];
  // 기간 0 h: 그 순간의 상태를 그대로 쓴다
  const wt = total > 0 ? w : Float64Array.from({ length: n }, (_, i) => (i === 0 ? 1 : 0));
  const tot = total > 0 ? total : 1;
  let fracSum = 0, lit = 0, comm = 0, irr = 0;
  const dark: boolean[] = new Array(n);
  const noComm: boolean[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const s = samples[i];
    fracSum += s.sun_frac * wt[i];
    if (s.sun_frac > DARK_FRAC) lit += wt[i];
    if (s.earth_visible) comm += wt[i];
    irr += s.irr_vertical_w_m2 * wt[i];
    dark[i] = s.sun_frac <= DARK_FRAC;
    noComm[i] = !s.earth_visible;
  }
  return {
    start: samples[0].t,
    end: samples[n - 1].t,
    step_h,
    illum_frac: fracSum / tot,
    sunlit_frac: lit / tot,
    comm_frac: comm / tot,
    daily_comm_h_min: dailyMinHours(samples, w, samples.map((s) => s.earth_visible)),
    longest_dark_h: longestRun(dark, w),
    longest_no_comm_h: longestRun(noComm, w),
    mean_irr_vertical_w_m2: irr / tot,
  };
}

/** 24 h 이동 창 안의 참 시간 최솟값(h). 기간이 24 h 보다 짧으면 전체 기간의 참 시간 */
export function dailyMinHours(times: ArrayLike<{ t: TimeMs } | TimeMs>, w: ArrayLike<number>, flags: ArrayLike<boolean | number>): number {
  const n = times.length;
  if (n === 0) return 0;
  const at = (i: number) => { const v = times[i]; return typeof v === 'number' ? v : v.t; };
  // 누적 참 시간 C(x): 구간 안에서 상태가 일정하므로 선형
  const cum = new Float64Array(n);
  for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + (flags[i - 1] ? w[i - 1] : 0);
  const t0 = at(0), tEnd = at(n - 1);
  const day = 24 * HOUR_MS;
  if (n < 2 || tEnd - t0 < day - 1) return cum[n - 1];
  const C = (x: number) => {
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (at(m) <= x) lo = m; else hi = m; }
    const span = at(hi) - at(lo);
    const f = span > 0 ? Math.min(1, Math.max(0, (x - at(lo)) / span)) : 0;
    return cum[lo] + (cum[hi] - cum[lo]) * f;
  };
  const lastStart = tEnd - day;
  let best = C(tEnd) - C(lastStart);
  // C(x + day) - C(x)의 기울기는 창의 시작 또는 끝이 표본 경계를 지날 때 바뀐다.
  for (let i = 0; i < n; i++) {
    for (const start of [at(i), at(i) - day]) {
      if (start >= t0 && start <= lastStart) best = Math.min(best, C(start + day) - C(start));
    }
  }
  return best;
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
