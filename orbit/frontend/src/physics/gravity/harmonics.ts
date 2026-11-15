import type { V3 } from '../math';
import { GravityModelError, type HarmonicCoefficients, type HarmonicEvaluation } from './types';

export { GravityModelError } from './types';
export type { HarmonicCoefficients, HarmonicEvaluation } from './types';
export const triangularIndex = (n: number, m: number): number => n * (n + 1) / 2 + m;

// Fields: potential, dx,dy,dz, dxx,dxy,dxz,dyy,dyz,dzz. Derivatives are with
// respect to dimensionless Cartesian r/R; SI scales are applied after synthesis.
const FIELDS = 10;

/** Apply an exact Cartesian differential operator to normalized solid-harmonic
 * coefficients, once at construction (no runtime finite differences or jets).
 * Derivatives increase the BASIS degree by one; they do not add gravity data.
 * Positive m fields use cosine/sine pairs. Zonal harmonics require the distinct
 * sqrt(2) normalization, and W[n,0] is identically zero.
 */
function differentiate(c: Float64Array, s: Float64Array, degree: number, source: number, dest: number, axis: number): void {
  for (let n = 0; n <= degree; n++) {
    const ratio = (2 * n + 1) / (2 * n + 3);
    for (let m = 0; m <= n; m++) {
      const i = triangularIndex(n, m) * FIELDS + source, C = c[i], S = s[i];
      if (C === 0 && S === 0) continue;
      if (axis === 2) {
        const target = triangularIndex(n + 1, m) * FIELDS + dest;
        const factor = -Math.sqrt(ratio * ((n + 1) ** 2 - m * m));
        c[target] += factor * C; if (m > 0) s[target] += factor * S;
      } else if (m === 0) {
        const target = triangularIndex(n + 1, 1) * FIELDS + dest;
        const factor = -Math.sqrt(ratio * (n + 1) * (n + 2) / 2);
        if (axis === 0) c[target] += factor * C; else s[target] += factor * C;
      } else {
        const plus = triangularIndex(n + 1, m + 1) * FIELDS + dest;
        const minus = triangularIndex(n + 1, m - 1) * FIELDS + dest;
        const p = -.5 * Math.sqrt(ratio * (n + m + 1) * (n + m + 2));
        const q = .5 * Math.sqrt(ratio * (n - m + 1) * (n - m + 2) * (m === 1 ? 2 : 1));
        if (axis === 0) {
          c[plus] += p * C; c[minus] += q * C;
          s[plus] += p * S; if (m > 1) s[minus] += q * S;
        } else {
          s[plus] += p * C; if (m > 1) s[minus] -= q * C;
          c[plus] -= p * S; c[minus] += q * S;
        }
      }
    }
  }
}

/** Polar-safe external gravity in the coefficient frame, with analytic Hessian.
 *
 * Vnm+iWnm=(R/r)^(n+1) Pbar_nm(z/r) exp(i*m*lambda), geodesy-4pi normalized,
 * no Condon–Shortley phase. Using X=Rx/r²,Y=Ry/r²,Z=Rz/r²,Q=R²/r²:
 * V00=R/r; V11+iW11=sqrt(3)(X+iY)V00;
 * Vmm+iWmm=sqrt((2m+1)/(2m))(X+iY)(V[m-1,m-1]+iW[m-1,m-1]) for m>1;
 * V[n,m]=a_nm Z V[n-1,m]-b_nm Q V[n-2,m], and the same for W,
 * a_nm=sqrt((4n²-1)/(n²-m²)),
 * b_nm=sqrt((2n+1)((n-1)²-m²)/((2n-3)(n²-m²))).
 * The n=m+1 case has b=0 and a=sqrt(2m+3).
 *
 * This normalized Cartesian solid-harmonic recurrence has no latitude,
 * longitude, horizontal-radius division or factorials. Exact poles are regular.
 * Cartesian derivatives are themselves exterior solid harmonics: their
 * coefficients are analytically transformed ONCE by differentiate(), including
 * the Hessian. Runtime synthesis needs scalar basis values up to N+1 (a) or N+2
 * (H); N remains the selected gravity model degree. No point-mass Hessian or
 * finite-difference approximation is substituted for the harmonic derivatives.
 *
 * Normalization: Park et al. (2025), eq. 2,
 * https://pmc.ncbi.nlm.nih.gov/articles/PMC12119328/ ; independent convention:
 * https://shtools.github.io/SHTOOLS/fortran-real-spherical-harmonics.html .
 * U=GM/R sum(Cnm Vnm+Snm Wnm); a=grad(U). Explicit C00 is included exactly
 * once. A caller must not add a separate lunar central acceleration.
 * Whether a finite external expansion adequately models near-surface gravity
 * is a physical/model question, not a hard r>=R requirement.
 */
