// Worker 호출 (최신 요청만 살린다: 같은 이름의 이전 요청은 취소)
import type { WorkerResponse } from './protocol';

export class WorkerClient {
  private w: Worker;
  private seq = 0;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; onProgress?: (v: number) => void }>();
  private latest = new Map<string, number>();

  constructor(factory: () => Worker) {
    this.w = factory();
    this.w.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const m = e.data;
      const p = this.pending.get(m.id);
      if (!p) return;
      if (m.kind === 'progress') p.onProgress?.(m.value);
      else {
        this.pending.delete(m.id);
        if (m.kind === 'result') p.resolve(m.value);
        else p.reject(new Error(m.message));
      }
    };
  }

  request<R>(type: string, payload: unknown, opts: { onProgress?: (v: number) => void; transfer?: Transferable[]; latestOnly?: boolean } = {}): Promise<R> {
    const id = ++this.seq;
    if (opts.latestOnly !== false) {
      const prev = this.latest.get(type);
      if (prev !== undefined && this.pending.has(prev)) {
        this.w.postMessage({ id: prev, type: 'cancel' });
        this.pending.get(prev)!.reject(new Error('cancelled'));
        this.pending.delete(prev);
      }
      this.latest.set(type, id);
    }
    return new Promise<R>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, onProgress: opts.onProgress });
      this.w.postMessage({ id, type, payload }, opts.transfer ?? []);
    });
  }
}

let grid: WorkerClient | null = null;
let search: WorkerClient | null = null;
let sim: WorkerClient | null = null;
export const gridWorker = () => (grid ??= new WorkerClient(() => new Worker(new URL('./grid.worker.ts', import.meta.url), { type: 'module' })));
export const searchWorker = () => (search ??= new WorkerClient(() => new Worker(new URL('./search.worker.ts', import.meta.url), { type: 'module' })));
export const simWorker = () => (sim ??= new WorkerClient(() => new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' })));
export const isCancelled = (e: unknown) => (e as Error)?.message === 'cancelled';
