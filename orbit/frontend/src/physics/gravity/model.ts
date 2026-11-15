import { DataUnavailable, type Frames } from '../data';
import type { V3 } from '../math';
import { SphericalHarmonicGravity } from './harmonics';

export interface GravityData {
  schema: string; model: string; gm_m3_s2: number; reference_radius_m: number;
  max_degree: number; c: number[]; s: number[]; frame: string; fixed_frame: string;
  normalization: string; csphase: number; pa_to_me_rotation: number[];
  source_url?: string; [key: string]: unknown;
}
export interface LunarGravityModel {
  readonly metadata: { model: 'grail'; degree: number; gm_m3_s2: number; reference_radius_m: number; frame: string; source_url: string };
  readonly stats: { calls: number; hessian_calls: number; cpu_ms: number };
  evaluate(t: number, r: V3, hessian?: boolean): { acceleration_m_s2: V3; jacobian_s2?: number[][] };
}
const SOURCE = 'https://pds-geosciences.wustl.edu/grail/grail-l-lgrs-5-rdr-v1/grail_1001/shadr/jggrx_1800f_sha.xml';
// Replaced only after reproducible preprocessing and independent reference review.
export const GRAVITY_DATA_SHA256 = '52127cccb74dd3c26d3ceac6e7099d63d818d31e22653fe79cdea6023282c848';
export const GRAVITY_DEGREES = [0, 20, 30, 60, 90] as const;
function multiply(a: number[], b: number[]): number[] {
  const c = new Array<number>(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) c[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[j + 3] + a[i * 3 + 2] * b[j + 6];
  return c;
}
export function paToInertialRotation(frames: Frames, paToMe: number[], t: number): number[] { return multiply(frames.at(t).r, paToMe); }

/** Coefficients are PA_DE440, terrain remains ME421; only vectors rotate here.
 * The inertial equations do not acquire centrifugal/Coriolis/Rdot terms. */
export class GrailGravityModel implements LunarGravityModel {
  readonly metadata: LunarGravityModel['metadata'];
  readonly stats = { calls: 0, hessian_calls: 0, cpu_ms: 0 };
  private core: SphericalHarmonicGravity;
  private frameTime = NaN;
  private rotation: number[] = [];
  constructor(readonly data: GravityData, private frames: Frames, degree: number) {
    if (!GRAVITY_DEGREES.includes(degree as typeof GRAVITY_DEGREES[number])) throw new DataUnavailable('GRAVITY_DATA — supported degrees are 0, 20, 30, 60 and 90.');
    if (data.schema !== 'lunar.gravity.v1' || data.frame !== 'MOON_PA_DE440' || data.fixed_frame !== frames.data.resolved_frame || data.csphase !== 1 || data.normalization !== '4pi' || data.max_degree !== 90 || data.gm_m3_s2 !== 4902800306330.2 || data.reference_radius_m !== 1738000) throw new DataUnavailable('GRAVITY_DATA — incompatible GL1800F model, units, normalization, phase or reference frame.');
    const r = data.pa_to_me_rotation;
    if (!Array.isArray(r) || r.length !== 9 || !r.every(Number.isFinite)) throw new DataUnavailable('GRAVITY_DATA — missing PA to ME frame rotation.');
    let orthogonality = 0;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) orthogonality = Math.max(orthogonality, Math.abs(r[i * 3] * r[j * 3] + r[i * 3 + 1] * r[j * 3 + 1] + r[i * 3 + 2] * r[j * 3 + 2] - (i === j ? 1 : 0)));
    const determinant = r[0] * (r[4] * r[8] - r[5] * r[7]) - r[1] * (r[3] * r[8] - r[5] * r[6]) + r[2] * (r[3] * r[7] - r[4] * r[6]);
    if (orthogonality > 1e-12 || Math.abs(determinant - 1) > 1e-12) throw new DataUnavailable('GRAVITY_DATA — invalid proper PA to ME rotation.');
    try { this.core = new SphericalHarmonicGravity(data, degree); } catch (e) { throw new DataUnavailable(`GRAVITY_DATA — ${String(e)}`); }
    this.metadata = { model: 'grail', degree, gm_m3_s2: data.gm_m3_s2, reference_radius_m: data.reference_radius_m, frame: data.frame, source_url: SOURCE };
  }
  evaluate(t: number, position: V3, hessian = false) {
    const started = performance.now();
    try {
      if (t !== this.frameTime) { this.rotation = paToInertialRotation(this.frames, this.data.pa_to_me_rotation, t); this.frameTime = t; }
      const R = this.rotation, p = position;
      const pa: V3 = [R[0] * p[0] + R[3] * p[1] + R[6] * p[2], R[1] * p[0] + R[4] * p[1] + R[7] * p[2], R[2] * p[0] + R[5] * p[1] + R[8] * p[2]];
      const value = this.core.evaluate(pa, hessian), a = value.acceleration_m_s2;
      const acceleration_m_s2: V3 = [R[0] * a[0] + R[1] * a[1] + R[2] * a[2], R[3] * a[0] + R[4] * a[1] + R[5] * a[2], R[6] * a[0] + R[7] * a[1] + R[8] * a[2]];
      let jacobian_s2: number[][] | undefined;
      if (hessian) {
        const H = value.jacobian_s2!;
        jacobian_s2 = Array.from({ length: 3 }, () => [0, 0, 0]);
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) for (let l = 0; l < 3; l++) jacobian_s2[i][j] += R[i * 3 + k] * H[k][l] * R[j * 3 + l];
        this.stats.hessian_calls++;
      }
      this.stats.calls++;
      return { acceleration_m_s2, jacobian_s2 };
    } catch(e) {
      if(e instanceof DataUnavailable)throw e;
      throw new Error(`GRAVITY_NUMERICS — ${e instanceof Error?e.message:String(e)}`);
    } finally { this.stats.cpu_ms += performance.now() - started; }
  }
}

export async function loadGravityData(base: string): Promise<GravityData> {
  const response = await fetch(base + 'gravity/index.json');
  if (!response.ok) throw new DataUnavailable(`GRAVITY_DATA — GL1800F static coefficients unavailable (${response.status}).`);
  const bytes = await response.arrayBuffer();
  if (!globalThis.crypto?.subtle) throw new DataUnavailable('GRAVITY_DATA — integrity checks require HTTPS or localhost.');
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
  if (hash !== GRAVITY_DATA_SHA256) throw new DataUnavailable('GRAVITY_DATA — coefficient integrity hash mismatch. Restore the verified static file.');
  try { return JSON.parse(new TextDecoder().decode(bytes)) as GravityData; } catch { throw new DataUnavailable('GRAVITY_DATA — invalid static coefficient JSON.'); }
}
