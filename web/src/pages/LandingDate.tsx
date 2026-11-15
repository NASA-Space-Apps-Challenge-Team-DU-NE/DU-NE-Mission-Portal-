// 04 착륙 날짜 정하기: 착륙 시각 또는 착륙 기간(둘 중 하나만), 착륙 윈도(P1-21), 상위 6곳 비교, 역방향 탐색(P2-04)
import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, Help, NoData, Progress, ScoreChip, Seg, deg, toast, utc, Empty } from '../components/kit';
import { BandChart } from '../components/viz';
import { DEFAULTS } from '../config';
import { DAY_MS, HOUR_MS } from '../core/constants';
import { cellMask } from '../core/gridScore';
import type { ReverseHit } from '../core/reverseSearch';
import { siteContext } from '../core/scenario';
import { sampleTimeline } from '../core/timeline';
import { useData } from '../state/data';
import { siteKey, timelineFor } from '../state/derived';
import { useGridRun } from '../state/gridRun';
import { useResolvedSite, useSiteCtx } from '../state/hooks';
import { ephPayload, makeScenario, siteMaskOf, useCandidates } from '../state/scenario';
import { useApp } from '../state/store';
import { useUi } from '../state/ui';
import { isCancelled, searchWorker } from '../workers/client';

const toInput = (ms: number) => new Date(ms).toISOString().slice(0, 16);
const toDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const dayMs = (d: string) => Date.parse(`${d}T00:00:00Z`);
/** 기간 모드에서 한 번에 찾는 최대 길이 (계산량) */
const PERIOD_MAX_DAYS = 120;

