// 홈페이지 + 미션 포털을 한 사이트로 묶어 dist/ 에 만든다 (Cloudflare 배포용, wrangler.jsonc).
//   /                 홈페이지 (homepage/ 의 정적 HTML 그대로)
//   /mission-portal/  미션 포털 (web/ 을 base=/mission-portal/ 로 빌드. 홈페이지의 "착륙 계획 세우기" 링크가 이 주소)
// 포털 소스는 바꾸지 않는다. 데이터·Orbit·Worker 경로는 모두 Vite BASE_URL 을 따른다.
// Orbit 정적 산출물(web/public/orbit)이 먼저 있어야 한다: npm run prepare:orbit
import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, 'dist');
const PORTAL_BASE = '/mission-portal/';
const MAX_BYTES = 25 * 1024 * 1024; // Cloudflare 정적 파일 하나당 25 MiB

if (!existsSync(path.join(root, 'web/public/orbit/index.html'))) {
  console.error('web/public/orbit 이 없습니다. 먼저 npm run prepare:orbit 를 실행하세요.');
  process.exit(1);
}
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

// 1) 미션 포털: /mission-portal/ 아래에서 열리도록 base 만 바꿔 빌드
const vite = path.join(root, 'web/node_modules/vite/bin/vite.js');
const r = spawnSync(process.execPath, [vite, 'build', `--base=${PORTAL_BASE}`, '--outDir', path.join(dist, 'mission-portal'), '--emptyOutDir'], { cwd: path.join(root, 'web'), stdio: 'inherit' });
if (r.status !== 0) process.exit(r.status ?? 1);

// 2) 홈페이지: 문서·도구를 빼고 그대로 복사
const SKIP = new Set(['README.md', 'tools', '.gitignore']);
for (const e of await readdir(path.join(root, 'homepage'))) {
  if (SKIP.has(e)) continue;
  await cp(path.join(root, 'homepage', e), path.join(dist, e), { recursive: true });
}

// 3) 25 MiB 넘는 파일 검사
const big = [];
async function walk(d) {
  for (const e of await readdir(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) await walk(p);
    else if ((await stat(p)).size > MAX_BYTES) big.push(path.relative(dist, p));
  }
}
await walk(dist);
if (big.length) { console.error('25 MiB 넘는 파일:', big.join(', ')); process.exit(1); }
console.log(`사이트 준비됨: dist/ (홈페이지 /, 미션 포털 ${PORTAL_BASE})`);