export class SphericalHarmonicGravity {
  readonly degree: number;
  readonly gm_m3_s2: number;
  readonly reference_radius_m: number;
  private readonly c: Float64Array;
  private readonly s: Float64Array;
  private readonly a: Float64Array;
  private readonly b: Float64Array;
  private readonly diagonal: Float64Array;
  private readonly v: Float64Array;
  private readonly w: Float64Array;
  private readonly total = new Float64Array(FIELDS);
  private cachedX = NaN;
  private cachedY = NaN;
  private cachedZ = NaN;
  private cachedHessian = false;

  constructor(data: HarmonicCoefficients, degree: number) {
    if (!Number.isInteger(degree) || degree < 0 || degree > 90 || !Number.isInteger(data.max_degree)
      || data.max_degree < degree || data.max_degree > 1800) {
      throw new GravityModelError('Gravity degree must be an explicitly selected integer in 0..90 and covered by the coefficient file.');
    }
    if (!(Number.isFinite(data.gm_m3_s2) && data.gm_m3_s2 > 0 && Number.isFinite(data.reference_radius_m) && data.reference_radius_m > 0)) {
      throw new GravityModelError('Gravity GM and reference radius must be finite positive SI values.');
    }
    const sourceCount = (data.max_degree + 1) * (data.max_degree + 2) / 2;
    if (data.c.length !== sourceCount || data.s.length !== sourceCount) throw new GravityModelError('Gravity coefficient arrays do not match the declared triangular degree.');
    for (let i = 0; i < sourceCount; i++) if (!Number.isFinite(data.c[i]) || !Number.isFinite(data.s[i])) throw new GravityModelError('Gravity coefficient arrays contain missing or nonfinite values.');
    for (let n = 0; n <= data.max_degree; n++) if (data.s[triangularIndex(n, 0)] !== 0) throw new GravityModelError('Zonal sine coefficients must be zero.');
    this.degree = degree; this.gm_m3_s2 = data.gm_m3_s2; this.reference_radius_m = data.reference_radius_m;
    const synthDegree = degree + 2, count = (synthDegree + 1) * (synthDegree + 2) / 2;
    this.c = new Float64Array(count * FIELDS); this.s = new Float64Array(count * FIELDS);
    for (let i = 0; i < (degree + 1) * (degree + 2) / 2; i++) {
      this.c[i * FIELDS] = data.c[i]; this.s[i * FIELDS] = data.s[i];
    }
    differentiate(this.c, this.s, degree, 0, 1, 0);
    differentiate(this.c, this.s, degree, 0, 2, 1);
    differentiate(this.c, this.s, degree, 0, 3, 2);
    differentiate(this.c, this.s, degree + 1, 1, 4, 0);
    differentiate(this.c, this.s, degree + 1, 1, 5, 1);
    differentiate(this.c, this.s, degree + 1, 1, 6, 2);
    differentiate(this.c, this.s, degree + 1, 2, 7, 1);
    differentiate(this.c, this.s, degree + 1, 2, 8, 2);
    differentiate(this.c, this.s, degree + 1, 3, 9, 2);
    this.a = new Float64Array(count); this.b = new Float64Array(count);
    this.diagonal = new Float64Array(synthDegree + 1);
    this.v = new Float64Array(count); this.w = new Float64Array(count);
    for (let m = 0; m <= synthDegree; m++) {
      if (m > 0) this.diagonal[m] = m === 1 ? Math.sqrt(3) : Math.sqrt((2 * m + 1) / (2 * m));
      for (let n = m + 1; n <= synthDegree; n++) {
        const i = triangularIndex(n, m);
        this.a[i] = Math.sqrt((4 * n * n - 1) / (n * n - m * m));
        if (n > m + 1) this.b[i] = Math.sqrt((2 * n + 1) * ((n - 1) ** 2 - m * m) / ((2 * n - 3) * (n * n - m * m)));
      }
    }
  }

