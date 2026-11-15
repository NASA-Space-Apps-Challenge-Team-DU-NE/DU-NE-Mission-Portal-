/** SI units throughout. DE440 lunar GM, JPL Astrodynamic Parameters. */
export const MU = 4.902800118e12;
export const R_MOON = 1_737_400;
export const G0 = 9.80665;
export type V3 = [number, number, number];
export type State = [number, number, number, number, number, number, number];
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const norm = (a: number[]): number => Math.hypot(...a);
export const unit = (a: V3): V3 => scale(a, 1 / norm(a));
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const position = (s: number[]): V3 => s.slice(0, 3) as V3;
export const velocity = (s: number[]): V3 => s.slice(3, 6) as V3;
export const gravity = (r: V3): V3 => scale(r, -MU / norm(r) ** 3);
export const mix = (a: V3, b: V3, k: number): V3 => add(scale(a, 1 - k), scale(b, k));
export const matVec = (m: number[], v: V3): V3 => [dot(m.slice(0, 3) as V3, v), dot(m.slice(3, 6) as V3, v), dot(m.slice(6, 9) as V3, v)];
export function inverse3(m: number[]): number[] {
  const [a, b, c, d, e, f, g, h, i] = m;
  const co = [e * i - f * h, c * h - b * i, b * f - c * e, f * g - d * i, a * i - c * g, c * d - a * f, d * h - e * g, b * g - a * h, a * e - b * d];
  const det = a * co[0] + b * co[3] + c * co[6];
  if (Math.abs(det) < 1e-12) throw new Error('Singular orientation matrix');
  return co.map(x => x / det);
}
/** Classical RK4 on the actual seven-state gravity/thrust/mass ODE.
 * a is piecewise constant inertial commanded acceleration; T(t)=m(t)|a|.
 * This is equivalent to an exponentially tapered open-loop thrust command.
 */
export function rk4(s: State, dt: number, a: V3 = [0, 0, 0], isp = 320): State {
  const aMag = norm(a);
  const rhs = (y: State): State => {
    const g = gravity(position(y));
    return [y[3], y[4], y[5], g[0] + a[0], g[1] + a[1], g[2] + a[2], -y[6] * aMag / (isp * G0)];
  };
  const stepped = (k: State, f: number) => s.map((x, i) => x + dt * f * k[i]) as State;
  const k1 = rhs(s), k2 = rhs(stepped(k1, .5)), k3 = rhs(stepped(k2, .5)), k4 = rhs(stepped(k3, 1));
  return s.map((x, i) => x + dt * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]) / 6) as State;
}
export function integrate(s: State, duration: number, acceleration: V3 = [0, 0, 0], step = 2, isp = 320): State {
  const n = Math.max(1, Math.ceil(duration / step)), dt = duration / n;
  let y = [...s] as State;
  for (let i = 0; i < n; i++) y = rk4(y, dt, acceleration, isp);
  return y;
}
export function solveLinear(a: number[][], b: number[]): number[] {
  const n = b.length, m = a.map((row, i) => [...row, b[i]]);
  for (let k = 0; k < n; k++) {
    let pivot = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(m[i][k]) > Math.abs(m[pivot][k])) pivot = i;
    if (Math.abs(m[pivot][k]) < 1e-14) throw new Error('Shooting Jacobian is singular');
    [m[k], m[pivot]] = [m[pivot], m[k]];
    const d = m[k][k];
    for (let j = k; j <= n; j++) m[k][j] /= d;
    for (let i = 0; i < n; i++) if (i !== k) {
      const f = m[i][k];
      for (let j = k; j <= n; j++) m[i][j] -= f * m[k][j];
    }
  }
  return m.map(row => row[n]);
}
export function circularParameters(altitudeM = 100_000) {
  const radius = R_MOON + altitudeM;
  return { radius_m: radius, speed_m_s: Math.sqrt(MU / radius), period_s: 2 * Math.PI * Math.sqrt(radius ** 3 / MU) };
}
export function descentOrbit(altitudeM = 100_000, pdiAltitudeM = 15_000) {
  const ra = R_MOON + altitudeM, rp = R_MOON + pdiAltitudeM, a = (ra + rp) / 2;
  const va = Math.sqrt(MU * (2 / ra - 1 / a)), vp = Math.sqrt(MU * (2 / rp - 1 / a));
  return { ra, rp, a, e: (ra - rp) / (ra + rp), va, vp, deltaV: Math.sqrt(MU / ra) - va, coastTime: Math.PI * Math.sqrt(a ** 3 / MU) };
}
