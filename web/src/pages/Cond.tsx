// 01 조건 정하기: 미션 프로파일(P2-03), 필수 조건·가중치(P1-18), 임무 기간·통신 여유각(P1-16), 상위 3곳 미리보기
import { useState } from 'react';
import { Card, Help, ScoreChip, pct } from '../components/kit';
import { DEFAULTS } from '../config';
import { PROFILES, type ProfileId } from '../config';
import type { Criterion, HardFilters } from '../core/types';
import { useData } from '../state/data';
import { useGridRun } from '../state/gridRun';
import { useApp, type ProfileSel } from '../state/store';
import { CRIT, CRIT_COL, PROFILE_UI, useUi } from '../state/ui';

type NumKey = Exclude<keyof HardFilters, 'artemis_only'>;
const FILTERS: Array<[NumKey, string, string, number, number, number, number, (v: number) => string, string]> = [
  ['min_illum_frac', '임무 기간 일조율', '≥', 0.6, 0, 1, 0.05, (v) => pct(v), '해가 이 비율 이상 드는 곳만 남깁니다.'],
  ['min_comm_frac', '임무 기간 교신율', '≥', 0.5, 0, 1, 0.05, (v) => pct(v), '지구와 이 비율 이상 교신할 수 있는 곳만.'],
  ['max_slope_deg', '경사 (90분위)', '≤', 15, 1, 30, 1, (v) => `${v}°`, '착륙선이 안전하게 설 수 있는 경사 한계.'],
  ['max_water_km', '영구음영(물 후보)까지', '≤', 20, 1, 100, 1, (v) => `${v} km`, '얼음이 있을 만한 곳에서 이 거리 안쪽만.'],
  ['max_dark_h', '최장 연속 그늘', '≤', 48, 0, 240, 6, (v) => `${v} h`, '배터리로 버텨야 하는 가장 긴 그늘 시간.'],
  ['avoid_faults_km', '단층애에서 떨어진 거리', '≥', 10, 1, 50, 1, (v) => `${v} km`, '지질 위험 경고 거리(임시값).'],
];
const CRITS = Object.keys(CRIT) as Criterion[];

