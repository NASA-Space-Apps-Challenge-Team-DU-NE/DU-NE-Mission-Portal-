// 09 검증 (P1-39): ① 천체력 ② 장기 일조율(PGDA69·WAC) ③ 과거 미션 재현 + 지평선 마스크·PA→ME. 값은 파이프라인 s80 결과.
import { useEffect, useMemo, useState } from 'react';
import { loadValidation } from '../adapters/data';
import { Card, Help, NoData, deg, utc } from '../components/kit';
import { Scatter } from '../components/viz';
import { LayerCheck, MissionFieldCheck, SiteCoordCheck, SpiceEphCheck } from '../components/ValidExtra';
import { DATA_BASE, DEFAULTS } from '../config';
import { flatMask } from '../core/horizon';
import { siteContext } from '../core/scenario';
import { skyState } from '../core/sky';
import type { Envelope, ValidationResult } from '../core/types';
import { useData } from '../state/data';
import { ephTableLabel } from '../strings';

type Name = 'ephemeris' | 'masks' | 'illumination' | 'frames' | 'mast' | 'wueller';
const n4 = (v: number | null | undefined, u = '') => (v == null || !Number.isFinite(v) ? '—' : `${Math.abs(v) < 0.01 && v !== 0 ? v.toExponential(1) : v.toFixed(4)}${u}`);
function label(r: ValidationResult): [string, string] {
  const m = r.metric, c = r.conditions as Record<string, unknown>;
  let x: RegExpMatchArray | null;
  if ((x = m.match(/^ephemeris_(horizons|spice)_(.+)_(sun|earth)$/))) return [`${x[3] === 'sun' ? '태양' : '지구'} 방향 각거리 · ${x[2]}`, `${x[1] === 'horizons' ? 'JPL Horizons' : 'SPICE'} 기준 표 · ${r.n}개 시각`];
  if ((x = m.match(/^mask_(.+)$/))) return [x[1], `Drive 지평선 마스크와 방위별 차이 · ${String(c.drive_quality ?? '')}`];
  if (m === 'illum_vs_illum_avg') return ['우리 계산 vs PGDA69 장기 평균 일조율', '75–90°S · 5 km 격자'];
  if (m === 'illum_vs_wac_ill_pct') return ['우리 계산 vs WAC 조명률', '88–90°S'];
  if (m === 'illum_vs_wac_ill_twi') return ['우리 계산 vs WAC 시간가중 조명률', '88–90°S · 관측 공백 보간판'];
  if ((x = m.match(/^ephemeris_horizons_(im\d)_(sun|earth)$/))) return [`${x[2] === 'sun' ? '태양' : '지구'} 방향 각거리 · ${x[1].toUpperCase()} 착륙지`, `JPL Horizons API 표 (겉보기) · ${r.n}개 시각`];
  if ((x = m.match(/^mast_jpl_b1_(sun|earth)_(any|half|whole)_disk$/))) return [`${x[1] === 'sun' ? '태양' : '지구'} 가시 비율 · ${x[2] === 'any' ? '일부라도' : x[2] === 'half' ? '절반 이상' : '원반 전체'}`, `높이 ${r.n}단계 · B1 좌표 축 규약 미확인 (DEM ${String(c.dem_ground_m ?? '')} m, 문서 ${String(c.published_elevation_m ?? '')} m) · 같은 점 PGDA69 ${typeof c.pgda69_illum_at_point === 'number' ? (c.pgda69_illum_at_point * 100).toFixed(0) + '%' : '—'}`];
  if ((x = m.match(/^wueller_(sun|sun_earth)_max_consecutive_days$/))) return [x[1] === 'sun' ? '최장 연속 일조 (일)' : '최장 연속 일조+교신 (일)', `후보점 ${String(c.points ?? '')}개 × 8년 · 순위 상관 ${typeof c.spearman_all === 'number' ? c.spearman_all.toFixed(2) : '—'} · 한여름 기간 가정`];
  if (m === 'frame_pa_to_me') return ['PA→ME 자체 변환 vs SpiceyPy', `최대 = 행렬 성분 차이 · 회전량 ${n4(c.rotation_deg as number, '°')} (표면 ${Number(c.surface_shift_m ?? NaN).toFixed(0)} m) · 방향 일치 ${c.direction_ok === false ? '아니오' : c.direction_ok === true ? '예' : '—'} · 현재 천체력은 SPICE MOON_ME 를 직접 써 이 행렬을 쓰지 않음`];
  return [m, Object.entries(c).slice(0, 3).map(([k, v]) => `${k}: ${typeof v === 'number' ? v.toFixed(4) : String(v).slice(0, 40)}`).join(' · ')];
}

