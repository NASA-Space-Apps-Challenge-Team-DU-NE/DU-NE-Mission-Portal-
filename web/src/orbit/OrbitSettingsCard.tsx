import { useRef, useState } from 'react';
import { Card, Help } from '../components/kit';
import { useApp } from '../state/store';
import { DEFAULT_SITE_ID } from '../config';
import { useOrbitPlan } from './hooks';
import { ORBIT_DEFAULT, parseConfig, type Config } from './model';
function NumberField({label,value,onChange,min,max,step=1}:{label:string;value:number|undefined;onChange(v:number):void;min?:number;max?:number;step?:number}){
  return <label className="small muted">{label}<input className="field num" type="number" aria-label={label} value={Number.isFinite(value)?value:''} min={min} max={max} step={step} onChange={e=>onChange(e.currentTarget.valueAsNumber)}/></label>;
}
export default function OrbitSettingsCard(){
  const settings=useApp(s=>s.orbitSettings),set=useApp(s=>s.setOrbitSettings),apply=useApp(s=>s.applyOrbitConfig), plan=useOrbitPlan();
  const [message,setMessage]=useState(''),file=useRef<HTMLInputElement>(null),n=settings.nrho!;
  const patch=(p:Partial<NonNullable<Config['nrho']>>)=>set({...settings,nrho:{...n,...p}});
  const save=()=>{if(!plan.config||plan.error)return;const url=URL.createObjectURL(new Blob([JSON.stringify({schema:'dune.orbit-mission.v1',config:plan.config,site_ref:useApp.getState().siteRef},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='dune-orbit-mission.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  return <Card title="궤도 임무 · Mode B" sub="NRHO → 100 km LLO → 착륙">
    <div className="orbit-fields">
      <label className="small muted">질량 기준 시점<select className="field" aria-label="질량 기준 시점" value={n.mass_basis} onChange={e=>patch({mass_basis:e.target.value as 'llo'|'nrho'})}><option value="llo">LLO 진입 후 · DOI 전</option><option value="nrho">NRHO 출발 전</option></select></label>
      <label className="small muted">달 중력 모델<select className="field" aria-label="달 중력 모델" value={n.gravity_model} onChange={e=>patch({gravity_model:e.target.value as 'grail'|'point_mass'})}><option value="grail">NASA GRAIL GL1800F</option><option value="point_mass">점질량 비교 모델</option></select></label>
      <label className="small muted">GRAIL 차수<select className="field" aria-label="GRAIL 차수" value={n.gravity_degree} disabled={n.gravity_model!=='grail'} onChange={e=>patch({gravity_degree:Number(e.target.value) as 20|30|60|90})}>{[20,30,60,90].map(d=><option key={d} value={d}>{d}차</option>)}</select></label>
      <NumberField label="PDI 기준 고도 (km)" value={settings.orbit.pdi_altitude_km} min={3} max={99} onChange={v=>set({...settings,orbit:{altitude_km:100,pdi_altitude_km:v}})}/>
    </div>
    <Help>{n.mass_basis==='llo'?'위 총질량은 LLO 진입 후 값입니다. 전이에 필요한 NRHO 출발 질량은 더 크게 역산됩니다.':'위 추진제에서 NRHO 전이·LLO 진입·착륙 연료를 모두 소모합니다.'} LLO 100 km 고정. 단일 단계·일정 Isp·시연용 제원입니다.</Help>
    <details><summary>궤도 고급 설정</summary><div className="orbit-fields">
      <NumberField label="전이 시간 최소 (일)" value={n.transfer_tof_min_days} min={0.01} max={14} step={0.1} onChange={v=>patch({transfer_tof_min_days:v})}/>
      <NumberField label="전이 시간 최대 (일)" value={n.transfer_tof_max_days} min={0.01} max={14} step={0.1} onChange={v=>patch({transfer_tof_max_days:v})}/>
      <NumberField label="최대 전이 ΔV (m/s)" value={n.max_transfer_delta_v_m_s} min={1} max={20000} onChange={v=>patch({max_transfer_delta_v_m_s:v})}/>
      <NumberField label="LLO 대기 궤도 수" value={n.parking_revolutions} min={0} max={5} onChange={v=>patch({parking_revolutions:v})}/>
      <NumberField label="최대 반복 횟수" value={n.max_iterations} min={1} max={100} onChange={v=>patch({max_iterations:v})}/>
      <NumberField label="계산 시간 제한 (s)" value={n.max_computation_seconds} min={1} max={300} onChange={v=>patch({max_computation_seconds:v})}/>
      <label className="small muted">전체 임무 선택 목표<select className="field" aria-label="전체 임무 선택 목표" value={n.objective} onChange={e=>patch({objective:e.target.value as 'delta_v'|'time'|'balanced'})}><option value="delta_v">전체 ΔV 우선</option><option value="time">전체 시간 우선</option><option value="balanced">ΔV + 100 m/s / 비행일</option></select></label>
      <label className="small muted">착륙 후보 정렬<select className="field" value={settings.objective} onChange={e=>set({...settings,objective:e.target.value as 'fuel'|'time'})}><option value="fuel">추진제 우선</option><option value="time">시간 우선</option></select></label>
      <label className="small muted">하강 시간 방식<select className="field" aria-label="하강 시간 방식" value={n.powered_descent_duration_s===undefined?'auto':'fixed'} onChange={e=>patch({powered_descent_duration_s:e.target.value==='auto'?undefined:880})}><option value="fixed">지정</option><option value="auto">자동 탐색</option></select></label>
      {n.powered_descent_duration_s!==undefined&&<NumberField label="동력 하강 시간 (s)" value={n.powered_descent_duration_s} min={260} max={1200} onChange={v=>patch({powered_descent_duration_s:v})}/>}
      <label className="small muted">접근 방향 방식<select className="field" aria-label="접근 방향 방식" value={n.approach_heading_deg===undefined?'auto':'fixed'} onChange={e=>patch({approach_heading_deg:e.target.value==='auto'?undefined:180})}><option value="fixed">지정</option><option value="auto">네 방향 탐색</option></select></label>
      {n.approach_heading_deg!==undefined&&<NumberField label="접근 방향 (°·북쪽부터 시계방향)" value={n.approach_heading_deg} min={0} max={359.99} onChange={v=>patch({approach_heading_deg:v})}/>}
      {([['position_tolerance_m','위치 오차 상한 (m)'],['speed_tolerance_m_s','접지 속도 상한 (m/s)'],['horizontal_speed_tolerance_m_s','수평 속도 상한 (m/s)']] as const).map(([key,label])=><NumberField key={key} label={label} value={settings.constraints[key]} min={0.001} step={0.1} onChange={v=>set({...settings,constraints:{...settings.constraints,[key]:v}})}/>) }
    </div><Help>종말 하강·접촉·저고도 속도·추력 기울기 제약은 항상 적용됩니다. 탐색 실패는 물리적 불가능의 증명이 아닙니다.</Help></details>
    <OrbitCoverage/>
    <div className="row"><button className="btn" onClick={()=>{try { apply(ORBIT_DEFAULT, {kind:'catalog',id:DEFAULT_SITE_ID});setMessage('Connecting Ridge · 2026-11-16 UTC와 검증 예제의 질량·추진·궤도 조건을 적용했습니다.'); } catch (err) { setMessage(String(err)); }}}>검증 예제 전체 적용</button><button className="btn" disabled={!!plan.error} onClick={save}>임무 JSON 저장</button><button className="btn" onClick={()=>file.current?.click()}>임무 JSON 불러오기</button></div>
    <Help>예제 적용 시 착륙지·날짜·질량·추진·궤도 조건이 함께 바뀝니다. 현재 URL은 전체 추진·궤도 입력을 저장하지 않으므로 재현에는 임무 JSON을 사용하세요.</Help>
    <input ref={file} type="file" accept=".json,application/json" hidden onChange={async e=>{const f=e.target.files?.[0];e.target.value='';if(!f)return;try{if(f.size>100000)throw new Error('임무 입력 파일은 100 kB 이하만 지원합니다.');const v=JSON.parse(await f.text());if(v.schema!=='dune.orbit-mission.v1')throw new Error('지원하지 않는 임무 파일 버전');if(!plan.caps)throw new Error('데이터 범위 확인 후 다시 불러오세요.');apply(parseConfig(v.config,plan.caps),v.site_ref);setMessage('임무 입력을 불러왔습니다. 계산은 05에서 실행하세요.');}catch(err){setMessage(String(err));}}}/>
    {message&&<p role="status" className="small">{message}</p>}
  </Card>;
}
export function OrbitCoverage(){const p=useOrbitPlan();return <div className="orbit-coverage"><p className="small">궤도 착륙 UTC: {p.caps?`${p.caps.landing_coverage_utc[0].slice(0,10)} ~ ${p.caps.landing_coverage_utc[1].slice(0,10)}`:'범위 확인 중'} · 남위 75–90° LOLA</p>{p.error?<p role="alert" className="orbit-warning">{p.error}</p>:<p className="small soft">입력 범위 확인됨 · 전체 비행 구간과 실제 지형·착륙 제약은 계산 시 검증합니다.</p>}</div>;}
