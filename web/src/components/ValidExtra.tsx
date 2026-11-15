// 09 검증: 2026-11-15 카탈로그·천체력·레이어 대조 표 (파이프라인 s10·s50·s70 산출물).
// 차이를 보여 줄 뿐 합격·불합격을 판정하지 않는다 (허용 오차는 팀이 정할 값).
import { Component, useEffect, useState, type ReactNode } from 'react';
import { loadValidationExtra } from '../adapters/data';
import type { ExtraValidationName } from '../adapters/schemaChecks';
import type { Envelope } from '../core/types';
import { Card, Help, NoData } from './kit';

type Row = Record<string, unknown>;

type LoadFailure = { error: string };
type ValidationMeta = Pick<Envelope<unknown>, 'quality' | 'notes'>;
function useJson<T>(name: ExtraValidationName) {
  const [v, setV] = useState<{ value: T | null | LoadFailure; meta: ValidationMeta | null }>({ value: null, meta: null });
  useEffect(() => {
    let alive = true;
    setV({ value: null, meta: null });
    loadValidationExtra<T>(name).then((r) => {
      if (alive) setV(r.status === 'ok' ? { value: r.value.data, meta: { quality: r.value.quality, notes: r.value.notes } } : { value: { error: r.reason }, meta: null });
    }).catch((e) => { if (alive) setV({ value: { error: `불러오기 실패: ${String(e)}` }, meta: null }); });
    return () => { alive = false; };
  }, [name]);
  return v;
}
const failed = (v: unknown): v is LoadFailure => !!v && typeof v === 'object' && 'error' in v;

function ValidationNotice({ meta }: { meta: ValidationMeta | null }) {
  if (!meta) return null;
  return <div style={{ padding: '10px 12px' }}>
    <span className={`badge ${meta.quality === 'VALIDATED' ? 'ok' : 'warn'}`}>품질 {meta.quality}</span>
    {meta.notes.map((note, i) => <p key={i} className="help">{note}</p>)}
  </div>;
}

// 선택적인 검증 카드의 예외가 다른 검증 결과와 앱 전체를 막지 않게 격리한다.
class ValidationCardBoundary extends Component<{ title: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <Card title={this.props.title}><NoData what="검증 결과" why="이 카드의 자료 형식이 올바르지 않습니다" /></Card> : this.props.children; }
}

const n = (v: unknown, d = 1) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(d) : '—');
const s = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));
const VERDICT: Record<string, string> = {
  match: '일치', replace: '교체 대상', region_point: '지역 대표점', named_region_only: '지역 이름만', no_source: '출처 없음',
  no_evidence: '근거 없음', conflict: '근거 충돌', derived: '유도',
};

function Loading({ v, what }: { v: unknown; what: string }) {
  if (v === null) return <div className="muted small" style={{ padding: 12 }}>불러오는 중…</div>;
  return <div style={{ padding: 12 }}><NoData what={what} why={failed(v) ? v.error : '검증 자료 형식이 올바르지 않습니다'} /></div>;
}

function SiteCoordContent() {
  const { value: v, meta } = useJson<Row[]>('catalog_sites');
  return (
    <Card title="④ 착륙지 좌표 대조" sub="공식 기록 대조본 · LROC 인공물 목록 · 2024 후보 지역 경계 · Wueller 외 2026" np>
      <ValidationNotice meta={meta} />
      {!Array.isArray(v) ? <Loading v={v} what="validation/catalog_sites.json" /> : (
        <div className="tblwrap"><table>
          <thead><tr><th>착륙지</th><th>판정</th><th>좌표 종류</th><th>근거</th><th>기준과 차이 (m)</th><th>출처 불확도 (m)</th><th>LROC 대비 (m)</th><th>비고</th></tr></thead>
          <tbody>{v.map((r) => (
            <tr key={s(r.id)}><td>{s(r.name)}</td><td>{VERDICT[s(r.verdict)] ?? s(r.verdict)}</td><td className="small">{s(r.coord_kind)}</td><td className="small">{s(r.evidence)}</td>
              <td className="mono">{n(r.diff_m)}</td><td className="mono">{n(r.ref_uncertainty_m ?? r.lroc_uncertainty_m)}</td><td className="mono">{n(r.lroc_diff_m)}</td>
              <td className="small muted wrap">{s(r.notes).slice(0, 140)}</td></tr>
          ))}</tbody>
        </table></div>
      )}
      <div style={{ padding: '0 12px 12px' }}><Help>일치 판정은 출처가 밝힌 위치 불확도만 씁니다. 지역 대표점은 착륙점이 아닙니다.</Help></div>
    </Card>
  );
}

