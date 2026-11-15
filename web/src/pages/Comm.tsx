// 05 임무 시뮬레이션 아래 · 통신: 지구 교신 판정(P1-35), 통신 여유각(P1-16, 값은 01에서), 지상국 통신 창(P1-36, 가정 지상국 포함)
import { useMemo } from 'react';
import { EarthGlobe } from '../components/EarthGlobe';
import { Card, Help, Kpi, NoData, deg, dur, hrs, pct, utc, Empty } from '../components/kit';
import { BandChart, LineChart } from '../components/viz';
import { stationSees, stationWindows } from '../core/stations';
import { longestRun } from '../core/timeline';
import type { Station } from '../core/types';
import { useData } from '../state/data';
import { siteKey, timelineFor, useLander } from '../state/derived';
import { useNextEvents, useResolvedSite, useSiteCtx } from '../state/hooks';
import { useApp } from '../state/store';

type St = Station & { custom?: boolean; short?: string };
const NAME_KO: Record<string, string> = { goldstone: '골드스톤', madrid: '마드리드', canberra: '캔버라', yeoju: '여주 심우주 안테나' };

function spans(times: number[], flags: ArrayLike<number | boolean>) {
  const out: Array<{ start: number; end: number; h: number }> = [];
  let s = -1;
  for (let i = 0; i <= times.length; i++) {
    const on = i < times.length && !!flags[i];
    if (on && s < 0) s = i;
    if (!on && s >= 0) { out.push({ start: times[s], end: times[i - 1], h: i - s }); s = -1; }
  }
  return out;
}

