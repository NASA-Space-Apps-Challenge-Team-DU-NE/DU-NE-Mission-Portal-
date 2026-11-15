import type { V3 } from '../math';

/** Dense triangular storage: index(n,m)=n(n+1)/2+m. C00 is explicit.
 * Fully normalized real geodesy-4pi coefficients, no Condon–Shortley phase.
 * The caller must enforce the source frame, normalization and tide metadata. */
export interface HarmonicCoefficients {
  gm_m3_s2: number;
  reference_radius_m: number;
  max_degree: number;
  c: ArrayLike<number>;
  s: ArrayLike<number>;
}

export interface HarmonicEvaluation {
  /** Positive geodetic potential U: acceleration = grad(U). */
  potential_m2_s2: number;
  acceleration_m_s2: V3;
  /** Symmetric d(acceleration)/d(position), in the input body-fixed axes. */
  jacobian_s2?: number[][];
}

export class GravityModelError extends Error {
  constructor(message: string) { super(message); this.name = 'GravityModelError'; }
}
