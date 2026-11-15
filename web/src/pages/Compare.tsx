import { parseConfig } from '../orbit/model';
// 07 후보 비교: 비교 보드(P1-37), 시나리오 A/B(P1-38), 빛 쌍둥이(P3-04), 과학·공학 균형(P3-06)
import { useEffect, useMemo, useState } from 'react';
import { Card, Help, NoData, ScoreChip, hrs, km, pct, utc, Empty, toast } from '../components/kit';
import { BandChart, Scatter } from '../components/viz';
import { FEATURES } from '../config';
import { rankCells, scoreGrid, type DynamicLayers } from '../core/gridScore';
import type { Scenario } from '../core/types';
import { useData } from '../state/data';
import { evalFor, siteKey, timelineFor } from '../state/derived';
import { useGridRun } from '../state/gridRun';
import { useResolvedSite, useSiteCtx } from '../state/hooks';
import { useApp, type ConditionSet, type SiteRef } from '../state/store';
import { PROFILE_UI } from '../state/ui';
import { gridWorker } from '../workers/client';

const ORIGIN: Record<Scenario['origin'], string> = { user: '사용자', alternative: '대안', template: '템플릿', mission: '미션', search: '탐색' };
const refOf = (sc: Scenario): SiteRef => (sc.site.category === 'custom' ? { kind: 'custom', lat: sc.site.lat_deg, lon: sc.site.lon_deg } : sc.site.category === 'cell' ? { kind: 'cell', cell: Number(sc.site.id.slice(5)) } : { kind: 'catalog', id: sc.site.id });

function Col({ sc, best, onScore }: { sc: Scenario; best: boolean; onScore(id: string, v: number): void }) {
  const app = useApp();
  const ref = refOf(sc);
  const rs = useResolvedSite(ref);
  const ctx0 = useSiteCtx(rs);
  // 저장할 때의 통신 여유각으로 평가한다 (지금 화면의 여유각이 아님)
  const margin = Number.isFinite(sc.comm_margin_deg) ? sc.comm_margin_deg : app.margin_deg;
  const ctx = useMemo(() => (ctx0 ? { ...ctx0, margin_deg: margin } : null), [ctx0, margin]);
  const landing = Date.parse(sc.landing_utc);
  const e = useMemo(() => (ctx ? evalFor(ctx, siteKey(rs, margin), landing, sc.duration_h, 3) : null), [ctx, rs, margin, landing, sc.duration_h, app.req, app.scenarioWeights, app.powerSource]);
  const band = useMemo(() => (ctx ? timelineFor(ctx, siteKey(rs, margin), landing, 720, 6) : null), [ctx, rs, margin, landing]);
  useEffect(() => { if (e) onScore(sc.id, e.score.total); }, [e, sc.id, onScore]);
  return (
    <div className="card" style={{ background: 'var(--bg)', ...(best ? { borderColor: 'var(--accent)' } : {}) }}>
      <div className="hd">
        <input className="field" value={sc.name} style={{ flex: 1, fontWeight: 600, background: 'transparent', borderColor: 'transparent', padding: '2px 4px' }} onChange={(ev) => app.renameScenario(sc.id, ev.target.value)} />
        <span className="badge">{ORIGIN[sc.origin]}</span>
        <button className="btn sm" aria-label="삭제" onClick={() => app.removeScenario(sc.id)}>×</button>
      </div>
      {e ? (
        <table><tbody>
          <tr><td>점수</td><td style={{ textAlign: 'right' }}><ScoreChip v={e.score.total} /></td></tr>
          <tr><td>요구 조건</td><td style={{ textAlign: 'right' }}>{e.score.meets_requirements ? <span className="badge ok">충족</span> : <span className="badge warn">요건 미달</span>}</td></tr>
          <tr><td>착륙지</td><td style={{ textAlign: 'right' }} className="small">{sc.site.name.slice(0, 18)}</td></tr>
          <tr><td>착륙 시각</td><td className="mono small" style={{ textAlign: 'right' }}>{utc(landing)}</td></tr>
          <tr><td>통신 여유각</td><td className="mono small" style={{ textAlign: 'right' }}>{margin}°</td></tr>
          <tr><td>일조율</td><td className="mono" style={{ textAlign: 'right' }}>{pct(e.summary.illum_frac)}</td></tr>
          <tr><td>교신율</td><td className="mono" style={{ textAlign: 'right' }}>{pct(e.summary.comm_frac)}</td></tr>
          <tr><td>최장 연속 암흑</td><td className="mono" style={{ textAlign: 'right' }}>{hrs(e.summary.longest_dark_h)}</td></tr>
          <tr><td>하루 최소 교신</td><td className="mono" style={{ textAlign: 'right' }}>{hrs(e.summary.daily_comm_h_min)}</td></tr>
          <tr><td className="small">전력 / 교신 / 지연 견고성</td><td className="mono small" style={{ textAlign: 'right' }}>{pct(e.score.power)} / {pct(e.score.comm)} / {pct(e.score.robustness)}</td></tr>
        </tbody></table>
      ) : <NoData what="계산 중" />}
      <div style={{ padding: 8 }}>
        {band ? <BandChart h={40} times={band.map((p) => p.t)} rows={[{ label: '햇빛', values: band.map((p) => p.sun_frac), color: '--sun', grad: true }, { label: '지구', values: band.map((p) => (p.earth_visible ? 1 : 0)), color: '--earth' }]} /> : null}
        <p className="tiny muted">{sc.orbit_input ? '추진·궤도 입력 스냅샷 포함 · 궤도 결과는 재계산' : '궤도 입력 없음 · 표면 운용 비교'}</p>
        <button className="btn sm" style={{ marginTop: 6, width: '100%', justifyContent: 'center' }} onClick={() => { try { if (sc.orbit_input) app.applyOrbitConfig(parseConfig(sc.orbit_input), ref); else { app.setSite(ref); app.setLanding(landing); app.setT(landing); toast('저장된 궤도 입력이 없습니다. 01에서 추진·궤도 조건을 확인하세요.'); } app.setDuration(sc.duration_h); app.setMargin(margin); } catch (e) { toast(String(e)); } }}>이 안으로 바꾸기</button>
      </div>
    </div>
  );
}

