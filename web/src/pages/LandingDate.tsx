// 02 착륙지·날짜 고르기의 날짜 부분 (옛 04 착륙 날짜 정하기를 합침). 화면 안 위치에 따라 세 부분으로 나눠 그린다:
//  part="top"     페이지 맨 위: 착륙 시각 또는 착륙 기간 → (기간이면) 후보 착륙지 × 시작일 점수표 → 검토 중인 조합 → 계획에 적용
//  part="windows" 지금 계획 카드의 '착륙 윈도' 탭 (P1-21)
//  part="rest"    맨 아래: 상위 6곳 비교, 역방향 탐색(P2-04)
import { useEffect, useMemo, useState } from 'react';
import { Card, Help, NoData, Progress, ScoreChip, Seg, deg, toast, utc, Empty } from '../components/kit';
import { BandChart } from '../components/viz';
import { DEFAULTS } from '../config';
import { DAY_MS, HOUR_MS } from '../core/constants';
import { cellMask } from '../core/gridScore';
import type { ReverseHit } from '../core/reverseSearch';
import { siteContext, type ScenarioEval } from '../core/scenario';
import { intervalSpans, sampleTimeline, type SiteContext } from '../core/timeline';
import type { Site } from '../core/types';
import { useData } from '../state/data';
import { evalFor, siteKey, timelineFor } from '../state/derived';
import { useGridRun } from '../state/gridRun';
import { useResolvedSite, useSiteCtx } from '../state/hooks';
import { ephPayload, makeScenario, siteMaskOf, useCandidates } from '../state/scenario';
import { scoreWeights, useApp, type SiteRef } from '../state/store';
import { useUi } from '../state/ui';
import { isCancelled, searchWorker } from '../workers/client';

