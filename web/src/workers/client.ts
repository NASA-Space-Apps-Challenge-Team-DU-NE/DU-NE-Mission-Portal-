// Worker 호출 (최신 요청만 살린다: 같은 이름의 이전 요청은 취소)
import type { WorkerResponse } from './protocol';

interface RequestOptions {
  onProgress?: (v: number) => void;
  transfer?: Transferable[];
  latestOnly?: boolean;
}

export class WorkerClient {
  private w: Worker;
  private seq = 0;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; onProgress?: (v: number) => void }>();
  private latest = new Map<string, number>();

  /** 스크립트 로딩 실패 등으로 더 쓸 수 없는 상태. 다음 호출 때 새로 만든다 */
  dead = false;

  constructor(factory: () => Worker) {
    this.w = factory();
    // Worker 자체 오류(스크립트 로딩 실패 등)는 runtime try/catch 가 못 잡는다: 미결 요청을 모두 거부한다
    const fail = (msg: string) => {
      this.dead = true;
      for (const p of this.pending.values()) p.reject(new Error(msg));
      this.pending.clear();
      try { this.w.terminate(); } catch { /* 이미 종료 */ }
    };
    this.w.onerror = (e) => { e.preventDefault?.(); fail(`worker_error: ${e.message || 'Worker 로딩 실패'}`); };
    this.w.onmessageerror = () => fail('worker_error: 메시지를 읽을 수 없음');
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

  request<R>(type: string, payload: unknown, opts: RequestOptions = {}): Promise<R> {
    if (this.dead) return Promise.reject(new Error('worker_error: Worker 를 쓸 수 없음'));
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
      try {
        this.w.postMessage({ id, type, payload }, opts.transfer ?? []);
      } catch (e) {
        this.pending.delete(id);
        reject(e as Error);
      }
    });
  }
}

/** 격자는 init의 배열을 보유하므로 Worker를 재생성하면 같은 입력으로 초기화부터 재실행한다. */
export class InitializedWorkerClient {
  private client: WorkerClient;
  private initPayload: unknown;
  private hasInit = false;
  private initialized: Promise<unknown> | null = null;
  private scorePayload: unknown;
  private hasScore = false;
  private scored: Promise<unknown> | null = null;

  constructor(private readonly factory: () => Worker) {
    this.client = new WorkerClient(factory);
  }

  async request<R>(type: string, payload: unknown, opts: RequestOptions = {}): Promise<R> {
    if (this.client.dead) {
      this.client = new WorkerClient(this.factory);
      this.initialized = null;
      this.scored = null;
    }
    const client = this.client;
    if (type === 'init') {
      // 복구할 입력의 소유권을 메인 스레드에 남긴다. 현재 init 호출도 전송 목록을 쓰지 않는다.
      if (opts.transfer?.length) throw new Error('격자 초기화에는 배열 소유권을 이전할 수 없습니다');
      this.initPayload = payload;
      this.hasInit = true;
      this.hasScore = false;
      this.scored = null;
      this.initialized = client.request<R>('init', payload, opts);
      return this.initialized as Promise<R>;
    }
    if (!this.hasInit) throw new Error('격자 초기화 자료 없음');
    this.initialized ??= client.request('init', this.initPayload, { latestOnly: false });
    const initialized = this.initialized;
    await initialized;
    // 기다리는 사이 입력 또는 Worker가 바뀌었으면 오래된 요청을 실행하지 않는다.
    if (client !== this.client || initialized !== this.initialized) throw new Error('cancelled');
    if (type === 'score') {
      this.scorePayload = payload;
      this.hasScore = true;
      this.scored = client.request<R>(type, payload, opts);
      return this.scored as Promise<R>;
    }
    // 빛 릴레이·쌍둥이는 init뿐 아니라 직전 점수 계산의 동적 배열도 필요하다.
    if (type === 'relay' || type === 'twins') {
      if (!this.hasScore) throw new Error('먼저 점수 계산');
      this.scored ??= client.request('score', this.scorePayload, { latestOnly: false });
      const scored = this.scored;
      await scored;
      if (client !== this.client || initialized !== this.initialized || scored !== this.scored) throw new Error('cancelled');
    }
    return client.request<R>(type, payload, opts);
  }
}

let grid: InitializedWorkerClient | null = null;
let search: WorkerClient | null = null;
let sim: WorkerClient | null = null;
// 죽은 Worker 는 다음 호출 때 새로 만든다 (재시도 경로)
export const gridWorker = () => (grid ??= new InitializedWorkerClient(() => new Worker(new URL('./grid.worker.ts', import.meta.url), { type: 'module' })));
/** 3D 달 전체 칠하기용: 지도 지역이 아닌 지역마다 따로 쓰는 격자 Worker (지도 지역 실행과 섞이지 않게) */
const extraGrid = new Map<string, InitializedWorkerClient>();
export const gridWorkerFor = (key: string) => {
  let w = extraGrid.get(key);
  if (!w) { w = new InitializedWorkerClient(() => new Worker(new URL('./grid.worker.ts', import.meta.url), { type: 'module' })); extraGrid.set(key, w); }
  return w;
};
export const searchWorker = () => (search = search && !search.dead ? search : new WorkerClient(() => new Worker(new URL('./search.worker.ts', import.meta.url), { type: 'module' })));
export const simWorker = () => (sim = sim && !sim.dead ? sim : new WorkerClient(() => new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' })));
export const isCancelled = (e: unknown) => (e as Error)?.message === 'cancelled';