/** 천체력 줄의 "최대"는 방향 각거리(conditions.angsep_max_deg). max_abs 는 고도 차이라 따로 보인다.
 *  PA→ME 줄은 회전량이 아니라 SpiceyPy 대비 오차(max_abs_vs_spiceypy)와 파이프라인 판정을 보인다. */
function maxOf(r: ValidationResult): number {
  const c = r.conditions as Record<string, unknown>;
  if (r.metric.startsWith('ephemeris_') && typeof c.angsep_max_deg === 'number') return c.angsep_max_deg;
  if (r.metric === 'frame_pa_to_me' && typeof c.max_abs_vs_spiceypy === 'number') return c.max_abs_vs_spiceypy;
  return r.max_abs;
}

// 천체력 줄은 화면의 허용 오차로 각거리를 판정한다. PA→ME 는 파이프라인 판정(방향 일치 포함)을 그대로 보인다.
function VT({ rows, unit = '', tol, eph = false, frames = false }: { rows: ValidationResult[]; unit?: string; tol?: number | null; eph?: boolean; frames?: boolean }) {
  return (
    <div className="tblwrap"><table>
      <thead><tr><th>항목</th><th>표본</th><th>평균 차이</th><th>RMSE</th><th>상관계수</th><th>{eph ? '최대 각거리' : '최대'}</th>{eph ? <th>최대 고도 차이</th> : null}<th>판정</th></tr></thead>
      <tbody>{rows.map((r) => { const [a, b] = label(r); const mx = maxOf(r); return (
        <tr key={r.metric}><td className="wrap">{a}<div className="tiny muted">{b}</div></td><td className="mono">{r.n.toLocaleString()}</td><td className="mono">{n4(r.mean_diff, unit)}</td><td className="mono">{n4(r.rmse, unit)}</td><td className="mono">{r.r == null ? '—' : r.r.toFixed(3)}</td><td className="mono">{n4(mx, unit)}</td>{eph ? <td className="mono">{n4(r.max_abs, unit)}</td> : null}
          <td>{frames ? (r.pass ? <span className="badge ok">✓</span> : <span className="badge warn" title="자체 변환 행렬의 방향 규약이 SPICE 와 다르다">✗ 실패</span>) : tol == null ? <span className="muted">—</span> : mx <= tol ? <span className="badge ok">✓</span> : <span className="badge warn">✗</span>}</td></tr>
      ); })}</tbody>
    </table></div>
  );
}