const toInput = (ms: number) => new Date(ms).toISOString().slice(0, 16);
const toDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const dayMs = (d: string) => Date.parse(`${d}T00:00:00Z`);
const md = (ms: number) => { const d = new Date(ms); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`; };
/** 기간 모드에서 한 번에 찾는 최대 길이 (계산량) */
const PERIOD_MAX_DAYS = 120;
/** 점수표 열 최대 개수: 기간이 길면 며칠 간격으로 표본 */
const MAX_COLS = 31;
/** 점수표 행(후보 착륙지) 최대 개수 */
const MAX_ROWS = 6;

interface Row { key: string; label: string; site: Site; ref: SiteRef | null; ctx: SiteContext; ctxKey: string }
interface RowStats { row: Row; evs: ScenarioEval[]; okCount: number; runLen: number; runFrom: number; best: number }

/** 연속으로 요구 조건을 만족한 가장 긴 시작일 구간 */
function longestRun(ok: boolean[]): { len: number; from: number } {
  let best = { len: 0, from: -1 }, cur = 0;
  ok.forEach((v, i) => { cur = v ? cur + 1 : 0; if (cur > best.len) best = { len: cur, from: i - cur + 1 }; });
  return best;
}

export default function LandingDate({ part }: { part: 'top' | 'windows' | 'rest' }) {
  const app = useApp();
  const rs = useResolvedSite();
  const ctx = useSiteCtx(rs);
  const grid = useData((d) => d.grid);
  const eph = useData((d) => d.eph);
  const ephRev = useData((d) => d.ephRev);
  const sites = useData((d) => d.sites.items);
  const masks = useData((d) => d.masks);
  const ensureMask = useData((d) => d.ensureMask);
  const res = useGridRun((g) => g.result);
  const ui = useUi();
  const [minH, setMinH] = useState(48);
  const [span, setSpan] = useState(30);
  const period = ui.dateMode === 'period';
  const pFrom = ui.periodFrom || toDay(app.landing);
  const pTo = ui.periodTo || toDay(app.landing + 13 * DAY_MS);
  const pStart = dayMs(pFrom), pEnd = dayMs(pTo) + DAY_MS; // 끝날 하루 전체 포함
  const pOk = Number.isFinite(pStart) && Number.isFinite(pEnd) && pEnd > pStart && pEnd - pStart <= PERIOD_MAX_DAYS * DAY_MS;
  // 윈도를 찾는 구간: 시각 모드 = 착륙 시각부터 30·60·90일, 기간 모드 = 정한 기간
  const winStart = period && pOk ? pStart : app.landing;
  const winH = period && pOk ? Math.round((pEnd - pStart) / HOUR_MS) : span * 24;
  const tl = useMemo(() => (ctx ? timelineFor(ctx, siteKey(rs, app.margin_deg), winStart, winH, 1) : null), [ctx, rs, app.margin_deg, winStart, winH]);
  const wins = useMemo(() => {
    if (!tl) return [];
    return intervalSpans(tl.map((x) => x.t), tl.map((x) => x.sun_frac >= 0.5 && x.earth_visible))
      .filter((w) => w.h >= minH)
      .map((w) => ({ ...w, minEl: Math.min(...tl.slice(w.start_index, w.end_index).map((x) => x.sun.el_deg)) }));
  }, [tl, minH]);
  const top6 = useMemo(() => {
    if (part !== 'rest' || !grid || !res) return [];
    return res.top.slice(0, 6).map((c, i) => {
      const site = { id: `cell_${c.cell}`, name: `#${i + 1}`, category: 'cell' as const, lat_deg: c.lat_deg, lon_deg: c.lon_deg, terrain: 'grid' as const, source_keys: [], verified: true };
      const cx = siteContext(site, cellMask(grid, c.cell), eph, app.margin_deg, grid.manifest.observer_height_m);
      return { label: `#${i + 1}`, s: sampleTimeline(cx, winStart, winStart + winH * HOUR_MS, 3) };
    });
  }, [part, grid, res, eph, winStart, winH, app.margin_deg]);

  // ── 후보 착륙지 × 시작일 점수표 (기간 모드) ──
  const cols = useMemo(() => {
    if (part !== 'top' || !period || !pOk) return [];
    const days = Math.round((pEnd - pStart) / DAY_MS), step = Math.max(1, Math.ceil(days / MAX_COLS)), out: number[] = [];
    for (let d = 0; d < days; d += step) out.push(pStart + d * DAY_MS);
    return out;
  }, [part, period, pOk, pStart, pEnd]);
  // 카탈로그 행은 지형 마스크가 있는 착륙지. 마스크를 미리 불러 둔다
  useEffect(() => { if (period && app.rankMode === 'catalog') sites.forEach((s) => s.mask && !masks[s.mask] && ensureMask(s.mask)); }, [period, app.rankMode, sites, masks, ensureMask]);
  const rows = useMemo((): Row[] => {
    if (part !== 'top' || !period) return [];
    const out: Row[] = [];
    if (rs && ctx) out.push({ key: 'plan', label: `지금 계획 · ${rs.site.name}`, site: rs.site, ref: app.siteRef, ctx, ctxKey: siteKey(rs, app.margin_deg) });
    if (app.rankMode === 'grid' && grid && res) {
      for (const [i, c] of res.top.entries()) {
        if (out.length >= MAX_ROWS) break;
        if (app.siteRef?.kind === 'cell' && app.siteRef.cell === c.cell) continue;
        const site: Site = { id: `cell_${c.cell}`, name: `격자 #${i + 1}`, category: 'cell', lat_deg: c.lat_deg, lon_deg: c.lon_deg, terrain: 'grid', source_keys: [], verified: true };
        out.push({ key: site.id, label: `격자 #${i + 1} (${c.lat_deg.toFixed(2)}°, ${c.lon_deg.toFixed(1)}°)`, site, ref: { kind: 'cell', cell: c.cell },
          ctx: siteContext(site, cellMask(grid, c.cell), eph, app.margin_deg, grid.manifest.observer_height_m), ctxKey: `hmcell|${c.cell}|${app.margin_deg}|r${ephRev}` });
      }
    } else if (app.rankMode === 'catalog') {
      for (const s of sites) {
        if (app.siteRef?.kind === 'catalog' && app.siteRef.id === s.id) continue;
        const env = s.mask ? masks[s.mask] : undefined, m = env && env !== 'missing' ? env.data : null;
        if (!m) continue; // 지형 마스크가 없는 곳은 후보에서 뺀다 (대안 후보 규칙과 같음)
        out.push({ key: s.id, label: s.name, site: s, ref: { kind: 'catalog', id: s.id },
          ctx: siteContext({ ...s, elevation_m: m.ground_elev_m ?? s.elevation_m }, m, eph, app.margin_deg), ctxKey: `hmcat|${s.id}|${app.margin_deg}|r${ephRev}` });
      }
    }
    return out;
  }, [part, period, rs, ctx, app.siteRef, app.rankMode, app.margin_deg, grid, res, sites, masks, eph, ephRev]);
  // 점수: 입력(요구 조건·가중치·발전 방식·기간·여유각)이 바뀌면 다시 계산 (evalFor 캐시 키에 모두 들어간다)
  const table = useMemo((): RowStats[] => {
    const all = rows.map((r): RowStats => {
      const evs = cols.map((t) => evalFor(r.ctx, r.ctxKey, t, app.duration_h, 6));
      const ok = evs.map((e) => e.score.meets_requirements);
      const run = longestRun(ok);
      const best = Math.max(-1, ...evs.filter((e) => e.score.meets_requirements).map((e) => e.score.total));
      return { row: r, evs, okCount: ok.filter(Boolean).length, runLen: run.len, runFrom: run.from, best };
    });
    // 카탈로그는 많아서 기간 평균 점수 상위만 남긴다 (지금 계획은 항상 맨 위)
    const plan = all.filter((x) => x.row.key === 'plan'), rest = all.filter((x) => x.row.key !== 'plan');
    rest.sort((a, b) => b.evs.reduce((s, e) => s + e.score.total, 0) - a.evs.reduce((s, e) => s + e.score.total, 0));
    // 정렬 뒤에 후보 A·B·C… 를 붙인다
    return [...plan, ...rest.slice(0, MAX_ROWS - plan.length).map((x, i) => ({ ...x, row: { ...x.row, label: `후보 ${String.fromCharCode(65 + i)} · ${x.row.label}` } }))];
  }, [rows, cols, app.duration_h, app.req, app.scenarioWeights, app.powerSource, app.delay_days]); // eslint-disable-line react-hooks/exhaustive-deps
  const range = useMemo(() => {
    const v = table.flatMap((r) => r.evs.map((e) => e.score.total));
    return v.length ? { lo: Math.min(...v), hi: Math.max(...v) } : { lo: 0, hi: 100 };
  }, [table]);
  const [pick, setPick] = useState<{ key: string; col: number } | null>(null);
  // 표가 바뀌어 고른 칸이 없어지면 검토 카드를 감춘다
  const picked = pick ? table.find((r) => r.row.key === pick.key) : undefined;
  const pickedEv = picked && pick ? picked.evs[pick.col] : undefined;
  const pickedWins = useMemo(() => {
    if (!picked || !pickedEv) return [];
    const s = sampleTimeline(picked.row.ctx, pickedEv.landing, pickedEv.landing + app.duration_h * HOUR_MS, 1);
    return intervalSpans(s.map((x) => x.t), s.map((x) => x.sun_frac >= 0.5 && x.earth_visible));
  }, [picked, pickedEv, app.duration_h]);

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
      .request<ReverseHit[] | null>('reverse', { eph: ephPayload(), candidates: [siteMaskOf(rs), ...cands], from: Date.parse(`${from}T00:00:00Z`), to: Date.parse(`${to}T00:00:00Z`), step_h: 12, duration_h: app.duration_h, req: app.req, weights: scoreWeights(app), delay_days: app.delay_days, only_meeting: only, margin_deg: app.margin_deg }, { onProgress: setProg })
      .then((r) => { setHits(r ? r.slice(0, 8) : []); setProg(null); })
      .catch((e) => { if (!isCancelled(e)) { setProg(null); console.warn("worker", e); } });
  };

  if (!rs || !tl) return part === 'top' ? <NoData what="착륙지" why="아래 지도·순위표·목록에서 착륙지를 먼저 고르세요" /> : null;
  const T = tl.map((p) => p.t);
  const apply = (r: Row, landing: number) => {
    if (r.ref) app.setSite(r.ref);
    app.setLanding(landing);
    setPick(null);
    toast(`계획을 ${r.site.name} · ${utc(landing)} UTC 착륙으로 바꿨습니다`);
  };
  const cellBg = (v: number) => { const a = range.hi > range.lo ? (v - range.lo) / (range.hi - range.lo) : 1; return `rgba(59,184,155,${(0.06 + 0.72 * a).toFixed(3)})`; };
  const bestEv = picked && picked.best >= 0 ? picked.evs.find((e) => e.score.meets_requirements && e.score.total === picked.best) : undefined;
  if (part === 'windows') return (
      <div className="bd">
        <Help>햇빛과 지구 교신이 동시에 되는 구간입니다.</Help>
        <div className="row"><span className="small muted">최소 연속 시간</span><Seg value={minH} opts={[[24, '24h'], [48, '48h'], [72, '72h']]} onChange={setMinH} />{period ? <span className="small muted">찾는 기간: <b className="mono">{pFrom} ~ {pTo}</b></span> : <><span className="small muted">찾는 기간</span><Seg value={span} opts={[[30, '30일'], [60, '60일'], [90, '90일']]} onChange={setSpan} /></>}</div>
        <div className="legend"><span><i className="sw" style={{ background: 'var(--sun)' }} />햇빛 (태양 원반 노출률)</span><span><i className="sw" style={{ background: 'var(--earth)' }} />지구 보임</span><span><i className="sw" style={{ background: 'var(--accent)' }} />착륙 윈도 (둘 다)</span><span><i className="sw" style={{ background: 'var(--fg)', width: 2 }} />보는 시각</span></div>
        <BandChart h={96} pick times={T} rows={[{ label: '햇빛', values: tl.map((p) => p.sun_frac), color: '--sun', grad: true }, { label: '지구', values: tl.map((p) => (p.earth_visible ? 1 : 0)), color: '--earth' }, { label: '윈도', values: tl.map((p) => (p.sun_frac >= 0.5 && p.earth_visible ? 1 : 0)), color: '--accent' }]} />
        <div className="chartlbl"><span>막대를 누르면 그 시각을 3D 달·현장 뷰에서 봅니다</span><span>{utc(winStart)} → +{Math.round(winH / 24)}일</span></div>
        {wins.length ? (
          <div className="tblwrap"><table>
            <thead><tr><th>#</th><th>시작 (UTC)</th><th>끝 (UTC)</th><th>길이</th><th>최저 태양 고도</th><th /></tr></thead>
            <tbody>{wins.map((w, i) => (
              <tr key={i}><td>{i + 1}</td><td className="mono small">{utc(w.start)}</td><td className="mono small">{utc(w.end)}</td><td className="mono">{w.h} h</td><td className="mono">{deg(w.minEl, 2)}</td>
                <td><button className="btn sm pri" onClick={() => { app.setLanding(w.start); toast('착륙 시각을 바꿨습니다'); }}>이 시각으로 착륙</button></td></tr>
            ))}</tbody>
          </table></div>
        ) : <Empty>조건에 맞는 윈도가 없습니다. 최소 시간을 줄이거나 기간을 늘려 보세요.</Empty>}
      </div>
  );
  if (part === 'rest') return (
    <>
      <Card title="상위 6곳 비교" sub="격자 상위 칸">
        <Help>추천 순위 상위 6칸에서 착륙 윈도(초록)가 언제 열리는지 나란히 봅니다.</Help>
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
                  app.setLanding(h.best.landing);
                  if (h.site.category === 'cell') app.setSite({ kind: 'cell', cell: Number(h.site.id.slice(5)) }); else if (h.site.category !== 'custom') app.setSite({ kind: 'catalog', id: h.site.id });
                  toast('비교에 추가했습니다 (07 후보 비교)');
                }}>이 안 쓰기 · 비교에 추가</button></td></tr>
            ))}</tbody>
          </table></div>
        ) : <Empty>조건을 만족하는 구간이 없습니다</Empty>) : null}
      </Card>
    </>
  );
  return (
    <>
      <Card title="착륙 시각 · 착륙 기간" tag={<Seg value={ui.dateMode} opts={[['time', '시각 지정'], ['period', '기간 지정']]} onChange={(v) => ui.set({ dateMode: v, ...(v === 'period' && !ui.periodFrom ? { periodFrom: pFrom, periodTo: pTo } : {}) })} />}>
        <div className={`modeline ${period ? 'inactive' : ''}`}>
          <span className="ml">착륙 시각</span>
          <input type="datetime-local" className="field mono" disabled={period} value={toInput(app.landing)} style={{ fontSize: 15 }} onChange={(e) => { const v = Date.parse(`${e.target.value}:00Z`); if (Number.isFinite(v)) { app.setLanding(v); toast('착륙 시각을 바꿨습니다'); } }} />
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
        <div className="row"><span className="small soft">착륙지: <b>{rs.site.name}</b></span><span className="small soft">· 지금 착륙 시각: <b className="mono">{utc(app.landing)} UTC</b></span>{period && pOk && (app.landing < pStart || app.landing >= pEnd) ? <span className="badge warn">계획 착륙 시각이 기간 밖</span> : null}</div>
        <Help>{period
          ? <>기간 안 시작일마다 후보 착륙지의 점수를 아래 표로 보여 줍니다. 칸을 누르면 그 조합을 검토하고, <b>이 조합을 계획으로 적용</b>을 눌러야 계획이 바뀝니다.</>
          : <>착륙 시각을 직접 정합니다. 바꾸면 3D 달·현장 뷰·점수가 그 시각으로 다시 계산됩니다. 날짜가 정해지지 않았으면 <b>기간 지정</b>으로 바꾸세요.</>}</Help>
      </Card>

      {period && pOk ? (
        <Card title="착륙지 × 시작일" sub={`일 단위 표본 · 같은 조건(임무 ${app.duration_h} h)으로 비교`} tag={<Seg value={app.rankMode} opts={[['grid', '격자 상위'], ['catalog', '카탈로그 착륙지']]} onChange={(v) => app.setMap({ rankMode: v })} />}>
          {table.length && cols.length ? (
            <div className="hmwrap">
              <div className="hm" style={{ gridTemplateColumns: `minmax(170px,1.4fr) repeat(${cols.length}, minmax(40px,1fr))` }}>
                <div className="hmh">후보 / 달성 여부</div>
                {cols.map((t) => <div key={t} className="hmc">{md(t)}</div>)}
                {table.map((r) => [
                  <div key={`${r.row.key}-l`} className="hml">
                    <b title={r.row.label}>{r.row.label}</b>
                    <span>충족 {r.okCount}/{cols.length} 시작일 · 최장 {r.runLen}개 연속</span>
                    <i style={{ width: `${(r.okCount / cols.length) * 100}%` }} />
                  </div>,
                  ...r.evs.map((e, ci) => (
                    <button key={`${r.row.key}-${ci}`} className={`hmv ${e.score.meets_requirements ? '' : 'fail'}`} aria-pressed={pick?.key === r.row.key && pick.col === ci} style={{ background: cellBg(e.score.total) }}
                      title={`${r.row.site.name} · ${utc(e.landing)} 착륙 · 점수 ${Math.round(e.score.total)}${e.score.meets_requirements ? '' : ' · 필수 조건 미달'}`} onClick={() => setPick({ key: r.row.key, col: ci })}>
                      {e.score.meets_requirements ? null : <span className="x">×</span>}{Math.round(e.score.total)}
                    </button>
                  )),
                ])}
              </div>
            </div>
          ) : <Empty>{app.rankMode === 'catalog' ? '지형 마스크가 있는 카탈로그 착륙지를 불러오는 중이거나 없습니다.' : res ? '01 조건을 만족하는 격자 칸이 없습니다.' : '격자 계산 중…'}</Empty>}
          <div className="legend"><span><i className="sw" style={{ background: 'linear-gradient(90deg,rgba(59,184,155,.08),rgba(59,184,155,.78))', width: 34 }} />점수 낮음 → 높음 (이 표 안 상대)</span><span>× 필수 조건 미달</span><span>칸을 눌러 검토</span></div>
          <p className="help" style={{ margin: 0 }}>점수는 후보 간 상대 비교용 지표이며 확률이 아닙니다.</p>
        </Card>
      ) : null}

      {period && picked && pickedEv ? (
        <Card title="검토 중인 조합" tag={pickedEv.score.meets_requirements ? <span className="badge ok">필수 조건 충족</span> : <span className="badge warn">필수 조건 미달</span>}>
          <div className="combo">
            <div className="combo-t">
              <b>{picked.row.label}</b>
              <span className="small soft mono">{utc(pickedEv.landing)} 착륙 → {utc(pickedEv.landing + app.duration_h * HOUR_MS)} 종료 · UTC</span>
            </div>
            <div className="combo-s"><b>{Math.round(pickedEv.score.total)}</b><span>점</span></div>
          </div>
          <div className="combo-k">
            <div><span>기간 내 조건 충족</span><b>{picked.okCount}/{cols.length} 시작일</b><small>{Math.round((picked.okCount / cols.length) * 100)}% · 일 단위 표본</small></div>
            <div><span>가장 긴 가능 구간</span><b>{picked.runLen ? `${md(cols[picked.runFrom])}–${md(cols[picked.runFrom + picked.runLen - 1])}` : '없음'}</b><small>{picked.runLen}개 시작일 연속</small></div>
            <div><span>충족 조합 중 최고점</span><b>{bestEv ? `${Math.round(bestEv.score.total)}점` : '—'}</b><small>{bestEv ? `${md(bestEv.landing)} 착륙` : '충족하는 시작일 없음'}</small></div>
            <div><span>착륙 윈도 (임무 기간 안)</span><b>{pickedWins.length ? `${pickedWins.length}개 · 최장 ${Math.max(...pickedWins.map((w) => w.h))} h` : '없음'}</b><small>{pickedWins.length ? `첫 윈도 ${utc(pickedWins[0].start).slice(5)} 시작` : '햇빛·교신 동시 구간 없음'}</small></div>
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="small muted">다른 칸을 살펴봐도 적용한 계획은 유지됩니다.</span>
            <span className="row" style={{ gap: 6 }}>
              <button className="btn" onClick={() => { app.addScenario(makeScenario(picked.row.site, pickedEv.landing, app.duration_h, 'search')); toast('비교에 추가했습니다 (07 후보 비교)'); }}>비교에 추가</button>
              <button className="btn pri" onClick={() => apply(picked.row, pickedEv.landing)}>이 조합을 계획으로 적용</button>
            </span>
          </div>
        </Card>
      ) : null}

    </>
  );
}
