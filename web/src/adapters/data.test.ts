import { readFileSync, existsSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadArtemisRegions, loadCatalog, loadEphemeris, loadGrid, loadLayer, loadLocalTerrain, loadManifest, loadMask, loadMastMasks, loadQuality, loadSources, loadTextures, loadValidation, loadValidationExtra } from './data';
import { useData } from '../state/data';

const dataRoot = new URL('../../public/data/', import.meta.url);
const fixture = (name: string) => JSON.parse(readFileSync(new URL(name, dataRoot), 'utf8'));
const json = (v: unknown) => new Response(JSON.stringify(v), { headers: { 'content-type': 'application/json' } });
type Override = (path: string) => Response | undefined;
function serve(override?: Override) {
  const fetcher = vi.fn(async (url: string | URL | Request) => {
    const path = new URL(String(url), 'http://localhost').pathname.replace(/^\/data\//, '');
    const replacement = override?.(path);
    if (replacement) return replacement;
    const file = new URL(path, dataRoot);
    if (!existsSync(file)) return new Response('', { status: 404 });
    return new Response(readFileSync(file), { headers: { 'content-type': path.endsWith('.json') ? 'application/json' : 'application/octet-stream' } });
  });
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}
beforeEach(async () => { serve(); await loadManifest(); });
afterEach(() => vi.unstubAllGlobals());

describe('실제 배포 자료와 nullable 필드 호환', () => {
  it('현재 카탈로그와 부가 자료를 거부하지 않는다', async () => {
    for (const name of ['sites', 'missions', 'landers', 'stations', 'power_refs'] as const) { const r = await loadCatalog(name); expect(r.status, r.status === 'missing' ? r.reason : name).toBe('ok'); }
    for (const load of [loadSources, loadQuality, loadArtemisRegions, loadTextures, loadLocalTerrain]) expect(await load(), load.name).toMatchObject({ status: 'ok' });
    expect(await loadMask('masks/connecting_ridge.json')).toMatchObject({ status: 'ok' });
    expect(await loadMastMasks('connecting_ridge')).toMatchObject({ status: 'ok' });
    const landers = await loadCatalog('landers');
    if (landers.status === 'ok') expect(landers.value.data[0].battery_wh).toBeNull();
  });
  it('모든 출하 천체력과 레이어 목록을 읽는다', async () => {
    const files = fixture('manifest.json').files as Array<{ path: string }>;
    for (const { path } of files.filter((f) => /^ephemeris\/.+\.json$/.test(f.path))) expect(await loadEphemeris(path), path).toMatchObject({ status: 'ok' });
    const grid = await loadGrid();
    expect(grid).toMatchObject({ status: 'ok' });
    if (grid.status === 'ok') {
      expect(grid.value.layersReason).toBeUndefined();
      expect(grid.value.layersEnv?.data.length).toBeGreaterThan(0);
    }
  });
  it('추가된 mast/wueller 및 광물 검증 항목을 포함해 모두 읽는다', async () => {
    for (const name of ['ephemeris', 'masks', 'illumination', 'frames', 'mast', 'wueller'] as const) expect(await loadValidation(name), name).toMatchObject({ status: 'ok' });
    for (const name of ['catalog_sites', 'catalog_missions', 'ephemeris_spice', 'layers_minerals'] as const) expect(await loadValidationExtra(name), name).toMatchObject({ status: 'ok' });
  });
});

describe('R06 잘못된 자료가 계산 경계 안으로 들어오지 않는다', () => {
  it('null·스칼라·배열 envelope와 객체 schema도 예외 없이 missing이다', async () => {
    for (const value of [null, false, 3, 'broken', [], {}, { data: [], schema: { toString: null } }]) {
      serve((p) => p === 'catalog/sites.json' ? json(value) : undefined);
      await expect(loadCatalog('sites')).resolves.toMatchObject({ status: 'missing' });
    }
  });
  it('깨진 manifest로 다음 요청을 오염시키지 않고 새 목록으로 복구한다', async () => {
    const fetcher = serve((p) => p === 'manifest.json' ? json({ schema: 'luna.manifest.v1', files: null }) : undefined);
    expect(await loadManifest()).toMatchObject({ status: 'missing' });
    expect(await loadCatalog('sites')).toMatchObject({ status: 'ok' });
    expect(String(fetcher.mock.calls.at(-1)?.[0])).not.toContain('?v=');
    serve();
    expect(await loadManifest()).toMatchObject({ status: 'ok' });
    const fresh = serve();
    await loadCatalog('sites');
    expect(String(fresh.mock.calls.at(-1)?.[0])).toContain('?v=');
  });
  it.each(['sites', 'missions', 'landers', 'stations', 'power_refs'] as const)('%s의 null 행을 missing으로 반환한다', async (name) => {
    const env = fixture(`catalog/${name}.json`); env.data = [null];
    serve((p) => p === `catalog/${name}.json` ? json(env) : undefined);
    expect(await loadCatalog(name)).toMatchObject({ status: 'missing', reason: expect.stringContaining('1행') });
  });
  it('위경도, 숫자 문자열 및 중복 id를 차단한다', async () => {
    for (const change of [(r: Record<string, unknown>) => { r.lat_deg = 91; }, (r: Record<string, unknown>) => { r.lon_deg = '23.5'; }]) {
      const env = fixture('catalog/sites.json'); change(env.data[0]);
      serve((p) => p === 'catalog/sites.json' ? json(env) : undefined);
      expect(await loadCatalog('sites')).toMatchObject({ status: 'missing' });
    }
    const env = fixture('catalog/sites.json'); env.data.push(env.data[0]);
    serve((p) => p === 'catalog/sites.json' ? json(env) : undefined);
    expect(await loadCatalog('sites')).toMatchObject({ status: 'missing', reason: expect.stringContaining('중복') });
  });
  it('지원하지 않는 카탈로그 enum을 차단하고 명시적 미상 값은 보존한다', async () => {
    for (const [name, field] of [['sites', 'category'], ['sites', 'coord_kind'], ['sites', 'coord_evidence'], ['missions', 'power'], ['missions', 'lighting_related'], ['missions', 'landing_precision'], ['landers', 'mount'], ['landers', 'dust_class'], ['stations', 'network']] as const) {
      const env = fixture(`catalog/${name}.json`); env.data[0][field] = 'unsupported';
      serve((p) => p === `catalog/${name}.json` ? json(env) : undefined);
      expect(await loadCatalog(name), `${name}.${field}`).toMatchObject({ status: 'missing' });
    }
    const env = fixture('catalog/missions.json'); Object.assign(env.data[0], { duration_h: null, power: 'unknown', comm: 'unknown', approach: 'unknown', lighting_related: 'unknown', landing_precision: 'unknown' });
    serve((p) => p === 'catalog/missions.json' ? json(env) : undefined);
    expect(await loadCatalog('missions')).toMatchObject({ status: 'ok' });
  });
  it('필수 nullable 필드의 null과 필드 자체 누락을 구분한다', async () => {
    for (const [name, field] of [['missions', 'duration_h'], ['landers', 'efficiency'], ['landers', 'battery_min_fraction']] as const) {
      const env = fixture(`catalog/${name}.json`); env.data[0][field] = null;
      serve((p) => p === `catalog/${name}.json` ? json(env) : undefined);
      expect(await loadCatalog(name)).toMatchObject({ status: 'ok' });
      delete env.data[0][field];
      expect(await loadCatalog(name)).toMatchObject({ status: 'missing' });
    }
  });
  it('높이별 마스크 내부 행과 높이 일치를 확인한다', async () => {
    const env = fixture('masks/heights/connecting_ridge.json'); env.data.masks[0] = null;
    serve((p) => p.includes('masks/heights/') ? json(env) : undefined);
    expect(await loadMastMasks('connecting_ridge')).toMatchObject({ status: 'missing' });
  });
  it.each([{ count: 1 }, { count: 2.5 }, { frame: 'MOON_PA' }, { bodies: ['earth', 'sun'] }, { step_h: 0 }])('잘못된 천체력 메타 %j를 바이너리 읽기 전에 거부한다', async (fields) => {
    const env = fixture('ephemeris/range.json'); Object.assign(env.data, fields);
    const fetcher = serve((p) => p === 'ephemeris/range.json' ? json(env) : undefined);
    expect(await loadEphemeris('ephemeris/range.json')).toMatchObject({ status: 'missing' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([NaN, Infinity, -1, 0])('천체력의 비정상 거리 %s를 차단한다', async (dist) => {
    const env = fixture('ephemeris/range.json'); env.data.count = 2;
    const values = new Float32Array([0, 0, dist, 0, 0, 384400, 0, 0, 149597870, 0, 0, 384400]);
    serve((p) => p === 'ephemeris/range.json' ? json(env) : p === 'ephemeris/range.bin' ? new Response(values) : undefined);
    expect(await loadEphemeris('ephemeris/range.json')).toMatchObject({ status: 'missing' });
  });
  it.each(['nx', 'ny', 'x0_km', 'y0_km'])('격자 필수 필드 %s 누락을 거부한다', async (field) => {
    const env = fixture('grid/manifest.json'); delete env.data[field];
    serve((p) => p === 'grid/manifest.json' ? json(env) : undefined);
    expect(await loadGrid()).toMatchObject({ status: 'missing' });
  });
  it('범위 밖 셀과 중복 셀을 차단한다', async () => {
    const env = fixture('grid/manifest.json');
    // 파일 Buffer의 byteOffset을 보존해 임의 메모리가 fixture로 들어가지 않게 한다.
    const b = readFileSync(new URL('grid/cells.u32', dataRoot));
    for (const mode of ['range', 'duplicate']) {
      const values = new Uint32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
      values[0] = mode === 'range' ? env.data.nx * env.data.ny : values[1];
      serve((p) => p === 'grid/cells.u32' ? new Response(values) : undefined);
      expect(await loadGrid()).toMatchObject({ status: 'missing' });
    }
  });
  it('정적 레이어의 NaN 결측은 유지하고 Infinity는 차단한다', async () => {
    const meta = fixture('grid/layers.json').data[0];
    serve(() => new Response(new Float32Array([NaN])));
    expect(await loadLayer(meta, 1)).toMatchObject({ status: 'ok' });
    serve(() => new Response(new Float32Array([Infinity])));
    expect(await loadLayer(meta, 1)).toMatchObject({ status: 'missing' });
  });
});

describe('R07 누락한 레이어 목록의 상태 전파', () => {
  it.each(['404', 'bad-schema', 'null-row', 'empty'])('%s 목록은 격자를 유지하고 degraded와 파일별 사유를 남긴다', async (mode) => {
    const env = fixture('grid/layers.json');
    if (mode === 'bad-schema') env.schema = 'luna.layers.v99';
    if (mode === 'null-row') env.data = [null];
    if (mode === 'empty') env.data = [];
    serve((p) => p === 'grid/layers.json' ? mode === '404' ? new Response('', { status: 404 }) : json(env) : undefined);
    useData.setState(useData.getInitialState(), true);
    await useData.getState().loadAll();
    const d = useData.getState();
    expect(d.status).toBe('degraded');
    expect(d.gridApprox).toBe(false);
    expect(d.grid?.cells.length).toBe(25992);
    expect(d.missingReasons.join('\n')).toContain('grid/layers.json');
    expect(d.layerReasons['grid/layers.json']).toBeTruthy();
  });
});

describe('R08 검증 카드의 독립적인 실패 및 캐시 버전', () => {
  it('손상된 카탈로그 대조는 missing으로 격리하고 다른 표는 정상이다', async () => {
    const env = fixture('validation/catalog_sites.json'); env.data = [null];
    serve((p) => p === 'validation/catalog_sites.json' ? json(env) : undefined);
    expect(await loadValidationExtra('catalog_sites')).toMatchObject({ status: 'missing' });
    expect(await loadValidationExtra('catalog_missions')).toMatchObject({ status: 'ok' });
  });
  it('위도대 객체를 배열처럼 렌더링하지 않는다', async () => {
    const env = fixture('validation/layers_minerals.json'); env.data.tio2_jaxa_mi.latitude_bands = {};
    serve((p) => p === 'validation/layers_minerals.json' ? json(env) : undefined);
    expect(await loadValidationExtra('layers_minerals')).toMatchObject({ status: 'missing' });
  });
  it('검증 자료의 스키마를 확인하고 manifest hash로 요청한다', async () => {
    const env = fixture('validation/catalog_sites.json'); env.schema = 'luna.validation.catalog_sites.v99';
    const fetcher = serve((p) => p === 'validation/catalog_sites.json' ? json(env) : undefined);
    expect(await loadValidationExtra('catalog_sites')).toMatchObject({ status: 'missing' });
    const hash = fixture('manifest.json').files.find((f: { path: string }) => f.path === 'validation/catalog_sites.json').sha256.slice(0, 12);
    expect(String(fetcher.mock.calls[0][0])).toContain(`?v=${hash}`);
  });
  it('검증 실패 판정은 계산에 사용하지 않되 검증 화면에는 표시할 수 있다', async () => {
    const env = fixture('validation/frames.json'); env.quality = 'VALIDATION_FAILED';
    serve((p) => p === 'validation/frames.json' ? json(env) : undefined);
    expect(await loadValidation('frames')).toMatchObject({ status: 'ok' });
  });
  it('검증 실패와 달리 NO_DATA는 정상 검증 결과로 표시하지 않는다', async () => {
    const env = fixture('validation/frames.json'); env.quality = 'NO_DATA';
    serve((p) => p === 'validation/frames.json' ? json(env) : undefined);
    expect(await loadValidation('frames')).toMatchObject({ status: 'missing', reason: expect.stringContaining('NO_DATA') });
  });
});
