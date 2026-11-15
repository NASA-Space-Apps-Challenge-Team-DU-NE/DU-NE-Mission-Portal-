// 01 임무 설정: [임무 프로파일] 미션 프로파일(P2-03), 필수 조건·가중치(P1-18), 임무 기간·통신 여유각(P1-16)
//              [착륙선 정보] 착륙선 프리셋(P1-29), 발전 방식, 전력·통신, 질량·추력(궤도 분석용)
import { Card, Help, Seg, pct } from '../components/kit';
import { DEFAULTS, POWER_KINDS, PROFILES, type LanderExtra, type PowerKind, type ProfileId } from '../config';
import type { Criterion, HardFilters, Lander } from '../core/types';
import { useLander } from '../state/derived';
import { useData } from '../state/data';
import { useGridRun } from '../state/gridRun';
import { needsSun, useApp, type ProfileSel } from '../state/store';
import { CRIT, CRIT_COL, PROFILE_UI, useUi } from '../state/ui';

type NumKey = Exclude<keyof HardFilters, 'artemis_only'>;
const FILTERS: Array<[NumKey, string, string, number, number, number, number, (v: number) => string, string]> = [
  ['min_illum_frac', '임무 기간 일조율', '≥', 0.6, 0, 1, 0.05, (v) => pct(v), '해가 이 비율 이상 드는 곳만 남깁니다.'],
  ['min_comm_frac', '임무 기간 교신율', '≥', 0.5, 0, 1, 0.05, (v) => pct(v), '지구와 이 비율 이상 교신할 수 있는 곳만.'],
  ['max_slope_deg', '경사 (90분위)', '≤', 15, 1, 30, 1, (v) => `${v}°`, '착륙선이 안전하게 설 수 있는 경사 한계.'],
  ['max_water_km', '영구음영(물 후보)까지', '≤', 20, 1, 100, 1, (v) => `${v} km`, '얼음이 있을 만한 곳에서 이 거리 안쪽만.'],
  ['max_dark_h', '최장 연속 그늘', '≤', 48, 0, 240, 6, (v) => `${v} h`, '배터리로 버텨야 하는 가장 긴 그늘 시간.'],
  ['avoid_faults_km', '단층애에서 떨어진 거리', '≥', 10, 1, 50, 1, (v) => `${v} km`, '지질 위험 경고 거리(임시값).'],
];
const CRITS = Object.keys(CRIT) as Criterion[];