function MissionFieldContent() {
  const { value: v, meta } = useJson<Row[]>('catalog_missions');
  return (
    <Card title="⑤ 과거 미션 필드 근거" sub="필드별 근거 수준과 출처 (근거표 대조)" np>
      <ValidationNotice meta={meta} />
      {!Array.isArray(v) ? <Loading v={v} what="validation/catalog_missions.json" /> : (
        <div className="tblwrap"><table>
          <thead><tr><th>미션</th><th>필드</th><th>이전 값</th><th>근거 값</th><th>판정</th><th>근거 수준</th><th>비고</th></tr></thead>
          <tbody>{v.map((r, i) => (
            <tr key={i}><td>{s(r.mission_id)}</td><td className="small">{s(r.field)}</td><td className="mono small">{s(r.current)}</td><td className="mono small wrap">{s(r.evidence)}</td>
              <td>{VERDICT[s(r.verdict)] ?? s(r.verdict)}</td>
              <td className="small">{r.source_url ? <a href={String(r.source_url)} target="_blank" rel="noreferrer">{s(r.level)}</a> : s(r.level)}</td>
              <td className="small muted wrap">{s(r.note).slice(0, 120)}</td></tr>
          ))}</tbody>
        </table></div>
      )}
    </Card>
  );
}

type Eph = {
  kernel_coverage_utc?: Record<string, [string, string]>; common_window_utc?: [string, string]; abcorr?: string;
  vs_horizons_range?: Row | null; interp_error_if_step_widened?: Record<string, Record<string, Row>>; vs_horizons_missions?: Record<string, Row | null>;
};

function SpiceEphContent() {
  const { value: v, meta } = useJson<Eph>('ephemeris_spice');
  if (!v || failed(v)) return <Card title="⑥ SPICE 천체력 표 대조" np><Loading v={v} what="validation/ephemeris_spice.json" /></Card>;
  const r = v.vs_horizons_range ?? {};
  const ms = Object.entries(v.vs_horizons_missions ?? {}).filter(([, x]) => x) as Array<[string, Row]>;
  const mx = (k: string) => (ms.length ? Math.max(...ms.map(([, x]) => Number(x[k]))) : NaN);
  return (
    <Card title="⑥ SPICE 천체력 표 대조" sub={`커널 공통 기간 ${s(v.common_window_utc?.[0])} ~ ${s(v.common_window_utc?.[1])} · 광행차 ${s(v.abcorr)}`} np>
      <ValidationNotice meta={meta} />
      <div className="tblwrap"><table>
        <thead><tr><th>비교</th><th>표본</th><th>태양 직하점 최대</th><th>지구 직하점 최대</th><th>지구 거리 최대 차이</th></tr></thead>
        <tbody>
          <tr><td>범위 표 vs 이전 Horizons 표 (겹치는 14개월)</td><td className="mono">{s(r.n)}</td><td className="mono">{n(r.sun_subpoint_max_deg, 5)}°</td><td className="mono">{n(r.earth_subpoint_max_deg, 5)}°</td><td className="mono">{n(r.earth_dist_max_km, 1)} km</td></tr>
          <tr><td>미션 표 {ms.length}개 vs Horizons (같은 시각)</td><td className="mono">{ms.reduce((a, [, x]) => a + Number(x.n), 0)}</td><td className="mono">{n(mx('sun_subpoint_max_deg'), 5)}°</td><td className="mono">{n(mx('earth_subpoint_max_deg'), 5)}°</td><td className="mono">{n(mx('earth_dist_max_km'), 1)} km</td></tr>
        </tbody>
      </table></div>
      <div style={{ padding: '0 12px 12px' }}>
        <Help>간격을 넓혔을 때 보간 오차(지구 직하점 최대): {Object.entries(v.interp_error_if_step_widened ?? {}).map(([k, x]) => `${k} ${n(x.earth?.max_deg, 4)}°`).join(' · ')}. 지구 쪽의 일정한 차이(약 0.0055°, 78 km)는 두 도구의 정의 차이로 보이며 원인은 확인하지 않았습니다.</Help>
      </div>
    </Card>
  );
}

