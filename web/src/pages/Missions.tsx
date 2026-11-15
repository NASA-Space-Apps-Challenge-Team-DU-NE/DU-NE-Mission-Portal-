// 08 과거 미션: 재현(P1-25), 참고 사례(P1-26), 이 미션처럼 맞추기(P1-27). 결과 라벨·원인을 항상 함께 보여 준다.
import { useEffect, useMemo, useState } from 'react';
import { Card, Help, NoData, OutBadge, deg, hrs, toast, utc } from '../components/kit';
import { DEFAULTS } from '../config';
import { flatMask } from '../core/horizon';
import { siteContext } from '../core/scenario';
import { featuresAt, matchTemplate, similarMissions, type MissionFeatures } from '../core/similarity';
import type { Mission } from '../core/types';
import { useData } from '../state/data';
import { useResolvedSite, useSiteCtx } from '../state/hooks';
import { makeScenario } from '../state/scenario';
import { useApp } from '../state/store';

const missionSite = (m: Mission) => ({ id: m.id, name: m.name, category: 'other' as const, lat_deg: m.lat_deg, lon_deg: m.lon_deg, terrain: 'flat' as const, source_keys: m.source_keys, verified: m.verified });
const PART: Record<string, string> = { abs_lat: '위도', sun_el: '태양', earth_el: '지구', since_sunrise_h: '일출후', duration_h: '기간', tags: '태그' };
const CAUSE_KO: Array<[RegExp, string]> = [[/navigation|항법|altitude|고도/i, '항법'], [/propulsion|engine|추진|엔진/i, '추진'], [/attitude|tip|tilt|자세|기울/i, '착지 자세'], [/power|전력/i, '전력'], [/comm|통신/i, '통신']];
const causeOf = (m: Mission) => (m.outcome === 'success' ? '' : (CAUSE_KO.find(([r]) => r.test(m.outcome_reason))?.[1] ?? '기타'));
// 조명 관련: 카탈로그에 lighting_related 필드가 없어 결과 설명에서 발전·일몰 언급으로 판단 (근사)
const lightRel = (m: Mission) => /발전|일몰|전력|태양전지|power|sunset/i.test(m.outcome_reason);

