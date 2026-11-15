// 원래 안 재평가·대안·차이 (P1-22~24, CLAUDE.md 8.6)
import { DAY_MS, HOUR_MS } from './constants';
import { scoreScenario, type ScenarioEval } from './scenario';
import type { SiteContext } from './timeline';
import type { Requirements, ScenarioWeights, Site, Summary, TimeMs } from './types';
import { greatCircleKm } from './vec';

export interface ScoreCtx {
  req: Requirements;
  weights: ScenarioWeights;
  delay_days: number;
  duration_h: number;
  step_h?: number;
}

export type DiffKey = 'score' | 'illum_frac' | 'comm_frac' | 'longest_dark_h' | 'distance_km' | 'landing_shift_days';
export interface ScenarioDiff {
  values: Record<DiffKey, number>;
  /** 가장 크게 바뀐 지표 (정규화 기준) */
  reason: DiffKey;
}

export function diffScenarios(a: { site: Site; ev: ScenarioEval }, b: { site: Site; ev: ScenarioEval }): ScenarioDiff {
  const values: Record<DiffKey, number> = {
    score: b.ev.score.total - a.ev.score.total,
    illum_frac: b.ev.summary.illum_frac - a.ev.summary.illum_frac,
    comm_frac: b.ev.summary.comm_frac - a.ev.summary.comm_frac,
    longest_dark_h: b.ev.summary.longest_dark_h - a.ev.summary.longest_dark_h,
    distance_km: greatCircleKm(a.site.lat_deg, a.site.lon_deg, b.site.lat_deg, b.site.lon_deg),
    landing_shift_days: (b.ev.landing - a.ev.landing) / DAY_MS,
  };
  // 서로 다른 단위를 비교하려고 대략적인 척도로 나눈다 (PROVISIONAL)
  const scaleOf: Record<DiffKey, number> = { score: 100, illum_frac: 1, comm_frac: 1, longest_dark_h: 100, distance_km: Infinity, landing_shift_days: Infinity };
  let reason: DiffKey = 'score', best = -1;
  for (const k of ['illum_frac', 'comm_frac', 'longest_dark_h'] as DiffKey[]) {
    const v = Math.abs(values[k]) / scaleOf[k];
    if (v > best) { best = v; reason = k; }
  }
  return { values, reason };
}

export interface Reevaluation {
  before: ScenarioEval;
  after: ScenarioEval;
  /** 가장 크게 나빠진 지표 */
  cause: keyof Summary | null;
  cause_before: number | null;
  cause_after: number | null;
}

export function reevaluate(ctx: SiteContext, original: TimeMs, shifted: TimeMs, sc: ScoreCtx): Reevaluation {
  const before = scoreScenario(ctx, original, sc.duration_h, sc.req, sc.weights, sc.delay_days, sc.step_h);
  const after = scoreScenario(ctx, shifted, sc.duration_h, sc.req, sc.weights, sc.delay_days, sc.step_h);
  const cands: Array<[keyof Summary, number]> = [
    ['illum_frac', before.summary.illum_frac - after.summary.illum_frac],
    ['comm_frac', before.summary.comm_frac - after.summary.comm_frac],
    ['longest_dark_h', (after.summary.longest_dark_h - before.summary.longest_dark_h) / 100],
    ['daily_comm_h_min', (before.summary.daily_comm_h_min - after.summary.daily_comm_h_min) / 24],
  ];
  cands.sort((a, b) => b[1] - a[1]);
  const cause = cands[0][1] > 0 ? cands[0][0] : null;
  return {
    before,
    after,
    cause,
    cause_before: cause ? (before.summary[cause] as number) : null,
    cause_after: cause ? (after.summary[cause] as number) : null,
  };
}

/** 대안 A: 같은 곳 다른 날짜 (±span 일, step 간격, 서로 24 h 이상) */
export function sameSiteAlternatives(ctx: SiteContext, landing: TimeMs, sc: ScoreCtx, span_days = 7, step_h = 6, k = 3, min_sep_h = 24): ScenarioEval[] {
  const all: ScenarioEval[] = [];
  for (let h = -span_days * 24; h <= span_days * 24; h += step_h) {
    if (h === 0) continue;
    all.push(scoreScenario(ctx, landing + h * HOUR_MS, sc.duration_h, sc.req, sc.weights, sc.delay_days, sc.step_h ?? 2));
  }
  all.sort((a, b) => b.score.total - a.score.total);
  const out: ScenarioEval[] = [];
  for (const e of all) {
    if (out.length >= k) break;
    if (out.some((o) => Math.abs(o.landing - e.landing) < min_sep_h * HOUR_MS)) continue;
    out.push(e);
  }
  return out;
}

export interface Candidate {
  site: Site;
  ctx: SiteContext;
}
/** 대안 B: 다른 곳 같은 날짜 (반경 안 후보, 서로 min_sep_km 이상) */
export function otherSiteAlternatives(origin: Site, candidates: Candidate[], landing: TimeMs, sc: ScoreCtx, radius_km = 200, k = 3, min_sep_km = 8) {
  const scored = candidates
    .filter((c) => c.site.id !== origin.id && greatCircleKm(origin.lat_deg, origin.lon_deg, c.site.lat_deg, c.site.lon_deg) <= radius_km)
    .map((c) => ({ site: c.site, ev: scoreScenario(c.ctx, landing, sc.duration_h, sc.req, sc.weights, sc.delay_days, sc.step_h ?? 2) }));
  scored.sort((a, b) => b.ev.score.total - a.ev.score.total);
  const out: typeof scored = [];
  for (const s of scored) {
    if (out.length >= k) break;
    if (out.some((o) => greatCircleKm(o.site.lat_deg, o.site.lon_deg, s.site.lat_deg, s.site.lon_deg) < min_sep_km)) continue;
    out.push(s);
  }
  return out;
}
