// 여러 화면이 같이 쓰는 파생값 (사이드바 요약·현장 뷰·페이지). 입력 키가 같으면 한 번만 계산한다.
import { useMemo } from 'react';
import { DEFAULTS, POWER_KINDS } from '../config';
import { DAY_MS, HOUR_MS } from '../core/constants';
import { simulate, systemFromLander, type SimResult } from '../core/energy';
import { nearestCell } from '../core/gridScore';
import type { DustWarning } from '../core/hazards';
import { powerPlan, type PowerPlan } from '../core/power';
import { scoreScenario, type ScenarioEval } from '../core/scenario';
import { sampleTimeline, type SiteContext } from '../core/timeline';
import type { Lander, TimelineSample } from '../core/types';
import { t } from '../strings';
import { useData } from './data';
import { useResolvedSite, useSiteCtx, type ResolvedSite } from './hooks';
import { useUi } from './ui';
import { scoreWeights, useApp } from './store';

const cache = new Map<string, unknown>();
export function cached<T>(key: string, fn: () => T): T {
  if (cache.has(key)) return cache.get(key) as T;
  const v = fn();
  cache.set(key, v);
  if (cache.size > 300) cache.delete(cache.keys().next().value as string);
  return v;
}

/** 지점·마스크·천체력 상태를 묶은 캐시 키 */
export function siteKey(rs: ResolvedSite | null, margin: number): string {
  if (!rs) return 'none';
  const d = useData.getState();
  // 천체력 revision 과 마스크 내용(관측 높이·생성 시각)을 키에 넣어 정밀 표·마스크가 준비되면 다시 계산한다
  const m = rs.maskEnv ? `${rs.maskEnv.observer_height_m}@${(rs.maskEnv as { generated_utc?: string }).generated_utc ?? ''}` : '';
  return `${rs.site.id}|${rs.site.lat_deg.toFixed(5)}|${rs.site.lon_deg.toFixed(5)}|${rs.terrain}|${m}|${margin}|${d.ephMeta?.count ?? 0}|r${d.ephRev}`;
}

export function useCurrent() {
  const rs = useResolvedSite();
  const ctx = useSiteCtx(rs);
  return { rs, ctx };
}

/** 현재 착륙지·착륙 시각의 시나리오 점수 (상대 비교용) */
export function useEval(): ScenarioEval | null {
  const { rs, ctx } = useCurrent();
  const app = useApp();
  return useMemo(() => {
    if (!ctx) return null;
    const w = scoreWeights(app);
    const k = `ev|${siteKey(rs, app.margin_deg)}|${app.landing}|${app.duration_h}|${JSON.stringify(app.req)}|${JSON.stringify(w)}|${app.delay_days}`;
    return cached(k, () => scoreScenario(ctx, app.landing, app.duration_h, app.req, w, app.delay_days, 1));
  }, [ctx, rs, app.margin_deg, app.landing, app.duration_h, app.req, app.scenarioWeights, app.delay_days, app.powerSource]);
}

export function evalFor(ctx: SiteContext, key: string, landing: number, duration_h: number, step_h = 3): ScenarioEval {
  const a = useApp.getState();
  // 여유각은 ctx 의 값을 쓴다 (저장한 시나리오는 자기 여유각으로 평가)
  const w = scoreWeights(a);
  return cached(`evf|${key}|${landing}|${duration_h}|${step_h}|${ctx.margin_deg}|${JSON.stringify(a.req)}|${JSON.stringify(w)}|${a.delay_days}`, () =>
    scoreScenario(ctx, landing, duration_h, a.req, w, a.delay_days, step_h),
  );
}

export function timelineFor(ctx: SiteContext, key: string, start: number, hours: number, step_h: number): TimelineSample[] {
  return cached(`tl|${key}|${start}|${hours}|${step_h}`, () => sampleTimeline(ctx, start, start + hours * HOUR_MS, step_h));
}

export function useLander(): Lander | null {
  const landers = useData((d) => d.landers.items);
  const id = useApp((s) => s.landerId);
  const edits = useApp((s) => s.landerEdits);
  return useMemo(() => {
    const b = landers.find((l) => l.id === id) ?? landers[0];
    return b ? { ...b, ...edits } : null;
  }, [landers, id, edits]);
}

