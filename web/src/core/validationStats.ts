// 검증 통계 (묶음 H, CLAUDE.md 8.10)
export interface PairStats {
  n: number;
  mean_diff: number;
  rmse: number;
  r: number | null;
  max_abs: number;
}

export function pairStats(ours: ArrayLike<number>, ref: ArrayLike<number>): PairStats {
  let n = 0, sd = 0, s2 = 0, mx = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
  for (let i = 0; i < Math.min(ours.length, ref.length); i++) {
    const a = ours[i], b = ref[i];
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    const d = a - b;
    n++;
    sd += d;
    s2 += d * d;
    mx = Math.max(mx, Math.abs(d));
    sa += a; sb += b; saa += a * a; sbb += b * b; sab += a * b;
  }
  if (n === 0) return { n: 0, mean_diff: NaN, rmse: NaN, r: null, max_abs: NaN };
  const cov = sab / n - (sa / n) * (sb / n);
  const va = saa / n - (sa / n) ** 2, vb = sbb / n - (sb / n) ** 2;
  return { n, mean_diff: sd / n, rmse: Math.sqrt(s2 / n), r: va > 0 && vb > 0 ? cov / Math.sqrt(va * vb) : null, max_abs: mx };
}
