// 05 임무 시뮬레이션: 착륙선 프리셋(P1-29), 타임랩스·멈춤(P1-33·34), 착륙선 시점(P3-03), 1년 기지 운용(P1-32)
// 그 아래에 전력 계획(Power)과 통신(Comm)을 이어 붙인다 (옛 05·07 단계).
import { useMemo, useState } from 'react';
import { Card, Help, Kpi, NoData, Progress, hrs, pct, utc } from '../components/kit';
import { LineChart, Pano } from '../components/viz';
import { DEFAULTS } from '../config';
import { HOUR_MS } from '../core/constants';
import type { BaseSimResult } from '../core/energy';
import { skyState } from '../core/sky';
import type { Lander } from '../core/types';
import { useData } from '../state/data';
import { useLander, useSim } from '../state/derived';
import { useResolvedSite, useSiteCtx } from '../state/hooks';
import { ephPayload, siteMaskOf } from '../state/scenario';
import { useApp } from '../state/store';
import { isCancelled, simWorker } from '../workers/client';
import Comm from './Comm';
import Power from './Power';

const VN = { met: '표면 운용 요구 조건 충족', partial: '표면 운용 요구 조건 부분 충족', not_met: '표면 운용 요구 조건 미충족' } as const;
const CAUSE = { sun_blocked: '일조 차단', earth_blocked: '지구 가림', over_consumption: '소비 과다' } as const;
const EVK: Record<string, string> = { blackout_start: '정전 시작', blackout_end: '정전 끝', comm_lost: '교신 끊김 시작', comm_back: '교신 재개', isru_off: 'ISRU 정지 (배터리 20% 미만)', isru_on: 'ISRU 재개' };

