// 데이터 어댑터 (ARCHITECTURE 6.3). web/public/data 산출물만 읽는다. 실패하면 던지지 않고 'missing' 을 돌려준다.
import { DATA_BASE } from '../config';
import type {
  Envelope, EphemerisMeta, GridManifest, HorizonMask, LayerMeta, Lander, MastMasks, Mission, PowerRef, QualityEntry,
  Site, SourceEntry, StaticLayerName, Station, ValidationResult,
} from '../core/types';

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

function checkEnvelope<T>(r: Loaded<Envelope<T>>, schemaPrefix: string, path: string): Loaded<Envelope<T>> {
  if (r.status !== 'ok') return r;
  const env = r.value;
  if (!env || typeof env !== 'object' || !('data' in env)) return missing(`${path}: 형식이 다르다`);
  if (!env.schema?.startsWith(schemaPrefix)) return missing(`${path}: 스키마 ${env.schema} (기대 ${schemaPrefix})`);
  if (env.quality === 'VALIDATION_FAILED' || env.quality === 'NO_DATA') return missing(`${path}: 품질 ${env.quality}`);
  return r;
}

export async function loadManifest(): Promise<Loaded<DataManifest>> {
  const r = await getJson<DataManifest>('manifest.json');
  if (r.status === 'ok') manifest = r.value;
  return r;
}

export const loadSources = () => getJson<{ data: SourceEntry[] }>('sources.json');
export interface ArtemisRegion {
  id: string;
  name: string;
  code: string;
  area_km2: number;
  /** 경위도 고리 [lon, lat][] (GCS_Moon_2000) */
  rings: Array<Array<[number, number]>>;
}
export async function loadArtemisRegions() {
  return checkEnvelope(await getJson<Envelope<ArtemisRegion[]>>('catalog/artemis_regions.json'), 'luna.artemis_regions', 'catalog/artemis_regions.json');
}
export const loadQuality = () => getJson<{ data: Record<string, QualityEntry> }>('quality.json');

export async function loadCatalog<T extends 'sites' | 'missions' | 'landers' | 'stations' | 'power_refs'>(name: T) {
  type M = { sites: Site[]; missions: Mission[]; landers: Lander[]; stations: Station[]; power_refs: PowerRef[] };
  const path = `catalog/${name}.json`;
  return checkEnvelope(await getJson<Envelope<M[T]>>(path), `luna.${name}`, path);
}

export async function loadMask(path: string): Promise<Loaded<Envelope<HorizonMask>>> {
  const r = checkEnvelope(await getJson<Envelope<HorizonMask>>(path), 'luna.mask', path);
  if (r.status === 'ok' && r.value.data.elevation_deg.length * r.value.data.az_step_deg !== 360) return missing(`${path}: 방위 개수가 360° 와 맞지 않는다`);
  return r;
}

export async function loadMastMasks(siteId: string) {
  const path = `masks/heights/${siteId}.json`;
  return checkEnvelope(await getJson<Envelope<MastMasks>>(path), 'luna.mast_masks', path);
}

export interface EphemerisLoaded {
  env: Envelope<EphemerisMeta>;
  rows: Float32Array;
}
export async function loadEphemeris(jsonPath: string): Promise<Loaded<EphemerisLoaded>> {
  const env = checkEnvelope(await getJson<Envelope<EphemerisMeta>>(jsonPath), 'luna.ephemeris', jsonPath);
  if (env.status !== 'ok') return env;
  const dir = jsonPath.slice(0, jsonPath.lastIndexOf('/') + 1);
  const bin = await getBin(dir + env.value.data.bin);
  if (bin.status !== 'ok') return bin;
  const rows = new Float32Array(bin.value);
  if (rows.length !== env.value.data.count * 6) return missing(`${jsonPath}: 행 수가 manifest 와 다르다`);
  return ok({ env: env.value, rows });
}

