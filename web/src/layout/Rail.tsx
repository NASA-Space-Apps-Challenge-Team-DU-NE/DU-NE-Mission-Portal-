// 오른쪽: 3D 달 + 현장 뷰(하늘 | 알림 | 데이터 출처). 어느 단계에서나 같은 착륙지·시각.
import { useEffect, useMemo, useState } from 'react';
import { HOUR_MS, DAY_MS } from '../core/constants';
import { skyState } from '../core/sky';
import { ArtemisBadge, LayerPickButton, NoData, Kpi, TerrBadge, deg, dur, hrs, pct, utc, Empty } from '../components/kit';
import { MoonGlobe } from '../components/MoonGlobe';
import { pickNear, SouthMap } from '../components/SouthMap';
import { Dome, Pano } from '../components/viz';
import { useData } from '../state/data';
import { siteKey, timelineFor, useEval, useSim } from '../state/derived';
import { useGridRun } from '../state/gridRun';
import { useNextEvents, useResolvedSite, useSiteCtx } from '../state/hooks';
import { HUD_LAYERS, LAYER_UI } from '../state/layerUi';
import { useApp, type FailMode } from '../state/store';
import { PROFILE_UI, useUi } from '../state/ui';
import { TimeBar } from './Shell';
import { useArtemisVintage } from '../state/artemis';

const FILTER_NAMES: Record<string, [string, (v: number) => string]> = {
  min_illum_frac: ['임무 기간 일조율', (v) => pct(v)], min_comm_frac: ['임무 기간 교신율', (v) => pct(v)], max_slope_deg: ['경사 (90분위)', (v) => `${v}°`],
  max_water_km: ['영구음영(물 후보)까지', (v) => `${v} km`], max_dark_h: ['최장 연속 그늘', (v) => `${v} h`], avoid_faults_km: ['단층애에서 떨어진 거리', (v) => `${v} km`],
};

