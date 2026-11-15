import { describe, expect, it } from 'vitest';
import { calculationSource, gridSources } from './calculationSource';

describe('실제로 계산한 천체력 출처', () => {
  const meta = { start_utc: '2026-11-01T00:00:00Z', step_h: 1, count: 25, source: 'spice' };
  const start = Date.parse(meta.start_utc), hour = 3_600_000;
  it('SPICE 범위 표 안의 시각을 Horizons로 표시하지 않는다', () => {
    expect(gridSources(meta, start, 24, 6, start).mission).toEqual({ keys: ['spice'], label: 'SPICE 표', approx: false });
  });
  it('표 밖과 경계에 걸친 임무를 구분하며 현재 시각을 별도로 처리한다', () => {
    const a = gridSources(meta, start, 30, 6, start + 48 * hour);
    expect(a.mission.keys).toEqual(['spice', 'analytic_ephemeris']); expect(a.mission.approx).toBe(true);
    expect(a.now.keys).toEqual(['analytic_ephemeris']); expect(a.now.label).toBe('근사 천체력');
    expect(gridSources(null, start, 24, 6, start).mission.keys).toEqual(['analytic_ephemeris']);
  });
  it('전력의 실제 표본이 근사이면 로드된 SPICE 메타만으로 표 출처를 주장하지 않는다', () => {
    expect(calculationSource(['analytic', 'analytic'], 'spice').label).toBe('근사 천체력');
    expect(calculationSource(['table'], 'horizons').keys).toEqual(['jpl_horizons']);
    expect(calculationSource(['table'], 'unknown').keys).toEqual([]);
  });
  it('파이프라인이 쓰는 jpl_horizons 출처 이름을 보존한다', () => {
    expect(calculationSource(['table'], 'jpl_horizons')).toEqual({ keys: ['jpl_horizons'], label: 'Horizons 표', approx: false });
  });
});
