// 역방향 탐색 (P2-04): 요구 조건 + 날짜 범위 → (착륙지, 날짜 구간) 점수순. Worker 에서 청크 단위로 돈다.
import { HOUR_MS } from './constants';
import { scoreScenario, type ScenarioEval } from './scenario';
import type { SiteContext } from './timeline';
import type { Requirements, ScenarioWeights, Site, TimeMs } from './types';

export interface ReverseInput {
  candidates: Array<{ site: Site; ctx: SiteContext }>;
  from: TimeMs;
  to: TimeMs;
  step_h: number;
  duration_h: number;
  req: Requirements;
  weights: ScenarioWeights;
  delay_days: number;
  only_meeting: boolean;
}

export interface ReverseHit {
  site: Site;
  /** 조건을 만족하는 연속 착륙 시각 구간 */
  start: TimeMs;
  end: TimeMs;
  best: ScenarioEval;
}

/** 진행률을 내보내며 결과를 쌓는 제너레이터. yield 값은 0~1 진행률 */
export function* reverseSearch(inp: ReverseInput, out: ReverseHit[]): Generator<number, void, unknown> {
  const steps = Math.floor((inp.to - inp.from) / (inp.step_h * HOUR_MS)) + 1;
  const total = inp.candidates.length * steps;
  let done = 0;
  for (const c of inp.candidates) {
    let run: ReverseHit | null = null;
    for (let k = 0; k < steps; k++) {
      const t = inp.from + k * inp.step_h * HOUR_MS;
      const ev = scoreScenario(c.ctx, t, inp.duration_h, inp.req, inp.weights, inp.delay_days, 3);
      const ok = !inp.only_meeting || ev.score.meets_requirements;
      if (ok) {
        if (!run) run = { site: c.site, start: t, end: t, best: ev };
        else {
          run.end = t;
          if (ev.score.total > run.best.score.total) run.best = ev;
        }
      } else if (run) {
        out.push(run);
        run = null;
      }
      done++;
      if (done % 8 === 0) yield done / total;
    }
    if (run) out.push(run);
  }
  out.sort((a, b) => b.best.score.total - a.best.score.total);
  yield 1;
}