export default function LandingDate() {
  const app = useApp();
  const rs = useResolvedSite();
  const ctx = useSiteCtx(rs);
  const grid = useData((d) => d.grid);
  const eph = useData((d) => d.eph);
  const res = useGridRun((g) => g.result);
  const ui = useUi();
  const [minH, setMinH] = useState(48);
  const [span, setSpan] = useState(30);
  const period = ui.dateMode === 'period';
  const pFrom = ui.periodFrom || toDay(app.landing);
  const pTo = ui.periodTo || toDay(app.landing + 30 * DAY_MS);
  const pStart = dayMs(pFrom), pEnd = dayMs(pTo) + DAY_MS; // 끝날 하루 전체 포함
  const pOk = Number.isFinite(pStart) && Number.isFinite(pEnd) && pEnd > pStart && pEnd - pStart <= PERIOD_MAX_DAYS * DAY_MS;
  // 윈도를 찾는 구간: 시각 모드 = 착륙 시각부터 30·60·90일, 기간 모드 = 정한 기간
  const winStart = period && pOk ? pStart : app.landing;
  const winH = period && pOk ? Math.round((pEnd - pStart) / HOUR_MS) : span * 24;
  const tl = useMemo(() => (ctx ? timelineFor(ctx, siteKey(rs, app.margin_deg), winStart, winH, 1) : null), [ctx, rs, app.margin_deg, winStart, winH]);
  const wins = useMemo(() => {
    if (!tl) return [];
    const out: Array<{ start: number; end: number; h: number; minEl: number }> = [];
    let s = -1;
    for (let i = 0; i <= tl.length; i++) {
      const ok = i < tl.length && tl[i].sun_frac >= 0.5 && tl[i].earth_visible;
      if (ok && s < 0) s = i;
      if (!ok && s >= 0) { if (i - s >= minH) out.push({ start: tl[s].t, end: tl[i - 1].t, h: i - s, minEl: Math.min(...tl.slice(s, i).map((x) => x.sun.el_deg)) }); s = -1; }
    }
    return out;
  }, [tl, minH]);
  const top6 = useMemo(() => {
    if (!grid || !res) return [];
    return res.top.slice(0, 6).map((c, i) => {
      const site = { id: `cell_${c.cell}`, name: `#${i + 1}`, category: 'cell' as const, lat_deg: c.lat_deg, lon_deg: c.lon_deg, terrain: 'grid' as const, source_keys: [], verified: true };
      const cx = siteContext(site, cellMask(grid, c.cell), eph, app.margin_deg, grid.manifest.observer_height_m);
      return { label: `#${i + 1}`, s: sampleTimeline(cx, winStart, winStart + winH * HOUR_MS, 3) };
    });
  }, [grid, res, eph, winStart, winH, app.margin_deg]);

  // 기간 모드: 기간·착륙지·최소 연속 시간이 바뀔 때마다 착륙 시각을 기간 안 첫 윈도 시작(없으면 기간 시작)으로 맞춘다.
  // 그 뒤 표에서 다른 윈도를 고르면 그 값을 그대로 둔다.
  const autoKey = period && pOk ? `${pFrom}|${pTo}|${rs?.site.id ?? ''}|${minH}` : '';
  const lastKey = useRef('');
  useEffect(() => {
    if (!autoKey) { lastKey.current = ''; return; }
    if (!tl || lastKey.current === autoKey) return;
    lastKey.current = autoKey;
    const v = wins.length ? wins[0].start : pStart;
    if (v !== app.landing) { app.setLanding(v); app.setT(v); toast(wins.length ? '착륙 시각을 기간 안 첫 착륙 윈도 시작으로 맞췄습니다' : '기간 안에 착륙 윈도가 없어 기간 시작으로 맞췄습니다'); }
  }, [autoKey, tl, wins]); // eslint-disable-line react-hooks/exhaustive-deps

  const cands = useCandidates(rs?.site ?? null, DEFAULTS.alt_radius_km, 10);
  const [from, setFrom] = useState(new Date(app.landing).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date(app.landing + 30 * DAY_MS).toISOString().slice(0, 10));
  const [only, setOnly] = useState(true);
  const [prog, setProg] = useState<number | null>(null);
  const [hits, setHits] = useState<ReverseHit[] | null>(null);
  const run = () => {
    if (!rs) return;
    setProg(0);
    searchWorker()
      .request<ReverseHit[] | null>('reverse', { eph: ephPayload(), candidates: [siteMaskOf(rs), ...cands], from: Date.parse(`${from}T00:00:00Z`), to: Date.parse(`${to}T00:00:00Z`), step_h: 12, duration_h: app.duration_h, req: app.req, weights: app.scenarioWeights, delay_days: app.delay_days, only_meeting: only, margin_deg: app.margin_deg }, { onProgress: setProg })
      .then((r) => { setHits(r ? r.slice(0, 8) : []); setProg(null); })
      .catch((e) => { if (!isCancelled(e)) { setProg(null); console.warn("worker", e); } });
  };

  if (!rs || !tl) return <NoData what="착륙지" why="02에서 착륙지를 먼저 고르세요" />;
  const T = tl.map((p) => p.t);
  return (
    <>
      <Card title="착륙 시각 · 착륙 기간" tag={<Seg value={ui.dateMode} opts={[['time', '시각 지정'], ['period', '기간 지정']]} onChange={(v) => ui.set({ dateMode: v, ...(v === 'period' && !ui.periodFrom ? { periodFrom: pFrom, periodTo: pTo } : {}) })} />}>
        <div className={`modeline ${period ? 'inactive' : ''}`}>
          <span className="ml">착륙 시각</span>
          <input type="datetime-local" className="field mono" disabled={period} value={toInput(app.landing)} style={{ fontSize: 15 }} onChange={(e) => { const v = Date.parse(`${e.target.value}:00Z`); if (Number.isFinite(v)) { app.setLanding(v); app.setT(v); toast('착륙 시각을 바꿨습니다'); } }} />
          <span className="muted">UTC</span>
        </div>
        <div className={`modeline ${period ? '' : 'inactive'}`}>
          <span className="ml">착륙 기간</span>
          <input type="date" className="field mono" disabled={!period} value={pFrom} max={pTo} onChange={(e) => e.target.value && ui.set({ periodFrom: e.target.value, periodTo: pTo })} />
          <span className="muted">~</span>
          <input type="date" className="field mono" disabled={!period} value={pTo} min={pFrom} onChange={(e) => e.target.value && ui.set({ periodFrom: pFrom, periodTo: e.target.value })} />
          <span className="muted">UTC · 최대 {PERIOD_MAX_DAYS}일</span>
        </div>
        {period && !pOk ? <div className="nodata">기간을 다시 정해 주세요. 끝날이 시작일보다 뒤여야 하고, 길이는 {PERIOD_MAX_DAYS}일 이하여야 합니다.</div> : null}
        <div className="row"><span className="small soft">착륙지: <b>{rs.site.name}</b></span>{period ? <span className="small soft">· 지금 착륙 시각: <b className="mono">{utc(app.landing)} UTC</b></span> : null}</div>
        <Help>{period
          ? <>기간 안에서 햇빛과 지구 교신이 동시에 되는 <b>착륙 윈도</b>를 찾습니다. 아래 표에서 <b>이 시각으로 착륙</b>을 누르면 착륙 시각이 정해집니다 (기간을 바꾸면 기간 안 첫 윈도 시작으로 먼저 맞춰 둡니다).</>
          : <>위쪽 막대의 "착륙 시각"과 같은 값입니다. 아래 착륙 윈도 표에서 <b>이 시각으로 착륙</b>을 눌러도 바뀝니다. 날짜가 정해지지 않았으면 <b>기간 지정</b>으로 바꾸세요.</>}</Help>
      </Card>
      <Card title="착륙 윈도" sub="햇빛과 지구 교신이 동시에 되는 구간">
        <div className="row"><span className="small muted">최소 연속 시간</span><Seg value={minH} opts={[[24, '24h'], [48, '48h'], [72, '72h']]} onChange={setMinH} />{period ? <span className="small muted">찾는 기간: <b className="mono">{pFrom} ~ {pTo}</b></span> : <><span className="small muted">찾는 기간</span><Seg value={span} opts={[[30, '30일'], [60, '60일'], [90, '90일']]} onChange={setSpan} /></>}</div>
        <div className="legend"><span><i className="sw" style={{ background: 'var(--sun)' }} />햇빛 (태양 원반 노출률)</span><span><i className="sw" style={{ background: 'var(--earth)' }} />지구 보임</span><span><i className="sw" style={{ background: 'var(--accent)' }} />착륙 윈도 (둘 다)</span><span><i className="sw" style={{ background: 'var(--fg)', width: 2 }} />보는 시각</span></div>
        <BandChart h={96} pick times={T} rows={[{ label: '햇빛', values: tl.map((p) => p.sun_frac), color: '--sun', grad: true }, { label: '지구', values: tl.map((p) => (p.earth_visible ? 1 : 0)), color: '--earth' }, { label: '윈도', values: tl.map((p) => (p.sun_frac >= 0.5 && p.earth_visible ? 1 : 0)), color: '--accent' }]} />
        <div className="chartlbl"><span>막대를 누르면 그 시각으로 이동합니다</span><span>{utc(winStart)} → +{Math.round(winH / 24)}일</span></div>
        {wins.length ? (
          <div className="tblwrap"><table>
            <thead><tr><th>#</th><th>시작 (UTC)</th><th>끝 (UTC)</th><th>길이</th><th>최저 태양 고도</th><th /></tr></thead>
            <tbody>{wins.map((w, i) => (
              <tr key={i}><td>{i + 1}</td><td className="mono small">{utc(w.start)}</td><td className="mono small">{utc(w.end)}</td><td className="mono">{w.h} h</td><td className="mono">{deg(w.minEl, 2)}</td>
                <td><button className="btn sm pri" onClick={() => { app.setLanding(w.start); app.setT(w.start); toast('착륙 시각을 바꿨습니다'); }}>이 시각으로 착륙</button></td></tr>
            ))}</tbody>
          </table></div>
        ) : <Empty>조건에 맞는 윈도가 없습니다. 최소 시간을 줄이거나 기간을 늘려 보세요.</Empty>}
      </Card>
      <Card title="상위 6곳 비교" sub="격자 상위 칸">
        <Help>02 추천 순위 상위 6칸에서 착륙 윈도(초록)가 언제 열리는지 나란히 봅니다.</Help>
        {top6.length ? <BandChart h={170} pick times={top6[0].s.map((x) => x.t)} rows={top6.map((r) => ({ label: r.label, values: r.s.map((p) => (p.sun_frac >= 0.5 && p.earth_visible ? 1 : 0)), color: '--accent' }))} /> : <NoData what="격자 상위 칸" why="01 조건을 만족하는 칸이 없거나 격자 계산 중입니다" />}
      </Card>
      <Card title="역방향 탐색" tag={<span className="badge">2순위</span>}>
        <Help>원하는 조건(01의 요구 조건)을 넣으면 맞는 착륙지와 날짜 구간을 순위로 보여 줍니다. 계산이 많아 버튼을 눌러 실행합니다.</Help>
        <div className="row">
          <label className="small muted">시작일 <input type="date" className="field" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="small muted">끝일 <input type="date" className="field" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <label className="small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={only} onChange={(e) => setOnly(e.target.checked)} /> 요건 충족만</label>
          <button className="btn pri" onClick={run}>탐색</button>
          <span className="tiny muted">후보 {cands.length + 1}곳 · 12 h 간격 · {DEFAULTS.alt_radius_km} km</span>
        </div>
        <Progress p={prog} />
        {hits ? (hits.length ? (
          <div className="tblwrap"><table>
            <thead><tr><th>착륙지</th><th>구간 시작</th><th>구간 끝</th><th>최고 점수</th><th /></tr></thead>
            <tbody>{hits.map((h, i) => (
              <tr key={i}><td>{h.site.name}</td><td className="mono small">{utc(h.start)}</td><td className="mono small">{utc(h.end)}</td><td><ScoreChip v={h.best.score.total} /></td>
                <td><button className="btn sm" onClick={() => {
                  app.addScenario(makeScenario(h.site, h.best.landing, app.duration_h, 'search'));
                  app.setLanding(h.best.landing); app.setT(h.best.landing);
                  if (h.site.category === 'cell') app.setSite({ kind: 'cell', cell: Number(h.site.id.slice(5)) }); else if (h.site.category !== 'custom') app.setSite({ kind: 'catalog', id: h.site.id });
                  toast('비교에 추가했습니다 (07 후보 비교)');
                }}>이 안 쓰기 · 비교에 추가</button></td></tr>
            ))}</tbody>
          </table></div>
        ) : <Empty>조건을 만족하는 구간이 없습니다</Empty>) : null}
      </Card>
    </>
  );
}
