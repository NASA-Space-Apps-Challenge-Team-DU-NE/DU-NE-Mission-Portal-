// 03 기지 배치: 기지 배치(P2-06), 기지 간 거리, 관측된 단층애 근접 경고. 경고는 참고용이며 안전을 보장하지 않는다.
// 착륙 먼지 도달 반경은 공개 근거가 없어 기능을 뺐다 (2026-11-15).
// 지도는 착륙지 중심 정사각형(한 변 10–100 km, 기본 10 km, 1 km 단위로 조절). 기지가 필요 없으면 스위치를 꺼서 착륙지 = 기지로 본다.
import { useEffect, useRef, useState } from 'react';
import { Card, Help, NoData, Seg, km, Empty } from '../components/kit';
import { LocalMap, useLocalTerrain } from '../components/LocalMap';
import { LocalTerrain3D } from '../components/LocalTerrain3D';
import { DEFAULTS } from '../config';
import { distanceTable, type BaseKind } from '../core/hazards';
import { useBases, useFaultCheck, useSiteWarnings } from '../state/derived';
import { useResolvedSite } from '../state/hooks';
import { useApp } from '../state/store';
import { useUi } from '../state/ui';

const KN: Record<BaseKind, string> = { landing_pad: '착륙장', power: '발전', water_mining: '물 채굴', habitat: '거주' };
const WK = { protected_site: '보호 대상 근처', base_conflict: '기지 요소 겹침', fault: '관측된 단층애 근처' } as const;

const VIEW_MIN = 10000, VIEW_MAX = 100000, VIEW_STEP = 1000, VIEW_DEFAULT = 10000;

