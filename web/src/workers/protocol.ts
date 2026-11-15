// Worker 메시지 계약 (ARCHITECTURE 6.5): 요청 id, cancel, progress, result, error
import type { HorizonMask, Site } from '../core/types';

export interface EphPayload {
  meta: { start_utc: string; step_h: number; count: number } | null;
  rows: Float32Array | null;
}
export interface SiteMask {
  site: Site;
  mask: { az_step_deg: number; elevation_deg: number[] };
  ground_elev_m: number;
  observer_height_m: number;
}

export type WorkerRequest<T = unknown> = { id: number; type: string; payload: T } | { id: number; type: 'cancel' };
export type WorkerResponse<R = unknown> =
  | { id: number; kind: 'progress'; value: number }
  | { id: number; kind: 'result'; value: R }
  | { id: number; kind: 'error'; message: string };

export function maskOf(m: HorizonMask | { az_step_deg: number; elevation_deg: ArrayLike<number> }) {
  return { az_step_deg: m.az_step_deg, elevation_deg: Array.from(m.elevation_deg) };
}
