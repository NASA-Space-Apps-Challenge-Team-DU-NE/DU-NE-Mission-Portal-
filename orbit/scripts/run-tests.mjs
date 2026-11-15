import { build } from '../frontend/node_modules/esbuild/lib/main.js';
import { mkdir, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const tests = (await readdir(path.join(root, 'tests'))).filter(f => f.endsWith('.test.ts'));
if (!tests.length) throw new Error('No tests discovered.');
await mkdir(path.join(root, '.cache/tests'), { recursive: true });
const outputs = [];
for (const test of tests) {
  const outfile = path.join(root, '.cache/tests', test.replace('.ts', '.mjs'));
  await build({ entryPoints: [path.join(root, 'tests', test)], outfile, bundle: true, platform: 'node', format: 'esm', sourcemap: 'inline' });
  outputs.push(outfile);
}
const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...outputs], { cwd: root, stdio: 'inherit' });
process.exitCode = result.status ?? 1;
