import type { Config, SimulationResult } from '../types';
export type { Config, SimulationResult };
export const BRIDGE = 'dune-orbit-bridge.v1';
export interface Capabilities {
  protocol: typeof BRIDGE; buildId: string; upstream: string;
  landing_coverage_utc: [string,string]; coverage_utc: [string,string];
  terrain_latitude_deg: [number,number]; gravity_degrees: number[];
  required_checks: string[]; terminal_policy: string;
  data_sha256: Record<string,string>;
}
export interface Envelope { protocol: typeof BRIDGE; sessionId: string; type: string; revision?: number; requestId?: string; inputKey?: string; [key: string]: unknown }
export function record(v: unknown): v is Record<string,unknown> { return !!v && typeof v === 'object' && !Array.isArray(v); }
export function isEnvelope(v: unknown): v is Envelope { return record(v) && v.protocol === BRIDGE && typeof v.sessionId === 'string' && v.sessionId.length > 0 && v.sessionId.length < 100 && typeof v.type === 'string'; }
export function parseCapabilities(v: unknown): Capabilities {
  if (!record(v) || v.protocol !== BRIDGE || typeof v.buildId !== 'string' || !/^[a-f0-9]{64}$/.test(v.buildId)) throw new Error('Orbit 계약/빌드 버전을 확인할 수 없습니다.');
  for (const k of ['landing_coverage_utc','coverage_utc']) { const a=v[k]; if (!Array.isArray(a)||a.length!==2||!a.every(x=>typeof x==='string'&&Number.isFinite(Date.parse(x)))||Date.parse(a[0])>=Date.parse(a[1])) throw new Error('Orbit 날짜 범위 메타데이터 오류'); }
  if (!Array.isArray(v.required_checks)||v.required_checks.length===0||!v.required_checks.every(x=>typeof x==='string')||!Array.isArray(v.gravity_degrees)||!v.gravity_degrees.every(Number.isFinite)||!Array.isArray(v.terrain_latitude_deg)||v.terrain_latitude_deg.length!==2||!v.terrain_latitude_deg.every(Number.isFinite)||typeof v.terminal_policy!=='string'||!record(v.data_sha256)) throw new Error('Orbit 자료 메타데이터 오류');
  return v as unknown as Capabilities;
}
function fields(o: Record<string,unknown>, allowed: string[], required=allowed) {
  if (Object.keys(o).some(k=>!allowed.includes(k))||required.some(k=>!(k in o))) throw new Error('누락되었거나 지원하지 않는 Orbit 입력 항목이 있습니다.');
}
/** Pure boundary validation. Numerical/terrain acceptance still belongs to the Worker. */
export function parseConfig(value: unknown, caps?: Capabilities): Config {
  if (!record(value)) throw new Error('임무 입력 객체가 필요합니다.');
  fields(value,['initial_orbit','nrho','target','lander','orbit','constraints','objective']);
  for (const k of ['nrho','target','lander','orbit','constraints']) if (!record(value[k])) throw new Error(`${k}: 입력이 필요합니다.`);
  const c=value as unknown as Config, n=c.nrho!;
  fields(c.target as unknown as Record<string,unknown>,['latitude_deg','longitude_deg','landing_time_utc']);
  fields(c.lander as unknown as Record<string,unknown>,['initial_mass_kg','dry_mass_kg','min_thrust_n','max_thrust_n','isp_s']);
  fields(c.orbit as unknown as Record<string,unknown>,['altitude_km','pdi_altitude_km']);
  fields(c.constraints as unknown as Record<string,unknown>,['position_tolerance_m','speed_tolerance_m_s','horizontal_speed_tolerance_m_s']);
  const nk=['mode','gravity_model','gravity_degree','transfer_tof_min_days','transfer_tof_max_days','max_transfer_delta_v_m_s','parking_revolutions','objective','max_iterations','max_computation_seconds','mass_basis'];
  fields(n as unknown as Record<string,unknown>,[...nk,'powered_descent_duration_s','approach_heading_deg'],nk);
  if(c.initial_orbit!=='nrho'||n.mode!=='b') throw new Error('포탈은 날짜 기반 NRHO Mode B만 지원합니다.');
  if(!['fuel','time'].includes(c.objective)||!['delta_v','time','balanced'].includes(n.objective)||!['llo','nrho'].includes(n.mass_basis)||!['grail','point_mass'].includes(n.gravity_model!)) throw new Error('목표·질량 기준·중력 설정을 확인하세요.');
  const nums=[c.target.latitude_deg,c.target.longitude_deg,...Object.values(c.lander),...Object.values(c.orbit),...Object.values(c.constraints),n.gravity_degree,n.transfer_tof_min_days,n.transfer_tof_max_days,n.max_transfer_delta_v_m_s,n.parking_revolutions,n.max_iterations,n.max_computation_seconds];
  if(!nums.every(x=>typeof x==='number'&&Number.isFinite(x))) throw new Error('빈 값 또는 유효하지 않은 숫자가 있습니다.');
  if(Math.abs(c.target.latitude_deg)>90||Math.abs(c.target.longitude_deg)>180) throw new Error('위도/경도 범위를 확인하세요.');
  if(c.target.latitude_deg < (caps?.terrain_latitude_deg[0]??-90)||c.target.latitude_deg>(caps?.terrain_latitude_deg[1]??-75)) throw new Error('정밀 착륙은 남위 75–90° LOLA 지역만 지원합니다.');
  const t=c.target.landing_time_utc;
  if(typeof t!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(t)||!Number.isFinite(Date.parse(t))||new Date(t).toISOString().slice(0,19)!==t.slice(0,19)) throw new Error('UTC 착륙 시각이 유효하지 않습니다.');
  if(caps&&(Date.parse(t)<Date.parse(caps.landing_coverage_utc[0])||Date.parse(t)>Date.parse(caps.landing_coverage_utc[1]))) throw new Error(`착륙 UTC 지원: ${caps.landing_coverage_utc.join(' ~ ')}`);
  const l=c.lander;
  if(!(l.initial_mass_kg>l.dry_mass_kg&&l.dry_mass_kg>0&&l.isp_s>0&&l.max_thrust_n>0&&l.min_thrust_n>=0&&l.min_thrust_n<=l.max_thrust_n)) throw new Error('질량·추진제를 확인하세요. 총질량 > 건조질량 > 0, Isp·최대 추력 > 0, 0 ≤ 최소 ≤ 최대 추력이 필요합니다.');
  if(c.orbit.altitude_km!==100||c.orbit.pdi_altitude_km<3||c.orbit.pdi_altitude_km>=100||Object.values(c.constraints).some(v=>v<=0)) throw new Error('LLO 100 km, PDI 3–100 km 미만, 양수인 착륙 허용오차가 필요합니다.');
  if(!(n.transfer_tof_min_days>0&&n.transfer_tof_min_days<=n.transfer_tof_max_days&&n.transfer_tof_max_days<=14)) throw new Error('전이 시간은 0 < 최소 ≤ 최대 ≤ 14일이어야 합니다.');
  if(n.max_transfer_delta_v_m_s<=0||n.max_transfer_delta_v_m_s>20000||n.parking_revolutions<0||n.parking_revolutions>5||!Number.isInteger(n.max_iterations)||n.max_iterations<1||n.max_iterations>100||n.max_computation_seconds<1||n.max_computation_seconds>300) throw new Error('전이 ΔV·대기 궤도·반복·계산 시간 범위를 확인하세요.');
  if(!(caps?.gravity_degrees??[20,30,60,90]).includes(n.gravity_degree!)) throw new Error('지원하는 GRAIL 차수를 선택하세요.');
  if(n.powered_descent_duration_s!==undefined&&(!Number.isFinite(n.powered_descent_duration_s)||n.powered_descent_duration_s<260||n.powered_descent_duration_s>1200)) throw new Error('하강 시간은 260–1200초 또는 자동입니다.');
  if(n.approach_heading_deg!==undefined&&(!Number.isFinite(n.approach_heading_deg)||n.approach_heading_deg<0||n.approach_heading_deg>=360)) throw new Error('접근 방향은 0–360° 미만 또는 자동입니다.');
  return structuredClone(c);
}
/** Exact canonical identity (not a cryptographic digest); finite values validated first. */
export function configKey(c: Config): string {
  const sort=(v:unknown):unknown=>Array.isArray(v)?v.map(sort):record(v)?Object.fromEntries(Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>[k,sort(v[k])])):v;
  return JSON.stringify(sort(c));
}
export function resultIsValidated(r: SimulationResult, caps: Capabilities): boolean {
  if(r.status!=='VALIDATED'||!record(r.validation)||!Array.isArray(r.trajectory)||!r.trajectory.length) return false;
  return caps.required_checks.every(k=>record((r.validation as Record<string,unknown>)[k])&&(r.validation as Record<string,{passed:unknown}>)[k].passed===true)&&Object.values(r.validation).every(v=>record(v)&&v.passed===true);
}