function ProfileTab() {
  const app = useApp();
  const sun = useApp(needsSun);
  const res = useGridRun((g) => g.result);
  const grid = useData((d) => d.grid);
  const nCells = grid?.cells.length ?? 0;
  const regions = useData((d) => d.artemisRegions);
  const dis = (k: keyof HardFilters) => res?.filters.find((f) => f.key === k)?.disabled ?? false;
  const wsum = CRITS.reduce((a, k) => a + (k === 'power' && !sun ? 0 : app.mapWeights[k]), 0) || 1;
  const profs: ProfileSel[] = ['custom', 'long_base', 'recon', 'water'];
  return (
    <>
      <Card title="미션 프로파일" tag={<span className="badge prov">임시값 PROVISIONAL</span>}>
        <div className="g4">
          {profs.map((k) => {
            const w = k === 'custom' ? app.customWeights : PROFILES[k as ProfileId].weights;
            return (
              <button key={k} className="opt" aria-pressed={app.profile === k} onClick={() => app.setProfile(k)}>
                <b>{PROFILE_UI[k].name}{k === 'custom' ? <> <span className="badge ok">기본</span></> : null}</b>
                <span>{PROFILE_UI[k].desc}</span>
                <span className="mono tiny">발전 {w.power} · 교신 {w.comm} · 물 {w.water} · 안전 {w.safety}</span>
              </button>
            );
          })}
        </div>
        <Help><b>사용자 설정</b>(기본)은 아래 가중치를 직접 정합니다. 다른 프로파일을 고르면 가중치가 자동으로 채워지고, 그 뒤 가중치를 움직이면 다시 사용자 설정으로 바뀝니다.</Help>
      </Card>
      <div className="g21">
        <div className="col">
          <Card title="필수 조건" sub="못 넘으면 제외">
            <div className="bigcount"><b>{res?.passCount ?? '—'}</b><span className="muted">/ {nCells.toLocaleString()} 칸 통과</span></div>
            <Help>켠 조건을 하나라도 못 넘는 곳은 순위에서 빠지고 지도에서 흐리게 보입니다. 너무 적게 남으면 조건을 풀어 보세요.</Help>
            <div>
              {FILTERS.map(([k, label, op, def, mn, mx, st, fmt, hp]) => {
                // 햇빛이 필요 없는 발전이면 일조율·최장 그늘 조건은 계산에서 빠진다
                const sunOnly = k === 'min_illum_frac' || k === 'max_dark_h';
                const on = app.filters[k] !== undefined, v = on ? (app.filters[k] as number) : def, d = dis(k) || (sunOnly && !sun);
                return (
                  <div key={k} className={`frow ${on ? '' : 'off'}`}>
                    <input type="checkbox" checked={on} disabled={d} aria-label={`${label} 조건 켜기`} onChange={(e) => app.setFilter(k, e.target.checked ? def : undefined)} />
                    <span className="lb">{label} {op}{d ? <span className="tiny muted"> · {sunOnly && !sun ? '발전 방식상 제외' : '자료 없음'}</span> : null}</span>
                    <output>{fmt(v)}</output>
                    <input type="range" min={mn} max={mx} step={st} value={v} disabled={!on} onChange={(e) => app.setFilter(k, Number(e.target.value))} />
                    <span className="hp">{hp}</span>
                  </div>
                );
              })}
              <div className={`frow ${app.filters.artemis_only ? '' : 'off'}`}>
                <input type="checkbox" checked={!!app.filters.artemis_only} disabled={dis('artemis_only') || !regions.length} onChange={(e) => app.setFilter('artemis_only', e.target.checked || undefined)} />
                <span className="lb">아르테미스 III 후보 지역 안만</span><output />
                <span className="hp">{regions.length ? `USGS 2024 공식 경계 ${regions.length}곳 (DOI 10.5066/P1MEQ6UK) 안쪽 칸만 남깁니다.` : '공식 경계 자료 없음 → 사용할 수 없습니다.'}</span>
              </div>
            </div>
          </Card>
        </div>
        <div className="col">
          <Card title="가중치" sub="순위에 반영" tag={<span className="badge prov">임시값</span>}>
            <Help>남은 곳들 중 무엇을 더 중요하게 볼지 정합니다. 비율만 의미가 있습니다.{sun ? null : <> 지금 발전 방식(<b>{POWER_KINDS[app.powerSource.kind].name}</b>)은 햇빛이 필요 없어 <b>발전(일조)</b> 가중치와 시나리오 점수의 전력 항목을 계산에서 뺍니다.</>}</Help>
            <div className="share">
              {CRITS.filter((k) => app.mapWeights[k] > 0 && (sun || k !== 'power')).map((k) => { const s = (app.mapWeights[k] / wsum) * 100; return <div key={k} style={{ width: `${s}%`, background: CRIT_COL[k] }} title={`${CRIT[k]} ${Math.round(s)}%`}>{s >= 9 ? `${Math.round(s)}%` : ''}</div>; })}
            </div>
            {CRITS.map((k) => (
              <div key={k} className="wrow">
                <label className="small"><i className="sw" style={{ background: CRIT_COL[k], marginRight: 6 }} />{CRIT[k].split('(')[0]}{k === 'power' && !sun ? <span className="tiny muted"> · 제외</span> : res?.missing.includes(k) ? <span className="tiny muted"> · 자료 없음</span> : null}</label>
                <input type="range" min={0} max={100} step={5} disabled={k === 'power' && !sun} value={app.mapWeights[k]} aria-label={`${CRIT[k]} 가중치`} onChange={(e) => app.setWeight(k, Number(e.target.value))} />
                <output>{app.mapWeights[k]}</output>
              </div>
            ))}
          </Card>
          <Card title="임무 기간 · 통신 여유각" tag={<span className="badge prov">임시값</span>}>
            <div className="wrow"><label className="small">임무 기간</label><input type="range" min={24} max={1440} step={24} value={app.duration_h} onChange={(e) => app.setDuration(Number(e.target.value))} /><output>{app.duration_h}</output></div>
            <div className="chips">
              {([[72, '3일'], [240, '10일'], [720, '30일'], [1440, '60일']] as Array<[number, string]>).map(([v, l]) => <button key={v} className="chip" aria-pressed={app.duration_h === v} onClick={() => app.setDuration(v)}>{l}</button>)}
              <span className="tiny muted" style={{ alignSelf: 'center' }}>시간(h) 단위</span>
            </div>
            <div className="wrow"><label className="small">통신 여유각</label><input type="range" min={0} max={10} step={0.5} value={app.margin_deg} onChange={(e) => app.setMargin(Number(e.target.value))} /><output>{app.margin_deg}°</output></div>
            <Help><b>통신 여유각</b>: 지구가 지형선보다 이 각도만큼 더 높아야 교신 가능으로 칩니다. 클수록 깐깐합니다. 04 임무 분석의 통신 탭도 이 값을 씁니다.</Help>
          </Card>
        </div>
      </div>
    </>
  );
}

