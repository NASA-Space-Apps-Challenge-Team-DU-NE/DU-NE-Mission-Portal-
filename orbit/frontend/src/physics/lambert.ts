import { norm, scale, sub } from './math';
import { IntegrationError } from './errors';
import type { Vec3 } from '../types';

function stumpff(z: number): [number, number] {
  if (Math.abs(z) < 1e-5) return [.5 - z / 24 + z * z / 720 - z ** 3 / 40320, 1 / 6 - z / 120 + z * z / 5040 - z ** 3 / 362880];
  if (z > 0) { const s = Math.sqrt(z); return [(1 - Math.cos(s)) / z, (s - Math.sin(s)) / s ** 3]; }
  const s = Math.sqrt(-z); return [(Math.cosh(s) - 1) / (-z), (Math.sinh(s) - s) / s ** 3];
}

/** Zero-revolution lunar two-body Lambert guess. Never used as the final transfer.
 * Both endpoints are lunar-centred inertial coordinates at departure's axes. */
export function lambertSeed(r1: Vec3, r2: Vec3, tof: number, mu: number, longWay = false): Vec3 {
  const d1 = norm(r1), d2 = norm(r2), cosine = Math.max(-1, Math.min(1, r1.reduce((s, x, i) => s + x * r2[i], 0) / d1 / d2));
  const sin = Math.sqrt(Math.max(0, 1 - cosine * cosine)) * (longWay ? -1 : 1);
  if (Math.abs(sin) < 1e-8) throw new IntegrationError('Lambert seed has collinear endpoints.');
  const a = sin * Math.sqrt(d1 * d2 / (1 - cosine));
  const evaluate = (z: number): { f: number; y: number } | null => {
    const [c, s] = stumpff(z); if (c <= 0) return null;
    const y = d1 + d2 + a * (z * s - 1) / Math.sqrt(c);
    if (y <= 0) return null;
    const f = (y / c) ** 1.5 * s + a * Math.sqrt(y) - Math.sqrt(mu) * tof;
    return Number.isFinite(f) ? { f, y } : null;
  };
  let lo: number | undefined, hi: number | undefined, previous: number | undefined;
  // A finite universal-variable bracket avoids an unconstrained Newton root
  // accidentally selecting a multiple-revolution or nonphysical branch.
  for (let i = 0; i <= 800; i++) {
    const z = -4 * Math.PI ** 2 + (8 * Math.PI ** 2 - 1e-6) * i / 800, e = evaluate(z);
    if (!e) continue;
    if (e.f <= 0) { lo = z; previous = z; }
    else if (previous !== undefined) { hi = z; break; }
  }
  if (lo === undefined || hi === undefined) throw new IntegrationError('No zero-revolution Lambert seed bracket at this flight time.');
  let lower: number = lo, upper: number = hi;
  for (let i = 0; i < 70; i++) { const mid: number = (lower + upper) / 2, e = evaluate(mid); if (!e || e.f < 0) lower = mid; else upper = mid; }
  const y = evaluate((lower + upper) / 2)!.y, f = 1 - y / d1, g = a * Math.sqrt(y / mu);
  if (Math.abs(g) < 1e-12) throw new IntegrationError('Degenerate Lambert transfer coefficient.');
  return scale(sub(r2, scale(r1, f)), 1 / g);
}
