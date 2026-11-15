import { BRIDGE, configKey, isEnvelope, parseCapabilities, parseConfig, record, resultIsValidated, type Capabilities, type Config, type Envelope, type SimulationResult } from './model';
/** One iframe session. Identity checks are deliberately independent of UI state. */
export class OrbitBridge {
  revision=0; ready=false; accepted=false;
  language:'ko'|'en'='ko';
  config:Config|null=null; inputKey=''; requestId:string|null=null;
  constructor(readonly sessionId:string, readonly origin:string, readonly source:()=>Window|null, readonly caps:Capabilities, readonly emit:(message:Envelope)=>void){}
  private send(type:string, extra:Record<string,unknown>={}){this.source()?.postMessage({protocol:BRIDGE,sessionId:this.sessionId,type,revision:this.revision,...extra},this.origin);}
  init(){this.send('INIT',{language:this.language});}
  setLanguage(language:'ko'|'en'){this.language=language;if(this.ready)this.send('SET_LANGUAGE',{language});}
  configure(config:Config|null){
    this.revision++;this.accepted=false;this.requestId=null;
    this.config=config?parseConfig(config,this.caps):null;this.inputKey=this.config?configKey(this.config):'';
    if(this.ready)this.flush();
  }
  private flush(){this.send('INVALIDATE');if(this.config)this.send('SET_CONFIG',{config:this.config,inputKey:this.inputKey});}
  run(id:string){if(!this.ready||!this.accepted||!this.config||this.requestId)throw new Error('최신 입력 적용을 기다려 주세요.');this.requestId=id;this.send('RUN',{requestId:id,inputKey:this.inputKey});}
  cancel(){if(this.requestId)this.send('CANCEL',{requestId:this.requestId});this.requestId=null;}
  dispose(){this.cancel();this.revision++;this.send('INVALIDATE');this.ready=false;}
  receive(event:Pick<MessageEvent,'origin'|'source'|'data'>){
    if(event.origin!==this.origin||event.source!==this.source()||!isEnvelope(event.data)||event.data.sessionId!==this.sessionId)return;
    const m=event.data;
    if(m.type==='READY'){
      if(this.ready)return;
      try{const c=parseCapabilities(m.capabilities);if(c.buildId!==this.caps.buildId)throw new Error('포탈/Orbit 빌드가 다릅니다. 새로고침 후 다시 연결하세요.');this.ready=true;this.flush();this.emit(m);}catch(e){this.emit({...m,type:'ERROR',message:String(e)});}return;
    }
    if(m.revision!==this.revision)return;
    if(m.type==='CONFIG_ACCEPTED'){if(m.inputKey===this.inputKey&&this.config){this.accepted=true;this.emit(m);}return;}
    if(m.type==='CONFIG_REJECTED'){this.accepted=false;this.emit(m);return;}
    if(m.type==='EDIT_REQUEST'){this.emit(m);return;}
    if(!this.requestId||m.requestId!==this.requestId)return;
    if(m.type==='RESULT'){
      try{
        if(m.inputKey!==this.inputKey||m.buildId!==this.caps.buildId||configKey(parseConfig(m.input,this.caps))!==this.inputKey)throw new Error('계산 결과와 실행 입력/빌드가 일치하지 않습니다.');
        if(!record(m.result)||typeof m.result.status!=='string'||!Array.isArray(m.result.trajectory)||!record(m.result.summary)||!m.result.validation)throw new Error('계산 결과 형식이 올바르지 않습니다.');
        const result=m.result as unknown as SimulationResult;
        if(result.status==='VALIDATED'&&!resultIsValidated(result,this.caps))throw new Error('필수 검증이 누락된 결과를 성공으로 표시할 수 없습니다.');
        this.requestId=null;this.emit(m);
      }catch(e){this.requestId=null;this.emit({...m,type:'ERROR',message:String(e)});}return;
    }
    if(m.type==='ERROR'||m.type==='CANCELLED')this.requestId=null;
    if(['PROGRESS','ERROR','CANCELLED'].includes(m.type))this.emit(m);
  }
}
