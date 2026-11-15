import type { SimulationResult } from '../types';
import { Icon } from './Icon';

export interface Segment { id: string; phase: string; label: string; start: number; end: number }
export const PHASE_LABELS: Record<string, string> = { NRHO: 'NRHO 기준 궤도', DEPARTURE_BURN: 'NRHO 이탈 연소', TRANSFER: 'NRHO → LLO 전이', INSERTION_BURN: 'LLO 진입 연소', PARKING: 'LLO 체류', CIRCULAR: '100 km 원궤도', DOI_BURN: 'DOI 감속 연소', COAST: '하강 타원궤도', POWERED_DESCENT: '동력 하강' };
export const EVENT_LABELS: Record<string, string> = { NRHO_DEPARTURE: 'NRHO 이탈', LLO_INSERTION: 'LLO 진입', DOI: 'DOI 감속', PDI: '동력 하강 시작', TOUCHDOWN: '접지' };
export function clockText(s: number) { const abs = Math.max(0, s); const days = Math.floor(abs / 86400); return `${days ? `${days}d ` : ''}${Math.floor(abs % 86400 / 3600).toString().padStart(2, '0')}:${Math.floor(abs % 3600 / 60).toString().padStart(2, '0')}:${Math.floor(abs % 60).toString().padStart(2, '0')}`; }
export function missionSegments(result: SimulationResult | null): Segment[] {
  const segments: Segment[] = [];
  result?.trajectory.forEach((sample, i, rows) => {
    const last = segments.at(-1);
    if (!last || sample.phase !== last.phase) {
      if (last) last.end = sample.time_s;
      segments.push({ id: `${sample.phase}-${i}`, phase: sample.phase, label: PHASE_LABELS[sample.phase] ?? sample.phase, start: sample.time_s, end: sample.time_s });
    } else last.end = sample.time_s;
    if (i === rows.length - 1 && segments.at(-1)) segments.at(-1)!.end = sample.time_s;
  });
  return segments;
}

export default function MissionTimeline({ result, time, playing, speed, segment, segments, pauseAtBurn, onTime, onPlay, onSpeed, onSegment, onPauseAtBurn, onEvent }: {
  result: SimulationResult | null; time: number; playing: boolean; speed: number; segment: string; segments: Segment[]; pauseAtBurn: boolean;
  onTime(value: number): void; onPlay(): void; onSpeed(value: number): void; onSegment(value: string): void; onPauseAtBurn(value: boolean): void; onEvent(time: number): void;
}) {
  const duration = result?.trajectory.at(-1)?.time_s ?? 0;
  const selected = segments.find(s => s.id === segment), min = selected?.start ?? 0, max = selected?.end ?? duration;
  const events = (result?.events ?? []).filter(e => e.time_s >= min && e.time_s <= max);
  const event = events.find(e => typeof e.delta_v_m_s === 'number' && (Math.abs(e.time_s - time) < 0.2 || e.burn_model === 'finite' && typeof e.end_time_s === 'number' && time >= e.time_s && time <= e.end_time_s));
  const ephemeris = result?.nrho?.mode === 'EPHEMERIS';
  const startUtc = typeof result?.reference?.start_time_utc === 'string' ? Date.parse(result.reference.start_time_utc) : NaN;
  // Display whole UTC seconds; rounding avoids millisecond export truncation
  // making an exact midnight touchdown appear in the preceding day.
  const currentUtc = ephemeris && Number.isFinite(startUtc) ? new Date(Math.round((startUtc + time * 1000) / 1000) * 1000).toISOString().slice(0, 19).replace('T', ' ') : null;
  return <section className="timeline-panel">
    <div className="timeline-header"><div className="play-controls"><button className="play-button" aria-label={playing ? '일시정지' : '애니메이션 재생'} disabled={!duration} onClick={onPlay}><Icon name={playing ? 'pause' : 'play'} size={16}/></button><div><span className="tiny-label">{ephemeris ? 'MODE B · MISSION ELAPSED TIME' : 'MISSION ELAPSED TIME'}</span><output>{clockText(time)} <small>/ {duration ? clockText(duration) : '--:--:--'}</small></output>{currentUtc && <time className="tiny-label">{currentUtc} UTC</time>}</div></div><div className="timeline-options"><select aria-label="재생 속도" value={speed} onChange={e => onSpeed(Number(e.target.value))}>{[1, 10, 60, 120, 300, ...(result?.nrho ? [1800, 7200, 21600] : [])].map(s => <option key={s} value={s}>{s}×</option>)}</select></div></div>
    <div className="timeline-tools"><label>구간 확대<select aria-label="시간 구간 선택" value={segment} onChange={e => onSegment(e.target.value)}><option value="full">전체 임무</option>{segments.map(s => <option key={s.id} value={s.id}>{s.label} · {clockText(s.end - s.start)}</option>)}</select></label><label className="burn-pause"><input type="checkbox" checked={pauseAtBurn} onChange={e => onPauseAtBurn(e.target.checked)}/>기동 시 정지</label></div>
    <input className="time-slider" type="range" min={min} max={max || 1} step={result?.nrho ? 1 : 0.1} value={Math.max(min, Math.min(max || 1, time))} aria-label="비행 시간" disabled={!duration} onChange={e => onTime(Number(e.target.value))}/>
    <div className="phase-ruler"><span>{selected ? clockText(min) : 'START'}</span><span>{selected ? clockText(max) : 'TOUCHDOWN'}</span></div>
    {events.length > 0 && <div className="event-chips">{events.map((e, i) => <button key={`${e.name}-${i}`} className={Math.abs(e.time_s - time) < 1 ? 'active' : ''} title={`T+${clockText(e.time_s)}${e.delta_v_m_s != null ? ` · ΔV ${e.delta_v_m_s.toFixed(1)} m/s` : ''}`} onClick={() => onEvent(e.time_s)}>{EVENT_LABELS[e.name ?? ''] ?? e.name ?? e.phase}</button>)}</div>}
    {event && <div className="burn-inspector"><span><Icon name="info" size={13}/>{EVENT_LABELS[event.name ?? ''] ?? event.name}</span><b>ΔV {event.delta_v_m_s!.toFixed(2)} m/s</b><small>{event.burn_model === 'finite' ? `유한 연소 · ${Number(event.duration_s).toFixed(2)}초 · ${(Number(event.thrust_n) / 1000).toFixed(2)} kN` : '충격기동 · 순간 속도·질량 변화'}</small></div>}
  </section>;
}
