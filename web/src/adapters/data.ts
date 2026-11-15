// 데이터 어댑터 (ARCHITECTURE 6.3). web/public/data 산출물만 읽는다. 실패하면 던지지 않고 'missing' 을 돌려준다.
import { DATA_BASE } from '../config';
import { artemisCheck, bandTerrainCheck, catalogCheck, ellipseCheck, ephemerisCheck, ephemerisRowsCheck, extraChecks, gridCheck, layerCheck, layersCheck, localCheck, manifestCheck, maskCheck, mastCheck, object, polarTerrainCheck, quality, qualityCheck, sourcesCheck, texturesCheck, validationRowsCheck, type Check, type ExtraValidationName } from './schemaChecks';
import type {
  Envelope, EphemerisMeta, GridManifest, HorizonMask, LayerMeta, Lander, MastMasks, Mission, PowerRef, QualityEntry,
  Site, SourceEntry, StaticLayerName, Station, ValidationResult,
} from '../core/types';
import { bandTerrainGrid, polarTerrainGrid, type BandTerrainManifest, type PolarTerrainManifest, type TerrainGrid, type TerrainRegion } from '../core/terrainGrids';
import type { GridRegion } from '../core/gridScore';

export type Loaded<T> = { status: 'ok'; value: T } | { status: 'missing'; reason: string };
export const ok = <T>(value: T): Loaded<T> => ({ status: 'ok', value });
export const missing = <T>(reason: string): Loaded<T> => ({ status: 'missing', reason });

interface ManifestFile {
  path: string;
  bytes: number;
  sha256: string;
}
export interface DataManifest {
  schema: string;
  generated_utc: string;
  total_bytes: number;
  budget_ok: boolean;
  files: ManifestFile[];
}

let manifest: DataManifest | null = null;
const shaOf = (path: string) => manifest?.files.find((f) => f.path === path)?.sha256?.slice(0, 12);
const urlOf = (path: string) => {
  const v = shaOf(path);
  return `${DATA_BASE}${path}${v ? `?v=${v}` : ''}`;
};

async function getJson<T>(path: string): Promise<Loaded<T>> {
  try {
    const r = await fetch(urlOf(path));
    if (!r.ok) return missing(`${path}: HTTP ${r.status}`);
    const ct = r.headers.get('content-type') ?? '';
    if (ct.includes('text/html')) return missing(`${path}: 파일 없음`);
    return ok((await r.json()) as T);
  } catch (e) {
    return missing(`${path}: ${(e as Error).message}`);
  }
}

async function getBin(path: string): Promise<Loaded<ArrayBuffer>> {
  try {
    const r = await fetch(urlOf(path));
    if (!r.ok) return missing(`${path}: HTTP ${r.status}`);
    if ((r.headers.get('content-type') ?? '').includes('text/html')) return missing(`${path}: 파일 없음`);
    return ok(await r.arrayBuffer());
  } catch (e) {
    return missing(`${path}: ${(e as Error).message}`);
  }
}

/** 이 앱이 읽을 수 있는 스키마 버전 (접두사만 맞는 v99 등은 거부) */
const SCHEMA_VERSION = 'v1';
const BLOCKED: ReadonlyArray<string> = ['VALIDATION_FAILED', 'NO_DATA'];