/** 표면 운용 타임랩스 (05) */
export function useSim(): { sim: SimResult; samples: TimelineSample[] } | null {
  const { rs, ctx } = useCurrent();
  const app = useApp();
  const lander = useLander();
  return useMemo(() => {
    if (!ctx || !lander) return null;
    const k = siteKey(rs, app.margin_deg);
    const samples = timelineFor(ctx, k, app.landing, app.duration_h, 1);
    const ps = app.powerSource, kind = POWER_KINDS[ps.kind];
    const sys = { ...systemFromLander(lander, DEFAULTS.panel_loss), ...(kind.needsSun ? {} : { source: 'constant' as const, const_w: ps.output_w, fuel_wh: kind.usesFuel ? ps.fuel_wh : null }) };
    const sim = cached(`sim|${k}|${app.landing}|${app.duration_h}|${JSON.stringify(sys)}|${app.req.min_ops_h}|${app.req.data_mb}`, () =>
      simulate(samples, 1, sys, app.req),
    );
    return { sim, samples };
  }, [ctx, rs, lander, app.margin_deg, app.landing, app.duration_h, app.req, app.powerSource]);
}

/** 전력 계획 (05 아래): 착륙 후 30일, 수직 태양 추적 패널 */
export function usePower(demand_kw: number, eff: number): { plan: PowerPlan; samples: TimelineSample[] } | null {
  const { rs, ctx } = useCurrent();
  const landing = useApp((s) => s.landing);
  const margin = useApp((s) => s.margin_deg);
  return useMemo(() => {
    if (!ctx) return null;
    const k = siteKey(rs, margin);
    const samples = timelineFor(ctx, k, landing, 30 * 24, 1);
    const plan = cached(`pw|${k}|${landing}|${demand_kw}|${eff}`, () => powerPlan(samples, 1, demand_kw, eff, DEFAULTS.panel_loss, DEFAULTS.power_margin));
    return { plan, samples };
  }, [ctx, rs, landing, margin, demand_kw, eff]);
}

/** 실제로 쓰는 기지 목록. 03에서 기지 배치를 끄면 따로 놓은 기지는 없고 착륙지 자체를 기지로 본다 */
export function useBases() {
  const bases = useApp((s) => s.bases);
  const off = useUi((u) => u.baseOff);
  return off ? NO_BASES : bases;
}
const NO_BASES: never[] = [];

/** 관측된 단층애 근접 경고 (03). 경고일 뿐 안전을 보장하지 않는다.
 *  착륙 먼지 반경 검사(보호 대상·기지 충돌)는 공개 근거가 없어 뺐다 (2026-11-15). */
export function useSiteWarnings(): DustWarning[] {
  const rs = useResolvedSite();
  const grid = useData((d) => d.grid);
  const layers = useData((d) => d.layers);
  return useMemo(() => {
    if (!rs || !grid || !layers.scarp_dist_km) return [];
    const c = nearestCell(grid, rs.site.lat_deg, rs.site.lon_deg, grid.manifest.cell_km);
    const d = c >= 0 ? layers.scarp_dist_km[c] : NaN;
    return Number.isFinite(d) && d <= DEFAULTS.fault_warn_km ? [{ kind: 'fault', target_id: 'scarp', target_name: t('map.geo_hazard'), distance_km: d, limit_km: DEFAULTS.fault_warn_km }] : [];
  }, [rs, grid, layers]);
}

/** 단층애 검사 상태: unknown(자료 없음·격자 밖·NaN) 과 checked(검사함) 를 구분한다 */
export function useFaultCheck(): { state: 'unknown' | 'checked'; reason: string | null } {
  const rs = useResolvedSite();
  const grid = useData((d) => d.grid);
  const layers = useData((d) => d.layers);
  const lr = useData((d) => d.layerReasons);
  return useMemo(() => {
    if (!rs) return { state: 'unknown', reason: null };
    if (!grid || !layers.scarp_dist_km) return { state: 'unknown', reason: lr.scarp_dist_km ?? '단층애 거리 자료 없음' };
    const c = nearestCell(grid, rs.site.lat_deg, rs.site.lon_deg, grid.manifest.cell_km);
    if (c < 0) return { state: 'unknown', reason: '격자 밖 지점' };
    return Number.isFinite(layers.scarp_dist_km[c]) ? { state: 'checked', reason: null } : { state: 'unknown', reason: '이 칸의 단층애 거리 값 없음' };
  }, [rs, grid, layers, lr]);
}

export const DAY = DAY_MS;
export const HOUR = HOUR_MS;
