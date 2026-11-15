import { DataUnavailable } from '../data';

export interface ReferenceSegment {
  start_s: number; end_s: number; source_priority: number; degree: number;
  times_s: number[]; states: number[][];
}
export interface NrhoReferenceData {
  schema: 'lunar.nrho.type9.v1'; object_id: number; origin_id: number;
  frame: string; units: string; source_url: string;
  coverage_s: [number,number]; gaps_s: number[][]; segments: ReferenceSegment[];
}

/** Bounded NASA SPK type-9 subset. States are Earth-relative, geometric J2000.
 * Preserve original knots and segment priority; never interpolate across gaps
 * or segment/maintenance boundaries. Position and velocity are independently
 * interpolated as in the source type-9 kernel (not Hermite derivatives). */
export class NrhoReference {
  constructor(readonly data: NrhoReferenceData) {
    const fail=()=>{throw new DataUnavailable('EPHEMERIS REFERENCE — invalid NASA type-9 subset.');};
    const finite=(a:unknown,n:number):a is number[]=>Array.isArray(a)&&a.length===n&&a.every(Number.isFinite);
    if(!data||data.schema!=='lunar.nrho.type9.v1'||data.object_id!==-60000||data.origin_id!==399||data.frame!=='J2000'||data.units!=='m, m/s'||!finite(data.coverage_s,2)||data.coverage_s[0]>=data.coverage_s[1]||!Array.isArray(data.segments)||!data.segments.length)fail();
    const priorities=new Set<number>();
    for(let i=0;i<data.segments.length;i++) {
      const s=data.segments[i],n=s.times_s?.length;
      if(!Number.isFinite(s.start_s)||!Number.isFinite(s.end_s)||s.start_s>=s.end_s||s.start_s<data.coverage_s[0]||s.end_s>data.coverage_s[1]||!Number.isInteger(s.source_priority)||priorities.has(s.source_priority)||s.degree!==7||!Array.isArray(s.times_s)||n<8||!Array.isArray(s.states)||s.states.length!==n)fail();
      if(i&&data.segments[i-1].end_s>s.start_s)fail();
      for(let j=0;j<n;j++)if(!Number.isFinite(s.times_s[j])||(j&&s.times_s[j]<=s.times_s[j-1])||!finite(s.states[j],6))fail();
      if(s.times_s[0]>s.start_s||s.times_s[n-1]<s.end_s)fail();
      priorities.add(s.source_priority);
    }
    if(data.segments[0].start_s!==data.coverage_s[0]||data.segments.at(-1)!.end_s!==data.coverage_s[1])fail();
    const gaps=data.segments.slice(1).flatMap((s,i)=>data.segments[i].end_s<s.start_s?[[data.segments[i].end_s,s.start_s]]:[]);
    if(!Array.isArray(data.gaps_s)||JSON.stringify(gaps)!==JSON.stringify(data.gaps_s))fail();
  }
  segmentAt(t:number):ReferenceSegment {
    if(!Number.isFinite(t)||t<this.data.coverage_s[0]||t>this.data.coverage_s[1])throw new DataUnavailable('EPHEMERIS REFERENCE COVERAGE — departure lies outside the NASA reference interval.');
    const segments=this.data.segments;
    let lo=0,hi=segments.length;
    while(lo<hi){const mid=(lo+hi)>>>1;if(segments[mid].start_s<=t)lo=mid+1;else hi=mid;}
    let selected:ReferenceSegment|undefined;
    for(let i=lo-1;i>=0&&segments[i].end_s>=t;i--)if(!selected||segments[i].source_priority>selected.source_priority)selected=segments[i];
    if(!selected)throw new DataUnavailable('EPHEMERIS REFERENCE GAP — the NASA SPK has no state at this exact departure time; no gap interpolation is permitted.');
    return selected;
  }
  supports(t:number):boolean {try{this.segmentAt(t);return true;}catch(e){if(e instanceof DataUnavailable)return false;throw e;}}
  state(t:number):number[] {
    const seg=this.segmentAt(t),times=seg.times_s;
    let lo=0,hi=times.length;
    while(lo<hi){const mid=(lo+hi)>>>1;if(times[mid]<t)lo=mid+1;else hi=mid;}
    if(times[lo]===t)return [...seg.states[lo]];
    const count=seg.degree+1,first=Math.max(0,Math.min(times.length-count,lo-count/2));
    const base=seg.states[first+count/2],out=[...base];
    for(let i=0;i<count;i++) {
      let weight=1;
      for(let j=0;j<count;j++)if(i!==j)weight*=(t-times[first+j])/(times[first+i]-times[first+j]);
      for(let k=0;k<6;k++)out[k]+=weight*(seg.states[first+i][k]-base[k]);
    }
    if(out.some(v=>!Number.isFinite(v)))throw new DataUnavailable('EPHEMERIS REFERENCE — invalid interpolated departure state.');
    return out;
  }
}
