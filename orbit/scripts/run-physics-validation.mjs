/** Run the identical browser TypeScript engine against static NASA assets in Node.
 * No backend or Python is involved in this validation run. */
import { build } from '../frontend/node_modules/esbuild/lib/main.js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
await mkdir(path.join(root, '.cache'), { recursive: true });
await mkdir(path.join(root, 'docs'), { recursive: true });
const outfile = path.join(root, '.cache/engine.mjs');
await build({ stdin: { contents: "export * from './frontend/src/physics/simulator'; export * from './frontend/src/physics/data'; export * from './frontend/src/physics/math';", resolveDir: root }, outfile, bundle: true, platform: 'node', format: 'esm' });
const { loadAssets, runSimulation } = await import(pathToFileURL(outfile).href + '?v=' + Date.now());
let totalBytes = 0; const reads = new Set();
globalThis.fetch = async function localFetch(input) {
  const url = new URL(String(input), 'http://static.local');
  const file = path.resolve(root, 'frontend/public', '.' + decodeURIComponent(url.pathname));
  if (!file.startsWith(path.join(root, 'frontend/public'))) throw new Error('Asset path escaped static directory');
  try { const b = await readFile(file); totalBytes += b.length; reads.add(url.pathname); return new Response(b); }
  catch { return new Response('Not found', { status: 404 }); }
};
const config = {
  target: { latitude_deg: -89.4441, longitude_deg: -137.291, landing_time_utc: '2026-11-16T00:00:00Z' },
  lander: { initial_mass_kg: 1500, dry_mass_kg: 650, max_thrust_n: 12000, min_thrust_n: 0, isp_s: 320 },
  orbit: { altitude_km: 100, pdi_altitude_km: 15 },
  constraints: { position_tolerance_m: 100, speed_tolerance_m_s: 2, horizontal_speed_tolerance_m_s: 1 }, objective: 'fuel',
};
const assets = await loadAssets('/data/');
const records = [];
for (const test of [
  { name: 'connecting-ridge', changes: {} },
  { name: 'south-polar-second-target', changes: { target: { ...config.target, latitude_deg: -87.9, longitude_deg: 25.1 } } },
  { name: 'insufficient-thrust', changes: { lander: { ...config.lander, max_thrust_n: 100 } } },
  { name: 'missing-target-dem', changes: { target: { ...config.target, latitude_deg: 0, longitude_deg: 0 } } },
]) {
  const c = { ...config, ...test.changes }, t = performance.now();
  console.log('RUN', test.name);
  try {
    const result = await runSimulation(c, assets, m => console.log(m));
    const record = { name: test.name, input: c, status: result.status, elapsed_ms: performance.now() - t, summary: result.summary, validation: result.validation, message: result.message };
    records.push(record); console.log(JSON.stringify(record));
    if (test.name === 'connecting-ridge') await writeFile(path.join(root, 'docs/default-trajectory.json'), JSON.stringify({ input: c, ...result }, null, 2));
  } catch (error) { const record = { name: test.name, status: error.name === 'DataUnavailable' ? 'DATA UNAVAILABLE' : 'ERROR', error: String(error), elapsed_ms: performance.now() - t }; records.push(record); console.log(record); }
}
await writeFile(path.join(root, 'docs/physics-validation-results.json'), JSON.stringify({ generated_at_utc: new Date().toISOString(), runtime: process.version, static_asset_bytes_read: totalBytes, static_assets_read: [...reads], tests: records }, null, 2));
if (records[0].status !== 'VALIDATED' || records[1].status !== 'VALIDATED' || records[2].status === 'VALIDATED' || records[3].status !== 'DATA UNAVAILABLE') process.exitCode = 1;
