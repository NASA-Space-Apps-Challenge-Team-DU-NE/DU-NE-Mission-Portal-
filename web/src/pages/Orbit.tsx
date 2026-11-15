import { useEffect, useRef, useState } from 'react';
import { Card, Help } from '../components/kit';
import { useApp } from '../state/store';
import { useUi } from '../state/ui';
import { useLang } from '../i18n';
import { useOrbitRun, orbitStatus } from '../state/orbitRun';
import { useOrbitPlan } from '../orbit/hooks';
import { OrbitBridge } from '../orbit/bridge';
import type { SimulationResult } from '../orbit/model';
export default function Orbit(){
  const plan=useOrbitPlan(),run=useOrbitRun(),frame=useRef<HTMLIFrameElement>(null),bridge=useRef<OrbitBridge|null>(null);
  const lang=useLang(s=>s.lang);
  const latest=useRef(plan);latest.current=plan;
  const [applied,setApplied]=useState(false),[connection,setConnection]=useState('Orbit 연결 중…'),[retry,setRetry]=useState(0);
  const src=`${import.meta.env.BASE_URL}orbit/index.html?embed=portal`;
  const edit=(page:'cond'|'site'='cond')=>{useUi.getState().set({condTab:'lander'});useApp.getState().setPage(page);};
  useEffect(()=>{
    if(!plan.caps)return;
    const b=new OrbitBridge(crypto.randomUUID(),new URL(src,window.location.href).origin,()=>frame.current?.contentWindow??null,plan.caps,m=>{
      if(m.type==='READY')setConnection('Orbit 연결 완료');
      else if(m.type==='CONFIG_ACCEPTED'){setApplied(true);setConnection('현재 계획 입력 적용 완료');}
      else if(m.type==='CONFIG_REJECTED'){setApplied(false);setConnection(String(m.message));}
      else if(m.type==='EDIT_REQUEST')edit();
      else if(m.type==='PROGRESS')useOrbitRun.getState().set({progress:String(m.message??'계산 중…')});
      else if(m.type==='RESULT')useOrbitRun.getState().set({phase:'complete',result:m.result as SimulationResult,buildId:String(m.buildId),error:null,progress:(m.result as SimulationResult).message??'계산 완료'});
      else if(m.type==='ERROR'){useOrbitRun.getState().set({phase:'error',error:String(m.message),progress:String(m.message)});if(!b.ready)setConnection(String(m.message));}
      else if(m.type==='CANCELLED')useOrbitRun.getState().set({phase:'cancelled',progress:'계산을 취소했습니다.'});
    });
    bridge.current=b;b.setLanguage(lang);setApplied(false);setConnection('Orbit 연결 중…');b.configure(latest.current.error?null:latest.current.config);
    const onMessage=(e:MessageEvent)=>b.receive(e);window.addEventListener('message',onMessage);
    let attempts=0;const timer=window.setInterval(()=>{if(b.ready){window.clearInterval(timer);return;}if(++attempts>24){window.clearInterval(timer);setConnection('Orbit 응답이 없습니다. 정적 파일을 확인하거나 다시 연결하세요.');return;}b.init();},500);b.init();
    return()=>{b.dispose();bridge.current=null;window.clearInterval(timer);window.removeEventListener('message',onMessage);const s=useOrbitRun.getState();if(s.phase==='running')s.set({phase:'cancelled',progress:'탭을 떠나 계산을 취소했습니다.'});};
  },[plan.caps,retry,src]);
  useEffect(()=>{setApplied(false);bridge.current?.configure(plan.error?null:plan.config);},[plan.key,plan.error]);
  useEffect(()=>{bridge.current?.setLanguage(lang);},[lang]);
  const start=()=>{if(!bridge.current||!plan.config||plan.error)return;try{bridge.current.run(crypto.randomUUID());run.set({phase:'running',input:structuredClone(plan.config),inputKey:plan.key,result:null,error:null,progress:'정적 NASA 자료와 전체 임무 계산을 준비합니다…',buildId:plan.caps!.buildId});}catch(e){run.set({phase:'error',error:String(e)});}};
  const cancel=()=>{bridge.current?.cancel();run.set({phase:'cancelled',progress:'계산을 취소했습니다.'});};
  const exportResult=()=>{if(!run.result||!run.input)return;const text=JSON.stringify({schema:'dune.orbit-result.v1',input:run.input,buildId:run.buildId,capabilities:plan.caps,result:run.result},null,2);const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='dune-orbit-result.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  const c=plan.config;
  return <>
    <Card title="궤도 분석" tag={<span className="badge">Mode B · 브라우저 계산</span>}>
      {c&&<div className="orbit-summary"><span>계획 좌표 <b>{c.target.latitude_deg.toFixed(4)}°, {c.target.longitude_deg.toFixed(4)}°</b></span><span>착륙 <b>{c.target.landing_time_utc.replace('T',' ').replace('Z',' UTC')}</b></span><span>{c.nrho!.mass_basis==='llo'?'LLO 진입 후':'NRHO 출발'} <b>{c.lander.initial_mass_kg} kg</b></span><span>{c.nrho!.gravity_model==='grail'?`GRAIL ${c.nrho!.gravity_degree}차`:'점질량'} · NRHO → LLO 100 km → 착륙</span></div>}
      <p className="small soft">{plan.caps?`착륙 UTC 지원 ${plan.caps.landing_coverage_utc[0].slice(0,10)} ~ ${plan.caps.landing_coverage_utc[1].slice(0,10)} · 남위 75–90° LOLA`: '정적 데이터 지원 범위 확인 중…'}</p>
      <div className="orbit-actions"><button className="btn primary" data-testid="orbit-run" disabled={!applied||!!plan.error||run.phase==='running'} onClick={start}>NRHO 전체 임무 계산</button><button className="btn" disabled={run.phase!=='running'} onClick={cancel}>계산 취소</button><button className="btn" onClick={()=>edit()}>01 질량·궤도 설정</button><button className="btn" onClick={()=>edit('site')}>02 착륙지·날짜</button><button className="btn" onClick={()=>{void plan.retryCapabilities();setRetry(v=>v+1);}} disabled={run.phase==='running'}>다시 연결</button></div>
      <p className="small" role="status" data-testid="orbit-status">{connection} · {orbitStatus(run)}</p>
      {plan.error&&<p role="alert" className="orbit-warning">{plan.error}</p>}
      {run.error&&<p role="alert" className="orbit-warning">{run.error}</p>}
      <p className="small" aria-live="polite" data-testid="orbit-progress">{run.progress}</p>
      {run.result&&<><p className={run.result.status==='VALIDATED'?'small':'orbit-warning'}>이전/완료 실행: <b data-testid="orbit-result-status">{run.result.status}</b> · {run.result.message}</p><button className="btn" onClick={exportResult}>입력·검증·출처 포함 JSON 저장</button></>}
      <Help>01/02의 계획값으로 계산합니다. 오른쪽 화면의 임시 탐색값은 사용하지 않습니다. 성공 표시는 이 모델의 수치 검증 조건 충족을 뜻합니다. 제한 시간 안의 미수렴은 물리적 불가능의 증명이 아닙니다.</Help>
    </Card>
    <iframe key={retry} ref={frame} className="orbit-frame" title="Mode B 궤도 시뮬레이터" src={src} onLoad={()=>bridge.current?.init()} />
  </>;
}
