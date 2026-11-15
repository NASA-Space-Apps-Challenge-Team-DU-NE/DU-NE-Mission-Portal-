// 09 검증 (P1-39): ① 천체력 ② 장기 일조율(PGDA69·WAC) ③ 과거 미션 재현 + 지평선 마스크·PA→ME. 값은 파이프라인 s80 결과.
import { useEffect, useMemo, useState } from 'react';
import { loadValidation } from '../adapters/data';
import { Card, Help, NoData, deg, utc } from '../components/kit';
import { Scatter } from '../components/viz';
import { DATA_BASE, DEFAULTS } from '../config';
import { flatMask } from '../core/horizon';
import { siteContext } from '../core/scenario';
import { skyState } from '../core/sky';
import type { ValidationResult } from '../core/types';
import { useData } from '../state/data';

type Name = 'ephemeris' | 'masks' | 'illumination' | 'frames';
const n4 = (v: number | null | undefined, u = '') => (v == null || !Number.isFinite(v) ? '—' : `${Math.abs(v) < 0.01 && v !== 0 ? v.toExponential(1) : v.toFixed(4)}${u}`);
function label(r: ValidationResult): [string, string] {
  const m = r.metric, c = r.conditions as Record<string, unknown>;
  let x: RegExpMatchArray | null;
  if ((x = m.match(/^ephemeris_(horizons|spice)_(.+)_(sun|earth)$/))) return [`${x[3] === 'sun' ? '태양' : '지구'} 방향 각거리 · ${x[2]}`, `${x[1] === 'horizons' ? 'JPL Horizons' : 'SPICE'} 기준 표 · ${r.n}개 시각`];
  if ((x = m.match(/^mask_(.+)$/))) return [x[1], `Drive 지평선 마스크와 방위별 차이 · ${String(c.drive_quality ?? '')}`];
  if (m === 'illum_vs_illum_avg') return ['우리 계산 vs PGDA69 장기 평균 일조율', '75–90°S · 5 km 격자'];
  if (m === 'illum_vs_wac_ill_pct') return ['우리 계산 vs WAC 조명률', '88–90°S'];
  return [m, Object.entries(c).slice(0, 3).map(([k, v]) => `${k}: ${typeof v === 'number' ? v.toFixed(4) : String(v).slice(0, 40)}`).join(' · ')];
}

// 합격·불합격은 천체력 줄만, 화면의 허용 오차로 판정한다. 파이프라인이 붙인 판정(임시 기준)은 쓰지 않는다.
function VT({ rows, unit = '', tol }: { rows: ValidationResult[]; unit?: string; tol?: number | null }) {
  return (
    <div className="tblwrap"><table>
      <thead><tr><th>항목</th><th>표본</th><th>평균 차이</th><th>RMSE</th><th>상관계수</th><th>최대</th><th>판정</th></tr></thead>
      <tbody>{rows.map((r) => { const [a, b] = label(r); return (
        <tr key={r.metric}><td className="wrap">{a}<div className="tiny muted">{b}</div></td><td className="mono">{r.n.toLocaleString()}</td><td className="mono">{n4(r.mean_diff, unit)}</td><td className="mono">{n4(r.rmse, unit)}</td><td className="mono">{r.r == null ? '—' : r.r.toFixed(3)}</td><td className="mono">{n4(r.max_abs, unit)}</td>
          <td>{tol == null ? <span className="muted">—</span> : r.max_abs <= tol ? <span className="badge ok">✓</span> : <span className="badge warn">✗</span>}</td></tr>
      ); })}</tbody>
    </table></div>
  );
}

export default function Valid() {
  const [v, setV] = useState<Partial<Record<Name, ValidationResult[] | 'missing'>>>({});
  const grid = useData((d) => d.grid);
  const layers = useData((d) => d.layers);
  const missions = useData((d) => d.missions.items);
  const missionEph = useData((d) => d.missionEph);
  const eph = useData((d) => d.eph);
  const [ours, setOurs] = useState<Float32Array | null>(null);
  useEffect(() => {
    (['ephemeris', 'masks', 'illumination', 'frames'] as Name[]).forEach((n) => loadValidation(n).then((r) => setV((p) => ({ ...p, [n]: r.status === 'ok' ? r.value.data : 'missing' }))));
    fetch(`${DATA_BASE}validation/illum_ours.f32`).then((r) => (r.ok && !(r.headers.get('content-type') ?? '').includes('html') ? r.arrayBuffer() : null)).then((b) => b && setOurs(new Float32Array(b))).catch(() => undefined);
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
    if (x === 'missing' || x.length === 0) return <div style={{ padding: 12 }}><NoData what={`validation/${n}.json`} /></div>;
    return <VT rows={x} unit={unit} tol={n === 'ephemeris' ? tol : undefined} />;
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
                <td>{s.source === 'table' ? <span className="badge ok">Horizons 표</span> : <span className="badge approx">근사 천체력</span>}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>
      <div className="g2">
        <Card title="지평선 마스크 (Drive 대조)" np>{block('masks', '°')}</Card>
        <Card title="PA → ME 변환" np>{block('frames')}</Card>
      </div>
    </>
  );
}
