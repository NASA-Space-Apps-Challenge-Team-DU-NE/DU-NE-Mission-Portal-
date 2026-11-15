// 아르테미스 후보 지점의 목록 연도 구분.
// 2024: USGS 2024 Artemis III 후보 지역 공식 경계(catalog/artemis_regions.json) 안에 있는 지점.
// 2022: 경계 밖에 있는 카탈로그 후보 지점. 카탈로그 출처가 NASA 2022년 후보 지역 발표이며 2024년 목록에서 빠졌다.
// 카탈로그를 고치지 않고 경계 자료로 판정한다. 경계 자료가 없으면 구분하지 않는다.
import { useMemo } from 'react';
import { pointInRing, ringToAeqd } from '../core/gridScore';
import { aeqdForward } from '../core/vec';
import { useData } from './data';

export type ArtemisVintage = { year: 2024; code: string; region: string } | { year: 2022 };

export function useArtemisVintage(): Map<string, ArtemisVintage> {
  const sites = useData((d) => d.sites.items);
  const regions = useData((d) => d.artemisRegions);
  return useMemo(() => {
    const out = new Map<string, ArtemisVintage>();
    if (!regions.length) return out;
    const rings = regions.map((r) => ({ r, rings: r.rings.map(ringToAeqd) }));
    for (const s of sites) {
      if (s.category !== 'artemis') continue;
      const p = aeqdForward(s.lat_deg, s.lon_deg);
      const hit = rings.find((x) => x.rings.some((ring) => pointInRing(p.x_km, p.y_km, ring)));
      out.set(s.id, hit ? { year: 2024, code: hit.r.code, region: hit.r.name } : { year: 2022 });
    }
    return out;
  }, [sites, regions]);
}

export const vintageLabel = (v: ArtemisVintage) => (v.year === 2024 ? `2024 후보 지역 안 · ${v.code}` : '2022 후보 · 2024 제외');
export const vintageTitle = (v: ArtemisVintage) =>
  v.year === 2024
    ? `USGS 2024 Artemis III 후보 지역 공식 경계(${v.region}) 안의 지점`
    : 'NASA 2022년 후보 지역 발표에 있던 지점. 2024년 Artemis III 후보 9곳의 공식 경계 밖이다';