export default function Cond() {
  const app = useApp();
  const ui = useUi();
  const [more, setMore] = useState(false);
  const res = useGridRun((g) => g.result);
  const grid = useData((d) => d.grid);
  const nCells = grid?.cells.length ?? 0;
  const regions = useData((d) => d.artemisRegions);
  const dis = (k: keyof HardFilters) => res?.filters.find((f) => f.key === k)?.disabled ?? false;
  const wsum = Object.values(app.mapWeights).reduce((a, b) => a + b, 0) || 1;
  const profs: ProfileSel[] = ['custom', 'long_base', 'recon', 'water'];
  return (
    <>
      <Card title="미션 프로파일" tag={<span className="badge prov">임시값 PROVISIONAL</span>}>
        <div className="g4">
          {profs.map((k) => {
            const w = k === 'custom' ? app.customWeights : PROFILES[k as ProfileId].weights;
            return (
              <button key={k} className="opt" aria-pressed={app.profile === k} onClick={() => app.setProfile(k)}>
                <b>{PROFILE_UI[k].name}{k === 'custom' ? <> <span className="badge ok">기본</span></> : null}</b>
                <span>{PROFILE_UI[k].desc}</span>
                <span className="mono tiny">발전 {w.power} · 교신 {w.comm} · 물 {w.water} · 안전 {w.safety}</span>
              </button>
            );
          })}
        </div>
        <Help><b>사용자 설정</b>(기본)은 아래 가중치를 직접 정합니다. 다른 프로파일을 고르면 가중치가 자동으로 채워지고, 그 뒤 가중치를 움직이면 다시 사용자 설정으로 바뀝니다.</Help>
      </Card>
      <div className="g21">
        <div className="col">
          <Card title="필수 조건" sub="못 넘으면 제외">
            <div className="bigcount"><b>{res?.passCount ?? '—'}</b><span className="muted">/ {nCells.toLocaleString()} 칸 통과</span></div>
            <Help>켠 조건을 하나라도 못 넘는 곳은 순위에서 빠지고 지도에서 흐리게 보입니다. 너무 적게 남으면 조건을 풀어 보세요.</Help>
            <div>
              {FILTERS.map(([k, label, op, def, mn, mx, st, fmt, hp]) => {
                const on = app.filters[k] !== undefined, v = on ? (app.filters[k] as number) : def, d = dis(k);
                return (
                  <div key={k} className={`frow ${on ? '' : 'off'}`}>
                    <input type="checkbox" checked={on} disabled={d} aria-label={`${label} 조건 켜기`} onChange={(e) => app.setFilter(k, e.target.checked ? def : undefined)} />
                    <span className="lb">{label} {op}{d ? <span className="tiny muted"> · 자료 없음</span> : null}</span>
                    <output>{fmt(v)}</output>
                    <input type="range" min={mn} max={mx} step={st} value={v} disabled={!on} onChange={(e) => app.setFilter(k, Number(e.target.value))} />
                    <span className="hp">{hp}</span>
                  </div>
                );
              })}
              <div className={`frow ${app.filters.artemis_only ? '' : 'off'}`}>
                <input type="checkbox" checked={!!app.filters.artemis_only} disabled={dis('artemis_only') || !regions.length} onChange={(e) => app.setFilter('artemis_only', e.target.checked || undefined)} />
                <span className="lb">아르테미스 III 후보 지역 안만</span><output />
                <span className="hp">{regions.length ? `USGS 2024 공식 경계 ${regions.length}곳 (DOI 10.5066/P1MEQ6UK) 안쪽 칸만 남깁니다.` : '공식 경계 자료 없음 → 사용할 수 없습니다.'}</span>
              </div>
            </div>
          </Card>
        </div>
        <div className="col">
          <Card title="가중치" sub="순위에 반영" tag={<span className="badge prov">임시값</span>}>
            <Help>남은 곳들 중 무엇을 더 중요하게 볼지 정합니다. 비율만 의미가 있습니다.</Help>
            <div className="share">
              {CRITS.filter((k) => app.mapWeights[k] > 0).map((k) => { const s = (app.mapWeights[k] / wsum) * 100; return <div key={k} style={{ width: `${s}%`, background: CRIT_COL[k] }} title={`${CRIT[k]} ${Math.round(s)}%`}>{s >= 9 ? `${Math.round(s)}%` : ''}</div>; })}
            </div>
            {CRITS.map((k) => (
              <div key={k} className="wrow">
                <label className="small"><i className="sw" style={{ background: CRIT_COL[k], marginRight: 6 }} />{CRIT[k].split('(')[0]}{res?.missing.includes(k) ? <span className="tiny muted"> · 자료 없음</span> : null}</label>
                <input type="range" min={0} max={100} step={5} value={app.mapWeights[k]} aria-label={`${CRIT[k]} 가중치`} onChange={(e) => app.setWeight(k, Number(e.target.value))} />
                <output>{app.mapWeights[k]}</output>
              </div>
            ))}
          </Card>
          <Card title="임무 기간 · 통신 여유각" tag={<span className="badge prov">임시값</span>}>
            <div className="wrow"><label className="small">임무 기간</label><input type="range" min={24} max={1440} step={24} value={app.duration_h} onChange={(e) => app.setDuration(Number(e.target.value))} /><output>{app.duration_h}</output></div>
            <div className="chips">
              {([[72, '3일'], [240, '10일'], [720, '30일'], [1440, '60일']] as Array<[number, string]>).map(([v, l]) => <button key={v} className="chip" aria-pressed={app.duration_h === v} onClick={() => app.setDuration(v)}>{l}</button>)}
              <span className="tiny muted" style={{ alignSelf: 'center' }}>시간(h) 단위</span>
            </div>
            <div className="wrow"><label className="small">통신 여유각</label><input type="range" min={0} max={10} step={0.5} value={app.margin_deg} onChange={(e) => app.setMargin(Number(e.target.value))} /><output>{app.margin_deg}°</output></div>
            <Help><b>통신 여유각</b>: 지구가 지형선보다 이 각도만큼 더 높아야 교신 가능으로 칩니다. 클수록 깐깐합니다. 05 통신 계산도 이 값을 씁니다.</Help>
            <button className="disclose" aria-expanded={more} aria-controls="condMore" onClick={() => setMore(!more)}>
              <span className="ar" aria-hidden>{more ? '▾' : '▸'}</span>상세 조건 <span className="tiny muted">전력 수요 · 패널 효율{more ? '' : ` — 지금 ${ui.demand_kw} kW · ${ui.eff}`}</span>
            </button>
            {more ? (
              <div id="condMore" className="more">
                <div className="row">
                  <label className="small muted">필요 전력 (kW)<br /><input className="field num" type="number" min={0} step={1} value={ui.demand_kw} onChange={(e) => ui.set({ demand_kw: Number(e.target.value) })} /></label>
                  <label className="small muted">패널 효율<br /><input className="field num" type="number" min={0.05} max={0.5} step={0.01} value={ui.eff} onChange={(e) => ui.set({ eff: Number(e.target.value) })} /></label>
                </div>
                <Help>05 임무 시뮬레이션 아래 <b>전력 계획</b>이 이 값으로 패널 면적과 배터리 용량을 계산합니다. 태양을 따라 도는 수직 패널 기준, 시스템 손실 {DEFAULTS.panel_loss * 100}%, 설계 여유 {DEFAULTS.power_margin * 100}% (임시값).</Help>
              </div>
            ) : null}
          </Card>
          <Card title="미리보기 · 지금 조건의 상위 3곳" np tag={<button className="btn sm ghost" onClick={() => app.setPage('site')}>02에서 전체 보기 →</button>}>
            <table><tbody>
              {res && res.top.length ? res.top.slice(0, 3).map((c, i) => (
                <tr key={c.cell} className="click" onClick={() => app.setSite({ kind: 'cell', cell: c.cell })}><td>{i + 1}</td><td className="mono small">{c.lat_deg.toFixed(2)}°, {c.lon_deg.toFixed(1)}°</td><td><ScoreChip v={c.score * 100} /></td></tr>
              )) : <tr><td className="muted">{res ? '조건을 만족하는 칸이 없습니다' : '격자 계산 중…'}</td></tr>}
            </tbody></table>
          </Card>
        </div>
      </div>
    </>
  );
}