export default function Base() {
  const app = useApp();
  const ui = useUi();
  const rs = useResolvedSite();
  const W = useSiteWarnings();
  const FC = useFaultCheck();
  const bases = useBases();
  const [kind, setKind] = useState<BaseKind>('landing_pad');
  const D = distanceTable(bases);
  const local = useLocalTerrain(rs?.site.id);
  const lt = local && rs ? local.meta.sites[rs.site.id] : undefined;
  const off = ui.baseOff;
  const [mode, setMode] = useState<'2d' | '3d'>('2d');
  const [exag, setExag] = useState(1);
  const has3d = !!(local && lt?.elev_file && rs && Math.abs(lt.lat_deg - rs.site.lat_deg) < 1e-6 && Math.abs(lt.lon_deg - rs.site.lon_deg) < 1e-6);
  const lockRef = useRef<HTMLDivElement>(null);
  // 꺼졌을 때 회색 영역 안으로 키보드 초점도 못 들어가게 (React 18 은 inert 속성 타입이 없어 직접 단다)
  useEffect(() => { lockRef.current?.toggleAttribute('inert', off); }, [off]);
  const place = (lat: number, lon: number) => app.addBase({ id: `b${Date.now().toString(36)}`, kind, name: `${KN[kind]} ${app.bases.filter((b) => b.kind === kind).length + 1}`, lat_deg: lat, lon_deg: lon });
  const view = Math.max(VIEW_MIN, Math.min(VIEW_MAX, ui.baseViewM));
  // 입력칸은 다 쓴 뒤(Enter·포커스 이동) 반영한다. 타이핑 중간값(예: 2)이 바로 10 km로 바뀌지 않게
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => { if (draft != null) { const v = Number(draft); if (draft.trim() !== '' && Number.isFinite(v)) setView(v * 1000); setDraft(null); } };
  const setView = (m: number) => ui.set({ baseViewM: Math.max(VIEW_MIN, Math.min(VIEW_MAX, Math.round(m / VIEW_STEP) * VIEW_STEP)) });
  return (
    <>
      <div className={`switchbar ${off ? 'off' : ''}`}>
        <button className="switch" role="switch" aria-checked={!off} onClick={() => ui.set({ baseOff: !off })}><i /></button>
        <div>
          <b>{off ? '기지 배치 꺼짐 · 착륙지 = 기지 위치' : '기지 따로 배치'}</b>
          <span className="small muted">{off
            ? `착륙만 필요한 임무입니다. ${rs?.site.name ?? '착륙지'}를 기지 위치로 봅니다${W.length ? ` (단층애 경고 ${W.length}건)` : ''}. 놓아 둔 기지 ${app.bases.length}개는 지워지지 않고, 켜면 다시 쓰입니다.`
            : '착륙장·발전·물 채굴·거주 기지를 착륙지 주변에 놓습니다. 착륙만 필요하면 끄세요.'}</span>
        </div>
      </div>
      <div ref={lockRef} className={off ? 'locked' : ''} aria-disabled={off}>
      <div className="g21">
        <Card title="기지 놓기" sub={rs ? `${rs.site.name} 중심 · 한 변 ${view / 1000} km` : ''} tag={<><Seg value={kind} opts={(Object.keys(KN) as BaseKind[]).map((k) => [k, KN[k]] as [BaseKind, string])} onChange={setKind} /></>}>
          {!rs ? <NoData what="착륙지" why="02에서 착륙지를 먼저 고르세요" /> : (
            <>
              <div className="row" style={{ gap: 8 }}>
                <Seg value={has3d ? mode : '2d'} opts={[['2d', '평면 지도'], ['3d', '3D 지형']]} onChange={(v) => has3d && setMode(v)} />
                {has3d && mode === '3d' ? <label className="small muted" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>높이 과장 <input type="range" min={1} max={5} step={0.5} value={exag} onChange={(e) => setExag(Number(e.target.value))} /><output className="mono">{exag}×</output></label> : null}
                {!has3d ? <span className="tiny muted">3D 지형은 실제 고도 자료가 있는 카탈로그 착륙지에서만 됩니다</span> : null}
                {has3d && mode === '3d' && local && view > local.meta.half_km * 2000 ? <span className="tiny muted">3D 지형 자료는 한 변 {local.meta.half_km * 2} km까지만 있어 그 범위만 보입니다</span> : null}
              </div>
              {has3d && mode === '3d' && local && lt ? (
                <LocalTerrain3D lat={rs.site.lat_deg} lon={rs.site.lon_deg} sizeM={Math.min(view, local.meta.half_km * 2000)} bases={bases} meta={local.meta} info={lt} img={local.img} exag={exag} disabled={off} onPick={place} />
              ) : (
                <LocalMap lat={rs.site.lat_deg} lon={rs.site.lon_deg} name={rs.site.name} siteId={rs.site.id} sizeM={view} bases={bases} disabled={off} onPick={place} />
              )}
              <div className="row zoomrow">
                <span className="small muted">지도 크기 (한 변)</span>
                <button className="ibtn" aria-label="1 km 줄이기" disabled={view <= VIEW_MIN} onClick={() => setView(view - VIEW_STEP)}>−</button>
                <label className="viewm"><input className="field num mono" type="number" min={VIEW_MIN / 1000} max={VIEW_MAX / 1000} step={VIEW_STEP / 1000} value={draft ?? view / 1000} aria-label="지도 한 변 (km)" onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); }} /> km</label>
                <button className="ibtn" aria-label="1 km 늘리기" disabled={view >= VIEW_MAX} onClick={() => setView(view + VIEW_STEP)}>+</button>
                <button className="btn sm" disabled={view === VIEW_DEFAULT} onClick={() => setView(VIEW_DEFAULT)}>기본 10 km</button>
              </div>
              <div className="mlg">
                <span><i style={{ border: '2px solid #fff', borderRadius: '50%' }} />착륙지 (가운데)</span>
                <span><i style={{ border: '2px solid var(--amber)' }} />내 기지</span>
              </div>
              <div className="row tiny muted" style={{ gap: 6 }}>
                {lt && local ? <>
                  <span className="badge ok">실제 지형</span><span>배경: LOLA 30 m 지형 음영기복 · 약 {Math.round(local.meta.m_per_px)} m/화소 · 조명 방향 북서 {local.meta.light.alt_deg}°(보기용, 실제 햇빛 아님). 지형 그림은 착륙지 둘레 한 변 {local.meta.half_km * 2} km까지만 있어, 그보다 넓게 보면 바깥은 LROC WAC 남극 모자이크(약 440 m/화소)로 채웁니다. 3D 지형은 같은 30 m 고도로 만든 실제 기복이며 지형 그림 범위까지만 보입니다{mode === '3d' && exag > 1 ? ` (높이 ${exag}배 과장)` : ''}.</span>
                  <span className="mono">고도 {Math.round(lt.elev_min_m).toLocaleString()} ~ {Math.round(lt.elev_max_m).toLocaleString()} m (중심 {Math.round(lt.elev_center_m).toLocaleString()} m)</span>
                </> : <>
                  <span className="badge approx">저해상도</span><span>배경: LROC WAC 남극 모자이크 확대 (약 440 m/화소). 상세 지형 그림은 카탈로그 착륙지에만 있습니다.</span>
                </>}
              </div>
              <Help>지도를 누르면 위에서 고른 종류의 기지가 그 자리에 놓입니다. 위쪽이 북(위도가 커지는 쪽)입니다.</Help>
            </>
          )}
        </Card>
        <div className="col">
          <Card title="단층애 근접 경고" sub={`${rs?.site.name ?? ''} · 경고 거리 ${DEFAULTS.fault_warn_km} km`}>
            <p className="note">착륙지가 관측된 단층애(LROC 목록)에서 경고 거리 안이면 알립니다. 경고는 참고용이며 안전을 보장하지 않습니다. 착륙 먼지 도달 반경은 공개 근거가 없어 검사하지 않습니다.</p>
            {!rs ? <NoData what="착륙지" /> : FC.state === 'unknown' ? <span className="badge warn" title={FC.reason ?? ''}>평가 못 함 · {FC.reason ?? '자료 없음'}</span> : W.length === 0 ? <span className="badge ok">경고 없음</span> : (
              <table><tbody>{W.map((w, i) => (
                <tr key={i}><td><span className="badge warn">경고</span></td><td className="wrap"><b>{WK[w.kind]}</b><div className="small muted">{w.target_name}</div></td><td className="mono">{km(w.distance_km)}</td><td className="mono small muted">≤ {km(w.limit_km, 0)}</td></tr>
              ))}</tbody></table>
            )}
          </Card>
          <Card title={<>놓은 기지 <small>{app.bases.length}개</small></>} np={!!app.bases.length}>
            {app.bases.length ? (
              <table><tbody>{app.bases.map((b) => (
                <tr key={b.id}>
                  <td><span className="badge" style={{ borderColor: 'var(--amber)', color: 'var(--amber)' }}>{KN[b.kind]}</span></td>
                  <td>{b.name}<div className="mono tiny muted">{b.lat_deg.toFixed(4)}, {b.lon_deg.toFixed(4)}</div></td>
                  <td><button className="btn sm" aria-label="삭제" onClick={() => app.removeBase(b.id)}>×</button></td>
                </tr>
              ))}</tbody></table>
            ) : <Empty>지도를 눌러 기지를 놓으세요</Empty>}
          </Card>
        </div>
      </div>
      {bases.length > 1 ? (
        <Card title="기지 간 거리 (km)" np>
          <div className="tblwrap"><table>
            <thead><tr><th />{bases.map((b) => <th key={b.id}>{b.name}</th>)}</tr></thead>
            <tbody>{bases.map((a, i) => (
              <tr key={a.id}><td>{a.name}</td>{bases.map((b, j) => {
                const d = D[i][j];
                return <td key={b.id} className="mono small">{i === j ? '—' : d.toFixed(2)}</td>;
              })}</tr>
            ))}</tbody>
          </table></div>
        </Card>
      ) : null}
      </div>
    </>
  );
}
