/** Development-only, reproducible short-orbit convergence check. No backend.
 * Runs the same dated TypeScript integrator, frame interpolation and force
 * model as the browser. This is NOT a mission/landing validation or an
 * independent integrator comparison (see the separate SciPy gravity report).
 * Usage: node scripts/run-gravity-convergence.mjs
 */
import { build } from '../frontend/node_modules/esbuild/lib/main.js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const root = fileURLToPath(new URL('../', import.meta.url));
const publicRoot = path.join(root, 'frontend/public');
await mkdir(path.join(root, '.cache'), { recursive: true });
const bundle = path.join(root, '.cache/gravity-convergence-engine.mjs');
await build({ stdin: { contents: [
  "export * from './frontend/src/physics/ephemeris/data';",
  "export {propagateEphemeris} from './frontend/src/physics/ephemeris/dynamics';",
  "export * from './frontend/src/physics/gravity/model';",
].join('\n'), resolveDir: root }, outfile: bundle, bundle: true, platform: 'node', format: 'esm' });
const { loadEphemeris, Ephemeris, loadGravityData, GrailGravityModel, paToInertialRotation, propagateEphemeris } = await import(pathToFileURL(bundle).href);
const originalFetch = globalThis.fetch;
globalThis.fetch = async input => {
  const url = new URL(String(input), 'https://static.test');
  const file = path.resolve(publicRoot, '.' + decodeURIComponent(url.pathname));
  if (!file.startsWith(publicRoot + path.sep)) return new Response('Forbidden', { status: 403 });
  try { return new Response(await readFile(file)); } catch { return new Response('Not found', { status: 404 }); }
};

