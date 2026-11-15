// 지도·점수 격자의 지역 일반화: 북극·전역 기하가 지평선 격자(terrainGrids)·파이프라인과 같은 칸을 가리키는지 실제 산출물로 확인한다.
import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cellDistKm, geometryFor, nearestCell, panelCandidates, rankCells, scoreGrid } from './gridScore';
import { bandTerrainGrid, locateTerrainCell, polarTerrainGrid, type BandTerrainManifest, type PolarTerrainManifest } from './terrainGrids';
import { greatCircleKm } from './vec';

const root = new URL('../../public/data/', import.meta.url);
const has = existsSync(new URL('grid_global/manifest.json', root)) && existsSync(new URL('grid_north/manifest.json', root));
const bin = <A>(p: string, C: { new (b: ArrayBuffer): A }) => { const b = readFileSync(new URL(p, root)); return new C(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };

describe.skipIf(!has)('지역 격자 기하 (실제 산출물)', () => {
  const nm = JSON.parse(readFileSync(new URL('grid_north/manifest.json', root), 'utf8')).data as PolarTerrainManifest;
  const gm = JSON.parse(readFileSync(new URL('grid_global/manifest.json', root), 'utf8')).data as BandTerrainManifest;
  const nc = bin('grid_north/cells.u32', Uint32Array), nh = bin('grid_north/horizon.i16', Int16Array);
  const gc = bin('grid_global/cells.u32', Uint32Array), gh = bin('grid_global/horizon.i16', Int16Array);
  const north = geometryFor('north', nm, nc, nh), band = geometryFor('global', gm, gc, gh);
  const tn = polarTerrainGrid(nm, nc, nh), tb = bandTerrainGrid(gm, gc, gh);

  it('칸 중심은 자기 칸으로 돌아오고, 지평선 격자와 같은 칸 번호', () => {
    for (const [g, t] of [[north, tn], [band, tb]] as const) {
      for (let i = 0; i < g.cells.length; i += 211) {
        expect(g.locate(g.lat[i], g.lon[i])).toBe(i);
        expect(locateTerrainCell(t, g.lat[i], g.lon[i])).toBe(i);
      }
    }
  });

  it('범위와 상식 값', () => {
    const mm = (a: Float32Array) => a.reduce(([lo, hi], v) => [Math.min(lo, v), Math.max(hi, v)], [Infinity, -Infinity]);
    expect(mm(north.lat)[0]).toBeGreaterThanOrEqual(75 - 0.2);
    expect(mm(band.lat)[1]).toBeLessThan(75);
    expect(mm(band.lat)[0]).toBeGreaterThan(-75);
    expect(north.locate(70, 0)).toBe(-1);
    expect(band.locate(80, 0)).toBe(-1);
    // 파이프라인 기준 칸 (BandGridSpec, 북극 GridSpec)
    expect(band.locate(0.674, 23.473)).toBe(82978);
    expect(north.locate(89.5, 0)).toBe(13633);
    expect(nearestCell(band, 17, 59.1)).toBe(106751);
  });

  it('거리: 띠 격자는 대권 거리, 북극은 평면 거리', () => {
    const a = band.locate(0, 179.9), b = band.locate(0, -179.9);
    expect(cellDistKm(band, a, b)).toBeLessThan(40); // 경도 ±180 경계를 넘어도 가깝다
    expect(cellDistKm(band, a, b)).toBeCloseTo(greatCircleKm(band.lat[a], band.lon[a], band.lat[b], band.lon[b]), 6);
    const p = north.locate(85, 0), q = north.locate(85, 180);
    expect(cellDistKm(north, p, q)).toBeCloseTo(2 * 5 * (Math.PI / 180) * 1737.4, -1);
  });

  it('점수·순위: 아르테미스 필터는 남극 밖에서 통과 칸 없음, 순위는 칸 간격을 지킨다', () => {
    const n = band.cells.length;
    const st = { slope_p90_deg: new Float32Array(n).map((_, i) => (i % 40)) };
    const weights = { power: 0, comm: 0, water: 0, metal: 0, safety: 1, geo: 0 };
    const r = scoreGrid({ g: band, dyn: null, st, weights, filters: {}, artemisPoints: [], artemisRegions: [] });
    expect(r.passCount).toBeGreaterThan(0);
    const top = rankCells(band, r, 10, 50);
    for (let i = 0; i < top.length; i++) for (let j = 0; j < i; j++) expect(cellDistKm(band, top[i].cell, top[j].cell)).toBeGreaterThanOrEqual(50);
    const ra = scoreGrid({ g: band, dyn: null, st, weights, filters: { artemis_only: true }, artemisPoints: [{ lat_deg: 0, lon_deg: 0 }], artemisRegions: [] });
    expect(ra.passCount).toBe(0);
  });

  it('패널 후보: 지점 지역 격자에서 반경·경사 상한을 지킨다 (북극·전역)', () => {
    for (const [g, lat, lon] of [[band, 0.674, 23.473], [north, 85, 30]] as const) {
      const c0 = nearestCell(g, lat, lon);
      expect(c0).toBeGreaterThanOrEqual(0);
      const all = panelCandidates(g, {}, c0, 40, null);
      expect(all.length).toBeGreaterThan(3);
      const me = all.find((c) => c.cell === c0)!;
      expect(me.distance_km).toBe(0);
      for (const c of all) {
        expect(c.distance_km).toBeLessThanOrEqual(40);
        expect(c.mask.elevation_deg.length).toBe(g.manifest.horizon.n_az);
      }
      if (g.region === 'global') expect([me.x_km, me.y_km]).toEqual([0, 0]);
      const slope = new Float32Array(g.cells.length).fill(20);
      slope[c0] = 1;
      expect(panelCandidates(g, { slope_p90_deg: slope }, c0, 40, 5).map((c) => c.cell)).toEqual([c0]);
    }
  });
});
