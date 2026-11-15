// 북극·전역 지평선 격자: 칸 찾기가 파이프라인(luna/geo/polar.py)과 같은 칸을 고르는지, 실제 산출물로 확인한다.
import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bandTerrainCheck, polarTerrainCheck } from '../adapters/schemaChecks';
import { bandTerrainGrid, locateTerrainCell, polarTerrainGrid, terrainMaskAt, type BandTerrainManifest, type PolarTerrainManifest } from './terrainGrids';

const root = new URL('../../public/data/', import.meta.url);
const has = existsSync(new URL('grid_global/manifest.json', root)) && existsSync(new URL('grid_north/manifest.json', root));
const bin = <A>(p: string, C: { new (b: ArrayBuffer): A }) => { const b = readFileSync(new URL(p, root)); return new C(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };

describe.skipIf(!has)('terrain grids (실제 산출물)', () => {
  const nm = JSON.parse(readFileSync(new URL('grid_north/manifest.json', root), 'utf8'));
  const gm = JSON.parse(readFileSync(new URL('grid_global/manifest.json', root), 'utf8'));
  const north = polarTerrainGrid(nm.data as PolarTerrainManifest, bin('grid_north/cells.u32', Uint32Array), bin('grid_north/horizon.i16', Int16Array));
  const band = bandTerrainGrid(gm.data as BandTerrainManifest, bin('grid_global/cells.u32', Uint32Array), bin('grid_global/horizon.i16', Int16Array));

  it('manifest 형식 검사를 통과한다', () => {
    expect(polarTerrainCheck(nm.data)).toBeNull();
    expect(bandTerrainCheck(gm.data)).toBeNull();
  });

  it('띠 격자: 파이프라인 BandGridSpec.locate 와 같은 칸', () => {
    // 기준값: pipeline BandGridSpec(15, 75).locate (2026-11-15 생성)
    const pts: Array<[number, number, number]> = [
      [0.674, 23.473, 82978], [-43.3, -11.36, 23851], [17.0, 59.1, 106751], [-74.99, 179.99, 191],
      [74.99, -179.99, 163480], [26.13, 3.63, 118853], [-20.38, -102.5, 52004],
    ];
    for (const [la, lo, cell] of pts) expect(locateTerrainCell(band, la, lo)).toBe(cell);
    expect(locateTerrainCell(band, 75.01, 0)).toBe(-1);
    expect(locateTerrainCell(band, -75.01, 0)).toBe(-1);
  });

  it('북극 격자: 파이프라인 GridSpec(5, 75) 북극 투영과 같은 칸 (경도 0° = −y)', () => {
    const pts: Array<[number, number, number]> = [[89.5, 0, 13633], [85, 90, 13117], [80, -135, 5513], [75.5, 10, 25837], [88, 179, 10728]];
    for (const [la, lo, cell] of pts) expect(locateTerrainCell(north, la, lo)).toBe(cell);
    expect(locateTerrainCell(north, 74.9, 0)).toBe(-1);
    expect(locateTerrainCell(north, -80, 0)).toBe(-1);
  });

  it('terrainMaskAt: 지역 선택과 상식 범위', () => {
    const grids = [north, band];
    expect(terrainMaskAt(grids, 85, 30)?.region).toBe('north');
    expect(terrainMaskAt(grids, 0.674, 23.473)?.region).toBe('global');
    expect(terrainMaskAt(grids, -85, 0)).toBeNull(); // 남극은 남극 격자가 맡는다
    const crisium = terrainMaskAt(grids, 17.0, 59.1)!, tycho = terrainMaskAt(grids, -41.9, -11.4)!;
    expect(crisium.mask.elevation_deg).toHaveLength(72);
    // 평평한 바다는 지평선이 낮고 티코 테두리 근처는 높다
    expect(Math.max(...crisium.mask.elevation_deg)).toBeLessThan(2);
    expect(Math.max(...tycho.mask.elevation_deg)).toBeGreaterThan(5);
  });
});

describe('terrain grids (작은 합성 격자, 형식만)', () => {
  it('띠 경도 감싸기와 결측 칸', () => {
    const m: BandTerrainManifest = { projection: 't', cell_km: 1, lat_max_deg: 10, dlat_deg: 10, n_rows: 2, n_lon: [4, 2], n_cells_total: 6, n_cells: 5, cells: 'c', horizon: { file: 'h', az_step_deg: 180, n_az: 2, scale: 0.01 }, observer_height_m: 2 };
    const g = bandTerrainGrid(m, Uint32Array.from([0, 1, 2, 3, 5]), Int16Array.from([0, 100, 0, 200, 0, 300, 0, 400, 0, 500]));
    expect(locateTerrainCell(g, -5, -180)).toBe(0);
    expect(locateTerrainCell(g, -5, 180)).toBe(0);
    expect(locateTerrainCell(g, -5, 179.9)).toBe(3);
    expect(locateTerrainCell(g, 5, -10)).toBe(-1); // 칸 4 는 결측
    expect(terrainMaskAt([g], 5, 10)?.mask.elevation_deg).toEqual([0, 5]);
    expect(bandTerrainCheck(m)).toBeNull();
    expect(bandTerrainCheck({ ...m, n_lon: [4] })).not.toBeNull();
  });
});
