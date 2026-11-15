// 02 착륙지·날짜 고르기 (옛 02 착륙지 + 04 착륙 날짜를 합침) · 착륙지 부분: 남극 지도·레이어(P1-02~07), 추천 순위(P1-19), 착륙지 목록·좌표(P1-08·09), 지표(P1-22 미리보기), 점수 근거(P1-20)
import { useEffect, useMemo, useState } from 'react';
import { ArtemisBadge, Card, Help, Kpi, NoData, ScoreChip, Seg, TerrBadge, hrs, pct, toast, Empty } from '../components/kit';
import { useArtemisVintage } from '../state/artemis';
import { MapCard } from '../components/MapCard';
import { DAY_MS } from '../core/constants';
import { nearestCell } from '../core/gridScore';
import { flatMask } from '../core/horizon';
import { siteContext } from '../core/scenario';
import type { Criterion, SiteCategory } from '../core/types';
import { useData } from '../state/data';
import { evalFor, siteKey, useEval } from '../state/derived';
import { useGridRun } from '../state/gridRun';
import { useResolvedSite, useSiteCtx } from '../state/hooks';
import { makeScenario } from '../state/scenario';
import { useApp } from '../state/store';
import { CAT, CRIT, CRIT_COL, useUi } from '../state/ui';
import LandingDate from './LandingDate';

