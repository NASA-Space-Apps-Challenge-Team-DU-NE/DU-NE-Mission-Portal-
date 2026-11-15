// 04 임무 분석: 타임랩스·멈춤(P1-33·34), 착륙선 시점(P3-03), 1년 기지 운용(P1-32).
// 전력 계획(Power)과 통신(Comm)은 같은 페이지의 탭. 착륙선 프리셋(P1-29)은 01 임무 설정 › 착륙선 정보로 옮겼다.
import { useMemo, useState } from 'react';
import { Card, Help, Kpi, NoData, Progress, hrs, pct, utc } from '../components/kit';
import { LineChart, Pano } from '../components/viz';
import { DEFAULTS, POWER_KINDS } from '../config';
import { HOUR_MS } from '../core/constants';
import { baseInputError, type BaseSimResult } from '../core/energy';
import { skyState } from '../core/sky';
import { useLander, useSim } from '../state/derived';
import { useResolvedSite, useSiteCtx } from '../state/hooks';
import { ephPayload, siteMaskOf } from '../state/scenario';
import { useApp } from '../state/store';
import { useUi } from '../state/ui';
import { isCancelled, simWorker } from '../workers/client';
import { t } from '../strings';
import Comm from './Comm';
import Power from './Power';

const VN = { met: '표면 운용 요구 조건 충족', partial: '표면 운용 요구 조건 부분 충족', not_met: '표면 운용 요구 조건 미충족' } as const;
const CAUSE = { sun_blocked: '일조 차단', earth_blocked: '지구 가림', over_consumption: '소비 과다' } as const;
const EVK: Record<string, string> = { blackout_start: '정전 시작', blackout_end: '정전 끝', comm_lost: '교신 끊김 시작', comm_back: '교신 재개', isru_off: 'ISRU 정지 (배터리 20% 미만)', isru_on: 'ISRU 재개' };

