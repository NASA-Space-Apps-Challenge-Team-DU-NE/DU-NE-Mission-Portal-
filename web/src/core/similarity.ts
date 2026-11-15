// 참고 사례·이 미션처럼 맞추기 (묶음 D, P1-26·27). 결과 라벨·원인은 항상 함께 보여 준다.
import { HOUR_MS } from './constants';
import { skyState } from './sky';
import { hoursSinceSunrise, type SiteContext } from './timeline';
import type { Mission, TimeMs } from './types';

export interface MissionFeatures {
  abs_lat: number;
  sun_el: number;
  earth_el: number;
  /** 일출 후 경과 h (계속 밝거나 어두우면 null) */
  since_sunrise_h: number | null;
  duration_h: number | null;
  power: Mission['power'];
  comm: Mission['comm'];
  approach: Mission['approach'];
}

export function featuresAt(ctx: SiteContext, lat: number, t: TimeMs, duration_h: number | null, tags: Pick<MissionFeatures, 'power' | 'comm' | 'approach'>): MissionFeatures {
  const s = skyState(ctx.frame, ctx.mask, ctx.eph, t, ctx.margin_deg);
  return { abs_lat: Math.abs(lat), sun_el: s.sun.el_deg, earth_el: s.earth.el_deg, since_sunrise_h: hoursSinceSunrise(ctx, t), duration_h, ...tags };
}

const NUM_KEYS = ['abs_lat', 'sun_el', 'earth_el', 'since_sunrise_h', 'duration_h'] as const;
type NumKey = (typeof NUM_KEYS)[number];

export interface SimilarMission {
  mission: Mission;
  distance: number;
  /** 특징별 차이 (정규화) */
  parts: Partial<Record<NumKey | 'tags', number>>;
}

/** z-score 정규화 유클리드 거리 + 태그(전원·통신·접근)가 다를 때마다 +0.5 (PROVISIONAL) */
export function similarMissions(mine: MissionFeatures, list: Array<{ mission: Mission; f: MissionFeatures }>, k = 3): SimilarMission[] {
  const stats = {} as Record<NumKey, { mu: number; sd: number }>;
  for (const key of NUM_KEYS) {
    const vals = [mine, ...list.map((x) => x.f)].map((f) => f[key]).filter((v): v is number => v !== null && Number.isFinite(v));
    const mu = vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length);
    const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mu) ** 2, 0) / Math.max(1, vals.length)) || 1;
    stats[key] = { mu, sd };
  }
  const out = list.map(({ mission, f }) => {
    const parts: SimilarMission['parts'] = {};
    let d2 = 0;
    for (const key of NUM_KEYS) {
      const a = mine[key], b = f[key];
      if (a === null || b === null) continue;
      const z = (a - b) / stats[key].sd;
      parts[key] = Math.abs(z);
      d2 += z * z;
    }
    let tag = 0;
    if (mine.power !== f.power) tag += 0.5;
    if (mine.comm !== f.comm) tag += 0.5;
    if (mine.approach !== f.approach) tag += 0.5;
    parts.tags = tag;
    return { mission, distance: Math.sqrt(d2) + tag, parts };
  });
  out.sort((a, b) => a.distance - b.distance);
  return out.slice(0, k);
}

/** 내 지점에서 around ±span 일, 1 h 간격으로 일출 후 경과가 목표와 같아지는 시각 중 around 에 가장 가까운 것 */
export function matchTemplate(ctx: SiteContext, target_since_sunrise_h: number, around: TimeMs, span_days = 30, tol_h = 1): TimeMs | null {
  let best: TimeMs | null = null, bestGap = Infinity;
  for (let h = -span_days * 24; h <= span_days * 24; h += 1) {
    const t = around + h * HOUR_MS;
    if (Math.abs(h) >= bestGap) continue;
    const s = hoursSinceSunrise(ctx, t, 720, 1);
    if (s !== null && Math.abs(s - target_since_sunrise_h) <= tol_h) {
      best = t;
      bestGap = Math.abs(h);
    }
  }
  return best;
}