export default function Missions() {
  const app = useApp();
  const missions = useData((d) => d.missions);
  const eph = useData((d) => d.eph);
  const ensureEph = useData((d) => d.ensureMissionEph);
  const missionEph = useData((d) => d.missionEph);
  const rs = useResolvedSite();
  const ctx = useSiteCtx(rs);
  const [, bump] = useState(0);
  useEffect(() => { Promise.all(missions.items.map((m) => ensureEph(m))).then(() => bump((x) => x + 1)); }, [missions.items, ensureEph]);

  const feats = useMemo(() => missions.items.map((m) => {
    const c = siteContext(missionSite(m), flatMask(m.id, m.lat_deg, m.lon_deg, DEFAULTS.observer_height_m), eph, app.margin_deg);
    return { m, f: featuresAt(c, m.lat_deg, Date.parse(m.landing_utc), m.duration_h, { power: m.power, comm: m.comm, approach: m.approach }) };
  }), [missions.items, eph, app.margin_deg, missionEph]);
  const mine: MissionFeatures | null = useMemo(() => (ctx && rs ? featuresAt(ctx, rs.site.lat_deg, app.landing, app.duration_h, { power: 'solar', comm: 'dte', approach: 'lunar_orbit' }) : null), [ctx, rs, app.landing, app.duration_h]);
  const refs = useMemo(() => (mine ? similarMissions(mine, feats.map((x) => ({ mission: x.m, f: x.f })), 3) : []), [mine, feats]);
  const [match, setMatch] = useState<Record<string, number | null>>({});

  const replay = (m: Mission) => {
    const tt = Date.parse(m.landing_utc);
    app.setSite(m.site_id ? { kind: 'catalog', id: m.site_id } : { kind: 'custom', lat: m.lat_deg, lon: m.lon_deg });
    app.setLanding(tt); app.setT(tt);
    if (m.duration_h) app.setDuration(Math.min(1440, Math.max(24, Math.round(m.duration_h / 24) * 24)));
    toast(`${m.name} 착륙 시각으로 재현합니다`);
  };
  return (
    <>
      <Card title="과거 미션" np sub="재현을 누르면 착륙지·시각이 그 미션으로 바뀝니다 (계산 검증도 겸함)">
        {missions.items.length === 0 ? <NoData what="catalog/missions.json" why={missions.reason} /> : (
          <div className="tblwrap"><table>
            <thead><tr><th>미션</th><th>결과 · 원인</th><th>착륙 (UTC)</th><th>위도, 경도</th><th>태양 고도</th><th>일출 후 경과</th><th /></tr></thead>
            <tbody>{feats.map(({ m, f }) => {
              const tab = missionEph[m.id] && missionEph[m.id] !== 'missing';
              return (
                <tr key={m.id}>
                  <td><b>{m.name}</b><div>{tab ? <span className="badge ok">Horizons 표</span> : <span className="badge approx">근사 천체력</span>}{m.verified ? null : <> <span className="badge warn">미검증</span></>}</div></td>
                  <td className="wrap"><OutBadge o={m.outcome} />{causeOf(m) ? <> <span className="badge">{causeOf(m)}</span></> : null}{lightRel(m) ? <> <span className="badge approx">조명 관련</span></> : null}<div className="small muted" style={{ marginTop: 3 }}>{m.outcome_reason || '—'}</div></td>
                  <td className="mono small">{utc(Date.parse(m.landing_utc))}</td>
                  <td className="mono small">{m.lat_deg.toFixed(3)}, {m.lon_deg.toFixed(3)}</td>
                  <td className="mono">{deg(f.sun_el)}</td>
                  <td className="mono">{f.since_sunrise_h == null ? '—' : hrs(f.since_sunrise_h)}</td>
                  <td><button className="btn sm pri" onClick={() => replay(m)}>그때 하늘 재현</button></td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
      </Card>
      <Card title="참고 사례" sub={rs ? `${rs.site.name} · ${utc(app.landing)}` : ''}>
        {!mine ? <NoData what="착륙지" /> : (
          <>
            <Help>내 계획과 착륙 조건(위도, 태양·지구 고도, 일출 후 경과, 임무 기간)이 비슷한 과거 미션 3개. <b>비슷하다고 성공 가능성이 높아지는 것은 아닙니다.</b></Help>
            <table><tbody>{refs.map((r) => (
              <tr key={r.mission.id}>
                <td className="wrap"><b>{r.mission.name}</b> <OutBadge o={r.mission.outcome} />{causeOf(r.mission) ? <> <span className="badge">{causeOf(r.mission)}</span></> : null}<div className="small muted">{r.mission.outcome_reason || '—'}</div></td>
                <td className="small mono muted wrap" style={{ minWidth: 150 }}>{Object.entries(r.parts).map(([k, v]) => `${PART[k] ?? k} ${(v as number).toFixed(2)}`).join(' · ')}</td>
                <td>
                  <button className="btn sm" onClick={() => {
                    const f = feats.find((x) => x.m.id === r.mission.id)?.f;
                    const tt = ctx && f?.since_sunrise_h != null ? matchTemplate(ctx, f.since_sunrise_h, app.landing, 30) : null;
                    setMatch((mm) => ({ ...mm, [r.mission.id]: tt }));
                    if (tt && rs) { app.addScenario(makeScenario(rs.site, tt, app.duration_h, 'template', `${rs.site.name.slice(0, 10)} ≈ ${r.mission.name}`)); toast('비교에 추가했습니다 (07 후보 비교)'); }
                  }}>이 미션처럼 맞추기</button>
                  {r.mission.id in match ? <div className="small mono" style={{ marginTop: 4 }}>{match[r.mission.id] ? `→ ${utc(match[r.mission.id]!)} (비교에 추가됨)` : '±30일 안에 맞는 시각이 없음'}</div> : null}
                </td>
              </tr>
            ))}</tbody></table>
            <Help><b>이 미션처럼 맞추기</b>: 그 미션이 착륙했을 때와 같은 "일출 후 경과 시간"이 되는 날짜를 내 착륙지에서 찾아 비교에 추가합니다.</Help>
          </>
        )}
      </Card>
    </>
  );
}
