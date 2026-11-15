import { describe, expect, it } from 'vitest';
import { pointInRing, ringToAeqd } from './gridScore';
import { aeqdForward } from './vec';

// USGS 2024 Malapert Massif 경계 (A3_9regions-lonlat-simplified.geojson)
const MALAPERT: Array<[number, number]> = [[-4.76364169, -85.6339442], [-5.65948184, -86.3227868], [5.14788482, -86.3258893], [4.33231398, -85.6365554], [-4.76364169, -85.6339442]];

describe('아르테미스 후보 지역 판정', () => {
  const ring = ringToAeqd(MALAPERT);
  const inside = (lat: number, lon: number) => { const p = aeqdForward(lat, lon); return pointInRing(p.x_km, p.y_km, ring); };
  it('지역 중심은 안', () => expect(inside(-85.99, -0.24)).toBe(true));
  it('경도 0° 를 가로지르는 지역의 양쪽 모두 안', () => {
    expect(inside(-86.0, -3)).toBe(true);
    expect(inside(-86.0, 3)).toBe(true);
  });
  it('반대편 경도·더 낮은 위도는 밖', () => {
    expect(inside(-85.99, 179.8)).toBe(false);
    expect(inside(-84.5, 0)).toBe(false);
  });
});
