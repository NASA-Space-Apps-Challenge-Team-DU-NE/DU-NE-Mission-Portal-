// 지평선 전용 지형 격자: 북극 5 km AEQD, 75°S–75°N 15 km 위도 띠 (전역 확장 안 B, 2026-11-15).
// 남극 격자(gridScore.ts)는 지도·순위·정적 레이어까지 쓰지만, 이 두 격자는 "임의 지점의 지평선 마스크"만 준다.
// 칸 번호 규칙은 파이프라인 luna/geo/polar.py (GridSpec·BandGridSpec) 와 같아야 한다.
import { DEG, R_MOON_KM } from './constants';
import type { Deg } from './types';
import { normLon } from './vec';

export type TerrainRegion = 'north' | 'global';

/** grid_north/manifest.json data (AEQD 북극: x=ρ·sinλ, y=−ρ·cosλ) */
export interface PolarTerrainManifest {
  projection: string;
  cell_km: number;
  nx: number;
  ny: number;
  x0_km: number;
  y0_km: number;
  lat_limit_deg: Deg;
  n_cells: number;
  cells: string;
  horizon: { file: string; az_step_deg: number; n_az: number; scale: number };
  observer_height_m: number;
}

/** grid_global/manifest.json data (luna.grid_bands.v1) */
export interface BandTerrainManifest {
  projection: string;
  cell_km: number;
  lat_max_deg: Deg;
  dlat_deg: Deg;
  n_rows: number;
  /** 띠마다 경도 칸 수 (남쪽 띠부터) */
  n_lon: number[];
  n_cells_total: number;
  n_cells: number;
  cells: string;
  horizon: { file: string; az_step_deg: number; n_az: number; scale: number };
  observer_height_m: number;
}

interface Common {
  region: TerrainRegion;
  cell_km: number;
  observer_height_m: number;
  horizon: Int16Array;
  hz: { az_step_deg: number; n_az: number; scale: number };
  /** 격자 번호 → horizon 행 (없으면 −1) */
  slot: Int32Array;
}
export interface PolarTerrainGrid extends Common { kind: 'polar'; m: PolarTerrainManifest }
export interface BandTerrainGrid extends Common { kind: 'band'; m: BandTerrainManifest; rowOffset: Int32Array }
export type TerrainGrid = PolarTerrainGrid | BandTerrainGrid;

function slots(size: number, cells: Uint32Array): Int32Array {
  const s = new Int32Array(size).fill(-1);
  for (let i = 0; i < cells.length; i++) s[cells[i]] = i;
  return s;
}

export function polarTerrainGrid(m: PolarTerrainManifest, cells: Uint32Array, horizon: Int16Array): PolarTerrainGrid {
  return { kind: 'polar', region: 'north', m, cell_km: m.cell_km, observer_height_m: m.observer_height_m, horizon, hz: m.horizon, slot: slots(m.nx * m.ny, cells) };
}

export function bandTerrainGrid(m: BandTerrainManifest, cells: Uint32Array, horizon: Int16Array): BandTerrainGrid {
  const rowOffset = new Int32Array(m.n_rows);
  for (let r = 1; r < m.n_rows; r++) rowOffset[r] = rowOffset[r - 1] + m.n_lon[r - 1];
  return { kind: 'band', region: 'global', m, rowOffset, cell_km: m.cell_km, observer_height_m: m.observer_height_m, horizon, hz: m.horizon, slot: slots(m.n_cells_total, cells) };
}

/** 위경도 → horizon 행 번호 (범위 밖·결측 −1) */
export function locateTerrainCell(g: TerrainGrid, lat: Deg, lon: Deg): number {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return -1;
  let id: number;
  if (g.kind === 'polar') {
    const m = g.m;
    if (lat < m.lat_limit_deg) return -1;
    const rho = R_MOON_KM * (90 - lat) * DEG, l = lon * DEG;
    const x = rho * Math.sin(l), y = -rho * Math.cos(l);
    const col = Math.floor((x - m.x0_km) / m.cell_km), row = Math.floor((m.y0_km - y) / m.cell_km);
    if (col < 0 || col >= m.nx || row < 0 || row >= m.ny) return -1;
    id = row * m.nx + col;
  } else {
    const m = g.m;
    const row = Math.floor((lat + m.lat_max_deg) / m.dlat_deg);
    if (row < 0 || row >= m.n_rows) return -1;
    const n = m.n_lon[row];
    const col = Math.min(n - 1, Math.floor(((normLon(lon) + 180) % 360) / 360 * n));
    id = g.rowOffset[row] + col;
  }
  return id >= 0 && id < g.slot.length ? g.slot[id] : -1;
}

/** 칸의 지평선 마스크 (HorizonMask 와 같은 모양) */
export function terrainCellMask(g: TerrainGrid, i: number) {
  const { n_az, az_step_deg, scale } = g.hz;
  const el = new Array<number>(n_az);
  for (let k = 0; k < n_az; k++) el[k] = g.horizon[i * n_az + k] * scale;
  return { az_step_deg, elevation_deg: el };
}

export interface TerrainHit {
  region: TerrainRegion;
  cell: number;
  cell_km: number;
  observer_height_m: number;
  mask: { az_step_deg: number; elevation_deg: number[] };
}

/** 지점을 덮는 첫 격자의 지평선. 없으면 null (구면 지평선으로 계산) */
export function terrainMaskAt(grids: readonly TerrainGrid[], lat: Deg, lon: Deg): TerrainHit | null {
  for (const g of grids) {
    const i = locateTerrainCell(g, lat, lon);
    if (i >= 0) return { region: g.region, cell: i, cell_km: g.cell_km, observer_height_m: g.observer_height_m, mask: terrainCellMask(g, i) };
  }
  return null;
}
