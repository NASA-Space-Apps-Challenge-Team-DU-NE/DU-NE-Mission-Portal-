import type { ReportSection } from '../core/export';
import type { OrbitRun } from '../state/orbitRun';
import { configKey, parseConfig, record, resultIsValidated, type Capabilities, type Config, type SimulationResult } from './model';

type ExportRun = Pick<OrbitRun,'phase'|'inputKey'|'input'|'result'|'buildId'|'error'>;
export function orbitEvaluation(config: Config | null, run: ExportRun, caps: Capabilities | null): { status: string; result: SimulationResult | null; buildId: string } {
  const empty=(status:string)=>({status,result:null,buildId:''});
  if(!config)return empty('INPUT_INVALID');
  try {parseConfig(config,caps??undefined);}catch{return empty('INPUT_INVALID');}
  if(!caps)return empty('DATA_UNAVAILABLE');
  const key=configKey(config);
  if(run.phase==='stale'&&run.inputKey===key)return empty('INPUT_CHANGED');
  if(!run.input||run.inputKey!==key||configKey(run.input)!==key)return empty('NOT_CALCULATED');
  if(run.phase!=='complete')return empty(({idle:'NOT_CALCULATED',running:'RUNNING',cancelled:'CANCELLED',stale:'INPUT_CHANGED',error:'ERROR'} as const)[run.phase]);
  if(run.buildId!==caps.buildId)return empty('STALE_BUILD');
  if(!run.result)return empty('NOT_CALCULATED');
  if(run.result.status==='VALIDATED'&&!resultIsValidated(run.result,caps))return empty('INVALID_RESULT');
  return {status:run.result.status,result:run.result,buildId:run.buildId};
}
const metrics = [
 ['total_delta_v_m_s','총 ΔV (m/s)','Total ΔV (m/s)'],
 ['propellant_consumed_kg','총 사용 추진제 (kg)','Total propellant consumed (kg)'],
 ['remaining_propellant_kg','잔여 추진제 (kg)','Remaining propellant (kg)'],
 ['landing_position_error_m','착륙 위치 잔차 (m)','Landing position residual (m)'],
 ['touchdown_velocity_m_s','접지 속도 (m/s)','Touchdown speed (m/s)'],
] as const;
const number=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?v:null;
export const ORBIT_CSV_HEADERS=['orbit_status','orbit_gravity_model','orbit_gravity_degree','orbit_mass_basis','orbit_landing_utc',...metrics.map(([key])=>'orbit_'+key),'orbit_checks_passed','orbit_checks_total','orbit_build_id','orbit_input_json','orbit_validation_json'];
export function orbitCsvCells(config:Config|null,run:ExportRun,caps:Capabilities|null):Array<string|number|null>{
 const out=orbitEvaluation(config,run,caps),checks=out.result?Object.values(out.result.validation):[];
 return [out.status,config?.nrho?.gravity_model??'',config?.nrho?.gravity_degree??null,config?.nrho?.mass_basis??'',config?.target.landing_time_utc??'',...metrics.map(([key])=>number(out.result?.summary[key])),out.result?checks.filter(c=>record(c)&&c.passed===true).length:null,out.result?checks.length:null,out.buildId,config?JSON.stringify(config):'',out.result?JSON.stringify(out.result.validation):''];
}
export function orbitReportSection(config:Config|null,run:ExportRun,caps:Capabilities|null,lang:'ko'|'en'):ReportSection{
 const en=lang==='en', out=orbitEvaluation(config,run,caps),checks=out.result?Object.entries(out.result.validation):[];
 const lines=[`${en?'Calculation status':'계산 상태'}: ${out.status}`,en?'Rankings retain their existing surface-assessment scores. Orbit results are attached only to exactly matching mission inputs; uncomputed candidates remain NOT_CALCULATED.':'순위는 기존 표면 평가 점수를 유지합니다. Orbit 결과는 임무 입력이 정확히 일치할 때만 연결하며 미계산 후보는 NOT_CALCULATED로 표시합니다.'];
 if(config)lines.push(`${en?'Mission input (SI units; altitude in km, transfer duration in days)':'임무 입력 (SI 단위; 고도 km, 전이 시간 일)'}: ${JSON.stringify(config)}`);
 if(out.result){
  for(const [key,ko,english] of metrics)lines.push(`${en?english:ko}: ${number(out.result.summary[key])??'N/A'}`);
  lines.push(`${en?'Passed checks':'검증 통과'}: ${checks.filter(([,v])=>record(v)&&v.passed===true).length}/${checks.length}`);
  lines.push(`${en?'Validation details':'검증 상세'}: ${JSON.stringify(out.result.validation)}`);
  lines.push(`${en?'Original diagnostics and warnings':'원본 진단 및 경고'}: ${JSON.stringify({message:out.result.message,warnings:out.result.warnings})}`);
  lines.push(`Orbit build: ${out.buildId}`);
  lines.push(`Data SHA-256: ${JSON.stringify(caps?.data_sha256)}`);
 }
 lines.push(en?'VALIDATED means the implemented model checks passed; it is not operational flight certification.':'VALIDATED는 구현된 모델 검사 통과를 뜻하며 실제 비행 운용 인증이 아닙니다.');
 return {title:en?'Orbit mission · Mode B':'궤도 임무 · Mode B',lines};
}
