// 시뮬레이션 Worker: 1년 기지 운용(P1-32), 마스트 높이 비교(P3-01), 패널 설치 추천(지점 지역 격자 후보)
import { HOUR_MS } from '../core/constants';
import { baseInputError, simulateBase, type BaseLoads, type BaseSystem } from '../core/energy';
import { mastComparison } from '../core/light';
import { pickPanels, powerPlan } from '../core/power';
import type { PanelCand } from '../core/gridScore';
import { sampleTimeline } from '../core/timeline';
import type { EphPayload, SiteMask } from './protocol';
import { ctxFrom, ephFrom, serve } from './runtime';

serve({
  base(p: { eph: EphPayload; site: SiteMask; margin_deg: number; start: number; days: number; loads: BaseLoads; sys: BaseSystem; auto: boolean; eff: number; loss: number; margin: number }, api) {
    const inputError = baseInputError(p.loads, p.auto ? { ...p.sys, efficiency: p.eff, loss: p.loss } : p.sys);
    if (inputError) throw new RangeError(inputError);
    if (p.auto && (!Number.isFinite(p.margin) || p.margin < 0)) throw new RangeError('invalid base input: margin must be finite and non-negative');
    const eph = ephFrom(p.eph);
    const ctx = ctxFrom(p.site, eph, p.margin_deg);
    const samples = sampleTimeline(ctx, p.start, p.start + p.days * 24 * HOUR_MS, 1);
    api.progress(0.6);
    let sys = p.sys;
    let plan = null;
    if (p.auto) {
      const first = samples.filter((s) => s.t <= p.start + 30 * 24 * HOUR_MS); // 720 h 종료 표본 포함
      plan = powerPlan(first, 1, p.loads.habitat_kw + p.loads.isru_kw + p.loads.constant_kw, p.eff, p.loss, p.margin);
      if (plan.feasible) sys = { ...sys, panel_area_m2: plan.panel_area_m2, battery_kwh: plan.battery_kwh };
    }
    const res = simulateBase(samples, 1, p.loads, sys);
    return { res, sys, plan: plan && { panel_area_m2: plan.panel_area_m2, battery_kwh: plan.battery_kwh, feasible: plan.feasible } };
  },
  panels(p: { eph: EphPayload; cands: PanelCand[]; observer_height_m: number; margin_deg: number; start: number; duration_h: number; demand_kw: number; eff: number; loss: number; margin: number }, api) {
    const eph = ephFrom(p.eph);
    const out = [];
    for (let k = 0; k < p.cands.length; k++) {
      const c = p.cands[k];
      const site = { id: `cell_${c.cell}`, name: `cell ${c.cell}`, category: 'cell' as const, lat_deg: c.lat_deg, lon_deg: c.lon_deg, terrain: 'grid' as const, source_keys: [], verified: true };
      const ctx = ctxFrom({ site, mask: c.mask, ground_elev_m: c.elev_m, observer_height_m: p.observer_height_m }, eph, p.margin_deg);
      const s = sampleTimeline(ctx, p.start, p.start + p.duration_h * HOUR_MS, 2);
      const plan = powerPlan(s, 2, p.demand_kw, p.eff, p.loss, p.margin);
      out.push({ cell: c.cell, lat_deg: c.lat_deg, lon_deg: c.lon_deg, distance_km: c.distance_km, panel_area_m2: plan.panel_area_m2, battery_kwh: plan.battery_kwh, x_km: c.x_km, y_km: c.y_km });
      if (k % 5 === 0) api.progress(k / p.cands.length);
    }
    return pickPanels(out, 5, 4);
  },
  mast(p: { eph: EphPayload; sites: Array<{ height_m: number; site: SiteMask }>; margin_deg: number; start: number; duration_h: number; demand_kw: number; eff: number; loss: number; margin: number }) {
    const eph = ephFrom(p.eph);
    return mastComparison(p.sites.map((s) => ({ height_m: s.height_m, ctx: ctxFrom(s.site, eph, p.margin_deg) })), p.start, p.duration_h, p.demand_kw, p.eff, p.loss, p.margin);
  },
});