export default function Comm() {
  const app = useApp();
  const rs = useResolvedSite();
  const ctx = useSiteCtx(rs);
  const cat = useData((d) => d.stations.items);
  const L = useLander();
  const nx = useNextEvents(ctx, app.t);
  const all: St[] = useMemo(() => [
    ...cat.map((s) => ({ ...s, short: NAME_KO[s.id]?.slice(0, 4) ?? s.name.slice(0, 6) })),
    ...app.customStations.map((s, i) => ({ ...s, custom: true, short: `가정${i + 1}` })),
  ], [cat, app.customStations]);
  const tl = useMemo(() => (ctx ? timelineFor(ctx, siteKey(rs, app.margin_deg), app.landing, 720, 1) : null), [ctx, rs, app.margin_deg, app.landing]);
  const times = useMemo(() => tl?.map((s) => s.t) ?? [], [tl]);
  const sw = useMemo(() => (tl && all.length ? stationWindows(all, times, tl.map((s) => s.earth_visible), 1) : null), [tl, all, times]);
  if (!rs || !ctx || !tl) return <NoData what="통신" why="02에서 착륙지를 먼저 고르세요" />;

  const vis = tl.map((s) => (s.earth_visible ? 1 : 0));
  const commFrac = vis.reduce((a: number, b) => a + b, 0) / vis.length;
  const link = sw?.link ?? vis, linkFrac = sw ? sw.link_frac : commFrac;
  const gap = longestRun(Array.from(link, (v) => !v), 1);
  const daily = sw ? sw.daily_link_h_min : 0;
  const wins = spans(times, link);
  const mbDay = L ? (L.rate_kbps * 3600 * linkFrac * 24) / 8000 : null;
  const iNow = Math.round((app.t - app.landing) / 3_600_000);
  const now = tl[Math.max(0, Math.min(tl.length - 1, iNow))];
  return (
    <>
      <Card title="지구 교신" sub={`${rs.site.name} · ${utc(app.landing)} + 30일`}>
        <div className="row"><Help>지구 중심이 그 방향 지형선 + 통신 여유각(<b>{app.margin_deg}°</b>)보다 높으면 "교신 가능"으로 칩니다.</Help><button className="btn sm ghost" onClick={() => app.setPage('cond')}>01 조건 정하기에서 여유각 바꾸기</button></div>
        <div className="kpis">
          <Kpi l="지금 · 지구 고도" v={deg(now.earth.el_deg, 2)} s={`필요: 지형 + 여유각 ${deg(now.horizon_earth_deg + app.margin_deg, 2)}`} tone={now.earth_visible ? 'good' : 'bad'} />
          <Kpi l="다음 변화" v={now.earth_visible ? dur(nx?.next_earthset != null ? nx.next_earthset - app.t : null) : dur(nx?.next_earthrise != null ? nx.next_earthrise - app.t : null)} s={now.earth_visible ? '지구몰까지' : '지구돋이까지'} />
          <Kpi l="임무 기간 교신율" v={pct(commFrac)} s="지구 보임 기준" />
          <Kpi l="교신 가능 (지구 보임 ∩ 지상국)" v={pct(linkFrac)} />
          <Kpi l="하루 최소 교신" v={hrs(daily)} s={`기준 ≥ ${app.req.min_daily_comm_h} h`} tone={daily >= app.req.min_daily_comm_h ? 'good' : 'bad'} />
          <Kpi l="최장 교신 끊김" v={hrs(gap)} />
          <Kpi l="예상 전송량" v={mbDay == null ? '—' : `${Math.round(mbDay).toLocaleString()} MB/일`} s={L ? `${L.name.split(' (')[0]} · ${L.rate_kbps} kbps` : ''} />
        </div>
        <div className="chartlbl"><span>지구 고도와 그 방향 지형 지평선 (30일)</span><span className="legend"><span><i className="sw" style={{ background: 'var(--earth)', height: 2 }} />지구 고도</span><span><i className="sw" style={{ background: 'var(--muted)', height: 2 }} />지형 + 여유각</span></span></div>
        <LineChart h={150} pick times={times} series={[{ values: tl.map((p) => p.earth.el_deg), color: '--earth' }, { values: tl.map((p) => p.horizon_earth_deg + app.margin_deg), color: '--muted', dash: true }]} unit="°" />
        <BandChart h={60} pick times={times} rows={[{ label: '지구 보임', values: vis, color: '--earth' }, { label: '교신 가능', values: Array.from(link, Number), color: '--accent' }]} />
        <p className="note">예상 전송량 = 착륙선 프리셋 전송 속도 × 교신 가능 시간 (근사)</p>
      </Card>
      <Card title="지상국 통신 창" sub="지구가 보이는 시간 ∩ 지상국에서 달이 보이는 시간" tag={<><span className="badge approx">근사값</span>{app.customStations.length ? <span className="badge">가정 {app.customStations.length}곳</span> : null}</>}>
        <div className="gEG">
          <div className="col">
            <EarthGlobe stations={all} />
            <p className="note">새로 생기거나 자료가 없는 지상국은 지구를 클릭해 위치를 정하면, 그 자리에 지상국이 있다고 가정하고 계산합니다. 최소 고도각은 표에서 바꿀 수 있습니다 (기본 10°, 임시값).</p>
          </div>
          <div className="col">
            {sw ? (
              <div className="tblwrap"><table>
                <thead><tr><th>지상국</th><th>지금 달 고도</th><th>하루 평균 가시</th><th>다음 가시 시작</th><th>최소 고도각</th><th /></tr></thead>
                <tbody>{all.map((st) => {
                  const ss = stationSees(st, app.t), arr = sw.per_station[st.id];
                  const nxt = times.find((tt, i) => tt > app.t && arr[i] && !arr[i - 1]);
                  return (
                    <tr key={st.id}>
                      <td className="wrap" style={{ minWidth: 150 }}>{NAME_KO[st.id] ?? st.name} <span className="tiny muted">{st.custom ? '가정' : st.network}</span>{st.custom ? <> <span className="badge approx">가정</span></> : st.verified ? null : <> <span className="badge warn">미검증</span></>}
                        <div className="tiny muted">{st.custom ? `${st.lat_deg.toFixed(2)}°, ${st.lon_deg.toFixed(2)}° · 지형 마스크 없음` : st.antennas[0]?.horizon_mask ? `안테나 지평선 마스크 ${st.antennas[0].id}` : '안테나 마스크 자료 없음'}</div></td>
                      <td><span className={`badge ${ss.visible ? 'ok' : ''}`}>{deg(ss.el_deg)}</span></td>
                      <td className="mono">{((Array.from(arr).reduce((a: number, b) => a + b, 0) / arr.length) * 24).toFixed(1)} h</td>
                      <td className="mono small">{nxt ? utc(nxt) : '—'}</td>
                      <td>{st.custom ? <><input className="field num" type="number" min={0} max={45} step={1} value={st.min_elev_deg} style={{ width: 64 }} onChange={(e) => app.setStationMin(st.id, Math.max(0, Math.min(45, Number(e.target.value) || 0)))} />°</> : <span className="mono">{deg(ss.threshold_deg, 0)}</span>}</td>
                      <td>{st.custom ? <button className="btn sm" aria-label="삭제" onClick={() => app.removeStation(st.id)}>×</button> : null}</td>
                    </tr>
                  );
                })}</tbody>
              </table></div>
            ) : <NoData what="catalog/stations.json" />}
            {sw ? <BandChart h={30 + all.length * 22} pick times={sw.times} rows={all.map((st) => ({ label: st.short ?? st.name, values: sw.per_station[st.id], color: st.custom ? '--amber' : '#3E6E78' }))} /> : null}
            <p className="note">지상국 쪽 달 위치는 근사 계산 (굴절 없음). 최소 고도각은 임시값. 여주는 출처 있는 안테나 좌표가 없어 목록에서 빠질 수 있습니다.</p>
          </div>
        </div>
      </Card>
      <div>
        <Card title={<>교신 가능 구간 <small>{wins.length}개</small></>} np={!!wins.length}>
          {wins.length ? (
            <div style={{ maxHeight: 300, overflow: 'auto' }}><table>
              <thead><tr><th>시작 (UTC)</th><th>끝 (UTC)</th><th>길이</th></tr></thead>
              <tbody>{wins.map((w, i) => <tr key={i} className="click" onClick={() => app.setT(w.start)}><td className="mono small">{utc(w.start)}</td><td className="mono small">{utc(w.end)}</td><td className="mono">{w.h} h</td></tr>)}</tbody>
            </table></div>
          ) : <Empty>—</Empty>}
        </Card>
      </div>
    </>
  );
}