function checkEnvelope<T>(r: Loaded<Envelope<T>>, schemaPrefix: string, path: string, dataCheck: Check, allowFailedValidation = false, minimal = false): Loaded<Envelope<T>> {
  if (r.status !== 'ok') return r;
  const env = r.value;
  if (!env || typeof env !== 'object' || !('data' in env)) return missing(`${path}: 형식이 다르다`);
  if (env.schema !== `${schemaPrefix}.${SCHEMA_VERSION}`) return missing(`${path}: 스키마 ${typeof env.schema === 'string' ? env.schema : '형식 오류'} (기대 ${schemaPrefix}.${SCHEMA_VERSION})`);
  if (!minimal && (!quality(env.quality) || !['real', 'approx', 'assumed', 'missing'].includes(env.kind) || !Array.isArray(env.provenance) || !env.provenance.every(object) || !Array.isArray(env.notes) || !env.notes.every((x) => typeof x === 'string'))) return missing(`${path}: 품질·출처 메타 형식이 다르다`);
  if (env.quality === 'NO_DATA' || (env.quality === 'VALIDATION_FAILED' && !allowFailedValidation)) return missing(`${path}: 품질 ${env.quality}`);
  let bad: string | null;
  try { bad = dataCheck(env.data); } catch { bad = '내부 데이터 구조가 다르다'; }
  if (bad) return missing(`${path}: ${bad}`);
  return r;
}

/** 바이너리 길이·정렬 검사 후 형식 배열 생성 (3바이트 파일 등은 RangeError 대신 missing) */
function typed<A>(buf: ArrayBuffer, Ctor: { new (b: ArrayBuffer): A; BYTES_PER_ELEMENT: number }, path: string): Loaded<A> {
  if (buf.byteLength % Ctor.BYTES_PER_ELEMENT !== 0) return missing(`${path}: 바이트 길이 ${buf.byteLength} 가 ${Ctor.BYTES_PER_ELEMENT} 의 배수가 아니다`);
  return ok(new Ctor(buf));
}

export async function loadManifest(): Promise<Loaded<DataManifest>> {
  // 검증 전에 전역 캐시에 넣지 않는다. 이전에 실패한 목록도 다음 로드를 오염시키지 않는다.
  manifest = null;
  const r = await getJson<DataManifest>('manifest.json');
  if (r.status === 'ok') {
    const bad = manifestCheck(r.value);
    if (bad) return missing(`manifest.json: ${bad}`);
    manifest = r.value;
  }
  return r;
}

export async function loadSources() {
  return checkEnvelope(await getJson<Envelope<SourceEntry[]>>('sources.json'), 'luna.sources', 'sources.json', sourcesCheck, false, true);
}
export interface ArtemisRegion {
  id: string;
  name: string;
  code: string;
  area_km2: number;
  /** 경위도 고리 [lon, lat][] (GCS_Moon_2000) */
  rings: Array<Array<[number, number]>>;
}
export async function loadArtemisRegions() {
  return checkEnvelope(await getJson<Envelope<ArtemisRegion[]>>('catalog/artemis_regions.json'), 'luna.artemis_regions', 'catalog/artemis_regions.json', artemisCheck);
}
export async function loadQuality() {
  return checkEnvelope(await getJson<Envelope<Record<string, QualityEntry>>>('quality.json'), 'luna.quality', 'quality.json', qualityCheck, false, true);
}

export async function loadCatalog<T extends 'sites' | 'missions' | 'landers' | 'stations' | 'power_refs'>(name: T) {
  type M = { sites: Site[]; missions: Mission[]; landers: Lander[]; stations: Station[]; power_refs: PowerRef[] };
  const path = `catalog/${name}.json`;
  return checkEnvelope(await getJson<Envelope<M[T]>>(path), `luna.${name}`, path, catalogCheck(name));
}

export async function loadMask(path: string): Promise<Loaded<Envelope<HorizonMask>>> {
  return checkEnvelope(await getJson<Envelope<HorizonMask>>(path), 'luna.mask', path, maskCheck);
}

export async function loadMastMasks(siteId: string) {
  const path = `masks/heights/${siteId}.json`;
  return checkEnvelope(await getJson<Envelope<MastMasks>>(path), 'luna.mast_masks', path, mastCheck);
}

