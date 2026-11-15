import { create } from 'zustand';
import { parseCapabilities, type Capabilities } from './model';

interface CapabilityState { caps: Capabilities | null; error: string | null }
export const useCapabilityState = create<CapabilityState>(() => ({ caps: null, error: null }));
let request: Promise<void> | undefined;
let generation = 0;
export function capabilitiesUrl() { return `${import.meta.env.BASE_URL}orbit/integration/capabilities.json`; }

/** Shared by all portal consumers. A retry replaces both the pending request and its error. */
export function loadCapabilities(retry = false): Promise<void> {
  if (!retry && request) return request;
  if (!retry && useCapabilityState.getState().caps) return Promise.resolve();
  const version = ++generation;
  useCapabilityState.setState({ caps: null, error: null });
  request = Promise.resolve().then(() => fetch(capabilitiesUrl(), { cache: 'no-cache' }))
    .then(r => { if (!r.ok) throw new Error(`Orbit 정적 데이터 준비 필요 (HTTP ${r.status}). 저장소 루트에서 npm run prepare:orbit를 실행하세요.`); return r.json(); })
    .then(parseCapabilities)
    .then(caps => { if (version === generation) useCapabilityState.setState({ caps, error: null }); })
    .catch(e => { if (version === generation) useCapabilityState.setState({ caps: null, error: String(e) }); })
    .finally(() => { if (version === generation) request = undefined; });
  return request;
}
export function retryCapabilities() { return loadCapabilities(true); }
