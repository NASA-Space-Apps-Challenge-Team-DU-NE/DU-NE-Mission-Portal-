// 06 일정 변경: 착륙 오차 범위(착륙지 중심 반경) 안 경사 조건 만족 비율 (P3-05).
// 원래 해상도(10 m / 20 m, 범위 밖이면 30 m)와 관측 비율을 함께 보여 준다. 반경·경사 한계는 근거 없는 값이라 임시값(PROVISIONAL)으로 시작하고 화면에서 바꾼다.
import { useEffect, useMemo, useRef, useState } from 'react';
import { loadEllipseIndex, loadEllipsePatch, type EllipseSiteInfo } from '../adapters/data';
import { circleStats, NODATA, observedOf, slopeOf, type EllipsePatch } from '../core/ellipse';
import { useResolvedSite } from '../state/hooks';
import { Card, Help, Kpi, NoData, deg, pct, rampRGB } from './kit';

/** "측정 밀도 낮음" 기준: 레이저 관측 픽셀 50% 미만 (평균 수준) */
const LOW_DENSITY_FRAC = 0.5;
/** PROVISIONAL: 착륙 오차 반경 (km)·경사 한계 (°) 기본값 */
const DEFAULT_RADIUS_KM = 1, DEFAULT_MAX_SLOPE = 15;

function NumIn({ label, unit, v, set, min, max, step }: { label: string; unit: string; v: number | null; set(v: number | null): void; min: number; max: number; step: number }) {
  return (
    <label className="small muted">{label} ({unit})<br />
      <input className="field num" type="number" min={min} max={max} step={step} value={v ?? ''} style={{ width: 90 }}
        onChange={(e) => set(e.target.value === '' ? null : Math.max(min, Math.min(max, Number(e.target.value))))} />
    </label>
  );
}

function usePatch(siteId: string | null): { info: EllipseSiteInfo | null; patch: EllipsePatch | null; state: 'loading' | 'ok' | 'none' } {
  const [v, setV] = useState<{ info: EllipseSiteInfo | null; patch: EllipsePatch | null; state: 'loading' | 'ok' | 'none' }>({ info: null, patch: null, state: 'loading' });
  useEffect(() => {
    let live = true;
    setV({ info: null, patch: null, state: 'loading' });
    (async () => {
      const idx = await loadEllipseIndex();
      const info = idx.status === 'ok' ? idx.value.data.sites.find((s) => s.id === siteId) ?? null : null;
      if (!info) { if (live) setV({ info: null, patch: null, state: 'none' }); return; }
      const bin = await loadEllipsePatch(info.file);
      if (!live) return;
      if (bin.status !== 'ok' || bin.value.byteLength !== info.size * info.size) { setV({ info, patch: null, state: 'none' }); return; }
      setV({ info, patch: { res_m: info.res_m, size: info.size, center_px: info.center_px, east_xy: info.east_xy, north_xy: info.north_xy, data: new Uint8Array(bin.value) }, state: 'ok' });
    })();
    return () => { live = false; };
  }, [siteId]);
  return v;
}

