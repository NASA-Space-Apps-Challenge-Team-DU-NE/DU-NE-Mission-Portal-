// 지도 레이어 → 값·색 규칙·품질 (P1-02~06, P2-01·02). 2D 지도와 3D 오버레이가 같이 쓴다.
import { FEATURES } from '../config';
import { geoValues, metalValues, safetyValues, waterValues, type StaticLayers } from '../core/gridScore';
import type { DataKind, LayerMeta, LayerName, Quality, StaticLayerName } from '../core/types';
import { t, type StringKey } from '../strings';
import type { GridScoreRes } from '../workers/grid.worker';

export interface LayerView {
  name: LayerName;
  label: StringKey;
  values: Float32Array | null;
  mode: 'score' | 'ramp';
  range?: [number, number];
  invert?: boolean;
  kind: DataKind;
  quality: Quality | null;
  caution: string | null;
  source_keys: string[];
}

export const LAYER_OPTIONS: Array<{ name: LayerName; label: StringKey; feature?: keyof typeof FEATURES }> = [
  { name: 'composite', label: 'map.composite' },
  { name: 'illum_mission', label: 'map.illum_mission' },
  { name: 'sun_now', label: 'map.sun_now' },
  { name: 'illum_avg', label: 'map.illum_avg' },
  { name: 'comm_mission', label: 'map.comm_mission' },
  { name: 'earth_vis_avg', label: 'map.earth_vis_avg' },
  { name: 'safety', label: 'map.safety' },
  { name: 'slope_p90_deg', label: 'map.slope_p90_deg' },
  { name: 'geo_hazard', label: 'map.geo_hazard' },
  { name: 'water', label: 'map.water', feature: 'waterMap' },
  { name: 'psr_dist_km', label: 'map.psr_dist_km', feature: 'waterMap' },
  { name: 'h_ppm', label: 'map.h_ppm', feature: 'waterMap' },
  { name: 'metal', label: 'map.metal', feature: 'metalMap' },
  { name: 'feo_wt', label: 'map.feo_wt', feature: 'metalMap' },
  { name: 'tio2_wt', label: 'map.tio2_wt', feature: 'metalMap' },
  { name: 'feo_wt_kaguya', label: 'map.feo_wt_kaguya', feature: 'metalMap' },
  { name: 'tio2_wt_jaxa', label: 'map.tio2_wt_jaxa', feature: 'metalMap' },
  { name: 'tio2_jaxa_ge2_frac', label: 'map.tio2_jaxa_ge2_frac', feature: 'metalMap' },
  { name: 'wac_ill_pct', label: 'map.wac_ill_pct' },
];

const metaOf = (metas: LayerMeta[], n: StaticLayerName) => metas.find((m) => m.name === n);

export function layerView(name: LayerName, res: GridScoreRes | null, st: StaticLayers, metas: LayerMeta[], n: number, approx = false): LayerView {
  const dynKind: DataKind = res ? (approx ? 'approx' : 'real') : 'missing';
  const label = LAYER_OPTIONS.find((o) => o.name === name)?.label ?? 'map.composite';
  const base = { name, label, kind: 'real' as DataKind, quality: null as Quality | null, caution: null as string | null, source_keys: [] as string[] };
  const fromStatic = (sn: StaticLayerName, over: Partial<LayerView> = {}): LayerView => {
    const m = metaOf(metas, sn);
    const v = st[sn] ?? null;
    return { ...base, values: v, mode: 'ramp', kind: v ? m?.kind ?? 'real' : 'missing', quality: m?.quality ?? null, caution: m?.caution ?? null, source_keys: m?.source_keys ?? [], ...over };
  };
  switch (name) {
    case 'composite':
      return { ...base, values: res?.composite ?? null, mode: 'score', range: [0, 1], kind: dynKind, source_keys: ['jpl_horizons', 'lola_dem_240m'] };
    case 'illum_mission':
    case 'comm_mission':
    case 'sun_now':
      return { ...base, values: res?.dyn[name] ?? null, mode: 'score', range: [0, 1], kind: dynKind, source_keys: ['jpl_horizons', 'lola_dem_240m', 'lola_dem_80m'] };
    case 'dark_h':
      return { ...base, values: res?.dyn.dark_h ?? null, mode: 'score', invert: true, kind: dynKind, source_keys: ['jpl_horizons'] };
    case 'safety': {
      const c = safetyValues(st, n);
      const m = metaOf(metas, 'slope_p90_deg');
      return { ...base, values: c.available ? c.values : null, mode: 'score', range: [0, 1], kind: c.available ? 'real' : 'missing', quality: m?.quality ?? null, source_keys: ['lola_slope'] };
    }
    case 'geo_hazard': {
      const c = geoValues(st, n);
      return { ...base, values: c.available ? c.values : null, mode: 'score', range: [0, 1], kind: c.available ? 'real' : 'missing', quality: c.uses.includes('scarp_dist_km') ? metaOf(metas, 'scarp_dist_km')?.quality ?? null : null, caution: c.uses.join(' · '), source_keys: ['lroc_scarps', 'lola_slope', 'bickel_rockfalls'] };
    }
    case 'water': {
      const c = waterValues(st, n);
      return { ...base, values: c.available ? c.values : null, mode: 'score', range: [0, 1], kind: c.available ? 'real' : 'missing', quality: metaOf(metas, 'psr_dist_km')?.quality ?? null, caution: t('map.water'), source_keys: ['pgda69'] };
    }
    case 'metal': {
      const c = metalValues(st, n);
      return { ...base, values: c.available ? c.values : null, mode: 'score', range: [0, 1], kind: c.available ? 'real' : 'missing', quality: metaOf(metas, 'feo_wt')?.quality ?? null, caution: t('map.tio2_wt'), source_keys: ['lp_grs'] };
    }
    case 'slope_p90_deg':
      return fromStatic('slope_p90_deg', { mode: 'score', range: [0, 30], invert: true });
    case 'psr_dist_km':
      return fromStatic('psr_dist_km', { mode: 'score', range: [0, 60], invert: true });
    case 'illum_avg':
    case 'earth_vis_avg':
    case 'wac_ill_pct':
    case 'tio2_jaxa_ge2_frac':
      return fromStatic(name, { mode: 'score', range: [0, 1] });
    case 'feo_wt_kaguya':
      return fromStatic(name, { range: [4, 20] });
    case 'tio2_wt_jaxa':
      return fromStatic(name, { range: [2, 15] });
    default:
      return fromStatic(name as StaticLayerName);
  }
}
