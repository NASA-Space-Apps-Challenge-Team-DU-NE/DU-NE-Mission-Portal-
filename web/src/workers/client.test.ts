import { describe, expect, it, vi } from 'vitest';
import { InitializedWorkerClient, WorkerClient } from './client';

class TestWorker {
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: { message: string; preventDefault(): void }) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  messages: Array<{ id: number; type: string; payload: unknown }> = [];
  terminate = vi.fn();
  postMessage(message: { id: number; type: string; payload: unknown }) { this.messages.push(message); }
  complete(index: number, value: unknown = 'ok') {
    this.onmessage?.({ data: { id: this.messages[index].id, kind: 'result', value } });
  }
  fail() { this.onerror?.({ message: 'script failed', preventDefault() {} }); }
}

describe('격자 Worker 복구', () => {
  it('오류 뒤 모든 후속 명령은 초기화 완료를 기다리고 새 입력을 사용한다', async () => {
    const workers: TestWorker[] = [];
    const client = new InitializedWorkerClient(() => {
      const worker = new TestWorker(); workers.push(worker); return worker as unknown as Worker;
    });
    const oldData = { cells: new Uint32Array([1]) };
    const first = client.request('init', oldData);
    workers[0].complete(0); await first;
    const score = client.request('score', {});
    await Promise.resolve();
    const rejected = expect(score).rejects.toThrow('worker_error');
    workers[0].fail(); await rejected;
    const retry = client.request('score', {});
    const panels = client.request('panels', {});
    expect(workers[1].messages.map(m => m.type)).toEqual(['init']);
    expect(workers[1].messages[0].payload).toBe(oldData);
    workers[1].complete(0); await Promise.resolve();
    expect(workers[1].messages.map(m => m.type)).toEqual(['init', 'score', 'panels']);
    workers[1].complete(1, { top: [1] }); workers[1].complete(2, [1]);
    await expect(retry).resolves.toEqual({ top: [1] }); await expect(panels).resolves.toEqual([1]);
    const freshData = { cells: new Uint32Array([2]) };
    const freshInit = client.request('init', freshData);
    workers[1].complete(3); await freshInit;
    workers[1].fail();
    const freshScore = client.request('score', {});
    expect(workers[2].messages[0].payload).toBe(freshData);
    workers[2].complete(0); await Promise.resolve(); workers[2].complete(1, 2);
    await expect(freshScore).resolves.toBe(2);
  });

  it('최초 초기화 오류도 다음 요청에서 복구한다', async () => {
    const workers: TestWorker[] = [];
    const client = new InitializedWorkerClient(() => { const w = new TestWorker(); workers.push(w); return w as unknown as Worker; });
    const init = client.request('init', { cells: [1] });
    const rejected = expect(init).rejects.toThrow('worker_error'); workers[0].fail(); await rejected;
    const retry = client.request('score', {});
    workers[1].complete(0); await Promise.resolve(); workers[1].complete(1, 5);
    await expect(retry).resolves.toBe(5);
  });

  it('메시지 해독 오류도 미결 요청을 거부한다', async () => {
    const w = new TestWorker(), client = new WorkerClient(() => w as unknown as Worker);
    const p = client.request('score', {}), rejected = expect(p).rejects.toThrow('worker_error');
    w.onmessageerror?.(); await rejected;
    expect(w.terminate).toHaveBeenCalledOnce(); expect(client.dead).toBe(true);
  });

  it('점수 계산 후 중단된 Worker의 릴레이·쌍둥이 요청도 동적 배열을 복구한다', async () => {
    const workers: TestWorker[] = [];
    const client = new InitializedWorkerClient(() => { const w = new TestWorker(); workers.push(w); return w as unknown as Worker; });
    const init = client.request('init', { cells: [1, 2] }); workers[0].complete(0); await init;
    const scoreInput = { start: 1, duration_h: 240 };
    const score = client.request('score', scoreInput); await Promise.resolve(); workers[0].complete(1); await score;
    workers[0].fail();
    const relay = client.request('relay', { cell: 0 }), twins = client.request('twins', { cell: 0 });
    expect(workers[1].messages.map(m => m.type)).toEqual(['init']);
    workers[1].complete(0); await Promise.resolve();
    expect(workers[1].messages.map(m => m.type)).toEqual(['init', 'score']);
    expect(workers[1].messages[1].payload).toBe(scoreInput);
    workers[1].complete(1); await Promise.resolve();
    expect(workers[1].messages.map(m => m.type)).toEqual(['init', 'score', 'relay', 'twins']);
    workers[1].complete(2, [1]); workers[1].complete(3, [2]);
    await expect(relay).resolves.toEqual([1]); await expect(twins).resolves.toEqual([2]);
  });
});