const EXTRA: Array<[keyof LanderExtra, string, number]> = [
  ['dry_mass_kg', '건조 질량 (kg)', 10], ['prop_mass_kg', '추진제 질량 (kg)', 10], ['thrust_n', '주 엔진 추력 (N)', 10], ['isp_s', '비추력 Isp (s)', 1],
];
const num = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : '');

function LanderTab() {
  const app = useApp();
  const ui = useUi();
  const landers = useData((d) => d.landers.items);
  const L = useLander();
  const ps = app.powerSource, kind = POWER_KINDS[ps.kind];
  const fld = (k: keyof Lander, l: string, st: number) => (
    <label className="small muted" key={k}>{l}<br /><input className="field num" type="number" step={st} value={num(L?.[k] as number)} onChange={(e) => app.editLander({ [k]: e.currentTarget.valueAsNumber } as Partial<Lander>)} /></label>
  );
  const ex = app.landerExtra;
  const m0 = ex.dry_mass_kg + ex.prop_mass_kg;
  const dv = ex.dry_mass_kg > 0 && m0 > 0 ? ex.isp_s * 9.80665 * Math.log(m0 / ex.dry_mass_kg) : NaN;
  const tw = m0 > 0 ? ex.thrust_n / (m0 * 1.62) : NaN;
  return (
    <>
      <Card title="착륙선 프리셋" tag={<span className="badge approx">근사값</span>}>
        <div className="row">
          <select className="field" value={L?.id ?? ''} style={{ minWidth: 300 }} onChange={(e) => app.setLander(e.target.value)}>
            {landers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          {Object.keys(app.landerEdits).length ? <button className="btn sm" onClick={() => L && app.setLander(L.id)}>원래 값으로</button> : null}
        </div>
        <Help>대표 유형의 근사값입니다. 아래 숫자를 바꾸면 04 임무 분석의 타임랩스가 바로 다시 계산됩니다.</Help>
      </Card>
      <Card title="발전 방식" tag={<span className="badge prov">출력·연료 임시값</span>}>
        <Seg<PowerKind> value={ps.kind} opts={(Object.keys(POWER_KINDS) as PowerKind[]).map((k) => [k, POWER_KINDS[k].name] as [PowerKind, string])} onChange={(k) => app.setPowerSource({ kind: k })} wrap />
        <p className="help" style={{ margin: 0 }}>{kind.desc}.{kind.needsSun ? '' : ' 햇빛이 필요 없으므로 일조율·최장 그늘은 가중치·필수 조건·점수 계산에서 빠집니다.'}</p>
        {kind.needsSun ? (
          <div className="row">{fld('panel_area_m2', '패널 면적 (m²)', 0.1)}{fld('efficiency', '패널 효율', 0.01)}</div>
        ) : (
          <div className="row">
            <label className="small muted">정격 출력 (W)<br /><input className="field num" type="number" min={0} step={10} value={num(ps.output_w)} onChange={(e) => app.setPowerSource({ output_w: e.currentTarget.valueAsNumber })} /></label>
            {kind.usesFuel ? <label className="small muted">실은 연료 에너지 (Wh)<br /><input className="field num" type="number" min={0} step={1000} value={num(ps.fuel_wh)} onChange={(e) => app.setPowerSource({ fuel_wh: e.currentTarget.valueAsNumber })} /></label> : null}
          </div>
        )}
      </Card>
      <div className="g2">
        <Card title="전력 · 통신" sub="착륙선">
          <div className="row">{fld('battery_wh', '배터리 (Wh)', 100)}{fld('load_active_w', '작업 중 소비 (W)', 10)}{fld('load_idle_w', '대기 소비 (W)', 10)}{fld('load_survival_w', '생존 최소 소비 (W)', 5)}</div>
          <div className="row">{fld('rate_kbps', '전송 속도 (kbps)', 50)}</div>
          <div className="row">
            <label className="small muted">기지 필요 전력 (kW)<br /><input className="field num" type="number" min={0} step={1} value={ui.demand_kw} onChange={(e) => ui.set({ demand_kw: Number(e.target.value) })} /></label>
            {kind.needsSun ? <label className="small muted">전력 계획 패널 효율<br /><input className="field num" type="number" min={0.05} max={0.5} step={0.01} value={ui.eff} onChange={(e) => ui.set({ eff: Number(e.target.value) })} /></label> : null}
          </div>
          <Help>04 임무 분석의 <b>전력</b> 탭이 기지 필요 전력으로 {kind.needsSun ? <>패널 면적과 배터리 용량을 계산합니다. 태양을 따라 도는 수직 패널 기준, 시스템 손실 {DEFAULTS.panel_loss * 100}%, 설계 여유 {DEFAULTS.power_margin * 100}% (임시값).</> : <>필요한 발전기 대수를 봅니다.</>}</Help>
        </Card>
        <Card title="질량 · 추진" sub="궤도 분석용" tag={<span className="badge prov">임시값 PROVISIONAL</span>}>
          <div className="row">{EXTRA.map(([k, l, st]) => <label key={k} className="small muted">{l}<br /><input className="field num" type="number" min={0} step={st} value={num(ex[k])} onChange={(e) => app.setLanderExtra({ [k]: e.currentTarget.valueAsNumber } as Partial<LanderExtra>)} /></label>)}</div>
          <div className="row small">
            <span>속도 변화 여유 Δv <b className="mono">{Number.isFinite(dv) ? `${Math.round(dv).toLocaleString()} m/s` : '—'}</b></span>
            <span>달 표면 추력 대 무게비 <b className="mono">{Number.isFinite(tw) ? tw.toFixed(2) : '—'}</b></span>
          </div>
          <Help>로켓 방정식 Δv = Isp·g₀·ln(전체 질량 ÷ 건조 질량)과 달 중력 1.62 m/s² 기준 추력 대 무게비입니다. 05 궤도 분석에서 쓸 입력이며 공개 근거가 없는 임시값입니다.</Help>
        </Card>
      </div>
    </>
  );
}

export default function Cond() {
  const ui = useUi();
  return (
    <>
      <div className="tabs pagetabs" role="tablist">
        {([['profile', '임무 프로파일'], ['lander', '착륙선 정보']] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={ui.condTab === k} onClick={() => ui.set({ condTab: k })}>{l}</button>)}
      </div>
      {ui.condTab === 'profile' ? <ProfileTab /> : <LanderTab />}
    </>
  );
}