function PatchMap({ patch, radiusKm, maxSlope, obsKnown }: { patch: EllipsePatch; radiusKm: number | null; maxSlope: number | null; obsKnown: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const img = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = patch.size;
    const x = c.getContext('2d')!, im = x.createImageData(patch.size, patch.size);
    for (let k = 0; k < patch.data.length; k++) {
      const b = patch.data[k];
      if ((b & 127) === NODATA) { im.data.set([60, 66, 70, 255], k * 4); continue; }
      const s = slopeOf(b);
      // 경사 한계가 있으면 한계 이하 = 초록, 2배 이상 = 빨강. 한계가 없으면 0–30° 회색조
      const [r, g, bl] = maxSlope !== null ? rampRGB(1 - Math.min(1, s / (2 * maxSlope))) : [Math.round(230 - Math.min(1, s / 30) * 180), Math.round(230 - Math.min(1, s / 30) * 180), Math.round(230 - Math.min(1, s / 30) * 180)];
      const a = !obsKnown || observedOf(b) ? 255 : 110; // 보간 픽셀은 흐리게 (관측 정보 없는 제품은 그대로)
      im.data.set([r, g, bl, a], k * 4);
    }
    x.putImageData(im, 0, 0);
    return c;
  }, [patch, maxSlope, obsKnown]);
  useEffect(() => {
    const c = ref.current!;
    const W = c.clientWidth || 300, dpr = window.devicePixelRatio || 1;
    c.width = c.height = Math.round(W * dpr);
    const x = c.getContext('2d')!;
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.fillStyle = '#04080A'; x.fillRect(0, 0, W, W);
    x.imageSmoothingEnabled = false;
    x.drawImage(img, 0, 0, W, W);
    const k = W / patch.size, cx = patch.center_px[0] * k, cy = patch.center_px[1] * k;
    // 착륙 오차 반경 (원)
    if (radiusKm !== null) {
      x.strokeStyle = '#fff'; x.lineWidth = 2; x.beginPath();
      x.arc(cx, cy, ((radiusKm * 1000) / patch.res_m) * k, 0, 2 * Math.PI);
      x.stroke();
    }
    x.strokeStyle = '#fff'; x.lineWidth = 1.5;
    x.beginPath(); x.moveTo(cx - 6, cy); x.lineTo(cx + 6, cy); x.moveTo(cx, cy - 6); x.lineTo(cx, cy + 6); x.stroke();
    // 북쪽 화살표 (국지 북)
    const ux = patch.north_xy[0], uy = -patch.north_xy[1]; // 화면 y 는 아래로
    const ax = 24, ay = 24;
    x.fillStyle = 'rgba(4,8,10,.75)'; x.fillRect(4, 4, 40, 40);
    x.strokeStyle = '#E5EEEC'; x.lineWidth = 2; x.beginPath(); x.moveTo(ax - ux * 12, ay - uy * 12); x.lineTo(ax + ux * 12, ay + uy * 12); x.stroke();
    x.fillStyle = '#E5EEEC'; x.font = '600 10px IBM Plex Mono'; x.textAlign = 'center'; x.fillText('N', ax + ux * 17, ay + uy * 17 + 3);
    // 축척
    const km = (1000 / patch.res_m) * k;
    x.fillStyle = 'rgba(4,8,10,.75)'; x.fillRect(W - km * 2 - 18, W - 26, km * 2 + 14, 22);
    x.fillStyle = '#E5EEEC'; x.fillRect(W - km * 2 - 11, W - 12, km * 2, 2);
    x.font = '10px IBM Plex Mono'; x.fillText('2 km', W - km - 11, W - 15);
  }, [img, patch, radiusKm]);
  return <canvas ref={ref} style={{ width: '100%', aspectRatio: '1 / 1', display: 'block', border: '1px solid var(--line2)' }} />;
}

