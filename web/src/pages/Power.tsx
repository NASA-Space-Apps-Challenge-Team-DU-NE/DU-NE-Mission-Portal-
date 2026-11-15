// 04 임무 분석 › 전력 탭: 전력 계산(P1-30), 패널 설치 추천(P1-31), 마스트 높이 비교(P3-01), 빛 릴레이(P3-02)
import { useEffect, useState } from 'react';
import { loadMastMasks } from '../adapters/data';
import { Card, Help, Kpi, NoData, Progress, hrs, km, pct } from '../components/kit';
import { LineChart } from '../components/viz';
import { DEFAULTS, FEATURES, POWER_KINDS } from '../config';
import { nearestCell, panelCandidates } from '../core/gridScore';
import { REGION_LABEL } from '../components/SouthMap';
import type { MastRow } from '../core/light';
import type { PanelPick } from '../core/power';
import { useData } from '../state/data';
import { calculationSource } from '../state/calculationSource';
import { usePower } from '../state/derived';
import { useGridRun } from '../state/gridRun';
import { useResolvedSite, useSiteLayers } from '../state/hooks';
import { ephPayload } from '../state/scenario';
import { useApp } from '../state/store';
import { useUi } from '../state/ui';
import { gridWorker, isCancelled, simWorker } from '../workers/client';
import { maskOf } from '../workers/protocol';

