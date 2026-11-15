/** Reproducible development check using the same TypeScript as the browser. */
import { build } from '../frontend/node_modules/esbuild/lib/main.js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
process.chdir(root);
await mkdir(path.join(root,'.cache'),{recursive:true});
const output=path.join(root,'.cache/gravity-reference-window-check.mjs');
await build({entryPoints:[path.join(root,'tests/gravity-reference-window-check.ts')],outfile:output,bundle:true,platform:'node',format:'esm'});
const {compareGravityReferenceWindow}=await import(pathToFileURL(output).href+'?'+Date.now());
const comparison=await compareGravityReferenceWindow();
const reportPath=path.join(root,'docs/gravity-reference-window-30.json');
const report=JSON.parse(await readFile(reportPath,'utf8'));
report.browser_comparison={...comparison,runtime:process.version,checked_at_utc:new Date().toISOString()};
await writeFile(reportPath,JSON.stringify(report,null,2));
console.log(JSON.stringify(comparison,null,2));
if(!comparison.passed)process.exitCode=1;
