import { describe, expect, it } from 'vitest';
import { combineScore, failedRequirements, partScores } from './scenario';
import type { Summary } from './types';

const req = { min_illum_frac: 0.6, min_daily_comm_h: 6, max_dark_h: 48, min_ops_h: 168, data_mb: 2000 };
const sum = (o: Partial<Summary>): Summary => ({
  start: 0, end: 0, step_h: 1, illum_frac: 0.6, sunlit_frac: 0.6, comm_frac: 0.5, daily_comm_h_min: 6,
  longest_dark_h: 48, longest_no_comm_h: 0, mean_irr_vertical_w_m2: 0, ...o,
});

describe('scenario', () => {
  it('요건을 정확히 충족하면 만점', () => {
    const p = partScores(sum({}), req);
    expect(p.power).toBeCloseTo(1, 9);
    expect(p.comm).toBeCloseTo(1, 9);
    expect(failedRequirements(sum({}), req)).toEqual([]);
  });
  it('요건 미달 표시와 이유', () => {
    const s = sum({ comm_frac: 0.1, daily_comm_h_min: 0 });
    const sc = combineScore(s, req, { power: 40, comm: 30, robustness: 30 }, 1);
    expect(sc.meets_requirements).toBe(false);
    expect(sc.failed).toEqual(['min_daily_comm_h']);
    expect(sc.reason).toBe('comm');
    expect(sc.total).toBeLessThan(100);
  });
  it('가중치 합 0 이면 0 점 (0 나누기 방지)', () => {
    expect(combineScore(sum({}), req, { power: 0, comm: 0, robustness: 0 }, 1).total).toBe(0);
  });
});

describe('scenario · 햇빛이 필요 없는 발전', () => {
  it('exclude_power 면 일조·암흑 요구 조건과 전력 가중치를 뺀다', () => {
    const dark = sum({ illum_frac: 0, longest_dark_h: 240 });
    const w = { power: 40, comm: 30, robustness: 30 };
    const solar = combineScore(dark, req, w, 0.5);
    expect(solar.meets_requirements).toBe(false);
    expect(solar.failed).toContain('min_illum_frac');
    const other = combineScore(dark, req, { ...w, exclude_power: true }, 1);
    expect(other.failed).toEqual([]);
    expect(other.meets_requirements).toBe(true);
    // 통신 만점(1)·견고성 1 → 전력을 빼면 100점
    expect(other.total).toBeCloseTo(100, 6);
    expect(failedRequirements(dark, req, false)).toEqual([]);
  });
});
