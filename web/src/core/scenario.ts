// 시나리오 점수 (묶음 C, CLAUDE.md 8.6). 점수는 후보 간 상대 비교용이며 확률이 아니다.
import { DAY_MS, HOUR_MS } from './constants';
import type { Ephemeris } from './ephemeris';
import { flatMask, type MaskLike } from './horizon';
import { sampleTimeline, summarize, type SiteContext } from './timeline';
import type { HorizonMask, Requirements, ScenarioScore, ScenarioWeights, Site, Summary, TimeMs } from './types';
import { localFrame } from './vec';

export function siteContext(site: Site, mask: MaskLike | null, eph: Ephemeris, margin_deg: number, observer_height_m = 2): SiteContext {
  const m = mask ?? flatMask(site.id, site.lat_deg, site.lon_deg, observer_height_m);
  const elev = (mask as HorizonMask | null)?.ground_elev_m ?? site.elevation_m ?? 0;
  return { frame: localFrame(site.lat_deg, site.lon_deg, elev, observer_height_m), mask: m, eph, margin_deg };
}

export function evaluateWindow(ctx: SiteContext, landing: TimeMs, duration_h: number, step_h = 1): Summary {
  return summarize(sampleTimeline(ctx, landing, landing + duration_h * HOUR_MS, step_h), step_h);
}

export interface PartScores {
  power: number;
  comm: number;
}
export function partScores(s: Summary, req: Requirements): PartScores {
  const power = 0.5 * Math.min(1, s.illum_frac / Math.max(req.min_illum_frac, 1e-9)) + 0.5 * Math.min(1, req.max_dark_h / Math.max(s.longest_dark_h, 1));
  const comm = 0.5 * Math.min(1, s.comm_frac / 0.5) + 0.5 * Math.min(1, s.daily_comm_h_min / Math.max(req.min_daily_comm_h, 1e-9));
  return { power, comm };
}

export function failedRequirements(s: Summary, req: Requirements): Array<keyof Requirements> {
  const f: Array<keyof Requirements> = [];
  if (s.illum_frac < req.min_illum_frac) f.push('min_illum_frac');
  if (s.daily_comm_h_min < req.min_daily_comm_h) f.push('min_daily_comm_h');
  if (s.longest_dark_h > req.max_dark_h) f.push('max_dark_h');
  return f;
}

/** 착륙일을 −delay…+delay 일(1일 간격)로 옮긴 경우 (power+comm)/2 의 최솟값 */
export function robustness(ctx: SiteContext, landing: TimeMs, duration_h: number, req: Requirements, delay_days: number, step_h = 1): number {
  let worst = Infinity;
  for (let d = -delay_days; d <= delay_days; d++) {
    const p = partScores(evaluateWindow(ctx, landing + d * DAY_MS, duration_h, step_h), req);
    worst = Math.min(worst, (p.power + p.comm) / 2);
  }
  return worst;
}

export function combineScore(s: Summary, req: Requirements, w: ScenarioWeights, robust: number): ScenarioScore {
  const p = partScores(s, req);
  const ws = w.power + w.comm + w.robustness;
  const total = ws > 0 ? (100 * (w.power * p.power + w.comm * p.comm + w.robustness * robust)) / ws : 0;
  const failed = failedRequirements(s, req);
  const parts: Array<[string, number]> = [
    ['power', w.power * (1 - p.power)],
    ['comm', w.comm * (1 - p.comm)],
    ['robustness', w.robustness * (1 - robust)],
  ];
  parts.sort((a, b) => b[1] - a[1]);
  return { total, power: p.power, comm: p.comm, robustness: robust, meets_requirements: failed.length === 0, failed, reason: parts[0][1] > 0 ? parts[0][0] : 'none' };
}

export interface ScenarioEval {
  landing: TimeMs;
  duration_h: number;
  summary: Summary;
  score: ScenarioScore;
}

export function scoreScenario(
  ctx: SiteContext,
  landing: TimeMs,
  duration_h: number,
  req: Requirements,
  w: ScenarioWeights,
  delay_days: number,
  step_h = 1,
): ScenarioEval {
  const summary = evaluateWindow(ctx, landing, duration_h, step_h);
  const robust = robustness(ctx, landing, duration_h, req, delay_days, Math.max(step_h, 3));
  return { landing, duration_h, summary, score: combineScore(summary, req, w, robust) };
}
