import { makeOrbitConfig, parseConfig } from '../orbit/model';
// 페이지 공용: 시나리오 만들기, Worker 로 보낼 지점·마스크, 대안 후보 목록
import { useEffect, useMemo, useState } from 'react';
import { DEFAULTS } from '../config';
import { cellMask } from '../core/gridScore';
import type { Scenario, Site } from '../core/types';
import { greatCircleKm } from '../core/vec';
import { maskOf, type SiteMask } from '../workers/protocol';
import { useData } from './data';
import { cellSite, type ResolvedSite } from './hooks';
import { useGridRun } from './gridRun';
import { useApp } from './store';

let seq = 0;
export function makeScenario(site: Site, landing: number, duration_h: number, origin: Scenario['origin'], name?: string): Scenario {
  const app = useApp.getState();
  let orbit_input: unknown;
  try { orbit_input = parseConfig(makeOrbitConfig(site, landing, app.landerExtra, app.orbitSettings)); } catch { /* Incomplete propulsion or unsupported region: no orbit snapshot. */ }
  return {
    orbit_input,
    id: `sc_${Date.now().toString(36)}_${++seq}`,
    name: name ?? `${site.name} · ${new Date(landing).toISOString().slice(0, 13).replace('T', ' ')}Z`,
    site,
    landing_utc: new Date(landing).toISOString(),
    duration_h,
    comm_margin_deg: useApp.getState().margin_deg,
    origin,
  };
}

export function siteMaskOf(rs: ResolvedSite): SiteMask {
  return { site: rs.site, mask: maskOf(rs.mask), ground_elev_m: rs.groundElev, observer_height_m: rs.maskEnv?.observer_height_m ?? DEFAULTS.observer_height_m };
}

export function ephPayload() {
  const d = useData.getState();
  return { meta: d.ephMeta, rows: d.ephRows };
}

/** 대안 B 후보: 반경 안 카탈로그 착륙지(마스크 있음) + 통과 격자 상위 칸 */
export function useCandidates(origin: Site | null, radius_km: number, extraCells = 30): SiteMask[] {
  const sites = useData((s) => s.sites.items);
  const ensureMask = useData((s) => s.ensureMask);
  const masks = useData((s) => s.masks);
  const grid = useData((s) => s.grid);
  const layers = useData((s) => s.layers);
  const res = useGridRun((g) => g.result);
  const [, bump] = useState(0);
  const near = useMemo(
    () => (origin ? sites.filter((s) => s.id !== origin.id && greatCircleKm(origin.lat_deg, origin.lon_deg, s.lat_deg, s.lon_deg) <= radius_km) : []),
    [origin, sites, radius_km],
  );
  useEffect(() => {
    near.forEach((s) => s.mask && !masks[s.mask] && ensureMask(s.mask).then(() => bump((x) => x + 1)));
  }, [near, masks, ensureMask]);
  return useMemo(() => {
    const out: SiteMask[] = [];
    for (const s of near) {
      const env = s.mask ? masks[s.mask] : undefined;
      if (env && env !== 'missing') out.push({ site: s, mask: maskOf(env.data), ground_elev_m: env.data.ground_elev_m, observer_height_m: env.data.observer_height_m });
    }
    if (grid && res && origin) {
      const idx: number[] = [];
      for (let i = 0; i < res.pass.length; i++) if (res.pass[i] && greatCircleKm(origin.lat_deg, origin.lon_deg, grid.lat[i], grid.lon[i]) <= radius_km) idx.push(i);
      idx.sort((a, b) => res.composite[b] - res.composite[a]);
      for (const i of idx.slice(0, extraCells)) {
        const el = layers.elev_m?.[i];
        out.push({ site: cellSite(i, grid.lat[i], grid.lon[i]), mask: maskOf(cellMask(grid, i)), ground_elev_m: Number.isFinite(el) ? (el as number) : 0, observer_height_m: grid.manifest.observer_height_m });
      }
    }
    return out;
  }, [near, masks, grid, res, origin, radius_km, layers, extraCells]);
}