export interface EphemerisLoaded {
  env: Envelope<EphemerisMeta>;
  rows: Float32Array;
}
export async function loadEphemeris(jsonPath: string): Promise<Loaded<EphemerisLoaded>> {
  const env = checkEnvelope(await getJson<Envelope<EphemerisMeta>>(jsonPath), 'luna.ephemeris', jsonPath, ephemerisCheck);
  if (env.status !== 'ok') return env;
  const dir = jsonPath.slice(0, jsonPath.lastIndexOf('/') + 1);
  const bin = await getBin(dir + env.value.data.bin);
  if (bin.status !== 'ok') return bin;
  const tr = typed(bin.value, Float32Array, dir + env.value.data.bin);
  if (tr.status !== 'ok') return tr;
  const rows = tr.value;
  if (rows.length !== env.value.data.count * 6) return missing(`${jsonPath}: 행 수가 manifest 와 다르다`);
  const badRows = ephemerisRowsCheck(rows);
  if (badRows) return missing(`${jsonPath}: ${badRows}`);
  return ok({ env: env.value, rows });
}

export interface GridLoaded {
  /** 지도·점수 격자 지역 (남극 grid/, 북극 grid_north/, 전역 grid_global/) */
  region: GridRegion;
  env: Envelope<GridManifest | PolarTerrainManifest | BandTerrainManifest>;
  cells: Uint32Array;
  horizon: Int16Array;
  layersEnv: Envelope<LayerMeta[]> | null;
  /** 격자 자체는 사용 가능해도 정적 레이어 목록 실패는 숨기지 않는다. */
  layersReason?: string;
}
export async function loadGrid(): Promise<Loaded<GridLoaded>> {
  const env = checkEnvelope(await getJson<Envelope<GridManifest>>('grid/manifest.json'), 'luna.grid', 'grid/manifest.json', gridCheck);
  if (env.status !== 'ok') return env;
  const m = env.value.data;
  const [c, h] = await Promise.all([getBin(`grid/${m.cells}`), getBin(`grid/${m.horizon.file}`)]);
  if (c.status !== 'ok') return c;
  if (h.status !== 'ok') return h;
  const ct = typed(c.value, Uint32Array, `grid/${m.cells}`);
  if (ct.status !== 'ok') return ct;
  const ht = typed(h.value, Int16Array, `grid/${m.horizon.file}`);
  if (ht.status !== 'ok') return ht;
  const cells = ct.value, horizon = ht.value;
  if (cells.length !== m.n_cells || horizon.length !== m.n_cells * m.horizon.n_az) return missing('grid: 길이가 manifest 와 다르다');
  if (cells.some((cell) => cell >= m.nx * m.ny) || new Set(cells).size !== cells.length) return missing('grid: 셀 인덱스가 범위를 벗어나거나 중복된다');
  if (horizon.some((h) => Math.abs(h * m.horizon.scale) > 90)) return missing('grid: 지평선 고도각이 범위를 벗어난다');
  const le = checkEnvelope(await getJson<Envelope<LayerMeta[]>>('grid/layers.json'), 'luna.layers', 'grid/layers.json', layersCheck);
  return ok({ region: 'south', env: env.value, cells, horizon, layersEnv: le.status === 'ok' ? le.value : null, ...(le.status === 'missing' ? { layersReason: le.reason } : {}) });
}

export const gridDir = (r: GridRegion) => (r === 'south' ? 'grid' : r === 'north' ? 'grid_north' : 'grid_global');