function RankTab() {
  const app = useApp();
  const res = useGridRun((g) => g.result);
  const sites = useData((d) => d.sites.items);
  const masks = useData((d) => d.masks);
  const ensureMask = useData((d) => d.ensureMask);
  const eph = useData((d) => d.eph);
  const [, bump] = useState(0);
  useEffect(() => { if (app.rankMode === 'catalog') sites.forEach((s) => s.mask && !masks[s.mask] && ensureMask(s.mask).then(() => bump((x) => x + 1))); }, [app.rankMode, sites, masks, ensureMask]);
  const cat = useMemo(() => {
    if (app.rankMode !== 'catalog') return [];
    return sites.map((s) => {
      const env = s.mask ? masks[s.mask] : undefined, m = env && env !== 'missing' ? env.data : null;
      const ctx = siteContext({ ...s, elevation_m: m?.ground_elev_m ?? s.elevation_m }, m ?? flatMask(s.id, s.lat_deg, s.lon_deg, 2), eph, app.margin_deg);
      return { s, terrain: (m ? 'site' : 'flat') as 'site' | 'flat', e: evalFor(ctx, `cat|${s.id}|${m ? 1 : 0}|r${useData.getState().ephRev}`, app.landing, app.duration_h, 6) };
    }).sort((a, b) => b.e.score.total - a.e.score.total);
  }, [app.rankMode, sites, masks, eph, app.margin_deg, app.landing, app.duration_h, app.req, app.scenarioWeights, app.powerSource]);
  const ref = app.siteRef;
  const vint = useArtemisVintage();
  return (
    <>
      <div className="row" style={{ padding: '10px 12px 6px' }}>
        <Seg value={app.rankMode} opts={[['grid', '격자 칸'], ['catalog', '카탈로그 착륙지']]} onChange={(v) => app.setMap({ rankMode: v })} />
        <span className="tiny muted">통과 {res?.passCount ?? '—'}칸 중 상위 {res?.top.length ?? 15}</span>
      </div>
      {app.rankMode === 'grid' ? (
        res && res.top.length ? (
          <div className="tblwrap" style={{ maxHeight: 380, overflow: 'auto' }}>
            <table>
              <thead><tr><th>#</th><th>위치</th><th>점수</th><th>일조</th><th>교신</th><th>최장 그늘</th></tr></thead>
              <tbody>{res.top.map((c, i) => (
                <tr key={c.cell} className={`click ${ref?.kind === 'cell' && ref.cell === c.cell ? 'sel' : ''}`} onClick={() => app.setSite({ kind: 'cell', cell: c.cell })}>
                  <td>{i + 1}</td><td className="mono small">{c.lat_deg.toFixed(3)}, {c.lon_deg.toFixed(2)}</td><td><ScoreChip v={c.score * 100} /></td>
                  <td className="mono">{pct(res.dyn.illum_mission[c.cell])}</td><td className="mono">{pct(res.dyn.comm_mission[c.cell])}</td><td className="mono">{Math.round(res.dyn.dark_h[c.cell])} h</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <div style={{ padding: 12 }}><Empty>{res ? '조건을 만족하는 칸이 없습니다. 01에서 조건을 풀어 보세요.' : '격자 계산 중…'}</Empty></div>
      ) : (
        <div className="tblwrap" style={{ maxHeight: 380, overflow: 'auto' }}>
          <table>
            <thead><tr><th>#</th><th>착륙지</th><th>점수</th><th>요구 조건</th></tr></thead>
            <tbody>{cat.map(({ s, e, terrain }, i) => (
              <tr key={s.id} className={`click ${ref?.kind === 'catalog' && ref.id === s.id ? 'sel' : ''}`} onClick={() => app.setSite({ kind: 'catalog', id: s.id })}>
                <td>{i + 1}</td><td>{s.name} <TerrBadge k={terrain} /> <ArtemisBadge v={vint.get(s.id)} /></td><td><ScoreChip v={e.score.total} /></td>
                <td>{e.score.meets_requirements ? <span className="badge ok">충족</span> : <span className="badge warn">요건 미달</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <p className="help" style={{ padding: '8px 12px' }}>점수는 후보 간 상대 비교용 지표이며 확률이 아닙니다. 행을 누르면 그곳이 선택되고 3D 달이 이동합니다.</p>
    </>
  );
}

function ListTab() {
  const app = useApp();
  const sites = useData((d) => d.sites.items);
  type CatSel = SiteCategory | 'all' | 'art2024' | 'art2022';
  const [c, setC] = useState<CatSel>('all');
  const [q, setQ] = useState('');
  const vint = useArtemisVintage();
  const catOk = (s: (typeof sites)[number]) =>
    c === 'all' || (c === 'art2024' ? vint.get(s.id)?.year === 2024 : c === 'art2022' ? vint.get(s.id)?.year === 2022 : s.category === c);
  const list = sites.filter((s) => catOk(s) && s.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <div className="row" style={{ padding: '10px 12px' }}>
        <Seg<CatSel> value={c} opts={[['all', '전체'], ...(['apollo', 'clps', 'international'] as SiteCategory[]).map((k) => [k, CAT[k]] as [CatSel, string]), ...(vint.size ? ([['art2024', '아르테미스 2024'], ['art2022', '아르테미스 2022']] as Array<[CatSel, string]>) : ([['artemis', CAT.artemis]] as Array<[CatSel, string]>)), ['other', CAT.other]]} onChange={setC} wrap />
        <input className="field" placeholder="이름 검색" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 120 }} />
      </div>
      <div className="tblwrap" style={{ maxHeight: 380, overflow: 'auto' }}>
        <table><tbody>{list.map((s) => (
          <tr key={s.id} className={`click ${app.siteRef?.kind === 'catalog' && app.siteRef.id === s.id ? 'sel' : ''}`} onClick={() => app.setSite({ kind: 'catalog', id: s.id })}>
            <td className="wrap">{s.name}{s.verified ? null : <> <span className="badge warn">미검증</span></>}</td>
            <td className="small muted">{CAT[s.category]}{vint.get(s.id) ? <> <ArtemisBadge v={vint.get(s.id)} /></> : null}</td>
            <td className="mono small">{s.lat_deg.toFixed(2)}, {s.lon_deg.toFixed(2)}</td>
            <td><TerrBadge k={s.terrain} /></td>
          </tr>
        ))}</tbody></table>
      </div>
    </>
  );
}

/** 좌표 입력: 숫자 칸은 "-" 만 친 중간 상태를 0 으로 바꿔 버리므로 글자로 받고, 누를 때 숫자로 바꾼다 */
const parseDeg = (s: string, lim: number): number | null => {
  const v = Number(s.trim().replace(',', '.').replace(/[−–]/g, '-'));
  return s.trim() !== '' && Number.isFinite(v) && Math.abs(v) <= lim ? v : null;
};

function CoordTab() {
  const app = useApp();
  const [latS, setLatS] = useState(String(app.siteRef?.kind === 'custom' ? app.siteRef.lat : -89.5));
  const [lonS, setLonS] = useState(String(app.siteRef?.kind === 'custom' ? app.siteRef.lon : 0));
  const lat = parseDeg(latS, 90), lon = parseDeg(lonS, 180);
  const ok = lat !== null && lon !== null;
  const go = () => { if (ok) app.setSite({ kind: 'custom', lat: lat!, lon: lon! }); };
  return (
    <div className="bd" style={{ padding: 12 }}>
      <Help>위도·경도를 넣으면 아무 곳이나 확인할 수 있습니다. 지형 자료가 없는 곳은 지평선을 0°로 보고 계산하며 <b>지형 미반영</b>으로 표시합니다.</Help>
      <div className="row">
        <label className="small muted">위도 (°, 남위 −)<br /><input className="field num" type="text" inputMode="decimal" placeholder="-89.5" value={latS} aria-invalid={lat === null} style={lat === null ? { borderColor: 'var(--warn)' } : undefined} onChange={(e) => setLatS(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} /></label>
        <label className="small muted">경도 (°, 동경 +)<br /><input className="field num" type="text" inputMode="decimal" placeholder="0" value={lonS} aria-invalid={lon === null} style={lon === null ? { borderColor: 'var(--warn)' } : undefined} onChange={(e) => setLonS(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} /></label>
        <button className="btn pri" style={{ alignSelf: 'flex-end' }} disabled={!ok} onClick={go}>이 좌표로</button>
      </div>
      {ok ? null : <p className="help" style={{ color: 'var(--warn)' }}>위도는 −90~90, 경도는 −180~180 사이 숫자로 넣어 주세요. 남위·서경은 앞에 − 를 붙입니다.</p>}
      <p className="help">지도나 3D 달을 직접 클릭해도 그 좌표가 선택됩니다.</p>
    </div>
  );
}

export default function Site() {
  const app = useApp();
  const ui = useUi();
  const rs = useResolvedSite();
  const ctx = useSiteCtx(rs);
  const ev = useEval();
  const grid = useData((d) => d.grid);
  const res = useGridRun((g) => g.result);
  const setExplain = useGridRun((g) => g.setExplain);
  // 점수 근거: 선택 지점의 격자 칸
  const cell = grid && rs ? (app.siteRef?.kind === 'cell' ? app.siteRef.cell : nearestCell(grid, rs.site.lat_deg, rs.site.lon_deg, grid.manifest.cell_km * 2)) : -1;
  useEffect(() => { setExplain(cell >= 0 ? cell : null); }, [cell, setExplain]);
  const prev = useMemo(() => (ctx ? [3, 7, 14].map((d) => ({ d, e: evalFor(ctx, siteKey(rs, app.margin_deg), app.landing + d * DAY_MS, app.duration_h, 6) })) : []), [ctx, rs, app.margin_deg, app.landing, app.duration_h, app.req, app.scenarioWeights, app.powerSource]);
  const ex = res?.explain && cell >= 0 ? res.explain : null;
  const comp = cell >= 0 && res ? res.composite[cell] : null;
  const R = app.req;
  const vint = useArtemisVintage();
  const sv = rs ? vint.get(rs.site.id) : undefined;
  return (
    <>
      <div className="g21">
        <MapCard where="site" />
        <section className="card">
          <div className="tabs" role="tablist">
            {([['rank', '추천 순위'], ['list', '착륙지 목록'], ['coord', '좌표 입력']] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={ui.siteTab === k} onClick={() => ui.set({ siteTab: k })}>{l}</button>)}
          </div>
          {ui.siteTab === 'rank' ? <RankTab /> : ui.siteTab === 'list' ? <ListTab /> : <CoordTab />}
        </section>
      </div>
      {rs && ev ? (
        <Card title={rs.site.name} sub={`${rs.site.lat_deg.toFixed(3)}°, ${rs.site.lon_deg.toFixed(3)}° · ${CAT[rs.site.category] ?? ''}`} tag={<><TerrBadge k={rs.terrain} /><ArtemisBadge v={sv} /><button className="btn sm" onClick={() => { app.addScenario(makeScenario(rs.site, app.landing, app.duration_h, 'user')); toast('비교에 추가했습니다 (07 후보 비교)'); }}>비교에 추가</button></>}>
          <div className="kpis">
            <Kpi l="시나리오 점수" v={Math.round(ev.score.total)} s="상대 비교용 · 확률 아님" />
            <Kpi l="요구 조건" v={ev.score.meets_requirements ? '충족' : '요건 미달'} s={ev.score.meets_requirements ? '' : '필수 요구 조건 미달'} tone={ev.score.meets_requirements ? 'good' : 'bad'} />
            <Kpi l="임무 기간 일조율" v={pct(ev.summary.illum_frac)} s={`기준 ≥ ${pct(R.min_illum_frac)}`} />
            <Kpi l="임무 기간 교신율" v={pct(ev.summary.comm_frac)} />
            <Kpi l="하루 최소 교신" v={hrs(ev.summary.daily_comm_h_min)} s={`기준 ≥ ${R.min_daily_comm_h} h`} tone={ev.summary.daily_comm_h_min >= R.min_daily_comm_h ? '' : 'bad'} />
            <Kpi l="최장 연속 암흑" v={hrs(ev.summary.longest_dark_h)} s={`기준 ≤ ${R.max_dark_h} h`} tone={ev.summary.longest_dark_h <= R.max_dark_h ? '' : 'bad'} />
          </div>
          <div className="row small"><b>날짜가 밀리면?</b>{prev.map((p) => <span key={p.d} className="mono">+{p.d}일 → <ScoreChip v={p.e.score.total} /></span>)}<button className="btn sm ghost" onClick={() => app.setPage('delay')}>06 일정 변경에서 자세히 →</button></div>
        </Card>
      ) : !rs ? <NoData what="착륙지" why="지도·순위표·목록에서 고르세요" /> : null}
      {ex ? (
        <Card title="점수 근거" sub={comp != null && Number.isFinite(comp) ? `종합 점수 ${Math.round(comp * 100)}` : ''}>
          <Help>지도 종합 점수가 기준별로 어떻게 나왔는지입니다. 막대가 짧은 기준이 점수를 깎은 원인입니다.{app.siteRef?.kind !== 'cell' ? ' (선택 지점에서 가장 가까운 5 km 격자 칸 기준)' : ''}</Help>
          {ex.contributions.map((c) => (
            <div key={c.criterion} className="wrow" style={{ gridTemplateColumns: '150px minmax(0,1fr) 90px' }}>
              <span className="small">{CRIT[c.criterion as Criterion]}</span>
              <div className="bar"><i style={{ width: `${c.missing || c.value == null ? 0 : c.value * 100}%`, background: c.missing ? 'var(--line2)' : CRIT_COL[c.criterion as Criterion] }} /></div>
              <span className="mono small" style={{ textAlign: 'right' }}>{c.missing || c.value == null ? '자료 없음' : pct(c.value)} <span className="muted">w{c.weight}</span></span>
            </div>
          ))}
          <div className="small">
            {ex.weakest ? <>가장 크게 깎인 기준: <b style={{ color: 'var(--warn)' }}>{CRIT[ex.weakest]}</b></> : null}
            {ex.contributions.some((c) => c.missing) ? <> · <span className="muted">빠진 기준(가중치 0 또는 자료 없음): {ex.contributions.filter((c) => c.missing).map((c) => CRIT[c.criterion as Criterion]).join(', ')}</span></> : null}
          </div>
        </Card>
      ) : null}
      <h2 className="sechead"><span>착륙 날짜</span><small>착륙 시각을 정하거나, 기간을 주고 후보 착륙지 × 시작일 점수표에서 조합을 골라 계획에 적용합니다</small></h2>
      <LandingDate />
    </>
  );
}
