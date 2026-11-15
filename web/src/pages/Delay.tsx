// 06 일정 변경 대응: 원래 안 재평가(P1-22), 대안(P1-23), 차이 표시(P1-24), 파노라마 겹쳐 보기(P2-05), 착륙 오차(P3-05)
import { useEffect, useMemo, useState } from 'react';
import { Card, Help, Kpi, NoData, Progress, ScoreChip, km, pct, signed, toast, utc } from '../components/kit';
import { Pano } from '../components/viz';
import { DEFAULTS } from '../config';
import { EllipseCard } from '../components/EllipseCard';
import { diffScenarios, type DiffKey, type Reevaluation } from '../core/alternatives';
import { DAY_MS } from '../core/constants';
import { siteContext, type ScenarioEval } from '../core/scenario';
import { sampleTimeline } from '../core/timeline';
import type { Site } from '../core/types';
import { useData } from '../state/data';
import { useResolvedSite, useSiteCtx } from '../state/hooks';
import { ephPayload, makeScenario, siteMaskOf, useCandidates } from '../state/scenario';
import { scoreWeights, useApp } from '../state/store';
import { isCancelled, searchWorker } from '../workers/client';

interface AltRes { re: Reevaluation; preview: Array<{ days: number; ev: ScenarioEval }>; same: ScenarioEval[]; other: Array<{ site: Site; ev: ScenarioEval }> }
const DIFF: Array<[DiffKey, string]> = [['score', '점수'], ['illum_frac', '일조율'], ['comm_frac', '교신율'], ['longest_dark_h', '최장 암흑'], ['distance_km', '거리'], ['landing_shift_days', '착륙일 차이']];
const CN: Record<string, string> = { illum_frac: '일조율', comm_frac: '교신율', longest_dark_h: '최장 암흑', score: '점수', distance_km: '거리', landing_shift_days: '착륙일 차이', daily_comm_h_min: '하루 최소 교신' };
const fmtDiff = (k: DiffKey, x: number) => (k === 'illum_frac' || k === 'comm_frac' ? signed(x * 100, 0, '%p') : k === 'longest_dark_h' ? signed(x, 0, ' h') : k === 'distance_km' ? km(x) : k === 'landing_shift_days' ? signed(x, 1, '일') : signed(x, 0));
const tone = (k: DiffKey, x: number) => { if (k === 'distance_km' || k === 'landing_shift_days' || Math.abs(x) < 1e-6) return undefined; const good = k === 'longest_dark_h' ? x < 0 : x > 0; return { color: good ? 'var(--good)' : 'var(--bad)' }; };

