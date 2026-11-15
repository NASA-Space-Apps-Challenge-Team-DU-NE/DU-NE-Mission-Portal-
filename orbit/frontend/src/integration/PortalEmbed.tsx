import bundledCapabilities from '../../public/integration/capabilities.json';
import { useEffect, useRef, useState } from 'react';
import App from '../App';
import { setOrbitLanguage } from '../i18n/dom';
import { BRIDGE, configKey, isEnvelope, parseCapabilities, parseConfig, type Capabilities, type Config } from './contract';
export interface Command { serial: number; type: 'CONFIG'|'RUN'|'CANCEL'; config: Config; revision: number; requestId?: string }
export interface Integration { command: Command; capabilities: Capabilities; publish(type: string, details?: Record<string,unknown>): void }
export default function PortalEmbed() {
  const [caps,setCaps]=useState<Capabilities|null>(null), [error,setError]=useState(''), [command,setCommand]=useState<Command|null>(null);
  const session=useRef(''), accepted=useRef<{config:Config;revision:number;key:string}|null>(null), active=useRef<{requestId:string;revision:number}|null>(null), serial=useRef(0), seen=useRef(new Set<string>()), latestRevision=useRef(0);
  const send=(type:string, details:Record<string,unknown>={})=>window.parent.postMessage({protocol:BRIDGE,sessionId:session.current,type,...details},window.location.origin);
  useEffect(()=>{ let disposed=false; fetch(new URL(`${import.meta.env.BASE_URL}integration/capabilities.json`,window.location.href)).then(r=>{if(!r.ok)throw new Error('Orbit metadata HTTP '+r.status);return r.json();}).then(v=>{if(!disposed){const c=parseCapabilities(v);if(c.buildId!==bundledCapabilities.buildId)throw new Error('Orbit 코드와 정적 데이터 버전이 다릅니다. 다시 빌드/새로고침하세요.');setCaps(c);}}).catch(e=>{if(!disposed)setError(String(e));});return()=>{disposed=true;}; },[]);
  useEffect(()=>{
    if(!caps)return;
    const receive=(event:MessageEvent)=>{
      if(event.origin!==window.location.origin||event.source!==window.parent||window.parent===window||!isEnvelope(event.data))return;
      const m=event.data;
      if(m.type==='INIT'){
        setOrbitLanguage(m.language);
        if(session.current!==m.sessionId){session.current=m.sessionId;accepted.current=null;active.current=null;seen.current.clear();latestRevision.current=0;setCommand(null);}
        send('READY',{capabilities:caps});return;
      }
      if(m.sessionId!==session.current)return;
      if(m.type==='SET_LANGUAGE'){setOrbitLanguage(m.language);return;}
      if(m.type==='INVALIDATE'){
        if(!Number.isSafeInteger(m.revision)||Number(m.revision)<latestRevision.current)return;
        latestRevision.current=Number(m.revision);active.current=null;accepted.current=null;setCommand(null);return;
      }
      if(m.type==='SET_CONFIG'){
        try{
          if(!Number.isSafeInteger(m.revision)||Number(m.revision)<0||Number(m.revision)<latestRevision.current)throw new Error('입력 revision 오류');
          const config=parseConfig(m.config,caps),key=configKey(config);
          if(key!==m.inputKey)throw new Error('입력 식별자가 일치하지 않습니다.');
          if(active.current)throw new Error('진행 중인 계산을 먼저 취소하세요.');
          latestRevision.current=Number(m.revision);accepted.current={config,revision:Number(m.revision),key};
          setCommand({serial:++serial.current,type:'CONFIG',config,revision:Number(m.revision)});
          send('CONFIG_ACCEPTED',{revision:m.revision,inputKey:key});
        }catch(e){accepted.current=null;active.current=null;setCommand(null);send('CONFIG_REJECTED',{revision:m.revision,message:String(e)});}return;
      }
      const a=accepted.current;
      if(m.type==='RUN'){
        if(!a||m.revision!==a.revision||m.inputKey!==a.key||typeof m.requestId!=='string'||m.requestId.length>100||seen.current.has(m.requestId)||active.current){send('ERROR',{revision:m.revision,requestId:m.requestId,message:'승인된 입력과 실행 요청이 일치하지 않거나 이미 실행 중입니다.'});return;}
        seen.current.add(m.requestId);if(seen.current.size>100)seen.current.delete(seen.current.values().next().value!);
        active.current={requestId:m.requestId,revision:a.revision};setCommand({serial:++serial.current,type:'RUN',config:structuredClone(a.config),revision:a.revision,requestId:m.requestId});
      }
      if(m.type==='CANCEL'&&a&&active.current?.requestId===m.requestId){active.current=null;setCommand({serial:++serial.current,type:'CANCEL',config:a.config,revision:a.revision});send('CANCELLED',{revision:a.revision,requestId:m.requestId});}
    };
    window.addEventListener('message',receive);return()=>window.removeEventListener('message',receive);
  },[caps]);
  const publish=(type:string,details:Record<string,unknown>={})=>{
    if(type==='EDIT_REQUEST'){send(type,{revision:accepted.current?.revision,...details});return;}
    const a=active.current;if(!a||a.requestId!==details.requestId||a.revision!==details.revision)return;
    send(type,{...details,buildId:caps?.buildId,inputKey:accepted.current?.key});
    if(type==='RESULT'||type==='ERROR')active.current=null;
  };
  if(error)return <p role="alert">{error}</p>;
  if(!caps||!command)return <div className="embed-wait" role="status">포탈의 임무 입력을 기다리고 있습니다. 계산 전 궤도는 표시하지 않습니다.</div>;
  return <App integration={{command,capabilities:caps,publish}}/>;
}
