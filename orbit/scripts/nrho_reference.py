"""Export only the needed NASA NRHO SPK type-9 segments, without resampling.

States retain the SPK's Earth/J2000 origin. The browser adds the DE440
Moon-relative Earth state. Segment priority and tiny gaps are preserved.
"""
from __future__ import annotations
import bisect
import numpy as np
import spiceypy as spice


def export_reference(path, epoch, end, source_url):
    handle = spice.dafopr(str(path))
    segments = []
    priority = 0
    try:
        spice.dafbfs(handle)
        while spice.daffna():
            dc, ic = spice.dafus(spice.dafgs(), 2, 6)
            priority += 1
            if int(ic[0]) != -60000 or dc[1] < epoch or dc[0] > end:
                continue
            if tuple(ic[:4]) != (-60000, 399, 1, 9):
                raise ValueError('Only the reviewed Earth/J2000 type-9 NRHO source is supported')
            begin, finish = map(int, ic[4:])
            degree, count = map(int, spice.dafgda(handle, finish-1, finish))
            if degree != 7 or count < degree+1:
                raise ValueError('Unexpected NASA NRHO interpolation format')
            records = spice.dafgda(handle, begin, begin+count*7-1)
            states = np.asarray(records[:count*6]).reshape(count, 6)*1000
            times = np.asarray(records[count*6:count*7])-epoch
            if not np.all(np.isfinite(states)) or not np.all(np.diff(times)>0):
                raise ValueError('Invalid NRHO records')
            segments.append(dict(start_s=max(float(dc[0])-epoch, 0.),
                                 end_s=min(float(dc[1])-epoch, end-epoch),
                                 source_priority=priority, degree=degree,
                                 times_s=times.tolist(), states=states.tolist()))
    finally:
        spice.dafcls(handle)
    segments.sort(key=lambda s:s['start_s'])
    if not segments or segments[0]['start_s'] != 0 or segments[-1]['end_s'] != end-epoch:
        raise ValueError('NRHO source does not cover the requested outer endpoints')
    gaps=[]
    for a,b in zip(segments,segments[1:]):
        if a['end_s'] > b['start_s']:
            raise ValueError('Unexpected overlapping SPK segments; priority review required')
        if a['end_s'] < b['start_s']:
            gaps.append([a['end_s'],b['start_s']])
    return dict(schema='lunar.nrho.type9.v1', object_id=-60000, origin_id=399,
                frame='J2000', units='m, m/s', source_url=source_url,
                interpolation='SPK type 9, degree-7 Lagrange, original knots and segment priority; no interpolation across segment boundaries or gaps',
                coverage_s=[0.,end-epoch], gaps_s=gaps, segments=segments)


def reference_state(reference, t):
    candidates=[s for s in reference['segments'] if s['start_s']<=t<=s['end_s']]
    if not candidates:
        raise ValueError('NRHO source gap or coverage violation')
    seg=max(candidates,key=lambda s:s['source_priority'])
    times=seg['times_s']; index=bisect.bisect_left(times,t)
    if index<len(times) and times[index]==t:
        return np.array(seg['states'][index])
    count=seg['degree']+1
    first=max(0,min(len(times)-count,index-count//2))
    nodes=np.array(times[first:first+count]); states=np.array(seg['states'][first:first+count])
    # Center values to avoid losing lunar-scale precision in Earth-relative coordinates.
    base=states[count//2].copy(); result=base.copy()
    for i in range(count):
        weight=np.prod([(t-nodes[j])/(nodes[i]-nodes[j]) for j in range(count) if j!=i])
        result+=weight*(states[i]-base)
    return result


def validate_reference(reference, epoch, frames):
    golden=[]; worst_p=worst_v=0.; checked=0
    for si,seg in enumerate(reference['segments']):
        knots=seg['times_s']
        candidates={seg['start_s'],seg['end_s']}
        for a,b in zip(knots,knots[1:]):
            mid=(a+b)/2
            if seg['start_s']<=mid<=seg['end_s']:
                candidates.add(mid)
        probes=[t for t in sorted(candidates) if not any(a<t<b for a,b in reference['gaps_s'])]
        for i,t in enumerate(probes):
            # Keep UTC and ET probes separate: no millisecond truncation here.
            expected=np.asarray(spice.spkezr('-60000',epoch+t,'J2000','NONE','EARTH')[0])*1000
            actual=reference_state(reference,t)
            dp=float(np.linalg.norm(actual[:3]-expected[:3])); dv=float(np.linalg.norm(actual[3:]-expected[3:]))
            worst_p=max(worst_p,dp);worst_v=max(worst_v,dv);checked+=1
            if i in {0,1,len(probes)//4,len(probes)//2,len(probes)*3//4,len(probes)-2,len(probes)-1}:
                moon=np.asarray(spice.spkezr('-60000',epoch+t,'J2000','NONE','MOON')[0])*1000
                golden.append(dict(t_s=t,segment_index=si,utc=frames.et_to_utc(epoch+t),earth_state=expected.tolist(),moon_state=moon.tolist()))
    limits=dict(position_m=.001,velocity_m_s=.000001)
    if worst_p>limits['position_m'] or worst_v>limits['velocity_m_s']:
        raise ValueError(f'NRHO SPK reconstruction failed: {worst_p} m, {worst_v} m/s')
    return dict(passed=True,checks=checked,segments=len(reference['segments']),states=sum(len(s['times_s']) for s in reference['segments']),
                max_position_error_m=worst_p,max_velocity_error_m_s=worst_v,limits=limits,
                source_gaps_s=reference['gaps_s'],golden_states=golden,
                meaning='Interpolation fidelity to the design SPK, not flight navigation accuracy')
