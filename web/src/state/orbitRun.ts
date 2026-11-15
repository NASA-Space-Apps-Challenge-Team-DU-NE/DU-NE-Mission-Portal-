import { create } from 'zustand';
import type { Config, SimulationResult } from '../orbit/model';
export interface OrbitRun {
  phase:'idle'|'running'|'complete'|'cancelled'|'stale'|'error';
  progress:string; inputKey:string; input:Config|null; result:SimulationResult|null;
  buildId:string; error:string|null;
  set(p:Partial<Omit<OrbitRun,'set'>>):void;
}
export const useOrbitRun=create<OrbitRun>(set=>({phase:'idle',progress:'계산 전',inputKey:'',input:null,result:null,buildId:'',error:null,set:p=>set(p)}));
export function orbitStatus(s:Pick<OrbitRun,'phase'|'result'>){return s.phase==='running'?'계산 중':s.phase==='complete'?s.result?.status??'결과 없음':s.phase==='stale'?'입력 변경 · 재계산 필요':s.phase==='cancelled'?'계산 취소':s.phase==='error'?'계산 오류':'계산 전';}