export interface GridLoaded {
  env: Envelope<GridManifest>;
  cells: Uint32Array;
  horizon: Int16Array;
  layersEnv: Envelope<LayerMeta[]> | null;
}
export async function loadGrid(): Promise<Loaded<GridLoaded>> {
  const env = checkEnvelope(await getJson<Envelope<GridManifest>>('grid/manifest.json'), 'luna.grid', 'grid/manifest.json');
  if (env.status !== 'ok') return env;
  const m = env.value.data;
  const [c, h] = await Promise.all([getBin(`grid/${m.cells}`), getBin(`grid/${m.horizon.file}`)]);
  if (c.status !== 'ok') return c;
  if (h.status !== 'ok') return h;
  const cells = new Uint32Array(c.value);
  const horizon = new Int16Array(h.value);
  if (cells.length !== m.n_cells || horizon.length !== m.n_cells * m.horizon.n_az) return missing('grid: 길이가 manifest 와 다르다');
  const le = checkEnvelope(await getJson<Envelope<LayerMeta[]>>('grid/layers.json'), 'luna.layers', 'grid/layers.json');
  return ok({ env: env.value, cells, horizon, layersEnv: le.status === 'ok' ? le.value : null });
}

export async function loadLayer(meta: LayerMeta, n_cells: number): Promise<Loaded<Float32Array>> {
  const b = await getBin(`grid/${meta.file}`);
  if (b.status !== 'ok') return b;
  const a = new Float32Array(b.value);
  if (a.length !== n_cells) return missing(`${meta.file}: 길이가 다르다`);
  return ok(a);
}

export async function loadLayers(metas: LayerMeta[], n_cells: number) {
  const out: Partial<Record<StaticLayerName, Float32Array>> = {};
  await Promise.all(
    metas.map(async (m) => {
      const r = await loadLayer(m, n_cells);
      if (r.status === 'ok') out[m.name] = r.value;
    }),
  );
  return out;
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
export type TextureSet = { hillshade?: TextureInfo; wac?: TextureInfo; globe_2k?: TextureInfo; globe_8k?: TextureInfo };
export async function loadTextures() {
  return checkEnvelope(await getJson<Envelope<TextureSet>>('textures/textures.json'), 'luna.textures', 'textures/textures.json');
}
export const textureUrl = (file: string) => urlOf(`textures/${file}`);

/** 착륙지 주변 국지 음영기복 (파이프라인 s75, LOLA 30 m). 03 기지 배치 지도 배경용 */
export interface LocalSiteTex { file: string; lat_deg: number; lon_deg: number; elev_center_m: number; elev_min_m: number; elev_max_m: number; dem: string; missing_frac: number }
export interface LocalTerrain { half_km: number; size_px: number; m_per_px: number; frame: string; light: { az_deg: number; alt_deg: number; note: string }; sites: Record<string, LocalSiteTex> }
export async function loadLocalTerrain() {
  return checkEnvelope(await getJson<Envelope<LocalTerrain>>('local/local.json'), 'luna.local', 'local/local.json');
}
export const localUrl = (file: string) => urlOf(`local/${file}`);

export async function loadValidation(name: 'ephemeris' | 'masks' | 'illumination' | 'frames' | 'missions') {
  const path = `validation/${name}.json`;
  return checkEnvelope(await getJson<Envelope<ValidationResult[]>>(path), `luna.validation.${name}`, path);
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
  ellipseIndex ??= getJson<Envelope<{ half_km: number; sites: EllipseSiteInfo[] }>>('ellipse/index.json').then((r) => checkEnvelope(r, 'luna.ellipse', 'ellipse/index.json'));
  return ellipseIndex;
}
const patchCache = new Map<string, Promise<Loaded<ArrayBuffer>>>();
export function loadEllipsePatch(file: string) {
  if (!patchCache.has(file)) patchCache.set(file, getBin(file));
  return patchCache.get(file)!;
}
