// 팀 규칙 검사 (npm run lint): 화면 금지 문구, core 의존 방향, 합성 난수 (CLAUDE.md 7·10절, ARCHITECTURE 6.1)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../src/', import.meta.url)); // 한글·공백 경로도 그대로
const files = [];
const walk = (d) => {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(n)) files.push(p);
  }
};
walk(root);

const FORBIDDEN_TEXT = ['성공 확률', '임무 성공 확률', '추천 미션', '얼음이 있다', '매장량', '안전한 착륙지', 'success probability'];
const errors = [];
for (const f of files) {
  const rel = relative(root, f).replace(/\\/g, '/');
  const src = readFileSync(f, 'utf8');
  const isTest = rel.endsWith('.test.ts');
  if (!rel.startsWith('scripts')) {
    for (const w of FORBIDDEN_TEXT) if (!isTest && src.includes(w)) errors.push(`${rel}: 금지 문구 "${w}" (CLAUDE.md 10절)`);
  }
  if (rel.startsWith('core/') && !isTest) {
    for (const m of src.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      const spec = m[1];
      if (!spec.startsWith('./')) errors.push(`${rel}: core 는 외부·상위 모듈을 import 하지 않는다 (${spec})`);
    }
    if (/Date\.now\(|Math\.random\(|document\.|window\.|fetch\(/.test(src)) errors.push(`${rel}: core 금지 API (Date.now/Math.random/DOM/fetch)`);
  }
  if (rel.startsWith('pages/')) {
    for (const m of src.matchAll(/from\s+['"](\.\.\/(?:\.\.\/)?pages\/[^'"]+|\.\.\/(?!\.\.)[0-9]{2}-[^'"]+)['"]/g)) errors.push(`${rel}: 페이지끼리 import 금지 (${m[1]})`);
  }
  if (!isTest && /Math\.random\(/.test(src)) errors.push(`${rel}: 시드 없는 난수 금지 (합성 값 금지)`);
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`규칙 검사 통과 (${files.length}개 파일)`);
