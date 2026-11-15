import type { NRHOSettings as Settings } from '../types';
import { Icon } from './Icon';

function Field({ label, value, unit, onChange, min, max, step = 'any' }: { label: string; value: number; unit: string; onChange(v: number): void; min?: number; max?: number; step?: number | 'any' }) {
  return <label className="number-field"><span>{label}</span><div className="input-unit"><input type="number" value={Number.isFinite(value) ? value : ''} min={min} max={max} step={step} onChange={e => onChange(e.target.valueAsNumber)} required/><em>{unit}</em></div></label>;
}

export default function NRHOSettings({ settings, coverage, dataError, onChange }: { settings: Settings; coverage?: [string, string]; dataError?: string | null; onChange(next: Settings): void }) {
  const patch = (value: Partial<Settings>) => onChange({ ...settings, ...value });
  const grail = settings.gravity_model === 'grail';
  const degree = settings.gravity_degree ?? 30;
  return <section className="form-section nrho-settings"><div className="section-label">NRHO SETTINGS <span>날짜 기반 전이</span></div>
    <div className="reference-mode ephemeris-mode"><b>MODE B · DATED EPHEMERIS</b><span>UTC · 지구·달·태양 중력 · 날짜별 달 자세</span><small>정적 NASA 데이터로 전 구간을 브라우저에서 계산합니다. 실제 Gateway 운용 궤적을 재현하는 모델은 아닙니다.</small></div>
    <div className="gravity-settings"><label className="field-label">달 중력장<select value={settings.gravity_model ?? 'point_mass'} onChange={e => patch({ gravity_model: e.target.value as Settings['gravity_model'] })}><option value="point_mass">기존 점질량 · 비교 기준</option><option value="grail">GRAIL GL1800F · 비구면 중력</option></select></label>
      {grail && <label className="field-label">중력장 최대 차수<select value={degree} onChange={e => patch({ gravity_degree: Number(e.target.value) as Settings['gravity_degree'] })}><option value={20}>20차 · 계산량 낮음</option><option value={30}>30차 · 기본</option><option value={60}>60차 · 세부 중력</option><option value={90}>90차 · 고급 / 계산량 높음</option>{degree === 0 && <option value={0}>0차 · 동일 GM 검증 기준</option>}</select></label>}
      <p className="help-text">{grail ? 'DE440 PA · 전역 구면조화 계수. 차수를 높이면 계산량이 늘어납니다. 정적 중력장이며 달의 고체 조석 변형은 포함하지 않습니다.' : '달은 중심 점질량으로 계산합니다. 지구·태양의 제3체 중력과 날짜별 달 자세는 유지합니다.'}</p>
      {grail && <a className="gravity-source" href="https://pds-geosciences.wustl.edu/grail/grail-l-lgrs-5-rdr-v1/grail_1001/shadr/jggrx_1800f_sha.xml" target="_blank" rel="noreferrer">NASA PDS · GL1800F 원본 설명 ↗</a>}
      <small className="gravity-caution">모델·차수를 바꾸면 이전 경로를 지우고 다시 계산합니다. 차수는 실제 착륙 정확도의 보증값이 아닙니다.</small>
    </div>
    <p className="reference-quality">출발 상태 · NASA NRHO 참조 궤적의 시각별 위치·속도</p>
    <div className="ephemeris-coverage"><b>NASA 정적 천체력 범위</b><span>{coverage ? `${coverage[0].slice(0, 10)} ~ ${coverage[1].slice(0, 10)} UTC` : dataError ? '지원 기간을 확인할 수 없습니다.' : '지원 기간을 확인하고 있습니다…'}</span><small>원본 구간 경계·기동·미세 공백을 보존합니다. 공백 안의 출발 상태는 생성하지 않습니다.</small><small>출발부터 접지까지 전 구간이 데이터 범위 안에 있어야 합니다.</small>{dataError && <p role="status">{dataError} 새로고침해 주세요.</p>}</div>
    <p className="help-text">착륙 UTC와 전이 시간으로 출발 시각을 정한 뒤, NASA 참조 궤적에서 그 시각의 위치·속도를 조회합니다. 이탈 이후 전이·착륙과 자유비행 미리보기는 브라우저가 적분합니다.</p>
    <label className="field-label">전체 임무 최적화 목표<select value={settings.objective} onChange={e => patch({ objective: e.target.value as Settings['objective'] })}><option value="balanced">Balanced mission · 균형</option><option value="delta_v">Minimum total ΔV · 기동량</option><option value="time">Minimum mission time · 전체 시간</option></select></label>
    <p className="help-text">이탈·진입·DOI는 실제 추력과 질량 감소를 적분하는 유한 연소입니다. 전이와 착륙 후보를 함께 비교합니다. 균형 목표는 전체 ΔV에 비행 1일당 100 m/s를 더해 평가합니다. 자세·점화 과도응답은 포함하지 않습니다.</p>
    <label className="field-label">입력 총질량의 기준 시점<select value={settings.mass_basis} onChange={e => patch({ mass_basis: e.target.value as Settings['mass_basis'] })}><option value="llo">LLO 진입 후 질량 · 기존 착륙선 유지</option><option value="nrho">NRHO 출발 질량 · 전이 연료 차감</option></select></label>
    <p className="help-text">{settings.mass_basis === 'llo' ? 'NRHO에서 필요한 시작 질량을 전이 ΔV와 로켓 방정식으로 계산합니다.' : '이탈·진입 기동 후의 질량으로 착륙 경로를 다시 계산합니다.'}</p>
    <details><summary>날짜·전이 고급 설정 <Icon name="chevron" size={13}/></summary><div className="details-content">
      <p className="help-text">전이 시간에 따라 출발 시각을 탐색하고 해당 시각의 NASA 참조 상태를 직접 조회합니다.</p>
      <div className="field-pair"><Field label="전이 시간 최소" value={settings.transfer_tof_min_days} unit="d" min={0.01} max={14} onChange={v => patch({ transfer_tof_min_days: v })}/><Field label="전이 시간 최대" value={settings.transfer_tof_max_days} unit="d" min={settings.transfer_tof_min_days} max={14} onChange={v => patch({ transfer_tof_max_days: v })}/></div>
        <label className="field-label">동력 하강 시간<select value={settings.powered_descent_duration_s===undefined?'auto':'fixed'} onChange={e=>patch({powered_descent_duration_s:e.target.value==='auto'?undefined:880})}><option value="auto">후보 시간 탐색</option><option value="fixed">시간 지정</option></select></label>
        {settings.powered_descent_duration_s!==undefined && <Field label="동력 하강 시간" value={settings.powered_descent_duration_s} unit="s" min={260} max={1200} step={10} onChange={v=>patch({powered_descent_duration_s:v})}/>}
        <label className="field-label">착륙 접근 방향<select value={settings.approach_heading_deg===undefined?'auto':'fixed'} onChange={e=>patch({approach_heading_deg:e.target.value==='auto'?undefined:180})}><option value="auto">네 방향 탐색</option><option value="fixed">방향 지정</option></select></label>
        {settings.approach_heading_deg!==undefined && <Field label="접근 방향 · 북쪽 기준 시계방향" value={settings.approach_heading_deg} unit="°" min={0} max={359.99} step={1} onChange={v=>patch({approach_heading_deg:v})}/>}
        <p className="help-text">하강 시간과 접근 방향을 바꾸면 경로·연료를 다시 계산합니다. 저고도 속도·추력 기울기·접촉 제한은 항상 적용됩니다.</p>
      <Field label="최대 전이 ΔV" value={settings.max_transfer_delta_v_m_s} unit="m/s" min={1} onChange={v => patch({ max_transfer_delta_v_m_s: v })}/>
      <Field label="LLO 대기 궤도 수" value={settings.parking_revolutions} unit="rev" min={0} max={5} step={1} onChange={v => patch({ parking_revolutions: v })}/>
      <div className="field-pair"><Field label="최대 반복 횟수" value={settings.max_iterations} unit="iter" min={1} max={100} step={1} onChange={v => patch({ max_iterations: v })}/><Field label="계산 시간 제한" value={settings.max_computation_seconds} unit="s" min={1} max={300} step={1} onChange={v => patch({ max_computation_seconds: v })}/></div>
      <p className="help-text">제한 시간 안에서 찾은 후보만 평가합니다. 수렴 실패는 물리적 불가능의 증명이 아닙니다.</p>
    </div></details>
  </section>;
}
