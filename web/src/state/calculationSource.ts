import { HOUR_MS } from '../core/constants';
import { sampleTimes } from '../core/timeline';
import type { EphemerisSource } from '../core/types';
import { ephTableLabel } from '../strings';

export interface CalculationSource { keys: string[]; label: string; approx: boolean }
type TableMeta = { start_utc: string; step_h: number; count: number; source?: string };

/** 표 밖 근사가 섞인 경우도 실제 계산 표본 기준으로 함께 표시한다. */
export function calculationSource(sources: EphemerisSource[], tableSource?: string): CalculationSource {
  const hasTable = sources.includes('table'), approx = sources.includes('analytic');
  const tableKey = tableSource === 'spice' ? 'spice' : ['horizons', 'jpl_horizons'].includes(tableSource ?? '') ? 'jpl_horizons' : null;
  return {
    keys: [...(hasTable && tableKey ? [tableKey] : []), ...(approx ? ['analytic_ephemeris'] : [])],
    label: [hasTable ? ephTableLabel(tableSource) : '', approx ? '근사 천체력' : ''].filter(Boolean).join(' + ') || '자료 없음',
    approx,
  };
}

/** 격자 Worker가 사용하는 범위 표와 정확히 같은 시각 목록으로 출처를 판정한다. */
export function gridSources(meta: TableMeta | null, start: number, duration_h: number, step_h: number, now: number) {
  const lo = meta ? Date.parse(meta.start_utc) : Infinity;
  const hi = meta ? lo + (meta.count - 1) * meta.step_h * HOUR_MS : -Infinity;
  const source = (t: number): EphemerisSource => t >= lo && t <= hi ? 'table' : 'analytic';
  return {
    mission: calculationSource(sampleTimes(start, start + Math.min(duration_h, 1440) * HOUR_MS, step_h).map(source), meta?.source),
    now: calculationSource([source(now)], meta?.source),
  };
}