/** 지평선 전용 격자 (북극 grid_north, 전역 grid_global). 칸·길이·고도각 범위를 검사한다 */
export async function loadTerrainGrid(region: TerrainRegion): Promise<Loaded<{ grid: TerrainGrid; env: Envelope<unknown>; raw: GridLoaded }>> {
  const dir = region === 'north' ? 'grid_north' : 'grid_global';
  const path = `${dir}/manifest.json`;
  const env = region === 'north'
    ? checkEnvelope(await getJson<Envelope<PolarTerrainManifest>>(path), 'luna.grid', path, polarTerrainCheck)
    : checkEnvelope(await getJson<Envelope<BandTerrainManifest>>(path), 'luna.grid_bands', path, bandTerrainCheck);
  if (env.status !== 'ok') return env;
  const m = env.value.data;
  const [c, h] = await Promise.all([getBin(`${dir}/${m.cells}`), getBin(`${dir}/${m.horizon.file}`)]);
  if (c.status !== 'ok') return c;
  if (h.status !== 'ok') return h;
  const ct = typed(c.value, Uint32Array, `${dir}/${m.cells}`);
  if (ct.status !== 'ok') return ct;
  const ht = typed(h.value, Int16Array, `${dir}/${m.horizon.file}`);
  if (ht.status !== 'ok') return ht;
  const cells = ct.value, horizon = ht.value;
  const size = 'nx' in m ? m.nx * m.ny : m.n_cells_total;
  if (cells.length !== m.n_cells || horizon.length !== m.n_cells * m.horizon.n_az) return missing(`${dir}: 길이가 manifest 와 다르다`);
  if (cells.some((cell) => cell >= size) || new Set(cells).size !== cells.length) return missing(`${dir}: 셀 인덱스가 범위를 벗어나거나 중복된다`);
  if (horizon.some((v) => Math.abs(v * m.horizon.scale) > 90)) return missing(`${dir}: 지평선 고도각이 범위를 벗어난다`);
  const grid = 'nx' in m ? polarTerrainGrid(m, cells, horizon) : bandTerrainGrid(m, cells, horizon);
  // 정적 지도 레이어 목록 (s50_regions). 실패해도 지평선은 쓴다
  const lp = `${dir}/layers.json`;
  const le = checkEnvelope(await getJson<Envelope<LayerMeta[]>>(lp), 'luna.layers', lp, layersCheck);
  const raw: GridLoaded = {
    region, env: env.value as GridLoaded['env'], cells, horizon,
    layersEnv: le.status === 'ok' ? le.value : null, ...(le.status === 'missing' ? { layersReason: le.reason } : {}),
  };
  return ok({ grid, env: env.value as Envelope<unknown>, raw });
}

export async function loadLayer(meta: LayerMeta, n_cells: number, dir = 'grid'): Promise<Loaded<Float32Array>> {
  if (!object(meta) || layerCheck(meta) || !Number.isSafeInteger(n_cells) || n_cells < 1) return missing('레이어 메타 또는 칸 개수가 유효하지 않다');
  // 레이어별 품질: 사용 금지 품질(VALIDATION_FAILED·NO_DATA)은 수치 계산에 넣지 않는다
  if (BLOCKED.includes(meta.quality)) return missing(`${meta.file}: 품질 ${meta.quality}`);
  const b = await getBin(`${dir}/${meta.file}`);
  if (b.status !== 'ok') return b;
  const t = typed(b.value, Float32Array, meta.file);
  if (t.status !== 'ok') return t;
  if (t.value.length !== n_cells) return missing(`${meta.file}: 길이가 다르다`);
  // 정적 레이어의 NaN은 정상적인 결측 표시지만 Infinity는 계산값으로 사용할 수 없다.
  if (t.value.some((v) => !Number.isFinite(v) && !Number.isNaN(v))) return missing(`${meta.file}: 무한대 값이 있다`);
  return t;
}

/** 레이어 묶음. 실패한 레이어의 사유는 reasons 로 돌려준다 */
export async function loadLayers(metas: LayerMeta[], n_cells: number, dir = 'grid'): Promise<{ layers: Partial<Record<StaticLayerName, Float32Array>>; reasons: Partial<Record<StaticLayerName, string>> }> {
  const out: Partial<Record<StaticLayerName, Float32Array>> = {};
  const reasons: Partial<Record<StaticLayerName, string>> = {};
  await Promise.all(
    metas.map(async (m) => {
      const r = await loadLayer(m, n_cells, dir);
      if (r.status === 'ok') out[m.name] = r.value;
      else reasons[m.name] = r.reason;
    }),
  );
  return { layers: out, reasons };
}

