import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const projectRoot = process.cwd();
export const publicRoot = path.join(projectRoot, 'frontend/public');
export function installStaticFetch() {
  const original = globalThis.fetch;
  const requested = new Set<string>();
  globalThis.fetch = async (input) => {
    const url = new URL(String(input), 'http://static.test');
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const resolved = path.resolve(publicRoot, relative);
    if (!resolved.startsWith(path.resolve(publicRoot) + path.sep)) return new Response('Forbidden', { status: 403 });
    requested.add(relative);
    try { return new Response(await readFile(resolved)); }
    catch { return new Response('Not found', { status: 404 }); }
  };
  return { requested, restore: () => { globalThis.fetch = original; } };
}
export async function readJson(relative: string) {
  return JSON.parse(await readFile(path.join(projectRoot, relative), 'utf8'));
}