export function EllipseCard() {
  const rs = useResolvedSite();
  const [radius, setRadius] = useState<number | null>(DEFAULT_RADIUS_KM);
  const [maxSlope, setMaxSlope] = useState<number | null>(DEFAULT_MAX_SLOPE);
  const siteId = rs?.site.category !== 'custom' && rs?.site.category !== 'cell' ? rs?.site.id ?? null : null;
  const { info, patch, state } = usePatch(siteId);
  const st = useMemo(() => (patch && radius !== null && maxSlope !== null ? circleStats(patch, radius, maxSlope) : null), [patch, radius, maxSlope]);
  const obsKnown = info?.obs_known !== false;
  const low = st && obsKnown ? st.observed_frac < LOW_DENSITY_FRAC : false;
  const obsTxt = obsKnown && st ? `관측 ${pct(st.observed_frac)}${low ? ' · 측정 밀도 낮음' : ''}` : obsKnown ? '' : '관측 수 지도 없음';
  const sub = [radius !== null ? `반경 ${radius} km` : '', info ? `${info.res_m} m` : '', obsTxt].filter(Boolean).join(' · ');
  return (
    <Card title="착륙 오차 범위 안 경사 조건 만족 비율" sub={sub} tag={<span className="badge">3순위 · 선택</span>}>
      {state === 'loading' ? <div className="muted small">불러오는 중…</div> : !patch || !info ? (
        <NoData what="착륙 오차 범위" why={rs ? '카탈로그 남극 착륙지만 계산합니다. 지도·좌표로 고른 지점은 국지 지형 패치가 없습니다' : '02에서 착륙지를 먼저 고르세요'} />
      ) : (
        <div className="g21" style={{ alignItems: 'start' }}>
          <div className="col">
            <div className="row">
              <NumIn label="착륙 오차 반경" unit="km" v={radius} set={setRadius} min={0.1} max={5} step={0.1} />
              <NumIn label="착륙 경사 한계" unit="°" v={maxSlope} set={setMaxSlope} min={1} max={45} step={1} />
            </div>
            {radius === null || maxSlope === null ? <p className="help">반경과 경사 한계를 넣으면 계산합니다.</p> : null}
            {st && maxSlope !== null ? (
              <div className="kpis">
                <Kpi l={`경사 ≤ ${maxSlope}° 비율`} v={pct(st.ok_frac)} s="반경 안 자료 있는 픽셀 기준" tone={st.ok_frac >= 0.5 ? 'good' : 'bad'} />
                {obsKnown ? <>
                  <Kpi l="관측 픽셀만" v={st.ok_observed_frac == null ? '—' : pct(st.ok_observed_frac)} s="레이저 측정 픽셀 기준 같은 비율" />
                  <Kpi l="레이저 관측 비율" v={pct(st.observed_frac)} s={low ? `측정 밀도 낮음 (기준 ${pct(LOW_DENSITY_FRAC)} 미만)` : '나머지는 보간값'} tone={low ? 'bad' : ''} />
                </> : <Kpi l="레이저 관측 비율" v="자료 없음" s={`${info.res_m} m 제품에 픽셀별 관측 수 지도 없음`} />}
                <Kpi l="경사 중앙값 · 90분위" v={`${deg(st.slope_p50)} · ${deg(st.slope_p90)}`} s={`기준 길이 ${info.res_m * 2} m`} />
                {st.nodata_frac > 0 ? <Kpi l="자료 없음" v={pct(st.nodata_frac)} s={`${info.source} 범위 밖`} tone="bad" /> : null}
              </div>
            ) : null}
            <p className="note">
              착륙지 중심에서 입력한 반경 안의 모든 픽셀을 봅니다. {info.source.toUpperCase()} 원래 해상도({info.res_m} m) 그대로 계산했고, 보간으로 해상도를 올리지 않았습니다.
              {info.fallback_from_m ? ` ${info.fallback_from_m} m 지형은 반경이 닿는 범위를 다 덮지 못해(DEM 경계 밖) 이 착륙지는 ${info.res_m} m 로 계산했습니다.` : ''}
              {obsKnown ? ' 지도에서 흐린 픽셀은 레이저 측정 없이 보간한 값입니다. "측정 밀도 낮음"은 관측 픽셀이 50% 미만일 때입니다. ' : ' 이 제품은 관측 수 지도가 없어 측정·보간 픽셀을 구분할 수 없습니다. '}
              경사만 판정하며 일조·교신은 착륙지 중심 기준입니다. 바위·작은 크레이터·토양 지지력은 반영되지 않습니다. 경고용 지표이며 착륙 안전을 보장하지 않습니다.
            </p>
          </div>
          <div>
            <PatchMap patch={patch} radiusKm={radius} maxSlope={maxSlope} obsKnown={obsKnown} />
            <div className="legend" style={{ marginTop: 6 }}>
              {maxSlope !== null ? <>
                <span><i className="sw" style={{ background: 'rgb(59,184,155)' }} />완만 (≤ 한계)</span>
                <span><i className="sw" style={{ background: 'rgb(217,100,90)' }} />가파름 (≥ 한계×2)</span>
              </> : <span><i className="sw" style={{ background: 'linear-gradient(90deg,#e6e6e6,#323232)' }} />경사 0–30° (한계 입력 전)</span>}
              {obsKnown ? <span>흐림 = 보간값</span> : null}
              <span><i className="sw" style={{ background: '#3c4246' }} />자료 없음</span>
            </div>
            <Help>12×12 km · 흰 원 = 착륙 오차 반경, + = 착륙지 대표 지점</Help>
          </div>
        </div>
      )}
    </Card>
  );
}
