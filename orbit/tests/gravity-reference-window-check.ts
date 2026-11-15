import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Ephemeris } from '../frontend/src/physics/ephemeris/data';
import { propagateEphemeris } from '../frontend/src/physics/ephemeris/dynamics';
import { GrailGravityModel, GRAVITY_DATA_SHA256 } from '../frontend/src/physics/gravity/model';
import { norm, position, sub } from '../frontend/src/physics/math';

/** Same coast tolerances as runEphemerisMission; the fixed seed tests the integrator, not direct source lookup. */
export const REFERENCE_PROPAGATION_OPTIONS = {
  rtol: 2e-12, atol_position_m: 1e-5, atol_velocity_m_s: 1e-8,
  max_step_s: 300, collect_samples: false,
};

export async function compareGravityReferenceWindow() {
  const [ephemerisBytes, gravityBytes, referenceBytes] = await Promise.all([
    readFile('frontend/public/data/ephemeris/index.json'),
    readFile('frontend/public/data/gravity/index.json'),
    readFile('data/gravity/reference-window-30.json'),
  ]);
  const data = JSON.parse(ephemerisBytes.toString()), coefficients = JSON.parse(gravityBytes.toString());
  const reference = JSON.parse(referenceBytes.toString());
  const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
  if (hash(gravityBytes) !== GRAVITY_DATA_SHA256 || hash(gravityBytes) !== reference.gravity_asset_sha256
    || hash(ephemerisBytes) !== reference.ephemeris_sha256 || reference.degree !== 30 || !reference.passed) {
    throw new Error('Independent reference-window fixture identity or validation mismatch');
  }
  const base = new Ephemeris(data), lunar = new GrailGravityModel(coefficients, base.frames, 30);
  const eph = new Ephemeris(data, lunar), seed = data.reference_seed;
  if (reference.seed_t_s !== seed.epoch_t_s || seed.state.some((x: number, i: number) => x !== reference.seed_state[i])) {
    throw new Error('Reference-window seed differs from the integrator regression source state');
  }
  const started = performance.now();
  const cases = reference.golden_states.map((expected: { t_s: number; duration_s: number; state: number[] }) => {
    const actual = propagateEphemeris(seed.state, seed.epoch_t_s, expected.duration_s, eph, REFERENCE_PROPAGATION_OPTIONS);
    return {
      duration_days: expected.duration_s / 86400,
      position_difference_m: norm(sub(position(actual.final), position(expected.state))),
      velocity_difference_m_s: norm(actual.final.slice(3, 6).map((v, i) => v - expected.state[i + 3])),
      final_state: actual.final, stats: actual.stats,
    };
  });
  const limits = { position_m: .1, velocity_m_s: 1e-5 };
  const degrees = cases.map((x: { duration_days: number }) => x.duration_days).sort((a: number, b: number) => a-b);
  const complete = JSON.stringify(degrees) === JSON.stringify([-7,-3,-1,1,3,7]);
  return {
    passed: complete && cases.every((x: { position_difference_m: number; velocity_difference_m_s: number }) =>
      x.position_difference_m < limits.position_m && x.velocity_difference_m_s < limits.velocity_m_s),
    method: 'Production TypeScript DOPRI5/4 + GL1800F + static ephemeris versus independent direct-SPICE/SciPy DOP853 golden states. Original seed is propagated separately to each requested epoch.',
    production_options: REFERENCE_PROPAGATION_OPTIONS, limits, cases,
    maximum_position_difference_m: Math.max(...cases.map((x: { position_difference_m: number }) => x.position_difference_m)),
    maximum_velocity_difference_m_s: Math.max(...cases.map((x: { velocity_difference_m_s: number }) => x.velocity_difference_m_s)),
    elapsed_s: (performance.now()-started)/1000,
  };
}
