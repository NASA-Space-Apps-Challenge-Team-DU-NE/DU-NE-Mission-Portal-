import test from 'node:test';
import assert from 'node:assert/strict';
import { SphericalHarmonicGravity, triangularIndex, type HarmonicCoefficients } from '../frontend/src/physics/gravity/harmonics';
import type { V3 } from '../frontend/src/physics/math';
import { readFileSync } from 'node:fs';

const GM = 4902800306330.2, R = 1738000;
function coefficients(n: number): HarmonicCoefficients & { c: number[]; s: number[] } {
  const count = (n + 1) * (n + 2) / 2;
  const c = Array(count).fill(0), s = Array(count).fill(0); c[0] = 1;
  return { gm_m3_s2: GM, reference_radius_m: R, max_degree: n, c, s };
}
function close(actual: number, expected: number, tolerance: number, message = ''): void {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected}, error ${actual - expected}`);
}
function varied(n: number): HarmonicCoefficients {
  const data = coefficients(n);
  for (let degree = 2; degree <= n; degree++) for (let order = 0; order <= degree; order++) {
    const i = triangularIndex(degree, order), amplitude = 1e-4 / (degree * degree);
    data.c[i] = amplitude * Math.sin(i * 1.7);
    data.s[i] = order === 0 ? 0 : amplitude * Math.cos(i * 2.3);
  }
  return data;
}

test('Cartesian harmonics degree zero matches point-mass potential, acceleration and analytic Hessian', () => {
  const model = new SphericalHarmonicGravity(coefficients(0), 0);
  for (const p of [[2e6, -1e6, 3e6], [0, 0, -1737000], [0, 0, 6e7], [1.8e6, 0, 0]] as V3[]) {
    const radius = Math.hypot(...p), actual = model.evaluate(p, true);
    close(actual.potential_m2_s2, GM / radius, 1e-9, 'U');
    for (let i = 0; i < 3; i++) {
      close(actual.acceleration_m_s2[i], -GM * p[i] / radius ** 3, 2e-15, `a${i}`);
      for (let j = 0; j < 3; j++) close(actual.jacobian_s2![i][j], GM * (3 * p[i] * p[j] / radius ** 5 - (i === j ? 1 / radius ** 3 : 0)), 4e-21, `H${i}${j}`);
    }
  }
});

test('normalized synthetic C20 has correct J2 sign and axis symmetry, without central double counting', () => {
  const data = coefficients(2), c20 = -9.088016373139e-5, radius = R + 100000;
  data.c[triangularIndex(2, 0)] = c20;
  const model = new SphericalHarmonicGravity(data, 2), factor = (R / radius) ** 2;
  const pole = model.evaluate([0, 0, radius]), equator = model.evaluate([radius, 0, 0]);
  close(pole.potential_m2_s2, GM / radius * (1 + Math.sqrt(5) * c20 * factor), 1e-9);
  close(pole.acceleration_m_s2[2], -GM / radius ** 2 * (1 + 3 * Math.sqrt(5) * c20 * factor), 2e-15);
  close(equator.acceleration_m_s2[0], -GM / radius ** 2 * (1 - 1.5 * Math.sqrt(5) * c20 * factor), 2e-15);
  const a = model.acceleration([.6 * radius, .8 * radius, 0]);
  close(a[0], .6 * equator.acceleration_m_s2[0], 2e-15);
  close(a[1], .8 * equator.acceleration_m_s2[0], 2e-15);
  assert.ok(Math.abs(pole.acceleration_m_s2[2]) < GM / radius ** 2);
  assert.ok(Math.abs(equator.acceleration_m_s2[0]) > GM / radius ** 2);
});

test('C22/S22 and odd-m C21/S21 use geodesy-4pi normalization without the Condon Shortley phase', () => {
  const data = coefficients(2);
  data.c[triangularIndex(2, 2)] = 2e-4; data.s[triangularIndex(2, 2)] = -3e-4;
  data.c[triangularIndex(2, 1)] = 4e-4; data.s[triangularIndex(2, 1)] = 5e-4;
  const model = new SphericalHarmonicGravity(data, 2);
  for (const p of [[1.3e6, .7e6, -1.1e6], [-1.3e6, -.7e6, -1.1e6], [0, 0, 1.8e6]] as V3[]) {
    const [x, y, z] = p, r = Math.hypot(...p);
    const expected = GM / r + GM * R * R / r ** 5 * Math.sqrt(15) * (
      .5 * data.c[5] * (x * x - y * y) + data.s[5] * x * y + data.c[4] * x * z + data.s[4] * y * z);
    close(model.evaluate(p).potential_m2_s2, expected, 2e-9, 'low-degree Cartesian polynomial reference');
  }
});

test('full Cartesian gradient and Hessian agree with independent finite differences, including poles', () => {
  const model = new SphericalHarmonicGravity(varied(12), 12);
  const points: V3[] = [[1.4e6, -6e5, -1e6], [0, 0, -1736000], [0, 0, 1837400], [5e7, 2e7, -1e7]];
  for (const point of points) {
    const actual = model.evaluate(point, true), step = 20;
    for (let j = 0; j < 3; j++) {
      const shifted = (d: number): V3 => { const p: V3 = [...point]; p[j] += d; return p; };
      const f = (d: number) => model.evaluate(shifted(d)).potential_m2_s2;
      const numericalGradient = (f(-2 * step) - 8 * f(-step) + 8 * f(step) - f(2 * step)) / (12 * step);
      close(actual.acceleration_m_s2[j], numericalGradient, 1e-10, `gradient at ${point}, axis ${j}`);
      const plus = model.acceleration(shifted(step)), minus = model.acceleration(shifted(-step));
      for (let i = 0; i < 3; i++) close(actual.jacobian_s2![i][j], (plus[i] - minus[i]) / (2 * step), 5e-16, `H at ${point}, ${i}${j}`);
    }
    close(actual.jacobian_s2![0][0] + actual.jacobian_s2![1][1] + actual.jacobian_s2![2][2], 0, 2e-20, 'external potential is harmonic');
  }
});

test('degree 90 is finite and continuous at exact poles and near-surface radii below reference R', () => {
  const model = new SphericalHarmonicGravity(varied(90), 90);
  for (const sign of [-1, 1]) {
    const pole: V3 = [0, 0, sign * 1736000], exact = model.evaluate(pole, true);
    assert.ok([exact.potential_m2_s2, ...exact.acceleration_m_s2, ...exact.jacobian_s2!.flat()].every(Number.isFinite));
    for (const angle of [0, .7, 2.2, 4.5]) {
      const near: V3 = [1e-4 * Math.cos(angle), 1e-4 * Math.sin(angle), pole[2]], limit = model.evaluate(near, true);
      for (let i = 0; i < 3; i++) {
        close(limit.acceleration_m_s2[i], exact.acceleration_m_s2[i], 2e-10);
        for (let j = 0; j < 3; j++) close(limit.jacobian_s2![i][j], exact.jacobian_s2![i][j], 5e-16);
      }
    }
  }
});

test('invalid coefficients, unsupported degree and nonfinite/singular states fail explicitly', () => {
  const data = coefficients(2);
  assert.throws(() => new SphericalHarmonicGravity(data, 3), /degree/);
  assert.throws(() => new SphericalHarmonicGravity(coefficients(91), 91), /degree/);
  assert.throws(() => new SphericalHarmonicGravity(data, 1.5), /degree/);
  assert.throws(() => new SphericalHarmonicGravity({ ...data, c: data.c.slice(1) }, 2), /triangular/);
  assert.throws(() => new SphericalHarmonicGravity({ ...data, reference_radius_m: Infinity }, 2), /finite positive/);
  data.c[5] = NaN; assert.throws(() => new SphericalHarmonicGravity(data, 0), /nonfinite/); data.c[5] = 0;
  data.s[0] = 1; assert.throws(() => new SphericalHarmonicGravity(data, 2), /Zonal/); data.s[0] = 0;
  const model = new SphericalHarmonicGravity(data, 2);
  assert.throws(() => model.acceleration([0, 0, 0]), /singular/);
  assert.throws(() => model.acceleration([NaN, 0, R]), /finite/);
});

test('copied coefficients and returned values cannot mutate an evaluator or its cached Hessian', () => {
  const data = coefficients(2), model = new SphericalHarmonicGravity(data, 2), p: V3 = [2e6, 1e6, -1e6];
  const expected = model.evaluate(p, true);
  data.c[0] = 20;
  const changed = model.evaluate(p, true); changed.acceleration_m_s2[0] = 100; changed.jacobian_s2![0][0] = 100;
  assert.deepEqual(model.evaluate(p, true), expected);
  model.acceleration([3e6, 1e6, 0]);
  assert.deepEqual(model.evaluate(p, true), expected);
});

test('GL1800F vectors and Hessians match independent SciPy angular-harmonic fixtures at all supported degrees', () => {
  const data = JSON.parse(readFileSync('frontend/public/data/gravity/index.json', 'utf8'));
  const reference = JSON.parse(readFileSync('data/gravity/reference-fixtures.json', 'utf8'));
  const models = new Map<number, SphericalHarmonicGravity>();
  for (const sample of reference.cases) {
    if (!models.has(sample.degree)) models.set(sample.degree, new SphericalHarmonicGravity(data, sample.degree));
    const actual = models.get(sample.degree)!.evaluate(sample.position_pa_m, true);
    close(actual.potential_m2_s2, sample.potential_m2_s2, reference.comparison_limits.potential_abs_m2_s2, sample.name);
    for (let i = 0; i < 3; i++) close(actual.acceleration_m_s2[i], sample.acceleration_m_s2[i], reference.comparison_limits.acceleration_abs_m_s2, `${sample.name} N${sample.degree} a${i}`);
    if (sample.jacobian_s2) for (let i = 0; i < 9; i++) close(actual.jacobian_s2![Math.floor(i / 3)][i % 3], sample.jacobian_s2[i], reference.comparison_limits.jacobian_abs_s2, `${sample.name} N${sample.degree} H${i}`);
  }
  assert.equal(reference.cases.length, 60);
});