export default function Compare() {
  const app = useApp();
  const grid = useData((d) => d.grid);
  const layers = useData((d) => d.layers);
  const sites = useData((d) => d.sites.items);
  const regions = useData((d) => d.artemisRegions);
  const res = useGridRun((g) => g.result);
  const rs = useResolvedSite();
  const [scores, setScores] = useState<Record<string, number>>({});
  const onScore = useMemo(() => (id: string, v: number) => setScores((s) => (s[id] === v ? s : { ...s, [id]: v })), []);
  const best = Math.max(-1, ...app.scenarios.map((s) => scores[s.id] ?? -1));
  const [labels, setLabels] = useState<{ A?: string; B?: string }>({});

  const rankFor = (set: ConditionSet | undefined) => {
    if (!set || !grid || !res) return null;
    const dyn = { ...res.dyn, lit_bits: new Uint8Array(0), comm_bits: new Uint8Array(0), n_samples: 0, sample_hours: new Float64Array(0) } as DynamicLayers;
    return rankCells(grid, scoreGrid({ g: grid, dyn, st: layers, weights: set.weights, filters: set.filters, artemisPoints: sites.filter((s) => s.category === 'artemis'), artemisRadiusKm: 0, artemisRegions: regions }), 8, 8);
  };
  const A = useMemo(() => rankFor(app.abSets.A), [app.abSets.A, grid, res, layers, sites, regions]);
  const B = useMemo(() => rankFor(app.abSets.B), [app.abSets.B, grid, res, layers, sites, regions]);
  const ov = A && B ? A.filter((a) => B.some((b) => b.cell === a.cell)).length : null;

  // 빛 쌍둥이: 선택 지점(또는 가장 가까운 칸)과 햇빛·교신 패턴이 비슷한 칸
  const cell = rs?.site.category === 'cell' ? Number(rs.site.id.slice(5)) : -1;
  const [twins, setTwins] = useState<Array<{ cell: number; distance: number; km: number }> | null>(null);
  useEffect(() => {
    setTwins(null);
    if (!FEATURES.lightTwins || cell < 0 || !res) return;
    gridWorker().request<typeof twins>('twins', { cell }).then((r) => setTwins(r ? r.slice(0, 5) : r)).catch(() => setTwins(null));
  }, [cell, res]);
  const balance = useMemo<Array<[number, number]> | null>(() => {
    if (!grid || !res || !layers.psr_dist_km) return null;
    const pts: Array<[number, number]> = [];
    for (let i = 0; i < grid.cells.length; i += 3) pts.push([Math.min(layers.psr_dist_km[i], 60), (res.dyn.illum_mission[i] + res.dyn.comm_mission[i]) / 2]);
    return pts;
  }, [grid, res, layers]);

  return (
    <>
      <Card title="비교 보드" sub={`${app.scenarios.length}/4 · 점수는 상대 비교용이며 확률이 아님`}>
        {app.scenarios.length ? (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(4, app.scenarios.length)},minmax(0,1fr))`, gap: 10 }}>
            {app.scenarios.map((sc) => <Col key={sc.id} sc={sc} best={scores[sc.id] === best} onScore={onScore} />)}
          </div>
        ) : <Empty>비교할 안이 없습니다. 02·04·06·08 단계에서 "비교에 추가"를 누르세요.</Empty>}
      </Card>
      <Card title="시나리오 A/B (조건 묶음)">
        <Help>01의 조건·가중치를 A나 B로 저장해 두고, 상위 후보가 얼마나 겹치는지 봅니다.</Help>
        <div className="row">
          {(['A', 'B'] as const).map((k) => <button key={k} className="btn" onClick={() => { app.saveAB(k); setLabels((l) => ({ ...l, [k]: `${PROFILE_UI[app.profile].name} · 필수 ${Object.keys(app.filters).length}개` })); }}>현재 조건을 {k}로 저장</button>)}
          {ov != null ? <span>겹치는 상위 후보 <b className="mono">{ov}</b> / 8</span> : null}
        </div>
        <div className="g2">
          {([['A', A], ['B', B]] as const).map(([k, r]) => (
            <div key={k}>
              <b>{k}</b> {labels[k] ? <span className="tiny muted">{labels[k]}</span> : null}
              {r ? (
                <table><tbody>{r.map((c, i) => <tr key={c.cell} className="click" onClick={() => app.setSite({ kind: 'cell', cell: c.cell })}><td>{i + 1}</td><td className="mono small">{c.lat_deg.toFixed(3)}, {c.lon_deg.toFixed(2)}</td><td><ScoreChip v={c.score * 100} /></td></tr>)}</tbody></table>
              ) : <Empty>아직 저장 안 함</Empty>}
            </div>
          ))}
        </div>
      </Card>
      <div className="g2">
        <Card title="빛 쌍둥이" tag={<span className="badge">3순위</span>}>
          {twins && twins.length ? (
            <>
              <Help>선택 지점과 햇빛·교신 패턴이 비슷한 다른 곳. 대안 후보로 씁니다.</Help>
              <table>
                <thead><tr><th>지점</th><th>거리</th><th>닮음</th></tr></thead>
                <tbody>{twins.map((x) => <tr key={x.cell} className="click" onClick={() => app.setSite({ kind: 'cell', cell: x.cell })}><td className="mono small">#{x.cell} ({grid?.lat[x.cell].toFixed(2)}, {grid?.lon[x.cell].toFixed(1)})</td><td className="mono">{km(x.km)}</td><td className="mono">{pct(1 - x.distance)}</td></tr>)}</tbody>
              </table>
            </>
          ) : <NoData what="빛 쌍둥이" why={cell < 0 ? '02 추천 순위에서 격자 칸을 먼저 고르세요' : '계산 중'} />}
        </Card>
        <Card title="과학·공학 균형" tag={<span className="badge">3순위 · 선택</span>}>
          <Help>가로: 영구음영(과학 목표)까지 거리, 세로: 전력·통신 점수. 왼쪽 위가 둘 다 좋은 곳입니다.</Help>
          {balance ? <Scatter h={220} pts={balance} xl="영구음영까지 거리 (km)" yl="전력·통신" /> : <NoData what="psr_dist_km" />}
        </Card>
      </div>
    </>
  );
}
