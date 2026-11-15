import type { Integration } from './integration/PortalEmbed';
import { resultIsValidated } from './integration/contract';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import LunarScene, { targetVector } from './components/LunarScene';
import { Icon } from './components/Icon';
import NRHOSettingsPanel from './components/NRHOSettings';
import { DEFAULT_NRHO } from './physics/ephemeris/settings';
import MissionTimeline, { clockText, missionSegments, PHASE_LABELS } from './components/MissionTimeline';
import FailureDialog from './components/FailureDialog';
import { diagnoseError, diagnoseResult, type FailureGuidance } from './services/failureGuidance';
import { cancelSimulation, downloadResult, readJson, runSimulation } from './services/simulation';
import { gravityComparisonKey, gravityComparisonRecord, gravitySelectionId, type GravityComparisonRecord } from './services/gravityComparison';
import { TERMINAL_DESCENT_POLICY } from './physics/ephemeris/terminalDescent';
import { defaultMission } from './defaultMission';
import type { Config, Sample, SimulationResult, Site, Terrain, ViewMode } from './types';

const DEFAULT = defaultMission();
const PHASE = PHASE_LABELS;
const fmt = (v: unknown, d = 1) => typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : 'N/A';
const seconds = (s: number) => `${Math.floor(s / 3600).toString().padStart(2, '0')}:${Math.floor(s % 3600 / 60).toString().padStart(2, '0')}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
const list = <T,>(data: unknown, key: string): T[] => Array.isArray(data) ? data : ((data as Record<string, T[]>)?.[key] ?? (data as Record<string, T[]>)?.items ?? (data as Record<string, T[]>)?.data ?? []);
const coords = (site: Site) => [site.latitude_deg ?? site.lat_deg ?? site.latitude ?? 0, site.longitude_deg ?? site.lon_deg ?? site.longitude ?? 0];
function statusTone(status: string) { return status === 'VALIDATED' ? 'success' : status === 'RUNNING' ? 'running' : status === 'READY' ? 'ready' : 'warning'; }
function summaryValue(result: SimulationResult | null, keys: string[]): number | null {
  for (const key of keys) { const v = result?.summary?.[key]; if (typeof v === 'number' && Number.isFinite(v)) return v; }
  return null;
}
function sampleAt(trajectory: Sample[], time: number): Sample | null {
  if (!trajectory.length) return null;
  let lo = 0, hi = trajectory.length - 1;
  while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (trajectory[mid].time_s <= time) lo = mid; else hi = mid - 1; }
  const a = trajectory[lo], b = trajectory[lo + 1];
  if (!b || b.time_s === a.time_s || b.phase !== a.phase) return a;
  const f = Math.max(0, Math.min(1, (time - a.time_s) / (b.time_s - a.time_s)));
  return { ...a, time_s: time, fixed_position_m: a.fixed_position_m.map((v, i) => v + (b.fixed_position_m[i] - v) * f) as Sample['fixed_position_m'] };
}
function NumberField({ label, value, unit, onChange, min, max, step = 'any', disabled = false }: { label: string; value: number; unit?: string; onChange(v: number): void; min?: number; max?: number; step?: number | 'any'; disabled?: boolean }) {
  return <label className="number-field"><span>{label}</span><div className="input-unit"><input type="number" value={Number.isFinite(value) ? value : ''} min={min} max={max} step={step} disabled={disabled} onChange={e => onChange(e.target.valueAsNumber)} required/>{unit && <em>{unit}</em>}</div></label>;
}
function Metric({ label, value, unit, accent }: { label: string; value: string; unit?: string; accent?: boolean }) {
  return <div className={`metric-row${accent ? ' accent' : ''}`}><span>{label}</span><b>{value}<small>{value !== 'N/A' && unit ? ` ${unit}` : ''}</small></b></div>;
}
function GravityComparison({ result, records, edited }: { result: SimulationResult | null; records: GravityComparisonRecord[]; edited: boolean }) {
  const positionDifference = summaryValue(result, ['gravity_same_controls_position_difference_m']);
  const velocityDifference = summaryValue(result, ['gravity_same_controls_velocity_difference_m_s']);
  const comparisonStatus = result?.summary.gravity_same_controls_status;
  const sameControls = !edited && result?.status === 'VALIDATED' && result.nrho?.mode === 'EPHEMERIS' && comparisonStatus === 'computed' && positionDifference !== null && velocityDifference !== null;
  const comparisonPending = !edited && comparisonStatus === 'not_run_budget' ? '남은 계산 예산이 부족해 비교 전파를 수행하지 않았습니다.' : !edited && comparisonStatus === 'not_completed' ? '비교 전파를 완료하지 못했습니다. 종단 차이는 표시하지 않습니다.' : 'GRAIL 임무 계산에서 PDI 이후 동일 초기상태·명령의 비교 전파가 완료되면 표시됩니다. 값이 없으면 차이를 추정하지 않습니다.';
  return <section className="gravity-comparison" aria-label="달 중력 모델 비교"><div className="gravity-comparison-heading"><h3>중력 모델 비교</h3><span>계산된 결과만 표시</span></div>
    <div className="gravity-comparison-experiment"><b>PDI 동일 초기상태·추력 / 같은 GM의 0차 모델</b>{sameControls ? <><div className="gravity-comparison-values"><span>종단 위치 차이 <strong>{fmt(positionDifference, 3)} m</strong></span><span>종단 속도 차이 <strong>{fmt(velocityDifference, 5)} m/s</strong></span></div><p>동력 하강 시작(PDI) 상태와 추력 명령을 고정하고, GL1800F와 동일 GM의 0차 중력으로 원래 경로의 종료 시각까지 전파한 차이입니다. 동일 시각의 종단 차이이며, 비교 전파의 지형·접지 검증이나 재최적화된 착륙 성공 결과가 아닙니다.</p></> : <p>{comparisonPending}</p>}</div>
    <div className="gravity-comparison-experiment"><b>각 모델에서 별도로 최적화한 임무</b><p>착륙 UTC, 착륙선, 탐색 범위와 계산 예산이 같은 검증 완료 결과만 비교합니다. 모델을 바꾸고 다시 계산하면 아래에 추가됩니다. 실제 착륙 정확도의 비교는 아닙니다.</p>
      {records.length ? <div className="gravity-comparison-table"><table><caption>이 세션에서 완료한 계산 기록</caption><thead><tr><th scope="col">모델</th><th scope="col">총 ΔV<br/>m/s</th><th scope="col">추진제<br/>kg</th><th scope="col">위치 잔차<br/>m</th><th scope="col">접지 속도<br/>m/s</th><th scope="col">전체 실행<br/>s</th></tr></thead><tbody>{records.map(record => <tr key={record.id}><th scope="row">{record.label}</th><td>{fmt(record.totalDeltaV, 2)}</td><td>{fmt(record.propellant, 2)}</td><td>{fmt(record.positionResidual, 3)}</td><td>{fmt(record.speedResidual, 4)}</td><td>{fmt(record.elapsedMs / 1000, 2)}</td></tr>)}</tbody></table></div> : <p className="gravity-comparison-empty">현재 입력과 일치하는 검증 완료 결과가 없습니다.</p>}
      <small>실행시간은 정적 파일 로딩과 검증을 포함한 이 브라우저의 경과 시간입니다. 후보 탐색과 캐시 상태의 영향을 받습니다.</small>
    </div>
  </section>;
}
const CHARTS = [
  { key: 'altitude_m', name: '고도', unit: 'km', factor: 0.001, color: '#4ade80' },
  { key: 'speed_m_s', name: '속도', unit: 'm/s', factor: 1, color: '#6eaaff' },
  { key: 'thrust_n', name: '추력', unit: 'kN', factor: 0.001, color: '#ef7e71' },
  { key: 'mass_kg', name: '질량 / 연료', unit: 'kg', factor: 1, color: '#f2ad53' },
  { key: 'distance_to_target_m', name: '목표까지 거리', unit: 'km', factor: 0.001, color: '#bc9af6' },
] as const;

export default function App({ integration }: { integration?: Integration }) {
  const [config, setConfig] = useState<Config>(integration?.command.config ?? DEFAULT);
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSite, setSelectedSite] = useState('connecting_ridge');
  const [landerCount, setLanderCount] = useState(0);
  const [manifest, setManifest] = useState<Record<string, unknown> | null>(null);
  const [ephemerisInfo, setEphemerisInfo] = useState<{ coverage_utc: [string, string]; landing_coverage_utc: [string, string]; reference_coverage_utc?: [string, string] } | null>(null);
  const [ephemerisError, setEphemerisError] = useState<string | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [resultConfig, setResultConfig] = useState<Config>(integration?.command.config ?? DEFAULT);
  const [gravityHistory, setGravityHistory] = useState<{ key: string; records: Record<string, GravityComparisonRecord> } | null>(null);
  const [terrain, setTerrain] = useState<Terrain | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState('시뮬레이션을 실행하면 계산된 궤도가 표시됩니다.');
  const [error, setError] = useState<string | null>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(60);
  const [view, setView] = useState<ViewMode>('moon');
  const [reset, setReset] = useState(0);
  const [chart, setChart] = useState(0);
  const [modal, setModal] = useState<'sources' | 'validation' | null>(null);
  const [failure, setFailure] = useState<FailureGuidance | null>(null);
  const [failureOpen, setFailureOpen] = useState(false);
  const setupForm = useRef<HTMLFormElement>(null);
  const [edited, setEdited] = useState(false);
  const [timeSegment, setTimeSegment] = useState('full');
  const [pauseAtBurn, setPauseAtBurn] = useState(false);
  const animation = useRef(0);
  const runToken = useRef(0);
  const duration = result?.trajectory?.at(-1)?.time_s ?? 0;
  const segments = useMemo(() => missionSegments(result), [result]);
  const selectedSegment = segments.find(s => s.id === timeSegment);
  const timeMin = selectedSegment?.start ?? 0, timeMax = selectedSegment?.end ?? duration;
  const nrhoMode = config.initial_orbit === 'nrho';
  const nrhoSettings = config.nrho ?? DEFAULT_NRHO;
  const ephemerisMode = nrhoMode;
  const displayedNRHO = Boolean(result?.nrho);
  const displayedEphemeris = result?.nrho?.mode === 'EPHEMERIS';
  const describedEphemeris = result?.nrho ? displayedEphemeris : ephemerisMode;
  const describedGravity = result?.nrho?.gravity?.model ?? (displayedEphemeris ? 'point_mass' : nrhoSettings.gravity_model ?? 'point_mass');
  const describedGravityDegree = result?.nrho?.gravity?.degree ?? (nrhoSettings.gravity_degree ?? 30);
  const comparisonRecords = gravityHistory?.key === gravityComparisonKey(config) ? Object.values(gravityHistory.records).sort((a, b) => a.model === b.model ? a.degree - b.degree : a.model === 'point_mass' ? -1 : 1) : [];
  const current = useMemo(() => sampleAt(result?.trajectory ?? [], time), [result, time]);
  const site = sites.find(s => s.id === selectedSite);
  const timeCoverage = ephemerisMode ? ephemerisInfo?.landing_coverage_utc : manifest?.landing_time_coverage_utc as string[] | undefined;
  const status = running ? 'RUNNING' : error ? 'COMPUTATION ERROR' : edited ? 'INPUT CHANGED' : result?.status ?? (dataError ? 'DATA UNAVAILABLE' : 'READY');
  const target = result?.target?.fixed_position_m ?? targetVector(config.target.latitude_deg, config.target.longitude_deg, result?.target?.elevation_m ?? 0);
  const didChange = (change: (old: Config) => Config) => {
    const next = change(config);
    setConfig(next);
    if (gravitySelectionId(next) !== gravitySelectionId(config)) {
      runToken.current++; cancelSimulation(); setRunning(false); setPlaying(false); setResult(null); setTerrain(null); setTime(0); setTimeSegment('full'); setView('moon');
      setFailure(null); setFailureOpen(false); setError(null); setEdited(false); setProgress('계산 모델이 변경되었습니다. 새 설정으로 경로를 다시 계산하세요.');
    } else if (result || failure) setEdited(true);
  };

  useEffect(() => {
    Promise.all([readJson<unknown>('sites.json'), readJson<unknown>('landers.json'), readJson<Record<string, unknown>>('manifest.json')]).then(([s, l, m]) => {
      const loaded = list<Site>(s, 'sites'); setSites(loaded); setLanderCount(list(l, 'landers').length); setManifest(m);
      const first = loaded.find(s => coords(s)[0] === DEFAULT.target.latitude_deg && coords(s)[1] === DEFAULT.target.longitude_deg);
      setSelectedSite(first?.id ?? 'custom');
    }).catch(e => setDataError(`데이터를 불러오지 못했습니다. ${e.message}`));
    return () => cancelSimulation();
  }, []);
  useEffect(() => {
    if (!ephemerisMode || ephemerisInfo) return;
    let active = true;
    setEphemerisError(null);
    readJson<{ coverage_utc: [string, string]; landing_coverage_utc: [string, string]; reference_coverage_utc?: [string, string] }>('ephemeris/index.json').then(data => {
      const validUtc = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));
      const validInterval = (value: unknown): value is [string, string] => Array.isArray(value) && value.length === 2 && value.every(validUtc) && Date.parse(value[0]) < Date.parse(value[1]);
      if (!validInterval(data.coverage_utc) || !validInterval(data.reference_coverage_utc) || !validInterval(data.landing_coverage_utc)
        || Date.parse(data.reference_coverage_utc[0]) < Date.parse(data.coverage_utc[0]) || Date.parse(data.reference_coverage_utc[1]) > Date.parse(data.coverage_utc[1])
        || Date.parse(data.landing_coverage_utc[0]) < Date.parse(data.coverage_utc[0]) || Date.parse(data.landing_coverage_utc[1]) > Date.parse(data.coverage_utc[1])) throw new Error('지원 기간 메타데이터를 확인할 수 없습니다.');
      if (active) setEphemerisInfo({ coverage_utc: data.coverage_utc, landing_coverage_utc: data.landing_coverage_utc, reference_coverage_utc: data.reference_coverage_utc });
    }).catch(() => { if (active) setEphemerisError('Mode B 천체력 정보를 불러오지 못했습니다.'); });
    return () => { active = false; };
  }, [ephemerisMode, ephemerisInfo]);
  useEffect(() => {
    if (!playing || !duration) return;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.2); last = now;
      setTime(t => {
        const next = Math.min(timeMax, t + dt * speed);
        const burn = pauseAtBurn ? result?.events?.find(e => e.time_s > t + 0.01 && e.time_s <= next && (e.delta_v_m_s ?? 0) > 0) : undefined;
        if (burn) { setPlaying(false); return burn.time_s; }
        if (next >= timeMax) setPlaying(false);
        return next;
      }); animation.current = requestAnimationFrame(tick);
    };
    animation.current = requestAnimationFrame(tick); return () => cancelAnimationFrame(animation.current);
  }, [playing, speed, duration, timeMax, pauseAtBurn, result]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (failureOpen || (e.target as HTMLElement).closest('dialog')) return; if ((e.target as HTMLElement).matches('input,select,textarea,button')) return; if (e.code === 'Space' && result) { e.preventDefault(); setPlaying(p => !p); } if (e.code === 'Escape') setModal(null); };
    document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key);
  }, [result, failureOpen]);

  const start = async (runConfig: Config = config) => {
    const identity = { requestId: integration?.command.requestId, revision: integration?.command.revision };
    const token = ++runToken.current;
    const startedAt = performance.now();
    setFailure(null); setFailureOpen(false); setModal(null);
    setRunning(true); setError(null); setPlaying(false); setResult(null); setTerrain(null); setTime(0); setTimeSegment('full'); setProgress(ephemerisMode ? '날짜별 NASA 천체력과 전체 임무 계산을 준비하고 있습니다…' : 'NASA 데이터와 좌표 변환 표를 준비하고 있습니다…'); setEdited(false);
    try {
      const calculated = await runSimulation(runConfig, message => { if (token === runToken.current) { setProgress(message); integration?.publish("PROGRESS", { ...identity, message }); } });
      if (token !== runToken.current) return;
      if (integration && calculated.status === 'VALIDATED' && !resultIsValidated(calculated, integration.capabilities)) throw new Error('필수 물리 검증 항목이 누락되었습니다.');
      const comparisonKey = gravityComparisonKey(runConfig), comparisonRecord = gravityComparisonRecord(runConfig, calculated, performance.now() - startedAt);
      if (comparisonKey && comparisonRecord) setGravityHistory(old => ({ key: comparisonKey, records: { ...(old?.key === comparisonKey ? old.records : {}), [comparisonRecord.id]: comparisonRecord } }));
      setResult(calculated); setResultConfig(runConfig); setTime(0); setView(calculated.nrho ? 'nrho' : 'moon'); setSpeed(calculated.nrho ? 7200 : 60); setReset(r => r + 1);
      setTerrain((calculated as SimulationResult & { terrain?: Terrain }).terrain ?? null);
      setProgress(calculated.message ?? (calculated.status === 'VALIDATED' ? '정의한 수치·물리 조건을 만족하는 경로를 찾았습니다.' : '결과의 검증 상태와 미충족 조건을 확인하세요.'));
      const guidance = diagnoseResult(calculated, runConfig);
      setFailure(guidance); setFailureOpen(Boolean(guidance));
      integration?.publish('RESULT', { ...identity, result: calculated, input: runConfig, guidance });
    } catch (e) {
      if (token !== runToken.current) return;
      if (e instanceof Error && e.name === 'AbortError') { setError(null); setProgress('계산을 취소했습니다.'); return; }
      setError(e instanceof Error ? e.message : String(e)); setProgress('계산을 완료하지 못했습니다. 입력과 데이터 범위를 확인하세요.');
      integration?.publish('ERROR', { ...identity, message: e instanceof Error ? e.message : String(e) });
      const guidance = diagnoseError(e, runConfig);
      setFailure(guidance); setFailureOpen(Boolean(guidance));
    } finally { if (token === runToken.current) setRunning(false); }
  };
  useEffect(() => {
    if (!integration) return;
    const command = integration.command;
    runToken.current++; cancelSimulation(); setRunning(false); setPlaying(false); setResult(null); setTerrain(null); setTime(0); setFailure(null); setFailureOpen(false); setError(null); setEdited(false);
    setConfig(command.config); setResultConfig(command.config);
    setProgress(command.type === 'CANCEL' ? '계산을 취소했습니다.' : '포탈 입력 적용 완료 · 계산 버튼을 누르세요.');
    if (command.type === 'RUN') void start(command.config);
    return () => { runToken.current++; cancelSimulation(); };
  }, [integration?.command.serial]);
  const changeSite = (id: string) => { setSelectedSite(id); const selected = sites.find(s => s.id === id); if (selected) { const [lat, lon] = coords(selected); didChange(c => ({ ...c, target: { ...c.target, latitude_deg: lat, longitude_deg: lon } })); } };
  const manual = (field: 'latitude_deg' | 'longitude_deg', value: number) => { setSelectedSite('custom'); didChange(c => ({ ...c, target: { ...c.target, [field]: value } })); };
  const chooseSegment = (id: string) => {
    setTimeSegment(id); setPlaying(false);
    const selected = segments.find(s => s.id === id);
    if (selected) { setTime(selected.start); setSpeed(['NRHO', 'TRANSFER'].includes(selected.phase) ? 7200 : selected.phase === 'POWERED_DESCENT' ? 10 : 60); setView(selected.phase === 'NRHO' ? 'nrho' : selected.phase === 'TRANSFER' ? 'transfer' : selected.phase === 'POWERED_DESCENT' ? 'descent' : 'orbit'); }
  };
  const seekEvent = (t: number) => {
    setPlaying(false); setTime(t);
    const event = result?.events?.find(e => e.time_s === t);
    if (event?.name === 'PDI') { setView('descent'); setSpeed(10); }
    else if (event?.name === 'NRHO_DEPARTURE') { setView('nrho'); setSpeed(7200); }
    else if (event?.name === 'LLO_INSERTION' || event?.name === 'DOI') { setView('orbit'); setSpeed(60); }
    else if (event?.name === 'TOUCHDOWN') setView('site');
  };
  const chosenChart = CHARTS[chart];
  const chartData = useMemo(() => {
    const rows = (result?.trajectory ?? []).filter(p => p.time_s >= timeMin && p.time_s <= timeMax); const stride = Math.max(1, Math.floor(rows.length / 700));
    return rows.filter((_, i) => i % stride === 0 || i === rows.length - 1).map(p => ({ time: p.time_s, value: typeof p[chosenChart.key] === 'number' ? (p[chosenChart.key] as number) * chosenChart.factor : null }));
  }, [result, chosenChart, timeMin, timeMax]);
  const displayLander = result ? resultConfig.lander : config.lander;
  const displayWetMass = result?.nrho ? result.trajectory[0]?.mass_kg ?? null : displayLander.initial_mass_kg;
  const currentPropellant = current ? current.mass_kg - displayLander.dry_mass_kg : null;
  const usedPropellant = summaryValue(result, ['propellant_consumed_kg', 'propellant_used_kg', 'fuel_used_kg']);
  const posError = summaryValue(result, ['landing_position_error_m', 'position_error_m', 'landing_error_m']);
  const touchdownSpeed = summaryValue(result, ['touchdown_speed_m_s', 'touchdown_velocity_m_s', 'final_speed_m_s']);
  const validEntries = Array.isArray(result?.validation) ? result.validation.map((v, i) => [String(v.name ?? i), v] as [string, unknown]) : Object.entries(result?.validation ?? {});
  const checks = validEntries.filter(([k, v]) => typeof v === 'boolean' || (v && typeof v === 'object' && ('passed' in v || 'pass' in v || 'status' in v)) || k.endsWith('_ok'));
  const isPass = (v: unknown) => typeof v === 'boolean' ? v : Boolean(v && typeof v === 'object' && ((v as Record<string, unknown>).passed === true || (v as Record<string, unknown>).pass === true || (v as Record<string, unknown>).status === 'PASS'));
  const passes = checks.filter(([, v]) => isPass(v)).length;
  const pdiTime = result?.events?.find(e => /PDI/.test(e.name ?? e.phase ?? ''))?.time_s;
  const doiTime = result?.events?.find(e => /DOI/.test(e.name ?? e.phase ?? ''))?.time_s;

  return <div className={`application${integration ? ' orbit-embedded' : ''}`}>
    {!integration && <header className="topbar">
      <a href="./" className="brand" aria-label="DU:NE 궤도 시뮬레이터 홈"><img src={`${import.meta.env.BASE_URL}brand/dune-logo.png`} alt="DU:NE"/><span><b>MISSION PORTAL</b><small>ORBIT SIMULATOR</small></span></a>
      <div className="header-separator"/><span className="project-name">ORBIT ANALYSIS <span>/ 05</span></span>
      <div className="header-actions"><span className="runtime-label"><i/>BROWSER COMPUTE</span><button className="header-button" onClick={() => setModal('sources')}><Icon name="layers" size={15}/> 데이터 출처</button><span className="team-label">DU-NE <span>SPACE APPS 2026</span></span></div>
    </header>}

    {!integration && <div className="mission-heading"><div><span className="eyebrow">STEP 05 · MISSION DYNAMICS</span><h1>궤도 분석</h1><p>{ephemerisMode ? '선택한 UTC의 천체력과 달 자세로 전이부터 착륙까지 계산합니다.' : '목표 좌표를 선택하고 감속 기동부터 접지까지의 궤적을 확인하세요.'}</p></div><div className="mission-badges"><span className="tag"><i className="dot teal"/>{ephemerisMode ? 'MODE B · DE440 EPHEMERIS' : 'NASA LOLA · JPL SPICE'}</span><span className={`status-pill ${statusTone(status)}`}><i/>{status}</span></div></div>}

    <main className="workspace">
      {!integration && <aside className="setup-panel">
        <div className="panel-heading"><span className="panel-number">01</span><h2>계산 설정<small>MISSION INPUTS</small></h2><Icon name="target"/></div>
        <form ref={setupForm} onSubmit={e => { e.preventDefault(); void start(); }}>
          <fieldset className="setup-scroll" disabled={running}>
            <section className="form-section initial-orbit"><div className="section-label">INITIAL ORBIT <span>출발 궤도</span></div><div className="orbit-select"><button type="button" aria-pressed={!nrhoMode} onClick={() => didChange(c => ({ ...c, initial_orbit: 'llo' }))}><Icon name="moon" size={17}/><span><b>100 km Lunar Orbit</b><small>기존 LLO → 착륙</small></span></button><button type="button" aria-pressed={nrhoMode} onClick={() => didChange(c => ({ ...c, initial_orbit: 'nrho', nrho: c.nrho ?? { ...DEFAULT_NRHO } }))}><Icon name="orbit" size={17}/><span><b>NRHO · NASA Reference</b><small>NRHO → LLO → 착륙</small></span></button></div></section>
            {nrhoMode && <NRHOSettingsPanel settings={nrhoSettings} coverage={ephemerisInfo?.coverage_utc} dataError={ephemerisError} onChange={next => didChange(c => ({ ...c, nrho: next }))}/>}
            <section className="form-section"><div className="section-label">LANDING TARGET <span>착륙 목표</span></div>
              <label className="field-label">착륙지 카탈로그<select value={selectedSite} onChange={e => changeSite(e.target.value)}><option value="custom">직접 좌표 입력</option>{sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
              <div className="field-pair"><NumberField label="위도" value={config.target.latitude_deg} unit="° N" min={-90} max={90} onChange={v => manual('latitude_deg', v)}/><NumberField label="경도" value={config.target.longitude_deg} unit="° E" min={-180} max={180} onChange={v => manual('longitude_deg', v)}/></div>
              <p className="coordinate-note"><span className="tiny-dot"/>{ephemerisMode ? 'MOON_ME · UTC별 SPICE 자세' : 'MOON_ME · 동경 + · 행성중심 위도'}</p>
              {site && <div className="site-note"><span className={`mini-badge ${site.verified ? 'ok' : 'approx'}`}>{site.verified ? '출처 확인' : '대표 좌표 / 검증 상태 확인 필요'}</span><p>{site.note ?? site.notes ?? '카탈로그 좌표를 목표점으로 사용합니다. 정밀 착륙점의 인증을 의미하지 않습니다.'}</p>{site.source_url && <a href={site.source_url} target="_blank" rel="noreferrer">좌표 원본 출처 ↗</a>}</div>}
              <><label className="field-label">목표 착륙 시각 <span className="label-unit">UTC</span><input type="datetime-local" step="1" min={timeCoverage?.[0].replace(/Z$/, '')} max={timeCoverage?.[1].replace(/Z$/, '')} value={config.target.landing_time_utc.replace(/Z$/, '')} onChange={e => didChange(c => ({ ...c, target: { ...c.target, landing_time_utc: `${e.target.value}Z` } }))} required/></label>{timeCoverage && <p className="help-text">{ephemerisMode ? '착륙 UTC 지원' : '자세 표 지원'}: {timeCoverage[0].slice(0, 10)} ~ {timeCoverage[1].slice(0, 10)} UTC</p>}{ephemerisMode && <p className="help-text">전체 비행 구간과 NRHO 출발 시각을 함께 검사합니다.{ephemerisInfo?.reference_coverage_utc && <> 기준 궤적의 출발 지원 기간: {ephemerisInfo.reference_coverage_utc[0].slice(0, 10)} ~ {ephemerisInfo.reference_coverage_utc[1].slice(0, 10)} UTC.</>}</p>}</>
            </section>
            <button type="button" className="preset-button" onClick={() => { didChange(() => defaultMission()); setSelectedSite('connecting_ridge'); }}>검증된 기본 입력 불러오기 · Mode B</button>
            <section className="form-section"><div className="section-label">VEHICLE <span>착륙선 제원</span></div>
              <label className="field-label">착륙선 프리셋<select value="demo" onChange={() => undefined}><option value="demo">Demonstration lander · 사용자 편집</option></select></label>
              <div className="assumption-label">DEMONSTRATION LANDER<br/><b>ASSUMED PARAMETERS</b></div>
              <div className="field-pair"><NumberField label={nrhoMode ? nrhoSettings.mass_basis === 'llo' ? 'LLO 기준 총질량' : 'NRHO 출발 총질량' : '초기 총질량'} value={config.lander.initial_mass_kg} unit="kg" min={1} onChange={v => didChange(c => ({ ...c, lander: { ...c.lander, initial_mass_kg: v } }))}/><NumberField label="건조 질량" value={config.lander.dry_mass_kg} unit="kg" min={1} onChange={v => didChange(c => ({ ...c, lander: { ...c.lander, dry_mass_kg: v } }))}/></div>
              <div className="field-pair"><NumberField label="최대 추력" value={config.lander.max_thrust_n} unit="N" min={0} onChange={v => didChange(c => ({ ...c, lander: { ...c.lander, max_thrust_n: v } }))}/><NumberField label="비추력" value={config.lander.isp_s} unit="s" min={1} onChange={v => didChange(c => ({ ...c, lander: { ...c.lander, isp_s: v } }))}/></div>
              <details><summary>추력·접지 조건 설정 <Icon name="chevron" size={13}/></summary><div className="details-content"><NumberField label="최소 추력" value={config.lander.min_thrust_n} unit="N" min={0} onChange={v => didChange(c => ({ ...c, lander: { ...c.lander, min_thrust_n: v } }))}/><NumberField label="목표 위치 오차" value={config.constraints.position_tolerance_m} unit="m" min={0.01} onChange={v => didChange(c => ({ ...c, constraints: { ...c.constraints, position_tolerance_m: v } }))}/><NumberField label="접지 속도 상한" value={config.constraints.speed_tolerance_m_s} unit="m/s" min={0.01} onChange={v => didChange(c => ({ ...c, constraints: { ...c.constraints, speed_tolerance_m_s: v } }))}/><NumberField label="수평 속도 상한" value={config.constraints.horizontal_speed_tolerance_m_s} unit="m/s" min={0.01} onChange={v => didChange(c => ({ ...c, constraints: { ...c.constraints, horizontal_speed_tolerance_m_s: v } }))}/><p className="help-text">시험용 설계 조건입니다. NASA 임무의 인증 기준이 아닙니다.</p>{ephemerisMode && <div className="help-text"><b>Mode B 종말 하강 제한 · 항상 적용</b><p>접촉 기준점은 질량중심 아래 {TERMINAL_DESCENT_POLICY.center_to_contact_m} m로 가정합니다. 다음 높이는 이 점과 DEM 사이 여유입니다.</p>{TERMINAL_DESCENT_POLICY.bands.slice().reverse().map(b => <p key={b.clearance_m}>{b.clearance_m.toLocaleString()} m 이하: 수평 ≤{b.horizontal_m_s} m/s · 하강 ≤{b.descent_m_s} m/s · 추력 기울기 ≤{b.tilt_deg}°</p>)}<p>저고도 재상승·조기 접촉을 거부합니다. 입력한 접지 속도 제한이 더 엄격하면 함께 적용합니다. 시연용 가정이며 실제 자세·착륙 다리·미세 장애물은 검증하지 않습니다.</p></div>}</div></details>
            </section>
            <section className="form-section last"><div className="section-label">FLIGHT PLAN <span>비행 계획</span></div><div className="field-pair"><NumberField label="초기 원궤도" value={config.orbit.altitude_km} unit="km" min={30} max={300} onChange={v => didChange(c => ({ ...c, orbit: { ...c.orbit, altitude_km: v } }))}/><NumberField label="PDI 기준 고도" value={config.orbit.pdi_altitude_km} unit="km" min={5} max={50} onChange={v => didChange(c => ({ ...c, orbit: { ...c.orbit, pdi_altitude_km: v } }))}/></div><label className="field-label">후보 경로 정렬<select value={config.objective} onChange={e => didChange(c => ({ ...c, objective: e.target.value as Config['objective'] }))}><option value="fuel">추진제 소모량 우선</option><option value="time">비행 시간 우선</option></select></label><p className="help-text">기준 반지름 1,737.4 km · 3D 중력 및 추력 적분</p></section>
          </fieldset>
          <div className="setup-action"><button type="submit" className="run-button" disabled={running || !manifest}><Icon name={running ? 'orbit' : 'play'} size={17}/>{running ? '궤도 계산 중…' : nrhoMode ? 'NRHO 전체 임무 계산' : '착륙 경로 계산'}<Icon name="arrow" size={17}/></button>{running ? <button type="button" className="cancel-button" onClick={() => { runToken.current++; cancelSimulation(); setRunning(false); setError(null); setProgress('계산을 취소했습니다.'); }}>계산 취소</button> : <p>실제 운동방정식으로 후보 경로를 검증합니다.</p>}</div>
        </form>
      </aside>}

      <section className="visual-panel">
        <div className="viewport-heading"><div><Icon name="orbit" size={17}/><b>3D 궤도</b><span>{displayedEphemeris ? 'MODE B · MOON_ME' : 'MOON_ME'}</span></div><button className="text-button" title="카메라 초기화" onClick={() => setReset(v => v + 1)}><Icon name="reset" size={14}/> 초기화</button></div>
        <div className="viewport"><LunarScene result={result} current={current} target={target} view={view} reset={reset} terrain={terrain} textureUrl={`${import.meta.env.BASE_URL}data/moon-gray-2k.jpg`}/>
          <div className="scene-topline"><span className="view-tag">{view === 'system' ? 'EARTH–MOON SYSTEM' : view === 'nrho' ? (displayedEphemeris ? 'COMPUTED NRHO COAST' : 'JPL NRHO REFERENCE') : view === 'transfer' ? 'NRHO → LLO TRANSFER' : view === 'site' ? 'LOLA TERRAIN' : view === 'descent' ? 'POWERED DESCENT' : view === 'follow' ? 'LANDER TRACKING' : 'LUNAR FIXED FRAME'}</span><span className="scene-note">{view === 'site' ? '지형 수직 배율 ×1' : '거리·천체 크기 실제 축척 · 마커·ΔV 화살표 크기 별도'}</span></div>
          <div className={`view-toolbar ${displayedNRHO ? 'extended' : ''}`}>{([...(displayedNRHO ? [['system', 'layers', '시스템'], ['nrho', 'orbit', 'NRHO'], ['transfer', 'arrow', '전이']] : []), ['moon', 'moon', '전체 달'], ['orbit', 'orbit', 'LLO'], ['descent', 'arrowdown', '하강'], ['site', 'target', '착륙지'], ['follow', 'layers', '추적']] as Array<[ViewMode, string, string]>).map(([v, icon, label]) => <button key={v} aria-pressed={view === v} disabled={v === 'transfer' ? !result?.trajectory.some(s => s.phase === 'TRANSFER') : v === 'descent' ? !result?.trajectory.some(s => s.phase === 'POWERED_DESCENT') : v === 'follow' && !result?.trajectory.length} onClick={() => setView(v)} title={label}><Icon name={icon} size={16}/><span>{label}</span></button>)}</div>
          {!result && !running && <div className="scene-intro"><span>MISSION PLANNING</span><b>궤도에서 접지까지</b><p>목표를 설정하고 경로 계산을 시작하세요.</p><div><i/> 계산 전 궤도는 표시하지 않습니다.</div></div>}
          {running && <div className="computation-panel"><span className="spinner"/><div><b>물리적으로 가능한 경로 탐색 중</b><p>{progress}</p></div></div>}
          {view === 'site' && !terrain && <div className="terrain-alert">지역 DEM 메시가 아직 없습니다. 경로 계산 후 제공됩니다.</div>}
          <div className="scene-bottomline"><div className="orbit-legend">{displayedNRHO && <><span><i className="blue"/>NRHO</span><span><i className="purple"/>전이</span></>}<span><i className={displayedNRHO ? 'teal-line' : 'blue'}/>LLO</span><span><i className="orange"/>DOI → PDI</span><span><i className="red"/>동력 하강</span><span><i className="green"/>목표</span></div><span>드래그 회전 · 스크롤 확대</span></div>
        </div>
        <div className={`result-banner ${error || dataError ? 'error' : result?.status === 'VALIDATED' ? 'validated' : ''}`} role="status"><Icon name={result?.status === 'VALIDATED' ? 'check' : 'info'} size={16}/><span>{error ?? dataError ?? progress}{edited && <b> 설정이 변경되었습니다. 표시된 경로는 이전 계산 결과입니다.</b>}</span>{result && <button onClick={() => setModal('validation')}>검증 상세 <Icon name="arrow" size={13}/></button>}</div>
        {failure && !running && <div className="failure-banner"><Icon name="info" size={17}/><div><b>{failure.title}</b><span>{edited ? '이전 계산의 진단입니다. 변경한 설정으로 다시 계산하세요.' : '원인과 설정 조정 방법을 확인하세요.'}</span></div><button type="button" onClick={() => { setModal(null); setPlaying(false); setFailureOpen(true); }}>원인·해결 방법 <Icon name="arrow" size={13}/></button></div>}

        <MissionTimeline result={result} time={time} playing={playing} speed={speed} segment={timeSegment} segments={segments} pauseAtBurn={pauseAtBurn} onTime={t => { setTime(t); setPlaying(false); }} onPlay={() => { if (time >= timeMax || time < timeMin) setTime(timeMin); setPlaying(p => !p); }} onSpeed={setSpeed} onSegment={chooseSegment} onPauseAtBurn={setPauseAtBurn} onEvent={seekEvent}/>
        <section className="charts-panel"><div className="chart-tabs" role="tablist" aria-label="비행 데이터 그래프">{CHARTS.map((c, i) => <button role="tab" aria-selected={chart === i} key={c.key} onClick={() => setChart(i)}>{c.name}<small>{c.unit}</small></button>)}</div><div className="chart-container">{result?.trajectory.length ? <ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{ top: 18, right: 22, left: 0, bottom: 2 }} onClick={state => { if (state?.activeLabel !== undefined) { setTime(Number(state.activeLabel)); setPlaying(false); } }}><defs><linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={chosenChart.color} stopOpacity={0.18}/><stop offset="100%" stopColor={chosenChart.color} stopOpacity={0.015}/></linearGradient></defs><CartesianGrid stroke="var(--line)" vertical={false} strokeDasharray="3 4"/><XAxis dataKey="time" type="number" domain={[timeMin, timeMax]} tickFormatter={s => timeMax - timeMin > 86400 ? `${(s / 86400).toFixed(1)}d` : timeMax - timeMin > 7200 ? `${(s / 3600).toFixed(1)}h` : `${Math.round(s / 60)}m`} tickLine={false} axisLine={false} fontSize={11} stroke="var(--muted)"/><YAxis width={52} tickLine={false} axisLine={false} tickFormatter={v => fmt(v, 0)} fontSize={11} stroke="var(--muted)"/><Tooltip contentStyle={{ fontSize: 12, background: 'var(--panel)', borderColor: 'var(--line2)', color: 'var(--fg)', borderRadius: 0 }} labelFormatter={v => `T + ${clockText(Number(v))}`} formatter={v => [`${fmt(Number(v), 2)} ${chosenChart.unit}`, chosenChart.name]}/><Area type="linear" dataKey="value" stroke={chosenChart.color} strokeWidth={1.8} fill="url(#chartFill)" isAnimationActive={false} connectNulls={false}/><ReferenceLine x={time} stroke="var(--fg)" strokeDasharray="3 3"/>{pdiTime !== undefined && <ReferenceLine x={pdiTime} stroke="#ef7e71" strokeDasharray="2 4"/>}</AreaChart></ResponsiveContainer> : <div className="chart-empty"><div className="empty-grid"/><span>계산 완료 후 시간별 {chosenChart.name}가 표시됩니다.</span></div>}</div><div className="chart-caption"><span>그래프를 클릭하면 해당 시점으로 이동합니다.</span><span className="mono">{chosenChart.unit} / elapsed time</span></div></section>
        {(ephemerisMode || displayedEphemeris) && <GravityComparison result={result} records={comparisonRecords} edited={edited}/>}
      </section>

      <aside className="telemetry-panel"><div className="panel-heading"><span className="panel-number">02</span><h2>비행 데이터<small>FLIGHT TELEMETRY</small></h2><span className={`live-dot ${current ? 'active' : ''}`}/></div>
        <div className="telemetry-scroll"><section className="phase-card"><span className="tiny-label">CURRENT PHASE</span><b>{current ? PHASE[current.phase] ?? current.phase : '비행 계획 대기'}</b><div className="phase-steps">{displayedNRHO && <><i className={current?.phase === 'NRHO' ? 'active blue' : ''}/><i className={['DEPARTURE_BURN', 'TRANSFER', 'INSERTION_BURN'].includes(current?.phase ?? '') ? 'active purple' : ''}/></>}<i className={current?.phase === 'CIRCULAR' || current?.phase === 'PARKING' ? 'active teal-line' : ''}/><i className={['DOI_BURN', 'COAST'].includes(current?.phase ?? '') ? 'active orange' : ''}/><i className={current?.phase === 'POWERED_DESCENT' ? 'active red' : ''}/></div><span className="phase-caption">{displayedNRHO ? <>NRHO <span>→</span> TRANSFER <span>→</span> LLO <span>→</span> LAND</> : <>ORBIT <span>→</span> COAST <span>→</span> DESCENT</>}</span></section>
          {(nrhoMode || displayedNRHO) && <section className="metric-section nrho-results"><h3>NRHO REFERENCE <span>MODE B</span></h3><><div className="dated-telemetry"><span>목표 착륙 UTC</span><b>{displayedEphemeris ? resultConfig.target.landing_time_utc.replace('T', ' ').replace('Z', '') : config.target.landing_time_utc.replace('T', ' ').replace('Z', '')}</b></div><div className="dated-telemetry"><span>참조 궤적에서 조회한 출발 UTC</span><b>{result?.nrho?.ephemeris?.reference_epoch_utc?.replace('T', ' ').replace('Z', '') ?? 'N/A'}</b></div><span className="reference-quality">NASA 참조 궤적에서 출발 상태 직접 조회<br/>{describedGravity === 'grail' ? `달 GRAIL ${describedGravityDegree}차 · 지구·태양 제3체 중력` : '지구·달·태양 점질량 중력'} · 실제 달 자세</span></></section>}
          {displayedEphemeris && result?.nrho?.gravity && <section className="metric-section gravity-results"><h3>LUNAR GRAVITY <span>계산에 사용한 모델</span></h3><div className="gravity-model-tag">{describedGravity === 'grail' ? `GRAIL GL1800F · ${describedGravityDegree}차` : '기존 점질량'}</div><Metric label="중력 평가 시간" value={fmt(describedGravity === 'grail' ? summaryValue(result, ['gravity_cpu_ms']) : null, 1)} unit="ms"/><Metric label="중력 평가 횟수" value={fmt(describedGravity === 'grail' ? summaryValue(result, ['gravity_calls']) : null, 0)}/><small>{result.nrho.gravity.frame}{describedGravity === 'grail' ? ' · 고체 조석 변형 생략' : ' · 점질량 중력 함수의 개별 시간·횟수는 미측정'}</small>{result.nrho.gravity.source_url && /^https:\/\//.test(result.nrho.gravity.source_url) && <a href={result.nrho.gravity.source_url} target="_blank" rel="noreferrer">중력장 원본 출처 ↗</a>}</section>}
          <div className="primary-metrics"><div><span>{current && ['NRHO', 'DEPARTURE_BURN', 'TRANSFER', 'INSERTION_BURN'].includes(current.phase) ? '기준 반지름 고도' : '지표 기준 고도'}</span><b>{fmt(current?.altitude_m != null ? current.altitude_m / 1000 : null, 3)}<small>km</small></b></div><div><span>지표 상대 속도</span><b>{fmt(current?.speed_m_s, 1)}<small>m/s</small></b></div></div>
          <section className="metric-section"><h3>LIVE TELEMETRY</h3><Metric label="수평 속도" value={fmt(current?.horizontal_speed_m_s)} unit="m/s"/><Metric label="수직 속도" value={fmt(current?.vertical_speed_m_s)} unit="m/s"/><Metric label="엔진 추력" value={fmt(current ? current.thrust_n / 1000 : null, 2)} unit="kN"/><Metric label="현재 질량" value={fmt(current?.mass_kg)} unit="kg"/><Metric label="목표까지 거리" value={fmt(current ? current.distance_to_target_m / 1000 : null, 2)} unit="km"/></section>
          {(nrhoMode || displayedNRHO) && <section className="metric-section transfer-results"><h3>NRHO → LLO TRANSFER</h3><Metric label="NRHO 출발 시점" value={result?.nrho?.transfer?.departure_time_s != null ? `T+${clockText(result.nrho.transfer.departure_time_s)}` : 'N/A'}/><Metric label="NRHO 이탈 ΔV" value={fmt(result?.nrho?.transfer?.departure_delta_v_m_s)} unit="m/s"/><Metric label="전이 비행 시간" value={result?.nrho?.transfer?.duration_s != null ? clockText(result.nrho.transfer.duration_s) : 'N/A'}/><Metric label="LLO 진입 ΔV" value={fmt(result?.nrho?.transfer?.insertion_delta_v_m_s)} unit="m/s"/><Metric label="LLO 도착 위치 잔차" value={fmt(result?.nrho?.transfer?.position_error_m, 2)} unit="m"/><Metric label="LLO 도착 속도 잔차" value={fmt(result?.nrho?.transfer?.velocity_error_m_s, 4)} unit="m/s"/><Metric label="LLO 체류 시간" value={result?.nrho?.transfer?.parking_duration_s != null ? clockText(result.nrho.transfer.parking_duration_s) : 'N/A'}/><span className={`transfer-status ${['VALIDATED', 'TRANSFER VALIDATED'].includes(result?.nrho?.transfer?.status ?? '') ? 'ok' : ''}`}>{result?.nrho?.transfer?.status ?? 'NOT COMPUTED'}</span></section>}
          {displayedEphemeris && result?.summary.propulsion_model === 'finite_constant_thrust_v1' && <section className="metric-section"><h3>FINITE BURNS <span>유한 연소</span></h3><Metric label="이탈 연소 시간" value={fmt(summaryValue(result, ['departure_burn_duration_s']), 2)} unit="s"/><Metric label="진입 연소 시간" value={fmt(summaryValue(result, ['insertion_burn_duration_s']), 2)} unit="s"/><Metric label="DOI 연소 시간" value={fmt(summaryValue(result, ['doi_burn_duration_s']), 2)} unit="s"/><Metric label="평가한 전체 임무 후보" value={fmt(summaryValue(result, ['joint_candidates_evaluated']), 0)}/><Metric label="검증 통과 후보" value={fmt(summaryValue(result, ['joint_candidates_validated']), 0)}/><p className="help-text">{result.summary.joint_search_complete ? '정의한 후보 탐색 완료' : '시간 제한 내 탐색 결과'} · 검증된 전체 임무 중 선택. 전역 최적해와 실제 비행 안전성을 보증하지 않습니다.</p></section>}
          <section className="metric-section"><h3>MANEUVERS <span>ΔV</span></h3><Metric label="DOI 감속" value={fmt(summaryValue(result, ['doi_delta_v_m_s', 'doi_dv_m_s']))} unit="m/s"/><Metric label="동력 하강" value={fmt(summaryValue(result, ['powered_descent_delta_v_m_s', 'powered_delta_v_m_s', 'powered_dv_m_s']))} unit="m/s"/><Metric label="총 ΔV" value={fmt(summaryValue(result, ['total_delta_v_m_s', 'total_dv_m_s']))} unit="m/s" accent/></section>
          {(nrhoMode || displayedNRHO) && <section className="metric-section"><h3>TOTAL MISSION</h3><Metric label="전체 비행 시간" value={summaryValue(result, ['flight_duration_s']) != null ? clockText(summaryValue(result, ['flight_duration_s'])!) : 'N/A'}/><Metric label="NRHO 시작 질량" value={fmt(displayedNRHO ? displayWetMass : null)} unit="kg"/><Metric label="LLO 기준 질량" value={fmt(summaryValue(result, ['llo_initial_mass_kg', 'llo_insertion_mass_kg']))} unit="kg"/><p className="help-text">질량 기준: {result?.nrho?.mass_basis === 'nrho' ? 'NRHO 출발' : result?.nrho?.mass_basis === 'llo' ? 'LLO 진입 후' : 'N/A'} · 총 추진제는 모든 기동을 포함합니다.</p></section>}
          <section className="metric-section"><h3>PROPELLANT <Icon name="fuel" size={13}/></h3><Metric label="총 사용 추진제" value={fmt(usedPropellant)} unit="kg"/><Metric label="현재 잔여 추진제" value={fmt(currentPropellant)} unit="kg"/><div className="fuel-gauge"><i style={{ width: currentPropellant != null ? `${Math.max(0, Math.min(100, currentPropellant / ((displayWetMass ?? displayLander.initial_mass_kg) - displayLander.dry_mass_kg) * 100))}%` : '0%' }}/></div><div className="fuel-label"><span>DRY {fmt(displayLander.dry_mass_kg, 0)} kg</span><span>WET {fmt(displayWetMass, 0)} kg</span></div></section>
          <section className="landing-verdict"><h3>TOUCHDOWN VALIDATION</h3><Metric label="착륙 위치 오차" value={fmt(posError, 2)} unit="m"/><Metric label="접지 상대 속도" value={fmt(touchdownSpeed, 3)} unit="m/s"/><button className={`verdict-button ${result?.status === 'VALIDATED' ? 'passed' : ''}`} disabled={!result} onClick={() => setModal('validation')}><Icon name={result?.status === 'VALIDATED' ? 'check' : 'info'} size={16}/><span>{!result ? '검증 결과 대기' : result.status === 'VALIDATED' ? '모델 검증 조건 충족' : '미검증 / 조건 미충족'}<small>{checks.length ? `${passes} / ${checks.length} checks passed` : '위치 · 속도 · 추력 · 연료 · 지형'}</small></span><Icon name="chevron" size={14}/></button></section>
          <div className="exports"><button disabled={!result} onClick={() => result && downloadResult(result, 'json')}><Icon name="down" size={14}/> JSON</button><button disabled={!result} onClick={() => result && downloadResult(result, 'csv')}><Icon name="down" size={14}/> CSV</button></div>
          <p className="scientific-note">NASA 원본 데이터 사용과 시뮬레이션 인증은 별개입니다. 이 결과는 NASA가 검증한 임무 계획이 아닙니다.</p>
        </div>
      </aside>
    </main>
    <footer className="footer"><span><i/> LOCAL PHYSICS · STATIC WEB APPLICATION</span><span>LOLA 240 m DEM <b>·</b> JPL DE440 / MOON_ME <b>·</b> SI units</span><button onClick={() => setModal('sources')}>모델과 데이터 출처 ↗</button></footer>

    {modal && <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setModal(null); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-heading"><div><span className="eyebrow">TRANSPARENCY & VERIFICATION</span><h2 id="modal-title">{modal === 'sources' ? '데이터와 계산 모델' : '착륙 경로 검증'}</h2></div><button className="icon-button" aria-label="닫기" onClick={() => setModal(null)}><Icon name="close"/></button></div>{modal === 'sources' ? <><p>{describedEphemeris ? 'Mode B는 NASA NRHO 참조 궤적에서 출발 시각의 위치·속도를 직접 조회하고 DE440 천체력을 사용합니다. 지구·달·태양 중력, 실제 달 자세, 추력·연료를 같은 시간축에서 전 구간 계산합니다. 정적 파일만 읽고 경로는 브라우저 Worker에서 계산합니다.' : '기존 Drive 카탈로그와 로컬 NASA 원본을 재사용합니다. 천체 좌표 변환은 JPL SPICE에서 사전 계산한 표를 사용하며, 비행 경로는 브라우저 Web Worker에서 운동방정식을 적분합니다.'}</p><div className="source-cards">{describedEphemeris && <div><b>NASA NRHO Reference · Mode B</b><span>NASA 날짜별 참조 초기상태 · DE440 지구·태양 천체력</span><a href="https://ntrs.nasa.gov/citations/20190030294" target="_blank" rel="noreferrer">NASA 참조 궤적 문서 ↗</a><p>원본 SPK의 구간별 위치·속도와 7차 보간 규칙으로 출발 상태를 얻습니다. 출발 후 경로와 자유비행 미리보기는 현재 모델의 수치 적분입니다. 실제 Gateway 운용 궤적이 아닙니다.</p></div>}<div><b>NASA GRAIL · GL1800F</b><span>DE440 PA · 정적 비구면 달 중력장</span><a href="https://pds-geosciences.wustl.edu/grail/grail-l-lgrs-5-rdr-v1/grail_1001/shadr/jggrx_1800f_sha.xml" target="_blank" rel="noreferrer">NASA PDS 계수·좌표계 설명 ↗</a><p>Mode B에서 선택한 차수까지 전역 계수를 사용합니다. 달의 고체 조석 변형은 생략합니다. 중력장 기준 반지름 1,738 km와 LOLA 고도 기준 1,737.4 km를 구별합니다.</p></div><div><b>NASA LOLA</b><span>240 m 극 평사 DEM · 지형 고도 및 충돌 검사</span><a href="https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/" target="_blank" rel="noreferrer">PDS 공식 원본 ↗</a></div><div><b>JPL SPICE / DE440</b><span>MOON_ME ↔ J2000 · 표면 회전속도 반영</span><a href="https://naif.jpl.nasa.gov/naif/data_generic.html" target="_blank" rel="noreferrer">NAIF 공식 원본 ↗</a></div><div><b>NASA SVS CGI Moon Kit</b><span>전역 달 표면 텍스처 · 시각화용</span><a href="https://svs.gsfc.nasa.gov/4720/" target="_blank" rel="noreferrer">NASA SVS ↗</a></div><div><b>기존 착륙지·착륙선 카탈로그</b><span>{sites.length}개 착륙지 · {landerCount}개 참고 착륙선</span><p>출처가 부족한 엔진·질량 값은 사용하지 않습니다. 현재 착륙선은 가상의 시험 제원입니다.</p></div></div>{result?.nrho && <details><summary>NRHO 초기조건 및 전이 메타데이터</summary><pre>{JSON.stringify({ source: result.nrho.source, mode: result.nrho.mode, gravity: result.nrho.gravity, ephemeris: result.nrho.ephemeris, transfer: result.nrho.transfer }, null, 2)}</pre></details>}<details><summary>데이터 매니페스트</summary><pre>{JSON.stringify(manifest, null, 2)}</pre></details><p className="model-note">{describedEphemeris ? (describedGravity === 'grail' ? `Mode B는 달 GL1800F ${describedGravityDegree}차 정적 중력장과 지구·태양 제3체 중력을 전이·LLO·DOI·하강에 적용합니다. 이탈·진입·DOI는 고정 관성 방향의 유한 추력과 질량 감소로 계산합니다. 고체 조석 변형, 자세 동역학과 궤도 유지 기동은 포함하지 않습니다.` : 'Mode B 점질량 선택은 달 중심 중력과 지구·태양 제3체 중력으로 전 구간을 계산합니다. 이탈·진입·DOI는 유한 연소로 계산합니다. 달 고차 중력장, 고체 조석 변형, 자세 동역학과 궤도 유지 기동은 포함하지 않습니다.') : '달 중심 2체 중력, 순간 DOI 기동, 시간에 따라 변하는 추력과 추진제 질량을 모델링합니다.'} 지형 범위 밖에서는 충돌 검증을 완료했다고 판정하지 않습니다. 자세한 가정과 적용 범위는 프로젝트 PHYSICS_MODEL.md 및 LIMITATIONS.md를 확인하세요.</p></> : <><span className={`status-pill ${statusTone(result?.status ?? 'READY')}`}><i/>{result?.status}</span><p>{result?.message ?? progress}</p>{checks.length > 0 && <div className="validation-list">{checks.map(([key, value]) => <div key={key}><span className={isPass(value) ? 'check-ok' : 'check-fail'}><Icon name={isPass(value) ? 'check' : 'close'} size={15}/></span><b>{key.replaceAll('_', ' ')}</b><span>{isPass(value) ? 'PASS' : 'NOT PASSED'}</span></div>)}</div>}<details open><summary>수치 검증 결과</summary><pre>{JSON.stringify(result?.validation, null, 2)}</pre></details>{result?.warnings?.length ? <ul>{result.warnings.map(w => <li key={w}>{w}</li>)}</ul> : null}<p className="model-note">VALIDATED는 명시된 모델과 수치 허용오차 안의 검증입니다. 지형 격자 사이의 미세 장애물이나 실제 임무의 안전을 보증하지 않습니다.</p></>}</section></div>}
    <FailureDialog guidance={failure} open={failureOpen} onClose={() => setFailureOpen(false)} onEdit={() => {
      if (integration) { integration.publish('EDIT_REQUEST', { section: 'settings' }); return; }
      requestAnimationFrame(() => { setupForm.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); setupForm.current?.querySelector<HTMLElement>('input:not([disabled]),select:not([disabled])')?.focus({ preventScroll: true }); });
    }}/>
  </div>;
}
