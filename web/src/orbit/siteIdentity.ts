import type { Site } from '../core/types';
import type { SiteRef } from '../state/store';
import type { Config } from './model';

type Coordinates = Pick<Config['target'], 'latitude_deg' | 'longitude_deg'>;
type GridCoordinates = { lat: ArrayLike<number>; lon: ArrayLike<number> };

/** Resolve identity without moving the target or replacing a catalog mask with a nearby grid cell. */
export function resolveOrbitSite(target: Coordinates, current: SiteRef | null, sites: readonly Site[], grid: GridCoordinates | null, preferred?: SiteRef): SiteRef {
  const same = (lat: number, lon: number) => lat === target.latitude_deg && lon === target.longitude_deg;
  const matches = (ref: SiteRef): boolean => {
    if (ref.kind === 'catalog') {
      const site = sites.find(s => s.id === ref.id);
      return !!site && same(site.lat_deg, site.lon_deg);
    }
    if (ref.kind === 'cell') return !!grid && Number.isInteger(ref.cell) && ref.cell >= 0 && ref.cell < grid.lat.length && same(grid.lat[ref.cell], grid.lon[ref.cell]);
    return ref.kind === 'custom' && same(ref.lat, ref.lon);
  };
  if (preferred !== undefined) {
    if (!preferred || !matches(preferred)) throw new Error('저장된 착륙지 식별자와 현재 카탈로그·격자 좌표가 일치하지 않습니다. 자료와 임무 파일을 확인하세요.');
    return { ...preferred };
  }
  if (current && current.kind !== 'custom' && matches(current)) return { ...current };
  // Legacy coordinate-only files: only an exact, unique catalog match can recover its identity.
  const exact = sites.filter(s => same(s.lat_deg, s.lon_deg));
  if (exact.length === 1) return { kind: 'catalog', id: exact[0].id };
  return { kind: 'custom', lat: target.latitude_deg, lon: target.longitude_deg };
}