function Hud() {
  const app = useApp();
  const rs = useResolvedSite();
  const ctx = useSiteCtx(rs);
  const ev = useEval();
  const res = useGridRun((g) => g.result);
  const span = Math.max(720, app.duration_h), rel = (app.t - app.landing) / HOUR_MS;
  const n = ctx ? skyState(ctx.frame, ctx.mask, ctx.eph, app.t, ctx.margin_deg) : null;
  return (
    <div className="hud">
      <div className="hud-top">
        <button className="btn" onClick={() => app.setFullscreen(false)}>← 나가기 <span className="kbd">Esc</span></button>
        <div className="tl">
          <button className="ibtn pri" onClick={app.togglePlay}>{app.playing ? '❚❚' : '▶'}</button>
          <input type="range" min={-24} max={span} step={1} value={Math.max(-24, Math.min(span, rel))} aria-label="보는 시각" onChange={(e) => app.setT(app.landing + Number(e.target.value) * HOUR_MS)} />
          <output className="mono small">{utc(app.t)}</output>
        </div>
        <div className="lbtns">{HUD_LAYERS.map((id) => <button key={id} aria-pressed={app.mapLayer === id} onClick={() => app.setMap({ mapLayer: id })}>{LAYER_UI[id].name.replace(/ \(.*\)/, '')}</button>)}</div>
        <button className="btn" onClick={() => app.setPresentation(!app.presentation)}>발표 모드</button>
      </div>
      <div className="hud-card" id="hudCond">
        <b>조건</b>
        <span className="muted">{PROFILE_UI[app.profile].name} · {app.duration_h} h · 여유각 {app.margin_deg}°</span>
        <span>통과 <b className="mono">{res?.passCount ?? '—'}</b>칸</span>
        {Object.entries(app.filters).map(([k, v]) => <span key={k} className="tiny muted">{k === 'artemis_only' ? '아르테미스 III 후보 지역 안만' : `${FILTER_NAMES[k]?.[0] ?? k} ${FILTER_NAMES[k]?.[1](v as number) ?? ''}`}</span>)}
      </div>
      <div className="hud-card" id="hudSel">
        {rs && n ? (
          <>
            <b>{rs.site.name}</b>
            <span className="mono tiny muted">{rs.site.lat_deg.toFixed(3)}, {rs.site.lon_deg.toFixed(3)}</span>
            <div className="fk">
              <Kpi l="태양 고도" v={deg(n.sun.el_deg, 2)} tone={n.sun_frac > 0.5 ? 'good' : 'bad'} />
              <Kpi l="지구" v={n.earth_visible ? '보임' : '가림'} tone={n.earth_visible ? 'good' : 'bad'} />
              <Kpi l="점수" v={ev ? Math.round(ev.score.total) : '—'} />
              <Kpi l="일조율" v={pct(ev?.summary.illum_frac)} />
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}


/** 지도 모드 첫 화면: 왼쪽 위 제목, 오른쪽 고른 곳 카드. 계획 모드로 넘어가면 사라진다 */
function Intro() {
  const app = useApp();
  const set = useUi((u) => u.set);
  const rs = useResolvedSite();
  const ev = useEval();
  const start = (page: 'cond' | 'site') => { app.setPage(page); set({ mode: 'plan' }); };
  return (
    <>
      <div className="pick">
        <div className="card">
          <div className="k">고른 곳</div>
          <b>{rs ? rs.site.name : '아직 안 고름'}</b>
          {rs ? <span className="mono tiny muted">{rs.site.lat_deg.toFixed(2)}°, {rs.site.lon_deg.toFixed(2)}°</span> : null}
          <div className="fk">
            <Kpi l="임무 기간 일조율" v={pct(ev?.summary.illum_frac)} />
            <Kpi l="교신율" v={pct(ev?.summary.comm_frac)} />
          </div>
        </div>
        <button className="btn pri" onClick={() => start('site')} disabled={!rs}>이 곳으로 계획 시작 →</button>
        <button className="btn" onClick={() => start('cond')}>조건부터 정하기</button>
      </div>
    </>
  );
}

function MoonSection() {
  const app = useApp();
  const [sub, setSub] = useState<string | null>(null);
  const explore = useUi((u) => u.mode) === 'explore';
  const dim = useUi((u) => u.dim);
  const setUi = useUi((u) => u.set);
  const dimSeg = <div className="seg dimseg" aria-label="3D 또는 2D">{(['3d', '2d'] as const).map((d) => <button key={d} aria-pressed={dim === d} onClick={() => setUi({ dim: d })}>{d.toUpperCase()}</button>)}</div>;
  useEffect(() => {
    document.body.classList.toggle('fs', app.fullscreen);
    document.body.classList.toggle('present', app.presentation);
  }, [app.fullscreen, app.presentation]);
  return (
    <section className="moon" id="moon">
      <div className="mhd">
        {explore ? (
          <div className="ttl intro-h"><span className="k">SOUTH POLE · 75°S 이남</span><h1>달 남극 착륙 계획</h1><span>달에서 착륙지를 누르거나, 조건을 정하고 후보 순위를 받아 보세요.</span></div>
        ) : <div className="ttl"><b>{dim === '3d' ? '3D 달' : '2D 남극 지도'}</b><span>{dim === '3d' ? sub ?? '드래그 회전 · 휠 확대 · 클릭으로 지점 선택' : '75°S 이남 · 위쪽이 경도 0° · 클릭으로 지점 선택'}</span></div>}
        <LayerPickButton where="rail" />
        <button className="btn sm" title="지도 색 켜기·끄기 (C)" onClick={() => app.setMap({ colorOn: !app.colorOn })}>{app.colorOn ? '색 끄기' : '색 켜기'}</button>
        <button className="ibtn" aria-label="전체화면" title="전체화면 (F)" onClick={() => app.setFullscreen(!app.fullscreen)}>⤢</button>
      </div>
      {dim === '3d' ? (
        <MoonGlobe onSub={setSub} tools={dimSeg}><Hud />{explore ? <Intro /> : null}</MoonGlobe>
      ) : (
        <div className="view2d"><SouthMap where="site" onPick={(la, lo) => pickNear(la, lo)} /><div className="vtools">{dimSeg}</div>{explore ? <Intro /> : null}</div>
      )}
      <div className="mctl">
        <label>색 진하기 <input type="range" min={0.1} max={1} step={0.05} value={app.opacity} aria-label="색 진하기" onChange={(e) => app.setMap({ opacity: Number(e.target.value) })} /><output className="mono soft">{pct(app.opacity)}</output></label>
        <label title="1단계 필수 조건을 못 넘는 곳을 어떻게 보일지 (종합 점수 레이어에서만)">조건 안 맞는 곳{' '}
          <span className="seg">{([['dim', '흐리게'], ['hide', '숨기기'], ['show', '그대로']] as Array<[FailMode, string]>).map(([v, l]) => <button key={v} aria-pressed={app.failMode === v} onClick={() => app.setMap({ failMode: v })}>{l}</button>)}</span>
        </label>
      </div>
      <TimeBar />
    </section>
  );
}

interface Ev { t: number; k: string; icon: string }
/** 앞으로 30일 주요 변화 (1 h 표본) */
export function useEventList(): Ev[] {
  const rs = useResolvedSite();
  const ctx = useSiteCtx(rs);
  const t = useApp((s) => s.t);
  const margin = useApp((s) => s.margin_deg);
  const sim = useSim();
  const hour = Math.floor(t / HOUR_MS) * HOUR_MS;
  return useMemo(() => {
    if (!ctx) return [];
    const tl = timelineFor(ctx, siteKey(rs, margin), hour, 30 * 24, 1), out: Ev[] = [];
    for (let i = 1; i < tl.length; i++) {
      const a = tl[i - 1], b = tl[i];
      if (a.sun_frac < 0.5 && b.sun_frac >= 0.5) out.push({ t: b.t, k: '일출', icon: '☀' });
      if (a.sun_frac >= 0.5 && b.sun_frac < 0.5) out.push({ t: b.t, k: '일몰', icon: '☾' });
      if (!a.earth_visible && b.earth_visible) out.push({ t: b.t, k: '지구돋이 · 교신 시작', icon: '◉' });
      if (a.earth_visible && !b.earth_visible) out.push({ t: b.t, k: '지구몰 · 교신 끊김', icon: '○' });
      const wa = a.sun_frac >= 0.5 && a.earth_visible, wb = b.sun_frac >= 0.5 && b.earth_visible;
      if (!wa && wb) out.push({ t: b.t, k: '착륙 윈도 열림', icon: '▲' });
      if (wa && !wb) out.push({ t: b.t, k: '착륙 윈도 닫힘', icon: '▼' });
    }
    const st = sim?.sim.stop_t;
    const CAUSE = { sun_blocked: '일조 차단', earth_blocked: '지구 가림', over_consumption: '소비 과다' } as const;
    if (st && st > hour && st < hour + 30 * DAY_MS) out.push({ t: st, k: `경고: 배터리 하한 (${sim?.sim.stop_cause ? CAUSE[sim.sim.stop_cause] : ''})`, icon: '⚠' });
    return out.sort((x, y) => x.t - y.t).slice(0, 40);
  }, [ctx, rs, margin, hour, sim]);
}

function SkyTab() {
  const app = useApp();
  const rs = useResolvedSite();
  const ctx = useSiteCtx(rs);
  const ev = useEval();
  const nx = useNextEvents(ctx, app.t);
  const hour = Math.floor(app.t / (3 * HOUR_MS)) * 3 * HOUR_MS;
  const now = useMemo(() => (ctx ? skyState(ctx.frame, ctx.mask, ctx.eph, app.t, ctx.margin_deg) : null), [ctx, app.t]);
  const trackPano = useMemo(() => (ctx ? timelineFor(ctx, siteKey(rs, app.margin_deg), hour - 15 * DAY_MS, 30 * 24, 3) : null), [ctx, rs, app.margin_deg, hour]);
  const trackDome = useMemo(() => (ctx ? timelineFor(ctx, siteKey(rs, app.margin_deg), hour, 30 * 24, 3) : null), [ctx, rs, app.margin_deg, hour]);
  if (!rs || !ctx || !now) return <NoData what="착륙지" why="02에서 착륙지를 고르세요" />;
  const sm = ev?.summary;
  return (
    <>
      <div className="fk">
        <Kpi l="태양 고도" v={deg(now.sun.el_deg, 2)} s={`방위 ${deg(now.sun.az_deg)}`} />
        <Kpi l="태양 원반 노출률" v={pct(now.sun_frac)} s={now.sun_frac > 0.5 ? `일몰까지 ${dur(nx?.next_sunset != null ? nx.next_sunset - app.t : null)}` : `일출까지 ${dur(nx?.next_sunrise != null ? nx.next_sunrise - app.t : null)}`} tone={now.sun_frac > 0.5 ? 'good' : 'bad'} />
        <Kpi l="지구" v={now.earth_visible ? '보임' : '가림'} s={`고도 ${deg(now.earth.el_deg, 2)} · ${now.earth_visible ? `지구몰까지 ${dur(nx?.next_earthset != null ? nx.next_earthset - app.t : null)}` : `지구돋이까지 ${dur(nx?.next_earthrise != null ? nx.next_earthrise - app.t : null)}`}`} tone={now.earth_visible ? 'good' : 'bad'} />
        <Kpi l="조도 (수평면)" v={`${Math.round(now.irr_horizontal_w_m2)} W/m²`} s={`수직 추적 패널 ${Math.round(now.irr_vertical_w_m2)} W/m²`} />
        <Kpi l="임무 기간 일조율" v={pct(sm?.illum_frac)} s={`교신율 ${pct(sm?.comm_frac)}`} />
        <Kpi l="최장 연속 암흑" v={hrs(sm?.longest_dark_h)} s={`기간 평균 (수직 추적) ${Math.round(sm?.mean_irr_vertical_w_m2 ?? 0)} W/m²`} />
        <Kpi l="지구 위상" v={pct(now.earth_phase)} s={`태양 방향 지형 ${deg(now.horizon_sun_deg, 2)}`} />
      </div>
      <div className="chartlbl"><span>지평선 파노라마 · {utc(app.t)}</span><span className="legend"><span><i className="sw" style={{ background: 'var(--sun)' }} />태양</span><span><i className="sw" style={{ background: 'var(--earth)' }} />지구</span><span><i className="sw" style={{ background: '#55666a' }} />가려짐</span></span></div>
      <Pano h={150} mask={ctx.mask} layers={[{ track: trackPano }]} now={now} />
      <div className="g2" style={{ gap: 10, alignItems: 'start' }}>
        <div><div className="chartlbl"><span>하늘 돔 · 30일</span></div><Dome h={170} mask={ctx.mask} track={trackDome} now={now} /></div>
        <div className="col" style={{ gap: 6 }}>
          <div className="wrow" style={{ gridTemplateColumns: '1fr 46px', padding: 0 }}>
            <label className="small">통신 여유각</label><output className="mono">{app.margin_deg}°</output>
            <input type="range" min={0} max={10} step={0.5} value={app.margin_deg} onChange={(e) => app.setMargin(Number(e.target.value))} style={{ gridColumn: '1/-1' }} />
          </div>
          <p className="help">돔 가운데가 머리 위, 바깥 원이 지평선입니다. 남극에서는 태양이 지평선 근처를 한 바퀴 돕니다.</p>
        </div>
      </div>
    </>
  );
}

function AlertsTab({ evs }: { evs: Ev[] }) {
  const setT = useApp((s) => s.setT);
  if (!evs.length) return <Empty>변화 없음</Empty>;
  return (
    <>
      <p className="help">앞으로 30일 동안의 주요 변화. 누르면 그 시각으로 이동합니다.</p>
      {evs.map((e, i) => <div key={i} className="ev" onClick={() => setT(e.t)}><span className="w">{utc(e.t)}</span><span>{e.icon} {e.k}</span></div>)}
    </>
  );
}

const Q: Record<string, string> = { VALIDATED: '검증됨', LIMITED_USE: '제한 사용', REVIEW_REQUIRED: '검토 필요', REFERENCE_ONLY: '참고용', NO_DATA: '자료 없음', VALIDATION_FAILED: '검증 실패' };
const KIND: Record<string, [string, string]> = { real: ['실제', 'ok'], approx: ['근사', 'approx'], assumed: ['가정', 'approx'], missing: ['자료 없음', 'warn'] };

function SourcesTab() {
  const sources = useData((d) => d.sources);
  const quality = useData((d) => d.quality);
  if (!sources.length) return <NoData what="sources.json" />;
  const q = (s: (typeof sources)[number]) => {
    if (s.quality) return Q[s.quality] ?? s.quality;
    const qs = (s.drive_paths ?? []).map((p) => quality[p]?.quality).filter(Boolean) as string[];
    return qs.length ? Q[qs[0]] ?? qs[0] : s.kind === 'approx' ? '근사값' : s.kind === 'assumed' ? '가정값' : '—';
  };
  return (
    <>
      <table>
        <thead><tr><th>자료</th><th>종류</th><th>해상도</th><th>품질</th></tr></thead>
        <tbody>
          {sources.map((s) => (
            <tr key={s.key}>
              <td className="wrap" style={{ minWidth: 140 }}>{s.url ? <a href={s.url} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>{s.name}</a> : s.name}</td>
              <td><span className={`badge ${KIND[s.kind]?.[1] ?? ''}`}>{KIND[s.kind]?.[0] ?? s.kind}</span></td>
              <td className="mono small">{s.resolution ?? '—'}</td>
              <td className="small">{q(s)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="help">지도 레이어마다 출처와 해상도는 레이어 고르기 창에도 적혀 있습니다.</p>
    </>
  );
}

function FieldView() {
  const rs = useResolvedSite();
  const [tab, setTab] = useState<'sky' | 'alerts' | 'src'>('sky');
  const evs = useEventList();
  const vint = useArtemisVintage();
  return (
    <section className="fv" aria-label="현장 뷰">
      <div className="fvh"><b>{rs ? rs.site.name : '현장 뷰'}</b>{rs ? <span>{rs.site.lat_deg.toFixed(3)}°, {rs.site.lon_deg.toFixed(3)}° · <TerrBadge k={rs.terrain} /> <ArtemisBadge v={vint.get(rs.site.id)} /></span> : null}</div>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'sky'} onClick={() => setTab('sky')}>하늘</button>
        <button role="tab" aria-selected={tab === 'alerts'} onClick={() => setTab('alerts')}>알림 <span className="mono" style={{ color: 'var(--accent)' }}>{evs.length || ''}</span></button>
        <button role="tab" aria-selected={tab === 'src'} onClick={() => setTab('src')}>데이터 출처</button>
      </div>
      <div className="fvb">
        {tab === 'sky' && <SkyTab />}
        {tab === 'alerts' && (rs ? <AlertsTab evs={evs} /> : <NoData what="착륙지" why="02에서 착륙지를 고르세요" />)}
        {tab === 'src' && <SourcesTab />}
      </div>
    </section>
  );
}

export function Rail() {
  return (
    <aside className="rail">
      <MoonSection />
      <FieldView />
    </aside>
  );
}
