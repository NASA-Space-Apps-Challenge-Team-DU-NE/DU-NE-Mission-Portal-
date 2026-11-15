import type { Config, SimulationResult } from '../types';

let worker: Worker | null = null;
let abortActive: (() => void) | null = null;
export function cancelSimulation() { abortActive?.(); abortActive = null; worker?.terminate(); worker = null; }
export function runSimulation(config: Config, progress: (message: string) => void): Promise<SimulationResult> {
  cancelSimulation();
  const instance = new Worker(new URL('../workers/simulation.worker.ts', import.meta.url), { type: 'module' });
  worker = instance;
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let finished = false;
    const cleanup = () => { finished = true; if (timer) clearTimeout(timer); instance.terminate(); if (worker === instance) { worker = null; abortActive = null; } };
    abortActive = () => { if (finished) return; cleanup(); const error = new Error('계산을 취소했습니다.'); error.name = 'AbortError'; reject(error); };
    if (config.initial_orbit === 'nrho') {
      const limit = Math.max(1, Math.min(300, config.nrho?.max_computation_seconds ?? 60));
      timer = setTimeout(() => { if (finished) return; cleanup(); resolve({ status: 'TRANSFER NOT CONVERGED', trajectory: [], summary: {}, validation: {}, message: `최대 계산 시간 ${limit}초에 도달하여 Worker를 종료했습니다. 성공 경로는 생성하지 않았습니다.` }); }, limit * 1000);
    }
    instance.onmessage = ({ data }) => {
      if (finished) return;
      if (data.type === 'PROGRESS') progress(typeof data.message === 'string' ? data.message : JSON.stringify(data.progress ?? data.message));
      if (data.type === 'RESULT') { cleanup(); resolve(data.result); }
      if (data.type === 'ERROR') { cleanup(); reject(new Error(data.error || data.message || '계산 중 오류가 발생했습니다.')); }
    };
    instance.onerror = (event) => { if (finished) return; cleanup(); reject(new Error(event.message || '계산 Worker를 시작하지 못했습니다.')); };
    instance.postMessage({ type: 'RUN', id: crypto.randomUUID(), config, assetBase: new URL(`${import.meta.env.BASE_URL}data/`, window.location.href).href });
  });
}

export async function readJson<T>(path: string): Promise<T> {
  const response = await fetch(`${import.meta.env.BASE_URL}data/${path}`);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

export function downloadResult(result: SimulationResult, format: 'json' | 'csv') {
  const text = format === 'json' ? JSON.stringify(result, null, 2) : [
    'time_s,phase,x_m,y_m,z_m,vx_m_s,vy_m_s,vz_m_s,altitude_m,speed_m_s,mass_kg,thrust_n,distance_to_target_m',
    ...result.trajectory.map(p => [p.time_s, p.phase, ...p.position_m, ...p.velocity_m_s, p.altitude_m, p.speed_m_s, p.mass_kg, p.thrust_n, p.distance_to_target_m].join(','))
  ].join('\n');
  const url = URL.createObjectURL(new Blob([text], { type: format === 'json' ? 'application/json' : 'text/csv' }));
  const a = document.createElement('a'); a.href = url; a.download = `lunar-trajectory.${format}`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