function SimMain() {
  const app = useApp();
  const rs = useResolvedSite();
  const ctx = useSiteCtx(rs);
  const landers = useData((d) => d.landers.items);
  const L = useLander();
  const R = useSim();
  const now = useMemo(() => (ctx ? skyState(ctx.frame, ctx.mask, ctx.eph, app.t, ctx.margin_deg) : null), [ctx, app.t]);

  const [loads, setLoads] = useState({ habitat_kw: 10, isru_kw: 15, constant_kw: 2 });
  const [auto, setAuto] = useState(true);
  const [sys, setSys] = useState({ panel_area_m2: 300, efficiency: 0.3, loss: DEFAULTS.panel_loss, battery_kwh: 500, isru_off_below: 0.2, isru_on_above: 0.5 });
  const [B, setB] = useState<{ res: BaseSimResult; sys: typeof sys } | null>(null);
  const [prog, setProg] = useState<number | null>(null);
  const runBase = () => {
    if (!rs) return;
    setProg(0);
    simWorker()
      .request<typeof B>('base', { eph: ephPayload(), site: siteMaskOf(rs), margin_deg: app.margin_deg, start: app.landing, days: 365, loads, sys, auto, eff: sys.efficiency, loss: sys.loss, margin: DEFAULTS.power_margin }, { onProgress: setProg })
      .then((r) => { setB(r); setProg(null); })
      .catch((e) => { if (!isCancelled(e)) { setProg(null); console.warn("worker", e); } });
  };

  if (!rs || !ctx || !R || !L) return <NoData what="착륙지" why="02에서 착륙지를 먼저 고르세요" />;
  const { sim, samples } = R;
  const fld = (k: keyof Lander, l: string, st: number) => (
    <label className="small muted" key={k}>{l}<br /><input className="field num" type="number" step={st} value={L[k] as number} onChange={(e) => app.editLander({ [k]: Number(e.target.value) } as Partial<Lander>)} /></label>
  );
  const rel = Math.max(0, Math.min(app.duration_h, (app.t - app.landing) / HOUR_MS));
  return (
    <>
      <Card title="착륙선 프리셋" tag={<span className="badge approx">근사값</span>}>
        <div className="row">
          <select className="field" value={L.id} style={{ minWidth: 300 }} onChange={(e) => app.setLander(e.target.value)}>
            {landers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          {Object.keys(app.landerEdits).length ? <button className="btn sm" onClick={() => app.setLander(L.id)}>원래 값으로</button> : null}
        </div>
        <div className="row">{fld('panel_area_m2', '패널 면적 (m²)', 0.1)}{fld('efficiency', '패널 효율', 0.01)}{fld('battery_wh', '배터리 (Wh)', 100)}{fld('load_active_w', '작업 중 소비 (W)', 10)}{fld('load_idle_w', '대기 소비 (W)', 10)}{fld('rate_kbps', '전송 속도 (kbps)', 50)}</div>
        <Help>대표 유형의 근사값입니다. 숫자를 바꾸면 아래 타임랩스가 바로 다시 계산됩니다.</Help>
      </Card>
      <Card title="표면 운용 타임랩스" sub={`${app.duration_h} h · ${L.name.split(' (')[0]}`}>
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
      <Card title="1년 기지 운용" sub="최대 1년 정전·교신 끊김·가동률 예측">
        <div className="row">
          <label className="small muted">거주 부하 (kW)<br /><input className="field num" type="number" value={loads.habitat_kw} onChange={(e) => setLoads({ ...loads, habitat_kw: Number(e.target.value) })} /></label>
          <label className="small muted">ISRU 부하 (kW)<br /><input className="field num" type="number" value={loads.isru_kw} onChange={(e) => setLoads({ ...loads, isru_kw: Number(e.target.value) })} /></label>
          <label className="small muted">상시 부하 (kW)<br /><input className="field num" type="number" value={loads.constant_kw} onChange={(e) => setLoads({ ...loads, constant_kw: Number(e.target.value) })} /></label>
          <label className="small" style={{ display: 'flex', gap: 6, alignItems: 'center', alignSelf: 'flex-end' }}><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> 자동 크기 (첫 30일 전력 계획)</label>
          {auto ? null : <>
            <label className="small muted">패널 (m²)<br /><input className="field num" type="number" value={sys.panel_area_m2} onChange={(e) => setSys({ ...sys, panel_area_m2: Number(e.target.value) })} /></label>
            <label className="small muted">배터리 (kWh)<br /><input className="field num" type="number" value={sys.battery_kwh} onChange={(e) => setSys({ ...sys, battery_kwh: Number(e.target.value) })} /></label>
          </>}
          <button className="btn pri" style={{ alignSelf: 'flex-end' }} onClick={runBase}>1년 시뮬레이션 실행</button>
        </div>
        <p className="note">계산에 넣은 것: 햇빛(지형 그늘 포함), 지구 교신, 패널 효율·손실, 배터리. <b>뺀 것</b>: 열 해석, 먼지 쌓임, 장비 고장, 중계 위성. 배터리 20% 미만이면 ISRU를 멈추고 50% 넘으면 재개.</p>
        <Progress p={prog} />
        {B ? (
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
      </Card>
    </>
  );
}

/** 한 페이지에서 시뮬레이션 → 전력 계획 → 통신 순서로 아래로 이어진다. 위쪽 바로가기로 건너뛸 수 있다. */
export default function Sim() {
  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return (
    <>
      <nav className="jump" aria-label="이 페이지 안 바로가기">
        <button onClick={() => go('sec-sim')}>임무 시뮬레이션</button>
        <button onClick={() => go('sec-power')}>전력 계획 ↓</button>
        <button onClick={() => go('sec-comm')}>통신 ↓</button>
      </nav>
      <div id="sec-sim" className="secanchor" />
      <SimMain />
      <h2 id="sec-power" className="sechead"><span>전력 계획</span><small>필요 전력을 채우는 패널 면적·배터리 용량, 근처 더 좋은 자리, 마스트 높이</small></h2>
      <Power />
      <h2 id="sec-comm" className="sechead"><span>통신</span><small>착륙지에서 지구가 보이는 시간과 지상국(DSN 3곳·여주)에서 실제로 교신 가능한 구간</small></h2>
      <Comm />
    </>
  );
}
