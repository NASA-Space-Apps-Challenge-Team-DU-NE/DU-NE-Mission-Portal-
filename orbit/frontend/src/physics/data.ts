import { add, inverse3, matVec, norm, position, R_MOON, sub, velocity, type V3 } from './math';

export class DataUnavailable extends Error { constructor(message: string) { super(message); this.name = 'DataUnavailable'; } }
export interface FrameSample { t_s: number; rotation: number[]; derivative: number[] }
export interface FramesData {
  fixed_frame: string; resolved_frame: string; inertial_frame: string; epoch_utc: string; epoch_et: number;
  step_s: number; samples: FrameSample[]; coverage_s: [number, number]; [key: string]: unknown;
}
export class Frames {
  constructor(public data: FramesData) {}
  time(utc: string): number {
    const t = (Date.parse(utc) - Date.parse(this.data.epoch_utc)) / 1000;
    if (!Number.isFinite(t)) throw new DataUnavailable('Invalid UTC landing time');
    return t;
  }
  at(t: number): { r: number[]; d: number[] } {
    const samples = this.data.samples;
    if (t < samples[0].t_s || t > samples[samples.length - 1].t_s) throw new DataUnavailable('SPICE orientation table does not cover the complete flight. Select a date within the supplied range.');
    let lo = 0, hi = samples.length - 1;
    while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if (samples[mid].t_s <= t) lo = mid; else hi = mid; }
    const a = samples[lo], b = samples[hi], h = b.t_s - a.t_s, u = (t - a.t_s) / h;
    // Cubic Hermite interpolation of SPICE R and dR/dt. Derivative below is
    // the exact derivative of that interpolant, preserving velocity kinematics.
    const h00 = 2 * u ** 3 - 3 * u ** 2 + 1, h10 = u ** 3 - 2 * u ** 2 + u;
    const h01 = -2 * u ** 3 + 3 * u ** 2, h11 = u ** 3 - u ** 2;
    const dh00 = (6 * u ** 2 - 6 * u) / h, dh10 = 3 * u ** 2 - 4 * u + 1;
    const dh01 = (-6 * u ** 2 + 6 * u) / h, dh11 = 3 * u ** 2 - 2 * u;
    return {
      r: a.rotation.map((x, i) => h00 * x + h10 * h * a.derivative[i] + h01 * b.rotation[i] + h11 * h * b.derivative[i]),
      d: a.rotation.map((x, i) => dh00 * x + dh10 * a.derivative[i] + dh01 * b.rotation[i] + dh11 * b.derivative[i]),
    };
  }
  toInertial(state: number[], t: number): number[] {
    const { r, d } = this.at(t), p = position(state), v = velocity(state);
    return [...matVec(r, p), ...add(matVec(d, p), matVec(r, v))];
  }
  toFixed(state: number[], t: number): number[] {
    const { r, d } = this.at(t), inv = inverse3(r), p = matVec(inv, position(state));
    return [...p, ...matVec(inv, sub(velocity(state), matVec(d, p)))];
  }
}
export function latLon(p: V3): [number, number] {
  return [Math.asin(Math.max(-1, Math.min(1, p[2] / norm(p)))) * 180 / Math.PI, Math.atan2(p[1], p[0]) * 180 / Math.PI];
}
export function surfacePosition(lat: number, lon: number, elevation: number): V3 {
  const a = lat * Math.PI / 180, b = lon * Math.PI / 180, r = R_MOON + elevation;
  return [r * Math.cos(a) * Math.cos(b), r * Math.cos(a) * Math.sin(b), r * Math.sin(a)];
}
export interface TerrainIndex {
  rows: number; cols: number; tile_size: number; tile_path: string; scale_m: number; reference_radius_m: number;
  pixel_m: number; line_projection_offset: number; sample_projection_offset: number; min_lat: number; max_lat: number;
  nodata: number; tiles?: Array<{ row: number; col: number; sha256: string; bytes: number }>; [key: string]: unknown;
}
export interface GlobalIndex { rows: number; cols: number; pixels_per_degree?: number; scale_m: number; offset_m?: number; dtype?: string; longitude_origin_deg?: number; model?: string; nodata?: number; data_path?: string; sha256?: string; [key: string]: unknown }
export interface Elevation { height: number | null; source: 'LOLA_240M' | 'LOLA_GLOBAL' | 'UNAVAILABLE' }

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url); if (!r.ok) throw new DataUnavailable(`Required static NASA asset unavailable: ${url} (${r.status})`);
  try { return await r.json(); } catch { throw new DataUnavailable(`Invalid JSON in NASA metadata: ${url}`); }
}
async function verifyHash(buf: ArrayBuffer, expected: string, label: string): Promise<void> {
  if (!globalThis.crypto?.subtle) throw new DataUnavailable('NASA data integrity checks require HTTPS or localhost with Web Crypto support.');
  const digest = await crypto.subtle.digest('SHA-256', buf);
  const hash = Array.from(new Uint8Array(digest), v => v.toString(16).padStart(2, '0')).join('');
  if (hash !== expected) throw new DataUnavailable(`LOLA data integrity check failed: ${label}`);
}
export class TerrainData {
  private tiles = new Map<string, Int16Array>();
  private pending = new Map<string, Promise<void>>();
  public globalIndex?: GlobalIndex;
  public globalValues?: Int16Array | Uint16Array;
  constructor(public index: TerrainIndex, public root: string) {}
  pixel(lat: number, lon: number): [number, number] | null {
    const m = this.index;
    if (lat < m.min_lat || lat > m.max_lat) return null;
    const rho = 2 * m.reference_radius_m * Math.tan(Math.PI / 4 + lat * Math.PI / 360), l = lon * Math.PI / 180;
    const row = m.line_projection_offset - rho * Math.cos(l) / m.pixel_m;
    const col = m.sample_projection_offset + rho * Math.sin(l) / m.pixel_m;
    if (row < 0 || col < 0 || row >= m.rows - 1 || col >= m.cols - 1) return null;
    return [row, col];
  }
  private key(row: number, col: number): string { return `${Math.floor(row / this.index.tile_size)}_${Math.floor(col / this.index.tile_size)}`; }
  async loadTile(row: number, col: number): Promise<void> {
    const key = this.key(row, col); if (this.tiles.has(key)) return;
    if (this.pending.has(key)) return this.pending.get(key);
    const [r, c] = key.split('_');
    const path = this.index.tile_path.replace('{row}', r).replace('{col}', c);
    const p = (async () => {
      const res = await fetch(this.root + path); if (!res.ok) throw new DataUnavailable(`LOLA tile missing: ${path}`);
      const buf = await res.arrayBuffer();
      if (buf.byteLength !== this.index.tile_size ** 2 * 2) throw new DataUnavailable(`LOLA tile has invalid byte length: ${path}`);
      const expected = this.index.tiles?.find(t => t.row === Number(r) && t.col === Number(c));
      if (expected) await verifyHash(buf, expected.sha256, path);
      this.tiles.set(key, new Int16Array(buf));
    })();
    this.pending.set(key, p);
    try { await p; } finally { this.pending.delete(key); }
  }
  async prepare(points: Array<[number, number]>): Promise<void> {
    const jobs = new Map<string, [number, number]>();
    for (const [lat, lon] of points) {
      const px = this.pixel(lat, lon); if (!px) continue;
      const [r, c] = px.map(Math.floor);
      for (const dr of [0, 1]) for (const dc of [0, 1]) jobs.set(this.key(r + dr, c + dc), [r + dr, c + dc]);
    }
    const entries = [...jobs.values()];
    // Bound requests so a long trajectory does not saturate a static host.
    for (let i = 0; i < entries.length; i += 6) await Promise.all(entries.slice(i, i + 6).map(([r, c]) => this.loadTile(r, c)));
  }
  private dn(row: number, col: number): number | null {
    const m = this.index, tile = this.tiles.get(this.key(row, col)); if (!tile) return null;
    // Edge tiles are padded to tile_size by the preprocessing pipeline.
    const x = tile[(row % m.tile_size) * m.tile_size + col % m.tile_size];
    return x === undefined || x === m.nodata ? null : x * m.scale_m;
  }
  elevation(lat: number, lon: number): Elevation {
    const px = this.pixel(lat, lon);
    if (px) {
      const [r, c] = px, ri = Math.floor(r), ci = Math.floor(c), fy = r - ri, fx = c - ci;
      const q = [this.dn(ri, ci), this.dn(ri, ci + 1), this.dn(ri + 1, ci), this.dn(ri + 1, ci + 1)];
      if (q.every(x => x !== null)) return { height: (q[0]! * (1 - fx) + q[1]! * fx) * (1 - fy) + (q[2]! * (1 - fx) + q[3]! * fx) * fy, source: 'LOLA_240M' };
      return { height: null, source: 'UNAVAILABLE' };
    }
    const m = this.globalIndex, vals = this.globalValues;
    if (!m || !vals) return { height: null, source: 'UNAVAILABLE' };
    const ppd = m.pixels_per_degree ?? m.cols / 360;
    if (m.model === 'max-pooled') {
      const row = Math.max(0, Math.min(m.rows - 1, Math.floor((90 - lat) * ppd)));
      const col = Math.floor((((lon - (m.longitude_origin_deg ?? -180)) % 360 + 360) % 360) * ppd) % m.cols;
      const dn = vals[row * m.cols + col];
      return dn === undefined || dn === m.nodata ? { height: null, source: 'UNAVAILABLE' } : { height: dn * m.scale_m + (m.offset_m ?? 0), source: 'LOLA_GLOBAL' };
    }
    const rr = Math.max(0, Math.min(m.rows - 1, (90 - lat) * ppd - .5));
    const cc = ((((lon - (m.longitude_origin_deg ?? 0)) % 360) + 360) % 360) * ppd - .5;
    const r0 = Math.floor(rr), r1 = Math.min(r0 + 1, m.rows - 1), c0 = ((Math.floor(cc) % m.cols) + m.cols) % m.cols, c1 = (c0 + 1) % m.cols;
    const fy = rr - r0, fx = cc - Math.floor(cc);
    const q = [vals[r0 * m.cols + c0], vals[r0 * m.cols + c1], vals[r1 * m.cols + c0], vals[r1 * m.cols + c1]];
    if (q.some(x => x === m.nodata || x === undefined)) return { height: null, source: 'UNAVAILABLE' };
    return { height: ((q[0] * (1 - fx) + q[1] * fx) * (1 - fy) + (q[2] * (1 - fx) + q[3] * fx) * fy) * m.scale_m + (m.offset_m ?? 0), source: 'LOLA_GLOBAL' };
  }
  async roi(lat: number, lon: number, sizeM = 18_000, n = 65) {
    const center = surfacePosition(lat, lon, 0), a = lat * Math.PI / 180, b = lon * Math.PI / 180;
    const east: V3 = [-Math.sin(b), Math.cos(b), 0], north: V3 = [-Math.sin(a) * Math.cos(b), -Math.sin(a) * Math.sin(b), Math.cos(a)];
    const points: [number, number][] = [];
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const e = (x / (n - 1) - .5) * sizeM, no = (y / (n - 1) - .5) * sizeM;
      points.push(latLon([center[0] + e * east[0] + no * north[0], center[1] + e * east[1] + no * north[1], center[2] + e * east[2] + no * north[2]]));
    }
    await this.prepare(points);
    const elevations = points.map(([a, b]) => this.elevation(a, b));
    if (elevations.some(e => e.height === null || e.source !== 'LOLA_240M')) return { status: 'TERRAIN DATA UNAVAILABLE', message: 'The entire landing-view ROI is not covered by the native 240m DEM.' };
    const heights = elevations.map(e => e.height);
    const positions_m = points.map(([a, b], i) => surfacePosition(a, b, heights[i]!)), indices: number[] = [];
    for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) { const k = y * n + x; indices.push(k, k + 1, k + n, k + 1, k + n + 1, k + n); }
    return { status: 'AVAILABLE', positions_m, indices, width: n, height: n, source: 'NASA LOLA LDEM_75S_240M; bilinear sampled', vertical_exaggeration: 1 };
  }
}
export interface Assets { frames: Frames; terrain: TerrainData }
export async function loadAssets(base = '/data/'): Promise<Assets> {
  const [f, index] = await Promise.all([getJson<FramesData>(base + 'frames.json'), getJson<TerrainIndex>(base + 'terrain/index.json')]);
  const terrain = new TerrainData(index, base + 'terrain/');
  try {
    terrain.globalIndex = await getJson<GlobalIndex>(base + 'terrain/global.json');
    const r = await fetch(base + 'terrain/' + (terrain.globalIndex.data_path ?? 'global.bin'));
    if (r.ok) {
      const buf = await r.arrayBuffer(), m = terrain.globalIndex;
      if (buf.byteLength !== m.rows * m.cols * 2) throw new DataUnavailable('Global LOLA model has an invalid byte length.');
      if (m.sha256) await verifyHash(buf, m.sha256, 'global.bin');
      terrain.globalValues = m.dtype === 'uint16le' ? new Uint16Array(buf) : new Int16Array(buf);
    }
  } catch { /* Explicit UNAVAILABLE result where absent; never a zero-height substitute. */ }
  return { frames: new Frames(f), terrain };
}