export default function Valid() {
  const [v, setV] = useState<Partial<Record<Name, Envelope<ValidationResult[]> | 'missing'>>>({});
  const grid = useData((d) => d.grid);
  const layers = useData((d) => d.layers);
  const missions = useData((d) => d.missions.items);
  const missionEph = useData((d) => d.missionEph);
  const ensureEph = useData((d) => d.ensureMissionEph);
  const eph = useData((d) => d.eph);
  const ephSource = useData((d) => d.ephMeta?.source);
  // 과거 미션 재현은 미션별 천체력 표로 계산한다 (페이지를 바로 열어도 근사 천체력으로 떨어지지 않게)
  useEffect(() => { missions.forEach((m) => { void ensureEph(m); }); }, [missions, ensureEph]);
  const [ours, setOurs] = useState<Float32Array | null>(null);
  useEffect(() => {
    let alive = true;
    (['ephemeris', 'masks', 'illumination', 'frames', 'mast', 'wueller'] as Name[]).forEach((n) => loadValidation(n).then((r) => { if (alive) setV((p) => ({ ...p, [n]: r.status === 'ok' ? r.value : 'missing' })); }));
    fetch(`${DATA_BASE}validation/illum_ours.f32`).then((r) => (r.ok && !(r.headers.get('content-type') ?? '').includes('html') ? r.arrayBuffer() : null)).then((b) => { if (alive && b && b.byteLength % 4 === 0) setOurs(new Float32Array(b)); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);
  const pts = useMemo<Array<[number, number]> | null>(() => {
    if (!ours || !layers.illum_avg || !grid || ours.length !== grid.cells.length) return null;
    const p: Array<[number, number]> = [];
    for (let i = 0; i < ours.length; i += 3) p.push([layers.illum_avg[i], ours[i]]);
    return p;
  }, [ours, layers, grid]);
  const mrows = useMemo(() => missions.map((m) => {
    const tt = Date.parse(m.landing_utc);
    const c = siteContext({ id: m.id, name: m.name, category: 'other', lat_deg: m.lat_deg, lon_deg: m.lon_deg, terrain: 'flat', source_keys: [], verified: m.verified }, flatMask(m.id, m.lat_deg, m.lon_deg, 2), eph, 0);
    return { m, s: skyState(c.frame, c.mask, c.eph, tt, 0) };
  }), [missions, eph, missionEph]);
  const [tol, setTol] = useState<number | null>(DEFAULTS.ephemeris_tolerance_deg);
  const block = (n: Name, unit = '') => {
    const x = v[n];
    if (x === undefined) return <div style={{ padding: 12 }} className="muted small">불러오는 중…</div>;
    if (x === 'missing' || x.data.length === 0) return <div style={{ padding: 12 }}><NoData what={`validation/${n}.json`} /></div>;
    return <>
      {x.quality === 'REFERENCE_ONLY' ? <div className="note" style={{ padding: 12 }}><b>과거 참고 자료 · 재검증 아님</b><div>{x.notes.join(' · ')}</div></div> : null}
      <VT rows={x.data} unit={unit} tol={n === 'ephemeris' && x.quality !== 'REFERENCE_ONLY' ? tol : undefined} eph={n === 'ephemeris'} frames={n === 'frames' && x.quality !== 'REFERENCE_ONLY'} />
    </>;
  };
  return (
    <>
      <div className="nodata" style={{ borderStyle: 'solid' }}>허용 오차는 팀이 정할 값이라 임시값 {DEFAULTS.ephemeris_tolerance_deg}°로 두었습니다. 천체력 줄은 아래 허용 오차로 최대 차이를 ✓·✗ 판정하고, 그 밖의 줄은 오차만 보여 줍니다.
        <div style={{ marginTop: 8 }}><label className="small">천체력 허용 오차 (°) <input className="field num" type="number" min={0.001} max={5} step={0.01} value={tol ?? ''} style={{ width: 90 }} onChange={(e) => setTol(e.target.value === '' ? null : Number(e.target.value))} /></label></div></div>
      <Card title="① 천체력 (Horizons·SPICE 기준 표)" np>{block('ephemeris', '°')}</Card>
      <Card title="② 장기 일조율 (PGDA69·WAC 실측)" np>
        {block('illumination')}
        <div style={{ padding: '10px 14px' }}>
          {pts ? <Scatter h={240} pts={pts} xl="PGDA69 장기 평균 일조율" yl="우리 계산" diag /> : <NoData what="validation/illum_ours.f32" />}
          <Help>가로: PGDA69 장기 평균 일조율 · 세로: 우리 계산. 대각선에 가까울수록 일치. 기간·관측 높이·해상도가 달라 완전히 같을 수는 없습니다.</Help>
        </div>
      </Card>
      <Card title="③ 과거 미션 재현" np>
        {mrows.length === 0 ? <div style={{ padding: 12 }}><NoData what="catalog/missions.json" /></div> : (
          <div className="tblwrap"><table>
            <thead><tr><th>미션</th><th>착륙 (UTC)</th><th>태양 고도</th><th>지구 고도</th><th>천체력</th></tr></thead>
            <tbody>{mrows.map(({ m, s }) => (
              <tr key={m.id}><td>{m.name}</td><td className="mono small">{utc(Date.parse(m.landing_utc))}</td><td className="mono">{deg(s.sun.el_deg, 2)}</td><td className="mono">{deg(s.earth.el_deg, 2)}</td>
                <td>{s.source === 'table' ? <span className="badge ok">{ephTableLabel(ephSource)}</span> : <span className="badge approx">근사 천체력</span>}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>
      <SpiceEphCheck />
      <SiteCoordCheck />
      <MissionFieldCheck />
      <LayerCheck />
      <div className="g2">
        <Card title="지평선 마스크 (Drive 대조)" np>{block('masks', '°')}</Card>
        <Card title="PA → ME 변환" np>{block('frames')}</Card>
      </div>
      <div className="g2">
        <Card title="마스트 높이 (JPL IPN 42-176C 지점 B1)" sub="높이별 태양·지구 가시 비율 (%), 2009–2028" np>{block('mast', '%p')}</Card>
        <Card title="한여름 최장 연속 일조 (Wueller 외 2026, 후보점 130개)" sub="한여름 기간 정의가 원 자료에 없어 가정을 둔 비교 — 순위 상관을 보세요" np>{block('wueller', '일')}</Card>
      </div>
    </>
  );
}