  private compute(position: V3, hessian: boolean): void {
    const [xm, ym, zm] = position;
    if (!(Number.isFinite(xm) && Number.isFinite(ym) && Number.isFinite(zm))) throw new GravityModelError('Gravity position must contain finite Cartesian metres.');
    if (xm === this.cachedX && ym === this.cachedY && zm === this.cachedZ && (!hessian || this.cachedHessian)) return;
    const radius = this.reference_radius_m, x = xm / radius, y = ym / radius, z = zm / radius;
    const r2 = x * x + y * y + z * z;
    if (!(r2 > 0 && Number.isFinite(r2))) throw new GravityModelError('Gravity position has a singular or nonfinite radius.');
    const Q = 1 / r2, X = x * Q, Y = y * Q, Z = z * Q, V = this.v, W = this.w;
    V[0] = 1 / Math.sqrt(r2);
    const synthDegree = this.degree + (hessian ? 2 : 1);
    // Degree-major traversal writes contiguous rows and reuses the two preceding
    // rows; the subdiagonal and diagonal are separate exact recurrence cases.
    for (let n = 1; n <= synthDegree; n++) {
      const row = n * (n + 1) / 2, previous = row - n, previous2 = previous - n + 1;
      for (let m = 0; m < n - 1; m++) {
        const i = row + m, p = previous + m, pp = previous2 + m;
        const az = this.a[i] * Z, bq = this.b[i] * Q;
        V[i] = az * V[p] - bq * V[pp]; W[i] = az * W[p] - bq * W[pp];
      }
      const i = row + n - 1, p = previous + n - 1, az = this.a[i] * Z;
      V[i] = az * V[p]; W[i] = az * W[p];
      const d = this.diagonal[n];
      V[i + 1] = d * (X * V[p] - Y * W[p]); W[i + 1] = d * (X * W[p] + Y * V[p]);
    }
    const count = (synthDegree + 1) * (synthDegree + 2) / 2, components = hessian ? FIELDS : 4;
    const total = this.total, c = this.c, s = this.s;
    // Small high-degree contributions first; dominant central terms last.
    let u = 0, ax = 0, ay = 0, az = 0;
    for (let i = count - 1; i >= 0; i--) {
      const o = i * FIELDS, v = V[i], w = W[i];
      u += c[o] * v + s[o] * w;
      ax += c[o + 1] * v + s[o + 1] * w;
      ay += c[o + 2] * v + s[o + 2] * w;
      az += c[o + 3] * v + s[o + 3] * w;
    }
    const potentialScale = this.gm_m3_s2 / radius, accelerationScale = potentialScale / radius, hessianScale = accelerationScale / radius;
    total[0] = u * potentialScale; total[1] = ax * accelerationScale; total[2] = ay * accelerationScale; total[3] = az * accelerationScale;
    if (hessian) {
      let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0;
      for (let i = count - 1; i >= 0; i--) {
        const o = i * FIELDS, v = V[i], w = W[i];
        xx += c[o + 4] * v + s[o + 4] * w;
        xy += c[o + 5] * v + s[o + 5] * w;
        xz += c[o + 6] * v + s[o + 6] * w;
        yy += c[o + 7] * v + s[o + 7] * w;
        yz += c[o + 8] * v + s[o + 8] * w;
        zz += c[o + 9] * v + s[o + 9] * w;
      }
      total[4] = xx * hessianScale; total[5] = xy * hessianScale; total[6] = xz * hessianScale;
      total[7] = yy * hessianScale; total[8] = yz * hessianScale; total[9] = zz * hessianScale;
    }
    for (let i = 0; i < components; i++) if (!Number.isFinite(total[i])) throw new GravityModelError('Nonfinite spherical harmonic gravity; model evaluation domain exceeded.');
    this.cachedX = xm; this.cachedY = ym; this.cachedZ = zm; this.cachedHessian = hessian;
  }

  evaluate(position: V3, withHessian = false): HarmonicEvaluation {
    this.compute(position, withHessian);
    const t = this.total;
    return { potential_m2_s2: t[0], acceleration_m_s2: [t[1], t[2], t[3]],
      ...(withHessian ? { jacobian_s2: [[t[4], t[5], t[6]], [t[5], t[7], t[8]], [t[6], t[8], t[9]]] } : {}) };
  }
  acceleration(position: V3): V3 { this.compute(position, false); return [this.total[1], this.total[2], this.total[3]]; }
  jacobian(position: V3): number[][] {
    this.compute(position, true);
    const t = this.total;
    return [[t[4], t[5], t[6]], [t[5], t[7], t[8]], [t[6], t[8], t[9]]];
  }
}