type Min = Record<string, Row & { latitude_bands?: Row[]; raw_adapter?: Row; orientation_check?: Row; vs_lp_0p5deg?: Row }>;

function LayerContent() {
  const { value: v, meta } = useJson<Min>('layers_minerals');
  if (!v || failed(v)) return <Card title="⑦ 광물·지질 레이어 대조" np><Loading v={v} what="validation/layers_minerals.json" /></Card>;
  const fe = v.feo_kaguya, mi = v.tio2_jaxa_mi, lp = v.tio2_lp, rf = v.rockfalls, sc = v.scarps;
  return (
    <Card title="⑦ 광물·지질 레이어 대조" np>
      <ValidationNotice meta={meta} />
      <div className="tblwrap"><table>
        <thead><tr><th>레이어</th><th>대조</th><th>결과</th></tr></thead>
        <tbody>
          {fe ? <>
            <tr><td>FeO · Kaguya</td><td>원본 ZIP 어댑터 vs 정규화 COG</td><td className="small">최대 차이 {n(fe.raw_adapter?.max_abs_diff_wt, 4)} wt% · 화소 {s(fe.raw_adapter?.both_valid_pixels)}개</td></tr>
            <tr><td>FeO · Kaguya</td><td>방향 확인 (보간 화소 ↔ 영구음영 상관)</td><td className="small">지금 배치 {n(fe.orientation_check?.corr_interp_frac_vs_psr_frac, 3)} · 행을 뒤집으면 {n(fe.orientation_check?.corr_if_rows_flipped, 3)}</td></tr>
            <tr><td>FeO · Kaguya</td><td>LP 0.5° 칸 평균과 차이</td><td className="small">중앙값 {n(fe.vs_lp_0p5deg?.median, 2)} wt% · 상관 {n(fe.vs_lp_0p5deg?.corr, 2)} · 칸 {s(fe.vs_lp_0p5deg?.bins)}개 (측정 방식이 달라 같을 필요 없음)</td></tr>
          </> : null}
          {mi ? <tr><td>TiO₂ · JAXA MI</td><td>정량 사용 보류 (연구용 보기만)</td><td className="small">공급자 유효 칸 {s(mi.cells_provider_valid)} · 15 wt% 초과 의심 {s(mi.cells_upper_tail_suspect)} · 결측 근처 {s(mi.cells_near_missing)} · 85°S 이남 자료 없음</td></tr> : null}
          {lp ? <tr><td>TiO₂ · LP 2° 셀</td><td>원래 셀 그대로</td><td className="small">2° 셀 {s(lp.cells_2deg)}개 · 값 있는 격자 칸 {s(lp.grid_cells_with_value)} · 2° 셀 없는 칸 {s(lp.grid_cells_without_2deg_cell)}</td></tr> : null}
          {rf ? <tr><td>낙석 밀도</td><td>Bickel 외 2020 (신뢰도 0.6)</td><td className="small">남극 {s(rf.rows_south)}행 · 이전 추출본과 같음 {rf.same_rows_as_previous_extract ? '예' : '아니오'} · 80°S 이남 검출 {s(rf.rows_south_of_80S)}개 (README 는 80°S 까지) · 25 m 안 근접 쌍 {s((rf.near_duplicates_not_merged as Row | undefined)?.pairs_within_25m)}</td></tr> : null}
          {sc ? <tr><td>단층애 거리</td><td>LROC 극지 단층애 목록</td><td className="small">남쪽 점 {s(sc.points_south)}개 (75°S 이남 {s(sc.points_south_75S)}개)</td></tr> : null}
          {rf?.confidence_0p8_sensitivity ? (() => { const c = rf.confidence_0p8_sensitivity as Row; return <tr><td>낙석 밀도</td><td>신뢰도 0.8 목록으로 바꾸면</td><td className="small">{s(c.rows_south)}행 (모두 0.6 목록에 포함) · 검출 있는 칸 {s(c.cells_with_detection_0p6)} → {s(c.cells_with_detection_0p8)} · 밀도 상관 {n(c.density_corr, 2)}</td></tr>; })() : null}
          {v.psr_polygons ? (() => { const p = v.psr_polygons, q = (p.vs_raster_psr_dist ?? {}) as Row; return <tr><td>영구음영 거리 · 폴리곤</td><td>래스터 기반 거리와 비교</td><td className="small">폴리곤 {s(p.polygons)}개 (최소 {n(p.area_km2_min, 1)} km²) · 차이 중앙값 {n(q.median_diff_km, 1)} km · 상관 {n(q.corr, 2)} (래스터는 작은 그늘까지 세어 대부분 칸이 0)</td></tr>; })() : null}
          {v.polar_plains ? <tr><td>극지 평원 비율</td><td>매핑 범위 (평사 ±304 km)</td><td className="small">폴리곤 {s(v.polar_plains.polygons)}개 · 범위 안 칸 {s(v.polar_plains.cells_in_extent)} · 평원이 있는 칸 {s(v.polar_plains.cells_with_plains)}</td></tr> : null}
          {v.boulders_shackleton ? <tr><td>섀클턴 바위 수</td><td>좌표 QA 이상치 제외</td><td className="small">{s(v.boulders_shackleton.points_used)}점 사용 (제외 {s(v.boulders_shackleton.dropped_by_coordinate_qa)}) · 바위가 있는 칸 {s(v.boulders_shackleton.cells_with_boulders)}</td></tr> : null}
        </tbody>
      </table></div>
      {mi?.latitude_bands ? (
        <div className="tblwrap"><table>
          <thead><tr><th>JAXA MI 위도대</th><th>공급자 유효</th><th>15 wt% 초과 (유효 중)</th><th>2 wt% 미만 (유효 중)</th></tr></thead>
          <tbody>{mi.latitude_bands.map((b) => <tr key={s(b.band)}><td>{s(b.band)}</td><td className="mono">{n(Number(b.provider_valid_frac) * 100, 1)}%</td><td className="mono">{n(Number(b.over15_of_valid) * 100, 1)}%</td><td className="mono">{n(Number(b.below2_of_valid) * 100, 0)}%</td></tr>)}</tbody>
        </table></div>
      ) : null}
      <div style={{ padding: '0 12px 12px' }}><Help>"공급자 유효"는 과학적으로 믿을 수 있다는 뜻이 아닙니다. 차이를 기록할 뿐 합격·불합격을 판정하지 않습니다.</Help></div>
    </Card>
  );
}

export const SiteCoordCheck = () => <ValidationCardBoundary title="④ 착륙지 좌표 대조"><SiteCoordContent /></ValidationCardBoundary>;
export const MissionFieldCheck = () => <ValidationCardBoundary title="⑤ 과거 미션 필드 근거"><MissionFieldContent /></ValidationCardBoundary>;
export const SpiceEphCheck = () => <ValidationCardBoundary title="⑥ SPICE 천체력 표 대조"><SpiceEphContent /></ValidationCardBoundary>;
export const LayerCheck = () => <ValidationCardBoundary title="⑦ 광물·지질 레이어 대조"><LayerContent /></ValidationCardBoundary>;
