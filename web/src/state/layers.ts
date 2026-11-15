// 지도 레이어 → 값·색 규칙·품질 (P1-02~06, P2-01·02). 2D 지도와 3D 오버레이가 같이 쓴다.
import { FEATURES } from '../config';
import { geoValues, metalValues, safetyValues, waterValues, type StaticLayers } from '../core/gridScore';
import type { DataKind, LayerMeta, LayerName, Quality, StaticLayerName } from '../core/types';
import { t, type StringKey } from '../strings';
import type { GridScoreRes } from '../workers/grid.worker';
import type { gridSources } from './calculationSource';

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
  { name: 'tio2_wt_lp', label: 'map.tio2_wt_lp', feature: 'metalMap' },
  { name: 'feo_wt_kaguya', label: 'map.feo_wt_kaguya', feature: 'metalMap' },
  { name: 'tio2_jaxa_mi_research', label: 'map.tio2_jaxa_mi_research', feature: 'metalMap' },
  { name: 'wac_ill_pct', label: 'map.wac_ill_pct' },
  { name: 'wac_ill_twi', label: 'map.wac_ill_twi' },
  { name: 'psr_poly_dist_km', label: 'map.psr_poly_dist_km', feature: 'waterMap' },
  { name: 'plains_frac', label: 'map.plains_frac' },
  { name: 'boulder_count', label: 'map.boulder_count' },
];

const metaOf = (metas: LayerMeta[], n: StaticLayerName) => metas.find((m) => m.name === n);

export function layerView(name: LayerName, res: GridScoreRes | null, st: StaticLayers, metas: LayerMeta[], n: number, approx = false, sources?: ReturnType<typeof gridSources> | null): LayerView {
  const usedSource = name === 'sun_now' ? sources?.now : sources?.mission;
  const dynKind: DataKind = res ? (approx || usedSource?.approx ? 'approx' : 'real') : 'missing';
  const terrainKeys = approx ? [] : metaOf(metas, 'elev_m')?.source_keys ?? [];
  const dynamicKeys = [...new Set([...(usedSource?.keys ?? []), ...terrainKeys])];
  const label = LAYER_OPTIONS.find((o) => o.name === name)?.label ?? 'map.composite';
  const base = { name, label, kind: 'real' as DataKind, quality: null as Quality | null, caution: null as string | null, source_keys: [] as string[] };
  const fromStatic = (sn: StaticLayerName, over: Partial<LayerView> = {}): LayerView => {
    const m = metaOf(metas, sn);
    const v = st[sn] ?? null;
    return { ...base, values: v, mode: 'ramp', kind: v ? m?.kind ?? 'real' : 'missing', quality: m?.quality ?? null, caution: m?.caution ?? null, source_keys: m?.source_keys ?? [], ...over };
  };
  switch (name) {
    case 'composite':
      return { ...base, values: res?.composite ?? null, mode: 'score', range: [0, 1], kind: dynKind, source_keys: dynamicKeys };
    case 'illum_mission':
    case 'comm_mission':
    case 'sun_now':
      return { ...base, values: res?.dyn[name] ?? null, mode: 'score', range: [0, 1], kind: dynKind, source_keys: dynamicKeys };
    case 'dark_h':
      return { ...base, values: res?.dyn.dark_h ?? null, mode: 'score', invert: true, kind: dynKind, source_keys: dynamicKeys };
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
      return { ...base, values: c.available ? c.values : null, mode: 'score', range: [0, 1], kind: c.available ? 'real' : 'missing', quality: metaOf(metas, 'feo_wt')?.quality ?? null, caution: t('map.tio2_wt_lp'), source_keys: ['lp_grs'] };
    }
    case 'slope_p90_deg':
      return fromStatic('slope_p90_deg', { mode: 'score', range: [0, 30], invert: true });
    case 'psr_dist_km':
      return fromStatic('psr_dist_km', { mode: 'score', range: [0, 60], invert: true });
    case 'psr_poly_dist_km':
      return fromStatic('psr_poly_dist_km', { mode: 'score', range: [0, 60], invert: true });
    case 'boulder_count':
      return fromStatic('boulder_count', { range: [0, 800] });
    case 'illum_avg':
    case 'earth_vis_avg':
    case 'wac_ill_pct':
    case 'wac_ill_twi':
    case 'plains_frac':
      return fromStatic(name, { mode: 'score', range: [0, 1] });
    case 'feo_wt_kaguya':
      return fromStatic(name, { range: [4, 20] });
    case 'tio2_jaxa_mi_research':
      // 연구용 보기: 원래 값(0~30 wt%)을 자르지 않고 그대로. 점수·필터·순위·내보내기에 연결하지 않는다
      return fromStatic(name, { range: [0, 15], caution: t('map.tio2_jaxa_mi_research') });
    default:
      return fromStatic(name as StaticLayerName);
  }
}