export default function Power() {
  const app = useApp();
  const ui = useUi();
  const rs = useResolvedSite();
  const grid = useData((d) => d.grid);
  const refs = useData((d) => d.powerRefs);
  const tableSource = useData((d) => d.ephMeta?.source);
  const ready = useGridRun((g) => g.ready);
  const gres = useGridRun((g) => g.result);
  const P = usePower(ui.demand_kw, ui.eff);
  // 빛 릴레이는 지금 지도 지역의 점수 계산(동적 배열)을 쓴다. 패널 추천은 지도 지역과 무관하게 지점을 덮는 지역 격자로 계산한다
  const cell = grid && rs ? nearestCell(grid, rs.site.lat_deg, rs.site.lon_deg, grid.manifest.cell_km) : -1;
  const sl = useSiteLayers(rs);
  const setMapRegion = useData((d) => d.setMapRegion);

  const [radius, setRadius] = useState(20);
  const [picks, setPicks] = useState<PanelPick[] | null>(null);
  const [prog, setProg] = useState<number | null>(null);
  const runPanels = () => {
    if (!sl.rd || sl.cell < 0) return;
    const cands = panelCandidates(sl.rd.geo, sl.rd.layers, sl.cell, radius, app.filters.max_slope_deg ?? null);
    setProg(0);
    simWorker()
      .request<PanelPick[]>('panels', { eph: ephPayload(), cands, observer_height_m: sl.rd.geo.manifest.observer_height_m, demand_kw: ui.demand_kw, eff: ui.eff, loss: DEFAULTS.panel_loss, margin: DEFAULTS.power_margin, start: app.landing, duration_h: 30 * 24, margin_deg: app.margin_deg }, { onProgress: setProg })
      .then((r) => { setPicks(r.slice(0, 5)); setProg(null); })
      .catch((e) => { if (!isCancelled(e)) { setProg(null); console.warn("worker", e); } });
  };

  const [mast, setMast] = useState<MastRow[] | null | 'missing'>(null);
  useEffect(() => {
    // 입력이 바뀌면 이전 요청(fetch·Worker) 결과는 버린다: 지점을 빨리 바꿔 응답 순서가 뒤집혀도 현재 지점 결과만 남는다
    let alive = true;
    const put = (v: MastRow[] | null | 'missing') => { if (alive) setMast(v); };
    setMast(null);
    if (!FEATURES.mastCompare || !rs || rs.terrain !== 'site') { setMast('missing'); return; }
    loadMastMasks(rs.site.id).then((r) => {
      if (!alive) return;
      if (r.status !== 'ok') return put('missing');
      const sites = r.value.data.masks.map((m) => ({ height_m: m.observer_height_m, site: { site: rs.site, mask: maskOf(m), ground_elev_m: m.ground_elev_m, observer_height_m: m.observer_height_m } }));
      simWorker().request<MastRow[]>('mast', { eph: ephPayload(), sites, margin_deg: app.margin_deg, start: app.landing, duration_h: 30 * 24, demand_kw: ui.demand_kw, eff: ui.eff, loss: DEFAULTS.panel_loss, margin: DEFAULTS.power_margin })
        .then(put)
        .catch((e) => { if (!isCancelled(e)) put('missing'); });
    }).catch(() => put('missing'));
    return () => { alive = false; };
  }, [rs, app.landing, ui.demand_kw, ui.eff, app.margin_deg]);

  const [relay, setRelay] = useState<Array<{ cell: number; km: number; either_lit_frac: number; longest_both_dark_h: number }> | null>(null);
  useEffect(() => {
    let alive = true;
    setRelay(null);
    if (!FEATURES.lightRelay || cell < 0 || !ready || !gres) return;
    gridWorker().request<typeof relay>('relay', { cell, radius_km: 30, step_h: DEFAULTS.grid_step_h }).then((r) => { if (alive) setRelay(r ? r.slice(0, 5) : r); }).catch(() => { if (alive) setRelay(null); });
    return () => { alive = false; };
  }, [cell, ready, gres]);

  if (!rs || !P) return <NoData what="전력 계획" why="02에서 착륙지를 먼저 고르세요" />;
  const kind = POWER_KINDS[app.powerSource.kind];
  if (!kind.needsSun) {
    const out = app.powerSource.output_w;
    const n = out > 0 ? Math.ceil((ui.demand_kw * 1000 * (1 + DEFAULTS.power_margin)) / out) : NaN;
    return (
      <Card title="전력 계산">
        <div className="nodata">지금 발전 방식(<b>{kind.name}</b>)은 햇빛이 필요 없어 패널 면적·일조 기반 계산(패널 설치 추천·마스트 높이·빛 릴레이)을 하지 않습니다.</div>
        <div className="kpis">
          <Kpi l="정격 출력 (1대)" v={`${out} W`} />
          <Kpi l="기지 필요 전력" v={`${ui.demand_kw} kW`} s={`여유 +${DEFAULTS.power_margin * 100}%`} />
          <Kpi l="필요 대수" v={Number.isFinite(n) ? `${n}대` : '—'} />
          {kind.usesFuel ? <Kpi l="연료로 버티는 시간" v={ui.demand_kw > 0 ? hrs(app.powerSource.fuel_wh / (ui.demand_kw * 1000)) : '—'} s="기지 필요 전력 기준, 1대분 연료" /> : null}
        </div>
        <div className="row"><button className="btn sm ghost" onClick={() => { useUi.getState().set({ condTab: 'lander' }); app.setPage('cond'); }}>01 임무 설정 › 착륙선 정보에서 바꾸기</button></div>
      </Card>
    );
  }
  const { plan, samples } = P;
  const source = calculationSource(samples.map((s) => s.source), tableSource);
  const terrain = rs.terrain === 'flat' ? '지형 미반영' : rs.terrain === 'grid' ? '격자 지평선' : '지점 지평선';
  return (
    <>
      <Card title="전력 계산" tag={<span className="badge">출처: {source.label} · {terrain}</span>}>
        <div className="row">
          <span className="small">필요 전력 <b className="mono">{ui.demand_kw} kW</b> · 패널 효율 <b className="mono">{ui.eff}</b></span>
          <button className="btn sm ghost" onClick={() => { useUi.getState().set({ condTab: 'lander' }); app.setPage('cond'); }}>01 임무 설정 › 착륙선 정보에서 바꾸기</button>
          <div className="note" style={{ flex: 1, minWidth: 220 }}>태양을 따라 도는 수직 패널 기준. 시스템 손실 {DEFAULTS.panel_loss * 100}%, 설계 여유 {DEFAULTS.power_margin * 100}% (임시값). 배터리는 최장 그늘 동안 부하를 버티는 용량.</div>
        </div>
        {!plan.feasible ? <div className="nodata">이 기간에는 햇빛이 없어 계산할 수 없습니다</div> : (
          <div className="kpis">
            <Kpi l="1 m² 평균 발전" v={`${Math.round(plan.mean_w_per_m2)} W/m²`} />
            <Kpi l="필요 패널 면적" v={`${Math.round(plan.panel_area_m2)} m²`} s={`여유 +${DEFAULTS.power_margin * 100}% 포함`} />
            <Kpi l="필요 배터리" v={`${Math.max(0, Math.round(plan.battery_kwh)).toLocaleString()} kWh`} s="최장 그늘 버팀" />
          </div>
        )}
        <div className="chartlbl"><span>앞으로 30일 발전 (1 m², 수직 추적)</span><span className="legend"><span><i className="sw" style={{ background: 'var(--sun)' }} />W/m²</span></span></div>
        <LineChart h={160} pick times={samples.map((s) => s.t)} series={[{ values: plan.per_m2_w, color: '--sun', fill: true }]} yMin={0} />
        <div className="row small">
          <b>비교 단위</b>
          {refs.items.length ? <>{refs.items.map((r, i) => <span key={r.id}>{i ? <span className="muted">· </span> : null}<span className="mono soft">{r.name}: {r.value} {r.unit}</span></span>)}</> : <span className="muted">자료 없음</span>}
        </div>
      </Card>
      <Card title="패널 설치 추천">
        <Help>착륙지 주변에서 같은 전력을 더 작은 패널·배터리로 얻을 수 있는 자리 5곳을 찾습니다.</Help>
        <div className="row">
          <label className="small muted">탐색 반경 (km) <input className="field num" type="number" min={5} max={100} value={radius} onChange={(e) => setRadius(Number(e.target.value))} /></label>
          <button className="btn pri" disabled={!sl.rd || sl.cell < 0} onClick={runPanels}>찾기</button>
          {sl.loading ? <span className="tiny muted">이 지역 격자를 불러오는 중</span> : !sl.rd || sl.cell < 0 ? <span className="tiny muted">지역 격자(남극·북극 5 km, 전역 15 km) 밖 지점은 추천할 수 없습니다</span> : sl.region ? <span className="tiny muted">{`${REGION_LABEL[sl.region]} ${sl.rd.geo.manifest.cell_km} km 격자 기준`}</span> : null}
        </div>
        <Progress p={prog} />
        {picks ? (
          <div className="tblwrap"><table>
            <thead><tr><th>#</th><th>위치</th><th>거리</th><th>필요 패널</th><th>필요 배터리</th><th /></tr></thead>
            <tbody>{picks.map((p, i) => (
              <tr key={p.cell}><td>{i + 1}</td><td className="mono small">{p.lat_deg.toFixed(3)}, {p.lon_deg.toFixed(2)}</td><td className="mono">{km(p.distance_km)}</td><td className="mono">{Math.round(p.panel_area_m2)} m²</td><td className="mono">{Math.max(0, Math.round(p.battery_kwh)).toLocaleString()} kWh</td>
                <td><button className="btn sm" onClick={() => app.setSite(sl.region === 'south' ? { kind: 'cell', cell: p.cell } : { kind: 'custom', lat: +p.lat_deg.toFixed(4), lon: +p.lon_deg.toFixed(4) })}>여기로 착륙지 바꾸기</button></td></tr>
            ))}</tbody>
          </table></div>
        ) : null}
      </Card>
      <div className="g2">
        <Card title="마스트 높이 비교" np={Array.isArray(mast)}>
          {mast === 'missing' ? <NoData what="마스트 높이 비교" why="파이프라인이 계산한 높이별 지평선 마스크가 있는 카탈로그 착륙지만 됩니다" /> : mast === null ? <Progress p={0} /> : (
            <>
              <table>
                <thead><tr><th>높이</th><th>일조율</th><th>최장 그늘</th><th>패널</th><th>배터리</th></tr></thead>
                <tbody>{mast.map((r) => (
                  <tr key={r.height_m}><td className="mono">{r.height_m} m</td><td className="mono">{pct(r.summary.illum_frac)}</td><td className="mono">{hrs(r.summary.longest_dark_h)}</td><td className="mono">{Number.isFinite(r.panel_area_m2) ? `${Math.round(r.panel_area_m2)} m²` : '—'}</td><td className="mono">{Number.isFinite(r.battery_kwh) ? `${Math.max(0, Math.round(r.battery_kwh)).toLocaleString()} kWh` : '—'}</td></tr>
                ))}</tbody>
              </table>
              <p className="help" style={{ padding: '8px 12px' }}>패널을 높이 세우면 주변 지형에 덜 가려집니다. 높이별 지평선 마스크로 계산.</p>
            </>
          )}
        </Card>
        <Card title="빛 릴레이">
          {relay && relay.length ? (
            <>
              <Help>두 곳에 패널을 나눠 두면 한쪽이 그늘일 때 다른 쪽이 발전합니다. "둘 다 어두운 최장 시간"이 짧을수록 좋습니다.</Help>
              <table>
                <thead><tr><th>짝 지점</th><th>거리</th><th>어느 한쪽 햇빛</th><th>둘 다 어두운 최장 시간</th></tr></thead>
                <tbody>{relay.map((r) => (
                  <tr key={r.cell} className="click" onClick={() => app.setSite({ kind: 'cell', cell: r.cell })}><td className="mono small">#{r.cell}</td><td className="mono">{km(r.km)}</td><td className="mono">{pct(r.either_lit_frac)}</td><td className="mono">{hrs(r.longest_both_dark_h)}</td></tr>
                ))}</tbody>
              </table>
            </>
          ) : cell < 0 && sl.region && sl.region !== grid?.region ? (
            <><NoData what="빛 릴레이" why="빛 릴레이는 지금 고른 지도 지역의 점수 계산을 씁니다. 지점이 있는 지역의 지도로 바꾸세요" /><div className="row"><button className="btn sm" onClick={() => void setMapRegion(sl.region!)}>{`${REGION_LABEL[sl.region]} 지도로 바꾸기`}</button></div></>
          ) : <NoData what="빛 릴레이" why={cell < 0 ? '지역 격자 밖 지점입니다' : '30 km 안에 격자 칸이 없거나 계산 중입니다'} />}
        </Card>
      </div>
    </>
  );
}