function SimMain() {
  const app = useApp();
  const rs = useResolvedSite();
  const ctx = useSiteCtx(rs);
  const L = useLander();
  const R = useSim();
  const now = useMemo(() => (ctx ? skyState(ctx.frame, ctx.mask, ctx.eph, app.t, ctx.margin_deg) : null), [ctx, app.t]);

  const [loads, setLoads] = useState({ habitat_kw: 10, isru_kw: 15, constant_kw: 2 });
  const [auto, setAuto] = useState(true);
  const [sys, setSys] = useState({ panel_area_m2: 300, efficiency: 0.3, loss: DEFAULTS.panel_loss, battery_kwh: 500, isru_off_below: 0.2, isru_on_above: 0.5 });
  const [B, setB] = useState<{ res: BaseSimResult; sys: typeof sys } | null>(null);
  const [prog, setProg] = useState<number | null>(null);
  const [baseError, setBaseError] = useState<string | null>(null);
  const invalidBase = baseInputError(loads, sys) !== null;
  const runBase = () => {
    if (!rs || invalidBase) return;
    setB(null);
    setBaseError(null);
    setProg(0);
    simWorker()
      .request<typeof B>('base', { eph: ephPayload(), site: siteMaskOf(rs), margin_deg: app.margin_deg, start: app.landing, days: 365, loads, sys, auto, eff: sys.efficiency, loss: sys.loss, margin: DEFAULTS.power_margin }, { onProgress: setProg })
      .then((r) => { setB(r); setProg(null); })
      .catch((e) => { if (!isCancelled(e)) { setProg(null); setBaseError(t('base.run_failed')); } });
  };

  if (!rs || !ctx || !R || !L) return <NoData what="착륙지" why="02에서 착륙지를 먼저 고르세요" />;
  const { sim, samples } = R;
  const rel = Math.max(0, Math.min(app.duration_h, (app.t - app.landing) / HOUR_MS));
  return (
    <>
      <Card title="표면 운용 타임랩스" sub={`${app.duration_h} h · ${L.name.split(' (')[0]} · ${POWER_KINDS[app.powerSource.kind].name}`} tag={<button className="btn sm ghost" onClick={() => { useUi.getState().set({ condTab: 'lander' }); app.setPage('cond'); }}>착륙선 정보 바꾸기 (01)</button>}>
        <div className={`verdict ${sim.verdict}`}><b>{VN[sim.verdict]}</b><span className="small soft">기준: 운용 ≥ {app.req.min_ops_h} h, 전송 ≥ {app.req.data_mb.toLocaleString()} MB (임시값)</span></div>
        <div className="kpis">
          <Kpi l="운용 시간" v={hrs(sim.ops_h)} s={`기준 ≥ ${app.req.min_ops_h} h`} tone={sim.ops_h >= app.req.min_ops_h ? 'good' : 'bad'} />
          <Kpi l="누적 전송" v={`${Math.round(sim.total_sent_mb).toLocaleString()} MB`} s={`기준 ≥ ${app.req.data_mb} MB`} tone={sim.total_sent_mb >= app.req.data_mb ? 'good' : 'bad'} />
          <Kpi l="멈춤 지점" v={sim.stop_t ? utc(sim.stop_t) : '—'} s={sim.stop_t ? `원인: ${sim.stop_cause ? CAUSE[sim.stop_cause] : ''}` : '임무 끝까지 배터리 하한에 닿지 않음'} tone={sim.stop_t ? 'bad' : 'good'} />
        </div>
        {sim.stop_t ? <div className="row"><button className="btn" onClick={() => app.setT(sim.stop_t!)}>멈춘 시각으로 이동 →</button><span className="small soft">오른쪽 현장 뷰에서 그때 하늘(태양·지구가 어디 있었는지)을 확인하세요.</span></div> : null}
        <div className="chartlbl"><span>배터리 잔량 (%)</span><span className="legend"><span><i className="sw" style={{ background: 'var(--accent)' }} />배터리</span><span><i className="sw" style={{ background: 'var(--warn)', width: 2 }} />멈춤</span></span></div>
        <LineChart h={130} pick times={sim.t} series={[{ values: Array.from(sim.soc, (v) => v * 100), color: '--accent', fill: true }]} yMin={0} yMax={100} unit="%" marks={sim.stop_t ? [sim.stop_t] : []} />
        <div className="chartlbl"><span>발전과 소비 (W)</span><span className="legend"><span><i className="sw" style={{ background: 'var(--sun)' }} />발전</span><span><i className="sw" style={{ background: 'var(--warn)', height: 2 }} />소비</span></span></div>
        <LineChart h={110} pick times={sim.t} series={[{ values: sim.gen_w, color: '--sun' }, { values: sim.load_w, color: '--warn', dash: true }]} yMin={0} />
        <div className="row">
          <button className="ibtn pri" aria-label="재생" onClick={app.togglePlay}>{app.playing ? '❚❚' : '▶'}</button>
          <input type="range" min={0} max={app.duration_h} step={1} value={rel} style={{ flex: 1 }} onChange={(e) => app.setT(app.landing + Number(e.target.value) * HOUR_MS)} />
          <span className="mono small">{utc(app.t)}</span>
        </div>
      </Card>
      <Card title="착륙선 시점" tag={<span className="badge">3순위</span>}>
        <Help>착륙선에서 본 지평선과 하늘. 위 막대로 시간을 움직이면 태양·지구 위치가 바뀝니다.</Help>
        <Pano h={200} mask={ctx.mask} layers={[{ track: samples.filter((_, i) => i % 2 === 0) }]} now={now} />
      </Card>
      {!POWER_KINDS[app.powerSource.kind].needsSun ? (
        <Card title="1년 기지 운용" sub="최대 1년 정전·교신 끊김·가동률 예측"><div className="nodata">1년 기지 운용은 태양전지 패널·배터리 기준 계산입니다. 지금 발전 방식({POWER_KINDS[app.powerSource.kind].name})에서는 계산하지 않습니다.</div></Card>
      ) : <Card title="1년 기지 운용" sub="최대 1년 정전·교신 끊김·가동률 예측">
        <div className="row">
          <label className="small muted">거주 부하 (kW)<br /><input className="field num" type="number" min={0} step="any" disabled={prog !== null} value={Number.isFinite(loads.habitat_kw) ? loads.habitat_kw : ''} onChange={(e) => setLoads({ ...loads, habitat_kw: e.currentTarget.valueAsNumber })} /></label>
          <label className="small muted">ISRU 부하 (kW)<br /><input className="field num" type="number" min={0} step="any" disabled={prog !== null} value={Number.isFinite(loads.isru_kw) ? loads.isru_kw : ''} onChange={(e) => setLoads({ ...loads, isru_kw: e.currentTarget.valueAsNumber })} /></label>
          <label className="small muted">상시 부하 (kW)<br /><input className="field num" type="number" min={0} step="any" disabled={prog !== null} value={Number.isFinite(loads.constant_kw) ? loads.constant_kw : ''} onChange={(e) => setLoads({ ...loads, constant_kw: e.currentTarget.valueAsNumber })} /></label>
          <label className="small" style={{ display: 'flex', gap: 6, alignItems: 'center', alignSelf: 'flex-end' }}><input type="checkbox" disabled={prog !== null} checked={auto} onChange={(e) => setAuto(e.target.checked)} /> 자동 크기 (첫 30일 전력 계획)</label>
          {auto ? null : <>
            <label className="small muted">패널 (m²)<br /><input className="field num" type="number" min={0} step="any" disabled={prog !== null} value={Number.isFinite(sys.panel_area_m2) ? sys.panel_area_m2 : ''} onChange={(e) => setSys({ ...sys, panel_area_m2: e.currentTarget.valueAsNumber })} /></label>
            <label className="small muted">배터리 (kWh)<br /><input className="field num" type="number" min={0} step="any" disabled={prog !== null} value={Number.isFinite(sys.battery_kwh) ? sys.battery_kwh : ''} onChange={(e) => setSys({ ...sys, battery_kwh: e.currentTarget.valueAsNumber })} /></label>
          </>}
          <button className="btn pri" disabled={invalidBase || prog !== null} style={{ alignSelf: 'flex-end' }} onClick={runBase}>1년 시뮬레이션 실행</button>
        </div>
        <p className="note">계산에 넣은 것: 햇빛(지형 그늘 포함), 지구 교신, 패널 효율·손실, 배터리. <b>뺀 것</b>: 열 해석, 먼지 쌓임, 장비 고장, 중계 위성. 배터리 20% 미만이면 ISRU를 멈추고 50% 넘으면 재개.</p>
        <Progress p={prog} />
        {invalidBase || baseError ? <p className="note" role="alert">{invalidBase ? t('base.invalid_input') : baseError}</p> : null}
        {B && !invalidBase ? (
          <>
            <div className="kpis">
              <Kpi l="가동률" v={pct(B.res.uptime, 1)} tone={B.res.uptime > 0.99 ? 'good' : 'bad'} />
              <Kpi l="정전" v={hrs(B.res.blackout_h)} tone={B.res.blackout_h > 0 ? 'bad' : 'good'} />
              <Kpi l="교신 끊김" v={hrs(B.res.comm_gap_h)} />
              <Kpi l="ISRU 가동률" v={pct(B.res.isru_uptime, 1)} />
              <Kpi l="패널 · 배터리" v={`${Math.round(B.sys.panel_area_m2)} m²`} s={`${Math.round(B.sys.battery_kwh).toLocaleString()} kWh`} />
            </div>
            <div className="chartlbl"><span>배터리 (%) · 365일</span></div>
            <LineChart h={110} noCursor times={B.res.t} series={[{ values: Array.from(B.res.soc, (v) => v * 100), color: '--accent' }]} yMin={0} yMax={100} unit="%" />
            <div className="chartlbl"><span>발전·부하 (kW)</span><span className="legend"><span><i className="sw" style={{ background: 'var(--sun)' }} />발전</span><span><i className="sw" style={{ background: 'var(--warn)', height: 2 }} />부하</span></span></div>
            <LineChart h={110} noCursor times={B.res.t} series={[{ values: B.res.gen_kw, color: '--sun' }, { values: B.res.load_kw, color: '--warn', dash: true }]} yMin={0} />
            <details>
              <summary className="small">이벤트 기록 ({B.res.events.length})</summary>
              <div style={{ maxHeight: 220, overflow: 'auto' }}><table><tbody>{B.res.events.slice(0, 200).map((e, i) => <tr key={i} className="click" onClick={() => app.setT(e.t)}><td className="mono small">{utc(e.t)}</td><td>{EVK[e.kind] ?? e.kind}</td></tr>)}</tbody></table></div>
            </details>
          </>
        ) : null}
      </Card>}
    </>
  );
}

/** 임무 분석 · 전력 · 통신을 탭으로 나눈다 (스크롤 이동 대신) */
export default function Sim() {
  const tab = useUi((u) => u.simTab);
  const set = useUi((u) => u.set);
  return (
    <>
      <div className="tabs pagetabs" role="tablist">
        {([['mission', '임무 분석'], ['power', '전력'], ['comm', '통신']] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => set({ simTab: k })}>{l}</button>)}
      </div>
      {tab === 'mission' ? <SimMain /> : tab === 'power' ? <Power /> : <Comm />}
    </>
  );
}
