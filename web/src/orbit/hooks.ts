import { useEffect, useMemo } from 'react';
import { useResolvedSite } from '../state/hooks';
import { useApp } from '../state/store';
import { useOrbitRun } from '../state/orbitRun';
import { makeOrbitConfig, inputIdentity, validateOrbitPlan } from './model';
import { loadCapabilities, retryCapabilities, useCapabilityState } from './capabilities';
export { capabilitiesUrl } from './capabilities';
export function useOrbitCapabilities(){
  const state = useCapabilityState();
  useEffect(() => { void loadCapabilities(); }, []);
  return state;
}
export function useOrbitPlan(){
  const rs=useResolvedSite(),landing=useApp(s=>s.landing),ex=useApp(s=>s.landerExtra),settings=useApp(s=>s.orbitSettings);
  const {caps,error:metadataError}=useOrbitCapabilities();
  return useMemo(()=>{
    try {const config=makeOrbitConfig(rs?.site??null,landing,ex,settings);const key=inputIdentity(config);try{if(caps)validateOrbitPlan(config,caps);return {config,key,caps,retryCapabilities,error:metadataError??(caps?null:'Orbit 지원 범위 확인 중…')};}catch(e){return {config,key,caps,retryCapabilities,error:e instanceof Error?e.message:String(e)};}}
    catch(e){return {config:null,key:'invalid-plan',caps,retryCapabilities,error:e instanceof Error?e.message:String(e)};}
  },[rs?.site.lat_deg,rs?.site.lon_deg,landing,ex,settings,caps,metadataError]);
}
export function useOrbitInvalidation(){
  const plan=useOrbitPlan();
  useEffect(()=>{const s=useOrbitRun.getState();if(s.inputKey&&s.inputKey!==plan.key)s.set({phase:'stale',result:null,input:null,error:null,progress:'계획 입력이 바뀌었습니다. 새 입력으로 다시 계산하세요.',inputKey:plan.key});},[plan.key]);
}