try {
  const baseline = await loadEphemeris('/data/');
  const data = await loadGravityData('/data/');
  const utc = '2026-11-16T00:00:00Z', start = baseline.time(utc);
  const terrainReferenceRadius = 1737400, altitude = 100000, radius = terrainReferenceRadius + altitude;
  const speed = Math.sqrt(data.gm_m3_s2 / radius);
  const duration = 2 * Math.PI * Math.sqrt(radius ** 3 / data.gm_m3_s2);
  const rotation = paToInertialRotation(baseline.frames, data.pa_to_me_rotation, start);
  const rotate = v => [0, 1, 2].map(i => rotation[i * 3] * v[0] + rotation[i * 3 + 1] * v[1] + rotation[i * 3 + 2] * v[2]);
  // Instantaneous PA-axis specification of INERTIAL position and velocity, not
  // a surface-fixed state: Rdot*r is intentionally not part of this velocity.
  const initial = [...rotate([radius, 0, 0]), ...rotate([0, 0, speed])];
  // Both max steps are below the integrator's ~22.5s geometric cap here.
  // A 60s->30s request would not change most actual steps and is not a useful
  // timestep-refinement test. These settings force a genuine 20s->10s check.
  const nominal = { rtol: 2e-11, atol_position_m: 1e-4, atol_velocity_m_s: 1e-7, max_step_s: 20 };
  const refined = { rtol: 2e-12, atol_position_m: 1e-5, atol_velocity_m_s: 1e-8, max_step_s: 10 };
  const common = { collect_samples: false, with_stm: false, collision_radius_m: terrainReferenceRadius, max_steps: 100000 };
  const delta = (a, b, offset) => Math.hypot(...a.slice(offset, offset + 3).map((x, i) => x - b[offset + i]));
  const rows = [], totalStarted = performance.now();
  for (const degree of [0, 20, 30, 60, 90]) {
    const run = settings => {
      const lunar = new GrailGravityModel(data, baseline.frames, degree);
      const eph = new Ephemeris(baseline.data, lunar);
      const started = performance.now();
      const result = propagateEphemeris(initial, start, duration, eph, { ...common, ...settings });
      return { final_state_j2000: result.final, elapsed_s: (performance.now() - started) / 1000,
        integration: result.stats, gravity: { ...lunar.stats } };
    };
    const normal = run(nominal), fine = run(refined);
    const row = { degree, nominal: normal, refined: fine,
      numerical_refinement_difference: { position_m: delta(normal.final_state_j2000, fine.final_state_j2000, 0),
        velocity_m_s: delta(normal.final_state_j2000, fine.final_state_j2000, 3) } };
    rows.push(row);
    console.log(`N=${degree}: refinement ${row.numerical_refinement_difference.position_m.toExponential(3)} m, ${(normal.elapsed_s + fine.elapsed_s).toFixed(3)} s`);
  }
  const reference = rows.at(-1).refined.final_state_j2000;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i], state = row.refined.final_state_j2000;
    row.degree_difference_from_refined_N90 = { position_m: delta(state, reference, 0), velocity_m_s: delta(state, reference, 3) };
    row.change_from_previous_degree = i ? { from_degree: rows[i - 1].degree,
      position_m: delta(state, rows[i - 1].refined.final_state_j2000, 0),
      velocity_m_s: delta(state, rows[i - 1].refined.final_state_j2000, 3) } : null;
  }
  const increases = field => rows.slice(1).flatMap((row, i) => row.degree_difference_from_refined_N90[field] > rows[i].degree_difference_from_refined_N90[field] ?
    [{ from_degree: rows[i].degree, to_degree: row.degree, previous_difference: rows[i].degree_difference_from_refined_N90[field], new_difference: row.degree_difference_from_refined_N90[field] }] : []);
  // Numerical budget only: well below the app's metre-scale landing constraints.
  // This does not bound gravity truncation, terrain/navigation/engine uncertainty.
  const limits = { refinement_position_m: .05, refinement_velocity_m_s: 5e-5 };
  const checks = rows.map(row => ({ degree: row.degree,
    pass: row.numerical_refinement_difference.position_m <= limits.refinement_position_m &&
      row.numerical_refinement_difference.velocity_m_s <= limits.refinement_velocity_m_s }));
  const report = {
    generated_at_utc: new Date().toISOString(), runtime: process.version, platform: process.platform,
    cpu: os.cpus()[0].model.trim(), logical_cpus: os.cpus().length,
    scope: 'One common-initial-state 100 km osculating polar LLO coast; no optimization, impulses, thrust, or state resets.',
    source: { model: data.model, gravity_asset_sha256: '52127cccb74dd3c26d3ceac6e7099d63d818d31e22653fe79cdea6023282c848',
      ephemeris: 'DE440 static dataset via integrity-checked loader', lunar_gm_m3_s2: data.gm_m3_s2,
      earth_gm_m3_s2: baseline.gm.earth, sun_gm_m3_s2: baseline.gm.sun,
      frames: 'MOON_PA_DE440 -> MOON_ME_DE440_ME421 -> J2000, evaluated at each integrator stage',
      third_bodies: 'Earth and Sun, direct minus lunar-origin acceleration in every run' },
    initial: { utc, elapsed_tdb_from_ephemeris_epoch_s: start, terrain_reference_radius_m: terrainReferenceRadius,
      altitude_m: altitude, state_j2000_m_m_s: initial,
      construction: 'PA-axis position [R_LOLA+100km,0,0] and inertial velocity [0,0,sqrt(GM/r)] rotated at the initial epoch; 90-degree instantaneous PA inclination. Same six-state for every degree.' },
    duration_s: duration, duration_definition: 'One Kepler period based on the same GL1800F GM, not a claim that perturbed trajectories close.',
    integration_method: 'Dormand-Prince 5(4) adaptive integration, browser TypeScript implementation',
    settings: { common, nominal, refined }, numerical_acceptance_limits: limits,
    rows, checks, passed: checks.every(x => x.pass),
    degree_monotonicity: { position_difference_increases: increases('position_m'), velocity_difference_increases: increases('velocity_m_s'),
      interpretation: 'Differences are measured against finite N90, not physical truth. Degree convergence need not be monotonic: harmonic contributions can reinforce or cancel. This single phase/orbit cannot certify a default degree for all missions.' },
    limitations: [
      'Both numerical-refinement trajectories use the same integrator and model implementation; independent acceleration verification is documented separately.',
      'No landing, low-altitude descent, fuel or optimal-control comparison is performed by this short coast report.',
      'Step refinement error is separate from harmonic truncation and physical/model uncertainties.',
      'Node elapsed time is not a browser performance guarantee; other concurrent tasks can influence timing.',
    ], total_elapsed_s: (performance.now() - totalStarted) / 1000,
  };
  await writeFile(path.join(root, 'docs/gravity-convergence.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, total_elapsed_s: report.total_elapsed_s,
    degree_differences: rows.map(row => ({ degree: row.degree, ...row.degree_difference_from_refined_N90 })),
    degree_monotonicity: report.degree_monotonicity }, null, 2));
  if (!report.passed) process.exitCode = 1;
} finally { globalThis.fetch = originalFetch; }
