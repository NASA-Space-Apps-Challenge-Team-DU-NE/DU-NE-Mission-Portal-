// 파생값 훅: 선택 지점 해석, 현재 하늘, 기간 타임라인 (묶음 A)
import { useEffect, useMemo, useState } from 'react';
import { DEFAULTS } from '../config';
import { cellMask } from '../core/gridScore';
import { flatMask, type MaskLike } from '../core/horizon';
import { siteContext } from '../core/scenario';
import { nextEvents, sampleTimeline, summarize, type SiteContext } from '../core/timeline';
import type { HorizonMask, Site, TerrainKind } from '../core/types';
import { nearestCell } from '../core/gridScore';
import { HOUR_MS } from '../core/constants';
import { t as tr } from '../strings';
import { useApp, type SiteRef } from './store';
import { useData } from './data';

export interface ResolvedSite {
  site: Site;
  mask: MaskLike;
  terrain: TerrainKind;
  maskEnv: HorizonMask | null;
  groundElev: number;
}

export function cellSite(cell: number, lat: number, lon: number): Site {
  return { id: `cell_${cell}`, name: `${tr('site.cell')} ${cell}`, category: 'cell', lat_deg: lat, lon_deg: lon, terrain: 'grid', source_keys: ['lola_dem_240m'], verified: true };
}

/** SiteRef → 지점·마스크 (카탈로그 마스크 → 75°S 이남 격자 마스크 → 구면 지평선) */
export function useResolvedSite(ref?: SiteRef | null): ResolvedSite | null {
  const appRef = useApp((s) => s.siteRef);
  const r = ref === undefined ? appRef : ref;
  const sites = useData((s) => s.sites.items);
  const grid = useData((s) => s.grid);
  const approx = useData((s) => s.gridApprox);
  const layers = useData((s) => s.layers);
  const ensureMask = useData((s) => s.ensureMask);
  const masks = useData((s) => s.masks);
  const [, bump] = useState(0);

  const base = useMemo((): Site | null => {
    if (!r) return null;
    if (r.kind === 'catalog') return sites.find((s) => s.id === r.id) ?? null;
    if (r.kind === 'cell') {
      // 격자 인덱스 정수·범위 확인 (오래된 공유 URL 등). 범위 밖이면 지점 없음 → 화면은 "착륙지를 고르세요"
      if (!grid || !Number.isInteger(r.cell) || r.cell < 0 || r.cell >= grid.lat.length) return null;
      const lat = grid.lat[r.cell], lon = grid.lon[r.cell];
      return Number.isFinite(lat) && Number.isFinite(lon) ? cellSite(r.cell, lat, lon) : null;
    }
    if (!Number.isFinite(r.lat) || !Number.isFinite(r.lon) || Math.abs(r.lat) > 90 || Math.abs(r.lon) > 180) return null;
    return { id: 'custom', name: tr('site.custom_name'), category: 'custom', lat_deg: r.lat, lon_deg: r.lon, terrain: 'flat', source_keys: [], verified: true };
  }, [r, sites, grid]);

  useEffect(() => {
    if (base?.mask && !masks[base.mask]) ensureMask(base.mask).then(() => bump((x) => x + 1));
  }, [base, masks, ensureMask]);

  return useMemo(() => {
    if (!base) return null;
    const env = base.mask ? masks[base.mask] : undefined;
    if (env && env !== 'missing') return { site: base, mask: env.data, terrain: 'site', maskEnv: env.data, groundElev: env.data.ground_elev_m };
    if (grid && !approx) {
      const cell = r?.kind === 'cell' ? r.cell : nearestCell(grid, base.lat_deg, base.lon_deg, grid.manifest.cell_km);
      if (cell >= 0) {
        const el = layers.elev_m?.[cell];
        return { site: base, mask: cellMask(grid, cell), terrain: 'grid', maskEnv: null, groundElev: Number.isFinite(el) ? (el as number) : base.elevation_m ?? 0 };
      }
    }
    return { site: base, mask: flatMask(base.id, base.lat_deg, base.lon_deg, DEFAULTS.observer_height_m), terrain: 'flat', maskEnv: null, groundElev: base.elevation_m ?? 0 };
  }, [base, masks, grid, layers, r, approx]);
}

export function useSiteCtx(rs: ResolvedSite | null): SiteContext | null {
  const eph = useData((s) => s.eph);
  const margin = useApp((s) => s.margin_deg);
  return useMemo(() => {
    if (!rs) return null;
    return siteContext({ ...rs.site, elevation_m: rs.groundElev }, rs.mask, eph, margin, rs.maskEnv?.observer_height_m ?? DEFAULTS.observer_height_m);
  }, [rs, eph, margin]);
}

/** 임무 기간 타임라인 (1 h) + 요약 */
export function useMissionTimeline(ctx: SiteContext | null, start?: number, duration?: number, step_h = 1) {
  const landing = useApp((s) => s.landing);
  const dur = useApp((s) => s.duration_h);
  const s0 = start ?? landing, d = duration ?? dur;
  return useMemo(() => {
    if (!ctx) return null;
    const samples = sampleTimeline(ctx, s0, s0 + d * HOUR_MS, step_h);
    return { samples, summary: summarize(samples, step_h) };
  }, [ctx, s0, d, step_h]);
}

export function useTrack(ctx: SiteContext | null, from: number, days = DEFAULTS.track_days, step_h = 2) {
  const key = Math.floor(from / (6 * HOUR_MS));
  return useMemo(() => (ctx ? sampleTimeline(ctx, key * 6 * HOUR_MS, key * 6 * HOUR_MS + days * 24 * HOUR_MS, step_h) : null), [ctx, key, days, step_h]);
}

export function useNextEvents(ctx: SiteContext | null, t: number) {
  const key = Math.floor(t / HOUR_MS);
  return useMemo(() => (ctx ? nextEvents(ctx, key * HOUR_MS) : null), [ctx, key]);
}