export default function Delay() {
  const app = useApp();
  const rs = useResolvedSite();
  const ctx = useSiteCtx(rs);
  const eph = useData((d) => d.eph);
  const shift = app.shift_days;
  const shifted = app.landing + shift * DAY_MS;
  const cands = useCandidates(rs?.site ?? null, DEFAULTS.alt_radius_km, 0);
  const [res, setRes] = useState<AltRes | null>(null);
  const [prog, setProg] = useState<number | null>(null);
  useEffect(() => {
    if (!rs) return;
    const tm = setTimeout(() => {
      setProg(0);
      searchWorker()
        .request<AltRes | null>('alternatives', { eph: ephPayload(), origin: siteMaskOf(rs), candidates: cands, original: app.landing, shifted, sc: { req: app.req, weights: scoreWeights(app), delay_days: app.delay_days, duration_h: app.duration_h, step_h: 2 }, margin_deg: app.margin_deg, span_days: DEFAULTS.alt_span_days, radius_km: DEFAULTS.alt_radius_km }, { onProgress: setProg })
        .then((r) => { if (r) setRes(r); setProg(null); })
        .catch((e) => { if (!isCancelled(e)) { setProg(null); console.warn("worker", e); } });
    }, 300);
    return () => clearTimeout(tm);
  }, [rs, cands, app.landing, shifted, app.req, app.scenarioWeights, app.powerSource, app.delay_days, app.duration_h, app.margin_deg]);

  const baseTrack = useMemo(() => (ctx ? sampleTimeline(ctx, shifted, shifted + app.duration_h * 3_600_000, 3) : null), [ctx, shifted, app.duration_h]);
  const ov = app.overlay;
  const ovLayer = useMemo(() => {
    if (!ov || !rs) return null;
    const c = cands.find((x) => x.site.id === ov.site.id);
    const mask = c ? { az_step_deg: c.mask.az_step_deg, elevation_deg: c.mask.elevation_deg } : rs.mask;
    const cx = siteContext(ov.site, mask, eph, app.margin_deg);
    return { mask, track: sampleTimeline(cx, ov.landing, ov.landing + app.duration_h * 3_600_000, 3) };
  }, [ov, rs, cands, eph, app.margin_deg, app.duration_h]);

  if (!rs || !ctx) return <NoData what="착륙지" why="02에서 착륙지를 먼저 고르세요" />;
  const origin = res ? { site: rs.site, ev: res.re.after } : null;
  const table = (rows: Array<{ site: Site; ev: ScenarioEval }>) => (
    <div className="tblwrap"><table>
      <thead><tr><th>안</th><th>착륙 시각</th>{DIFF.map(([, l]) => <th key={l}>{l}</th>)}<th /></tr></thead>
      <tbody>{rows.map((r, i) => {
        const d = origin ? diffScenarios(origin, r) : null;
        return (
          <tr key={i}>
            <td className="wrap"><b>{r.site.name}</b> <ScoreChip v={r.ev.score.total} /><div className="small muted">{d ? `원인: ${CN[d.reason] ?? d.reason} 차이가 가장 큼` : ''}</div></td>
            <td className="mono small">{utc(r.ev.landing)}</td>
            {DIFF.map(([k]) => <td key={k} className="mono small" style={d ? tone(k, d.values[k]) : undefined}>{d ? fmtDiff(k, d.values[k]) : '—'}</td>)}
            <td><div className="acts">
              <button className="btn sm" onClick={() => { app.addScenario(makeScenario(r.site, r.ev.landing, app.duration_h, 'alternative')); toast('비교에 추가했습니다 (07 후보 비교)'); }}>비교에 추가</button>
              <button className="btn sm ghost" onClick={() => app.setOverlayAlt({ site: r.site, landing: r.ev.landing })}>파노라마 겹쳐 보기</button>
            </div></td>
          </tr>
        );
      })}</tbody>
    </table></div>
  );
  const fmtC = (k: string | null, x: number | null | undefined) => (x == null ? '—' : k === 'longest_dark_h' ? `${Math.round(x)} h` : pct(x));
  return (
    <>
      <Card title="원래 안 재평가" sub={rs.site.name}>
        <div className="row">
          <span className="small">원래 착륙 시각 <b className="mono">{utc(app.landing)}</b></span>
          <label className="small muted">얼마나 밀렸나 (일) <input className="field num" type="number" min={-30} max={60} value={shift} onChange={(e) => app.setShift(Number(e.target.value))} /></label>
          <span className="chips">{[3, 7, 14, 30].map((d) => <button key={d} className="chip" aria-pressed={shift === d} onClick={() => app.setShift(d)}>+{d}일</button>)}</span>
          <span className="mono small soft">새 착륙 시각 {utc(shifted)}</span>
        </div>
        <Progress p={prog} />
        {res ? (
          <>
            <div className="kpis">
              <Kpi l="점수" v={`${Math.round(res.re.before.score.total)} → ${Math.round(res.re.after.score.total)}`} s="상대 비교용 · 확률 아님" tone={res.re.after.score.total < res.re.before.score.total ? 'bad' : 'good'} />
              <Kpi l="원인" v={res.re.cause ? CN[res.re.cause] ?? res.re.cause : '—'} s={res.re.cause ? `${fmtC(res.re.cause, res.re.cause_before)} → ${fmtC(res.re.cause, res.re.cause_after)}` : ''} />
              <Kpi l="요구 조건" v={res.re.after.score.meets_requirements ? '충족' : '요건 미달'} tone={res.re.after.score.meets_requirements ? 'good' : 'bad'} />
            </div>
            <div className="row small"><b>지연 미리보기</b>{res.preview.map((p) => <span key={p.days} className="mono">+{p.days}일 → <ScoreChip v={p.ev.score.total} /></span>)}</div>
          </>
        ) : null}
      </Card>
      <Card title="대안 1 · 같은 곳 다른 날짜">
        <Help>새 착륙 날짜 앞뒤 {DEFAULTS.alt_span_days}일 안에서 같은 착륙지의 점수 상위 시각 3개. 차이는 "밀린 원래 안" 대비입니다.</Help>
        {res && res.same.length && res.same[0].score.total <= res.re.after.score.total ? <p className="help">이 범위 안에는 밀린 원래 안보다 점수가 높은 시각이 없습니다. 아래는 점수가 같거나 낮은 상위 시각입니다.</p> : null}
        {res ? table(res.same.slice(0, 3).map((ev) => ({ site: rs.site, ev }))) : <Progress p={prog ?? 0} />}
      </Card>
      <Card title="대안 2 · 다른 곳 같은 날짜" tag={<span className="tiny muted">후보 {cands.length}곳 · {DEFAULTS.alt_radius_km} km</span>}>
        {res && res.other.length ? <><Help>지평선 마스크가 있는 착륙지 중 {DEFAULTS.alt_radius_km} km 안에서 새 날짜에 점수가 높은 3곳.</Help>{table(res.other.slice(0, 3))}</> : res ? <NoData what="다른 곳 같은 날짜" why={`${DEFAULTS.alt_radius_km} km 안에 지평선 마스크가 있는 착륙지가 없습니다`} /> : <Progress p={prog ?? 0} />}
      </Card>
      <Card title="파노라마 겹쳐 보기" sub={ov ? `원래 안(밀림) vs ${ov.site.name} ${utc(ov.landing)}` : ''} tag={<span className="badge">2순위</span>}>
        <div className="legend"><span><i className="sw" style={{ background: 'var(--terrain)' }} />원래 안 지형</span><span><i className="sw" style={{ border: '1px dashed var(--soft)', background: 'none' }} />대안 지형</span><span><i className="sw" style={{ background: 'var(--sun)' }} />태양 궤적</span><span><i className="sw" style={{ background: 'var(--earth)' }} />지구 궤적 (점선 = 대안)</span></div>
        <Pano h={210} mask={ctx.mask} layers={[{ track: baseTrack }, ...(ovLayer ? [{ track: ovLayer.track, dashed: true }] : [])]} now={null} maskB={ovLayer?.mask ?? null} />
        {ov ? null : <Help>위 표에서 <b>파노라마 겹쳐 보기</b>를 누르면 그 대안이 점선으로 겹쳐집니다.</Help>}
      </Card>
      <EllipseCard />
    </>
  );
}
