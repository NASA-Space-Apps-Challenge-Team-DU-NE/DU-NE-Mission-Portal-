import { DataUnavailable, Frames, type FramesData } from '../data';
import type { Vec3 } from '../../types';
import { NrhoReference, type NrhoReferenceData } from './reference';
import type { LunarGravityModel } from '../gravity/model';

export interface EphemerisSample { t_s: number; earth: number[]; sun: number[]; rotation: number[]; derivative: number[] }
export interface EphemerisData {
  epoch_utc: string; epoch_et: number; coverage_utc: [string,string]; coverage_s: [number,number]; step_s: number;
  gm: { moon: number; earth: number; sun: number }; earth_radius_m: number;
  fixed_frame: string; resolved_frame?: string; samples: EphemerisSample[];
  time_samples: Array<{utc_ms:number;t_s:number}>;
  reference_seed: {epoch_utc:string;epoch_t_s:number;state:number[];source_url:string;[key:string]:unknown};
  reference_coverage_s: [number,number];
  landing_coverage_utc: [string,string]; landing_coverage_s: [number,number];
  nrho_reference: NrhoReferenceData;
  [key:string]: unknown;
}

function bracket<T>(samples: T[], t: number, time: (row:T)=>number): [T,T] {
  if (!Number.isFinite(t) || t < time(samples[0]) || t > time(samples[samples.length-1])) throw new DataUnavailable('EPHEMERIS COVERAGE — the complete flight must stay inside the packaged UTC/ET interval.');
  let lo=0, hi=samples.length-1;
  while(hi-lo>1) { const mid=(lo+hi)>>1; if(time(samples[mid])<=t)lo=mid;else hi=mid; }
  return [samples[lo],samples[hi]];
}
function interpolateState(a:number[],b:number[],u:number,h:number):number[] {
  const u2=u*u,u3=u2*u;
  const p=[0,1,2].map(i=>(2*u3-3*u2+1)*a[i]+(u3-2*u2+u)*h*a[i+3]+(-2*u3+3*u2)*b[i]+(u3-u2)*h*b[i+3]);
  const v=[0,1,2].map(i=>(6*u2-6*u)/h*a[i]+(3*u2-4*u+1)*a[i+3]+(-6*u2+6*u)/h*b[i]+(3*u2-2*u)*b[i+3]);
  return [...p,...v];
}
class EphemerisFrames extends Frames {
  constructor(private ephemeris:Ephemeris) {
    const d=ephemeris.data;
    super({fixed_frame:d.fixed_frame,resolved_frame:d.resolved_frame??d.fixed_frame,inertial_frame:'J2000',epoch_utc:d.epoch_utc,epoch_et:d.epoch_et,step_s:d.step_s,coverage_s:d.coverage_s,samples:d.samples} as FramesData);
  }
  override time(utc:string) { return this.ephemeris.time(utc); }
}
export class Ephemeris {
  readonly reference:NrhoReference;
  readonly gm:EphemerisData['gm']; readonly coverage:[number,number]; readonly frames:Frames; readonly earth_radius_m:number;
  constructor(public data:EphemerisData, readonly lunarGravity?:LunarGravityModel) {
    const finiteArray=(v:unknown,n:number):v is number[]=>Array.isArray(v)&&v.length===n&&v.every(Number.isFinite);
    const s=data.samples, ts=data.time_samples;
    if (!Array.isArray(s)||s.length<2||!Array.isArray(ts)||ts.length<2||!finiteArray(data.coverage_s,2)||!Number.isFinite(data.epoch_et)||!Number.isFinite(Date.parse(data.epoch_utc))||!Object.values(data.gm??{}).length||!['moon','earth','sun'].every(k=>Number.isFinite(data.gm?.[k as keyof typeof data.gm])&&data.gm[k as keyof typeof data.gm]>0)) throw new DataUnavailable('EPHEMERIS DATA — invalid metadata.');
    for(let i=0;i<s.length;i++)if(!Number.isFinite(s[i].t_s)||(i>0&&s[i].t_s<=s[i-1].t_s)||!finiteArray(s[i].earth,6)||!finiteArray(s[i].sun,6)||!finiteArray(s[i].rotation,9)||!finiteArray(s[i].derivative,9))throw new DataUnavailable('EPHEMERIS DATA — invalid state/frame samples.');
    for(let i=0;i<ts.length;i++)if(!Number.isFinite(ts[i].utc_ms)||!Number.isFinite(ts[i].t_s)||(i>0&&(ts[i].utc_ms<=ts[i-1].utc_ms||ts[i].t_s<=ts[i-1].t_s)))throw new DataUnavailable('EPHEMERIS DATA — invalid UTC/ET mapping.');
    if(!finiteArray(data.reference_seed?.state,6)||!Number.isFinite(data.reference_seed.epoch_t_s)||!finiteArray(data.reference_coverage_s,2))throw new DataUnavailable('EPHEMERIS REFERENCE — missing dated initial state.');
    if(s[0].t_s>data.coverage_s[0]||s[s.length-1].t_s<data.coverage_s[1]||data.coverage_s[0]>=data.coverage_s[1])throw new DataUnavailable('EPHEMERIS COVERAGE — inconsistent state coverage.');
    this.reference=new NrhoReference(data.nrho_reference);
    if(!finiteArray(data.landing_coverage_s,2)||!Array.isArray(data.landing_coverage_utc)||data.landing_coverage_utc.length!==2||!data.landing_coverage_utc.every(x=>Number.isFinite(Date.parse(x)))||data.landing_coverage_s[0]>=data.landing_coverage_s[1]||data.landing_coverage_s[0]<data.coverage_s[0]||data.landing_coverage_s[1]>data.coverage_s[1]||data.reference_coverage_s.some((x,i)=>x!==this.reference.data.coverage_s[i])||data.reference_coverage_s[0]<data.coverage_s[0]||data.reference_coverage_s[1]>data.coverage_s[1])throw new DataUnavailable('EPHEMERIS COVERAGE — invalid landing or reference bounds.');
    this.gm=lunarGravity?{...data.gm,moon:lunarGravity.metadata.gm_m3_s2}:data.gm;this.coverage=data.coverage_s;this.earth_radius_m=data.earth_radius_m;this.frames=new EphemerisFrames(this);
  }
  time(utc:string):number {
    const ms=Date.parse(utc),[a,b]=bracket(this.data.time_samples,ms,row=>row.utc_ms);
    return a.t_s+(b.t_s-a.t_s)*(ms-a.utc_ms)/(b.utc_ms-a.utc_ms);
  }
  landingTime(utc:string):number {
    const ms=Date.parse(utc),range=this.data.landing_coverage_utc;
    if(!Number.isFinite(ms)||ms<Date.parse(range[0])||ms>Date.parse(range[1]))throw new DataUnavailable('EPHEMERIS COVERAGE — landing UTC must be inside '+range.join(' … ')+'. Padding data only supports pre-landing flight.');
    return this.time(utc);
  }
  referenceState(t:number):number[] {
    const earthRelative=this.reference.state(t),earth=this.at(t).earth;
    return earthRelative.map((v,i)=>v+earth[i]);
  }
  utc(t:number):string {
    const [a,b]=bracket(this.data.time_samples,t,row=>row.t_s);
    return new Date(a.utc_ms+(b.utc_ms-a.utc_ms)*(t-a.t_s)/(b.t_s-a.t_s)).toISOString();
  }
  at(t:number):{earth:number[];sun:number[]} {
    const [a,b]=bracket(this.data.samples,t,row=>row.t_s),h=b.t_s-a.t_s,u=(t-a.t_s)/h;
    return {earth:interpolateState(a.earth,b.earth,u,h),sun:interpolateState(a.sun,b.sun,u,h)};
  }
  bodyFixed(t:number):{earth_position_fixed_m:Vec3;sun_position_fixed_m:Vec3} {
    const s=this.at(t);
    return {earth_position_fixed_m:this.frames.toFixed(s.earth,t).slice(0,3) as Vec3,sun_position_fixed_m:this.frames.toFixed(s.sun,t).slice(0,3) as Vec3};
  }
}
export async function loadEphemeris(base:string):Promise<Ephemeris> {
  const response=await fetch(base+'ephemeris/index.json');
  if(!response.ok)throw new DataUnavailable(`EPHEMERIS DATA — static ephemeris unavailable (${response.status}).`);
  const bytes=await response.arrayBuffer();
  if(!globalThis.crypto?.subtle)throw new DataUnavailable('EPHEMERIS DATA integrity requires HTTPS or localhost with Web Crypto support.');
  // Pinned to the reviewed preprocessing output, not to a mutable downloaded manifest.
  const expected='e6e308c593d9e33e527990556ec8750aa79ede74d5507a73f1726ee4a077a20d';
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('');
  if(hash!==expected)throw new DataUnavailable('EPHEMERIS DATA — integrity hash mismatch. Restore the verified static dataset.');
  try { return new Ephemeris(JSON.parse(new TextDecoder().decode(bytes))); }catch(e){if(e instanceof DataUnavailable)throw e;throw new DataUnavailable('EPHEMERIS DATA — invalid static ephemeris JSON.');}
}
