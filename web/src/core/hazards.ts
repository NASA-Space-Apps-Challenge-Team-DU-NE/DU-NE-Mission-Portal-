// 먼지·충돌 검사, 기지 배치 거리 (묶음 G, P1-28·P2-06). 먼지 반경은 공식 기준이 없는 가정값.
import type { Site } from './types';
import { greatCircleKm } from './vec';

export type DustClass = 'small' | 'medium' | 'large';
export type BaseKind = 'landing_pad' | 'power' | 'water_mining' | 'habitat';

export interface BaseElement {
  id: string;
  kind: BaseKind;
  name: string;
  lat_deg: number;
  lon_deg: number;
  pad_class?: DustClass;
}

export interface DustWarning {
  kind: 'protected_site' | 'fault' | 'base_conflict';
  target_id: string;
  target_name: string;
  distance_km: number;
  limit_km: number;
}

export interface FaultPoint {
  id: string;
  lat_deg: number;
  lon_deg: number;
}

export function dustCheck(
  origin: { id: string; lat_deg: number; lon_deg: number },
  dust_km: number,
  protectedSites: Site[],
  faults: FaultPoint[],
  fault_warn_km: number,
  bases: BaseElement[] = [],
  dustRadius?: Record<DustClass, number>,
): DustWarning[] {
  const out: DustWarning[] = [];
  for (const s of protectedSites) {
    if (s.id === origin.id) continue;
    const d = greatCircleKm(origin.lat_deg, origin.lon_deg, s.lat_deg, s.lon_deg);
    if (d <= dust_km) out.push({ kind: 'protected_site', target_id: s.id, target_name: s.name, distance_km: d, limit_km: dust_km });
  }
  for (const f of faults) {
    const d = greatCircleKm(origin.lat_deg, origin.lon_deg, f.lat_deg, f.lon_deg);
    if (d <= fault_warn_km) out.push({ kind: 'fault', target_id: f.id, target_name: f.id, distance_km: d, limit_km: fault_warn_km });
  }
  // 기지끼리: 착륙장 먼지 반경 안의 다른 요소
  if (dustRadius)
    for (const pad of bases.filter((b) => b.kind === 'landing_pad')) {
      const r = dustRadius[pad.pad_class ?? 'medium'];
      for (const b of bases) {
        if (b.id === pad.id) continue;
        const d = greatCircleKm(pad.lat_deg, pad.lon_deg, b.lat_deg, b.lon_deg);
        if (d <= r) out.push({ kind: 'base_conflict', target_id: `${pad.id}→${b.id}`, target_name: `${pad.name} → ${b.name}`, distance_km: d, limit_km: r });
      }
    }
  return out.sort((a, b) => a.distance_km - b.distance_km);
}

export function distanceTable(bases: BaseElement[]): number[][] {
  return bases.map((a) => bases.map((b) => greatCircleKm(a.lat_deg, a.lon_deg, b.lat_deg, b.lon_deg)));
}
