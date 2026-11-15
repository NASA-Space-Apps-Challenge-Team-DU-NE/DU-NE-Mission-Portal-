// 지도 카드 (UI 예시 mapCard): 02 착륙지 고르기·04 기지 배치 공용. 남극·북극·전역 지역 전환
import type { ReactNode } from 'react';
import { useData } from '../state/data';
import { useGridRun } from '../state/gridRun';
import { layerUiFor } from '../state/layerUi';
import { layerView } from '../state/layers';
import { useApp } from '../state/store';
import { Card, Help, LayerPickButton, pct, Seg } from './kit';
import { pickNear, REGION_LABEL, RegionSeg, regionSub, SouthMap } from './SouthMap';

export function MapCard(p: { where: 'site' | 'base'; tag?: ReactNode; onPick?(lat: number, lon: number): void }) {
  const app = useApp();
  const grid = useData((d) => d.grid);
  const region = useData((d) => d.mapRegion);
  const regionLoading = useData((d) => d.regionLoading);
  const l = layerUiFor(app.mapLayer, region);
  const approx = useData((d) => d.gridApprox);
  const layers = useData((d) => d.layers);
  const metas = useData((d) => d.layerMetas);
  const res = useGridRun((g) => g.result);
  const sources = useGridRun((g) => g.sources);
  // 고정 문구 대신 실제 격자 해상도·근사 여부·품질을 보여 준다
  const lv = grid ? layerView(app.mapLayer, res, layers, metas, grid.cells.length, approx, sources) : null;
  const cellKm = grid?.manifest.cell_km;
  const resText = cellKm ? l.res.replace(/5 km/g, `${cellKm} km`) : l.res;
  const kindText = !lv || lv.kind === 'missing' ? '자료 없음' : approx ? '근사 · 지형 미반영' : lv.kind === 'approx' ? '근사 천체력 포함' : l.kind;
  const dynamic = ['composite', 'illum_mission', 'comm_mission', 'dark_h', 'sun_now'].includes(app.mapLayer);
  const source = app.mapLayer === 'sun_now' ? sources?.now : sources?.mission;
  const sourceText = dynamic ? `${source?.label ?? '자료 없음'} · ${approx ? '구면 지평선' : '지형 지평선'}` : l.src;
  const isBase = p.where === 'base';
  return (
    <Card title={isBase ? '기지 놓기' : `${REGION_LABEL[region]} 지도`} sub={isBase ? '' : regionSub(region)} tag={p.tag}>
      {isBase ? null : (
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="row" style={{ gap: 8 }}><RegionSeg /><LayerPickButton where="map" /></span>
          <div className="maplegend"><div className="ramp" /><div className="ramp-t"><span>{l.lo}</span><span>{l.hi}</span></div></div>
        </div>
      )}
      <SouthMap where={p.where} onPick={p.onPick ?? ((lat, lon) => pickNear(lat, lon))} />
      <div className="mlg">
        <span><i style={{ border: '2px solid var(--accent)', background: '#061412' }} />상위 후보</span>
        <span><i style={{ background: '#E5EEEC', transform: 'rotate(45deg) scale(.8)' }} />기존 착륙지</span>
        <span><i style={{ border: '2px dashed #8FD6C9' }} />아르테미스 III 후보 지역 (USGS 2024)</span>
        <span><i style={{ border: '2px solid #8FD6C9', transform: 'rotate(45deg) scale(.8)' }} />후보 지점 (2024 지역 안)</span>
        <span><i style={{ border: '2px dashed #9FB3B0', transform: 'rotate(45deg) scale(.8)' }} />후보 지점 (2022 · 2024 제외)</span>
        <span><i style={{ border: '2px solid var(--amber)' }} />내 기지</span>
        <span><i style={{ border: '2px solid #fff', borderRadius: '50%' }} />선택 지점</span>
      </div>
      {isBase ? (
        <Help>지도를 누르면 위에서 고른 종류의 기지가 그 자리에 놓입니다.</Help>
      ) : (
        <>
          <div className="row small">
            <label className="muted" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>색 진하기 <input type="range" min={0.1} max={1} step={0.05} value={app.opacity} onChange={(e) => app.setMap({ opacity: Number(e.target.value) })} style={{ width: 100 }} /><output className="mono">{pct(app.opacity)}</output></label>
            <span className="muted">조건 안 맞는 곳</span>
            <Seg value={app.failMode} opts={[['dim', '흐리게'], ['hide', '숨기기'], ['show', '그대로']]} onChange={(v) => app.setMap({ failMode: v })} />
            <label className="muted" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={app.colorOn} onChange={(e) => app.setMap({ colorOn: e.target.checked })} /> 색 켜기 <span className="kbd">C</span></label>
          </div>
          <div className="row tiny muted" style={{ gap: 6 }}>
            <span className={`badge ${kindText === '실제' ? 'ok' : kindText === '계산' ? '' : 'approx'}`}>{kindText}</span><span>해상도 {resText}</span><span>· 출처 {sourceText}</span>
            {lv?.quality && lv.quality !== 'VALIDATED' ? <span className="badge warn">품질 {lv.quality}</span> : null}
            {l.warn ? <span className="badge warn">{l.warn}</span> : null}{l.tag ? <span className="badge">{l.tag}</span> : null}
          </div>
          {regionLoading ? <Help>{REGION_LABEL[regionLoading]} 레이어 불러오는 중…</Help> : !grid ? <Help>{REGION_LABEL[region]} 격자 자료 없음 — 지도 색·순위를 계산할 수 없습니다.</Help> : null}
          <Help>지도를 클릭하면 그 좌표가 착륙지로 선택됩니다. 배경: {region === 'south' ? 'LROC WAC 남극 모자이크' : 'NASA SVS CGI Moon Kit 회색 지도 (LROC WAC + 극지 LOLA)'}.{region === 'global' ? ' 일조·지구 가시 장기 평균·영구음영은 |위도| 55.2° 이상만 자료가 있습니다 (그 밖은 자료 없음).' : ''}</Help>
        </>
      )}
    </Card>
  );
}
