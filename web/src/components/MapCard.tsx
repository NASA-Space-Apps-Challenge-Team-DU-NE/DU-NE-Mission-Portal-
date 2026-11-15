// 남극 지도 카드 (UI 예시 mapCard): 02 착륙지 고르기·04 기지 배치 공용
import type { ReactNode } from 'react';
import { LAYER_UI } from '../state/layerUi';
import { useApp } from '../state/store';
import { Card, Help, LayerPickButton, pct, Seg } from './kit';
import { pickNear, SouthMap } from './SouthMap';

export function MapCard(p: { where: 'site' | 'base'; tag?: ReactNode; onPick?(lat: number, lon: number): void }) {
  const app = useApp();
  const l = LAYER_UI[app.mapLayer] ?? LAYER_UI.composite;
  const isBase = p.where === 'base';
  return (
    <Card title={isBase ? '기지 놓기' : '남극 지도'} sub={isBase ? '' : '75°S 이남 · 위쪽이 경도 0°'} tag={p.tag}>
      {isBase ? null : (
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <LayerPickButton where="map" />
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
            <span className={`badge ${l.kind === '실제' ? 'ok' : 'approx'}`}>{l.kind}</span><span>해상도 {l.res}</span><span>· 출처 {l.src}</span>
            {l.warn ? <span className="badge warn">{l.warn}</span> : null}{l.tag ? <span className="badge">{l.tag}</span> : null}
          </div>
          <Help>지도를 클릭하면 그 좌표가 착륙지로 선택됩니다. 배경: LROC WAC 남극 모자이크.</Help>
        </>
      )}
    </Card>
  );
}