export interface TextureInfo {
  file: string;
  size?: number;
  radius_km?: number;
  width?: number;
  height?: number;
  projection: string;
  source?: string;
}
export type TextureSet = { hillshade?: TextureInfo; wac?: TextureInfo; globe_2k?: TextureInfo; globe_8k?: TextureInfo; relief_south?: TextureInfo; relief_north?: TextureInfo; relief_global?: TextureInfo };
export async function loadTextures() {
  return checkEnvelope(await getJson<Envelope<TextureSet>>('textures/textures.json'), 'luna.textures', 'textures/textures.json', texturesCheck);
}
export const textureUrl = (file: string) => urlOf(`textures/${file}`);

/** 착륙지 주변 국지 음영기복 (파이프라인 s75, LOLA 30 m). 03 기지 배치 지도 배경용 */
export interface LocalSiteTex { file: string; lat_deg: number; lon_deg: number; elev_center_m: number; elev_min_m: number; elev_max_m: number; dem: string; missing_frac: number; elev_file?: string; elev_px?: number; elev_offset_m?: number; elev_step_m?: number }
export interface LocalTerrain { half_km: number; size_px: number; m_per_px: number; frame: string; light: { az_deg: number; alt_deg: number; note: string }; sites: Record<string, LocalSiteTex> }
export async function loadLocalTerrain() {
  return checkEnvelope(await getJson<Envelope<LocalTerrain>>('local/local.json'), 'luna.local', 'local/local.json', localCheck);
}
export const localUrl = (file: string) => urlOf(`local/${file}`);

export async function loadValidation(name: 'ephemeris' | 'masks' | 'illumination' | 'frames' | 'missions' | 'mast' | 'wueller') {
  const path = `validation/${name}.json`;
  // 검증 실패 결과도 비교 화면에서는 읽어야 한다. 계산용 어댑터의 품질 차단과 구분한다.
  return checkEnvelope(await getJson<Envelope<ValidationResult[]>>(path), `luna.validation.${name}`, path, validationRowsCheck, true);
}

/** 추가 검증 카드도 공통 스키마 검사와 manifest 버전 URL을 사용한다. */
export async function loadValidationExtra<T>(name: ExtraValidationName): Promise<Loaded<Envelope<T>>> {
  const path = `validation/${name}.json`;
  const schema = name === 'layers_minerals' ? 'minerals' : name;
  return checkEnvelope(await getJson<Envelope<T>>(path), `luna.validation.${schema}`, path, extraChecks[name], true);
}

// ───────── 착륙 오차 타원 국지 경사 패치 (s35) ─────────
export interface EllipseSiteInfo {
  id: string;
  file: string;
  res_m: number;
  size: number;
  center_px: [number, number];
  east_xy: [number, number];
  north_xy: [number, number];
  /** 픽셀별 관측 수 지도가 있는 제품인지 (30 m 는 없음) */
  obs_known?: boolean;
  observed_frac: number | null;
  nodata_frac: number;
  source: string;
  /** 타원 반경에 더 높은 해상도 DEM 범위 밖이 걸려 이 해상도로 대체했을 때, 원래 해상도 */
  fallback_from_m?: number;
}
let ellipseIndex: Promise<Loaded<Envelope<{ half_km: number; sites: EllipseSiteInfo[] }>>> | null = null;
export function loadEllipseIndex() {
  ellipseIndex ??= getJson<Envelope<{ half_km: number; sites: EllipseSiteInfo[] }>>('ellipse/index.json').then((r) => checkEnvelope(r, 'luna.ellipse', 'ellipse/index.json', ellipseCheck));
  return ellipseIndex;
}
const patchCache = new Map<string, Promise<Loaded<ArrayBuffer>>>();
export function loadEllipsePatch(file: string) {
  if (!patchCache.has(file)) patchCache.set(file, getBin(file));
  return patchCache.get(file)!;
}
