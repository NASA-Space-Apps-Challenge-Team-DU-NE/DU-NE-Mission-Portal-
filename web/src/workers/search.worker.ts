// 탐색 Worker: 원래 안 재평가·대안(P1-22~24), 역방향 탐색(P2-04)
import { otherSiteAlternatives, reevaluate, sameSiteAlternatives, type ScoreCtx } from '../core/alternatives';
import { reverseSearch, type ReverseHit } from '../core/reverseSearch';
import type { Requirements, ScenarioWeights } from '../core/types';
import type { EphPayload, SiteMask } from './protocol';
import { ctxFrom, ephFrom, serve, yieldNow } from './runtime';

export interface AltReq {
  eph: EphPayload;
  origin: SiteMask;
  candidates: SiteMask[];
  original: number;
  shifted: number;
  sc: ScoreCtx;
  margin_deg: number;
  span_days: number;
  radius_km: number;
}
export interface RevReq {
  eph: EphPayload;
  candidates: SiteMask[];
  from: number;
  to: number;
  step_h: number;
  duration_h: number;
  req: Requirements;
  weights: ScenarioWeights;
  delay_days: number;
  only_meeting: boolean;
  margin_deg: number;
}

serve({
  async alternatives(p: AltReq, api) {
    const eph = ephFrom(p.eph);
    const ctx = ctxFrom(p.origin, eph, p.margin_deg);
    const re = reevaluate(ctx, p.original, p.shifted, p.sc);
    api.progress(0.2);
    const preview = [3, 7, 14].map((d) => ({ days: d, ev: reevaluate(ctx, p.original, p.original + d * 86_400_000, p.sc).after }));
    api.progress(0.35);
    const same = sameSiteAlternatives(ctx, p.shifted, p.sc, p.span_days, 6, 3, 24);
    api.progress(0.7);
    await yieldNow();
    if (api.cancelled()) return null;
    const other = otherSiteAlternatives(p.origin.site, p.candidates.map((c) => ({ site: c.site, ctx: ctxFrom(c, eph, p.margin_deg) })), p.shifted, p.sc, p.radius_km, 3, 8);
    return { re, preview, same, other };
  },
  async reverse(p: RevReq, api) {
    const eph = ephFrom(p.eph);
    const out: ReverseHit[] = [];
    const gen = reverseSearch(
      { candidates: p.candidates.map((c) => ({ site: c.site, ctx: ctxFrom(c, eph, p.margin_deg) })), from: p.from, to: p.to, step_h: p.step_h, duration_h: p.duration_h, req: p.req, weights: p.weights, delay_days: p.delay_days, only_meeting: p.only_meeting },
      out,
    );
    let k = 0;
    for (const v of gen) {
      if (++k % 4 === 0) {
        api.progress(v);
        await yieldNow();
        if (api.cancelled()) return null;
      }
    }
    return out.slice(0, 30);
  },
});
