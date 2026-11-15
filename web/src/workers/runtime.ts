// Worker 쪽 공통: 천체력 복원, 메시지 처리 틀 (취소·진행률)
import { CombinedEphemeris, TableEphemeris } from '../core/ephemeris';
import { siteContext } from '../core/scenario';
import type { EphPayload, SiteMask, WorkerRequest, WorkerResponse } from './protocol';

export function ephFrom(p: EphPayload): CombinedEphemeris {
  if (!p.meta || !p.rows) return new CombinedEphemeris();
  return new CombinedEphemeris([new TableEphemeris(p.meta, p.rows)]);
}

export function ctxFrom(sm: SiteMask, eph: CombinedEphemeris, margin: number) {
  return siteContext({ ...sm.site, elevation_m: sm.ground_elev_m }, sm.mask, eph, margin, sm.observer_height_m);
}

type Handler = (payload: never, api: { progress(v: number): void; cancelled(): boolean }) => unknown | Promise<unknown>;

export function serve(handlers: Record<string, Handler>) {
  const cancelled = new Set<number>();
  const scope = self as unknown as { onmessage: ((e: MessageEvent) => void) | null; postMessage(m: unknown, t?: Transferable[]): void };
  scope.onmessage = async (e: MessageEvent<WorkerRequest>) => {
    const msg = e.data;
    if (msg.type === 'cancel') {
      cancelled.add(msg.id);
      return;
    }
    const h = handlers[msg.type];
    const post = (r: WorkerResponse, tr?: Transferable[]) => scope.postMessage(r, tr);
    if (!h) return post({ id: msg.id, kind: 'error', message: `알 수 없는 요청 ${msg.type}` });
    try {
      const value = await h((msg as unknown as { payload: never }).payload, {
        progress: (v) => post({ id: msg.id, kind: 'progress', value: v }),
        cancelled: () => cancelled.has(msg.id),
      });
      if (!cancelled.has(msg.id)) post({ id: msg.id, kind: 'result', value });
    } catch (err) {
      post({ id: msg.id, kind: 'error', message: (err as Error).message });
    } finally {
      cancelled.delete(msg.id);
    }
  };
}

/** 긴 루프 중간에 메시지(취소)를 받을 수 있게 양보 */
export const yieldNow = () => new Promise((r) => setTimeout(r, 0));
