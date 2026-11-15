// 03 기지 배치용 국지 지도: 착륙지를 가운데 둔 정사각형 (한 변 sizeM 미터). 위쪽 = 북(위도가 커지는 쪽).
// 배경: 카탈로그 착륙지면 파이프라인 s75 의 LOLA 30 m 국지 음영기복(약 20 m/화소, 같은 틀),
//       그 밖(격자 칸·직접 입력 좌표)은 LROC WAC 남극 모자이크(약 440 m/화소)를 확대한 것. 계산에는 쓰지 않는다.
import { useEffect, useRef, useState } from 'react';
import { loadLocalTerrain, localUrl, type LocalTerrain } from '../adapters/data';
import { R_MOON_KM } from '../core/constants';
import type { BaseElement } from '../core/hazards';
import { mapXY, useWac } from './SouthMap';

const D2R = Math.PI / 180, R2D = 180 / Math.PI;

/** 출발점에서 방위(북 0°, 시계)·거리(km)만큼 간 점 (구면) */
export function destinationLL(lat: number, lon: number, bearingDeg: number, km: number): [number, number] {
  const p1 = lat * D2R, l1 = lon * D2R, th = bearingDeg * D2R, d = km / R_MOON_KM;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(th));
  const l2 = l1 + Math.atan2(Math.sin(th) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return [p2 * R2D, ((l2 * R2D + 540) % 360) - 180];
}

/** 가운데 점 기준 동쪽·북쪽 거리 (km, 방위 등거리) */
export function localEN(lat0: number, lon0: number, lat: number, lon: number): [number, number] {
  const p1 = lat0 * D2R, p2 = lat * D2R, dl = (lon - lon0) * D2R;
  const c = Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(dl);
  const d = Math.acos(Math.max(-1, Math.min(1, c))) * R_MOON_KM;
  const th = Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl));
  return [d * Math.sin(th), d * Math.cos(th)];
}

let wacData: { w: number; h: number; a: Uint8ClampedArray } | null = null;
function wacPixels(img: HTMLImageElement) {
  if (wacData && wacData.w === img.naturalWidth) return wacData;
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.drawImage(img, 0, 0);
  wacData = { w: c.width, h: c.height, a: x.getImageData(0, 0, c.width, c.height).data };
  return wacData;
}

let localEnv: LocalTerrain | null | 'missing' = null;
let localReq: Promise<void> | null = null;
const localImgs = new Map<string, HTMLImageElement>();

/** 착륙지 id 의 국지 음영기복 그림과 그 틀 정보 (없으면 null) */
export function useLocalTerrain(siteId: string | undefined): { img: HTMLImageElement; meta: LocalTerrain } | null {
  const [, bump] = useState(0);
  useEffect(() => {
    if (localEnv === null) {
      localReq ??= loadLocalTerrain().then((r) => { localEnv = r.status === 'ok' ? r.value.data : 'missing'; });
      localReq.then(() => bump((x) => x + 1));
    }
  }, []);
  const meta = localEnv && localEnv !== 'missing' ? localEnv : null;
  const info = meta && siteId ? meta.sites[siteId] : undefined;
  useEffect(() => {
    if (!info || localImgs.has(info.file)) return;
    const im = new Image();
    im.onload = () => { localImgs.set(info.file, im); bump((x) => x + 1); };
    im.src = localUrl(info.file);
  }, [info]);
  const img = info ? localImgs.get(info.file) : undefined;
  return meta && img ? { img, meta } : null;
}

/** 격자선 간격 (m): 한 변 길이에 맞춰 5~10칸쯤 */
const gridStep = (m: number) => (m <= 1500 ? 100 : m <= 3000 ? 250 : m <= 6000 ? 500 : m <= 15000 ? 1000 : 2000);

export function LocalMap(p: {
  lat: number; lon: number; name: string; sizeM: number; bases: BaseElement[];
  /** 카탈로그 착륙지 id. 파이프라인 국지 음영기복이 있으면 그것을 배경으로 */
  siteId?: string;
  disabled?: boolean; onPick(lat: number, lon: number): void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const wac = useWac();
  const local = useLocalTerrain(p.siteId);
  // 국지 그림은 그 착륙지 좌표를 중심으로 만들었으므로, 지도 중심이 같을 때만 쓴다
  const li = local && p.siteId ? local.meta.sites[p.siteId] : undefined;
  const useLocal = !!(local && li && Math.abs(li.lat_deg - p.lat) < 1e-6 && Math.abs(li.lon_deg - p.lon) < 1e-6);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const draw = () => {
      const W = c.clientWidth || 400, dpr = window.devicePixelRatio || 1;
      c.width = c.height = Math.round(W * dpr);
      const x = c.getContext('2d')!;
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
      const half = p.sizeM / 2000; // km
      const px = (km: number) => (km / (2 * half)) * W;
      const toXY = (e: number, n: number): [number, number] => [W / 2 + px(e), W / 2 - px(n)];

      // 배경: WAC 모자이크를 이 정사각형으로 다시 표본 (쌍선형)
      x.fillStyle = '#20292d'; x.fillRect(0, 0, W, W);
      if (useLocal && local) {
        // 파이프라인 그림: 한 변 2·half_km, 가운데 = 착륙지. 지금 보이는 한 변만큼 가운데에서 잘라 그린다
        const n = local.meta.size_px, src = Math.min(n, (p.sizeM / 1000 / (2 * local.meta.half_km)) * n);
        x.imageSmoothingEnabled = true;
        x.drawImage(local.img, n / 2 - src / 2, n / 2 - src / 2, src, src, 0, 0, W, W);
      } else if (wac && p.lat <= -75) {
        const N = 128, d = wacPixels(wac), im = x.createImageData(N, N);
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
          const e = ((i + 0.5) / N - 0.5) * 2 * half, n = (0.5 - (j + 0.5) / N) * 2 * half;
          const [la, lo] = destinationLL(p.lat, p.lon, Math.atan2(e, n) * R2D, Math.hypot(e, n));
          const [u, v] = mapXY(la, lo, d.w);
          const u0 = Math.max(0, Math.min(d.w - 2, Math.floor(u - 0.5))), v0 = Math.max(0, Math.min(d.h - 2, Math.floor(v - 0.5)));
          const fu = Math.max(0, Math.min(1, u - 0.5 - u0)), fv = Math.max(0, Math.min(1, v - 0.5 - v0));
          const g = (a: number, b: number) => d.a[(b * d.w + a) * 4];
          const val = g(u0, v0) * (1 - fu) * (1 - fv) + g(u0 + 1, v0) * fu * (1 - fv) + g(u0, v0 + 1) * (1 - fu) * fv + g(u0 + 1, v0 + 1) * fu * fv;
          im.data.set([val, val, val, 255], (j * N + i) * 4);
        }
        const t = document.createElement('canvas'); t.width = t.height = N;
        t.getContext('2d')!.putImageData(im, 0, 0);
        x.imageSmoothingEnabled = true;
        x.drawImage(t, 0, 0, W, W);
      }

      // 격자선과 축척
      const st = gridStep(p.sizeM) / 1000;
      x.strokeStyle = 'rgba(229,238,236,.16)'; x.lineWidth = 1;
      for (let k = Math.ceil(-half / st) * st; k <= half + 1e-9; k += st) {
        const [a] = toXY(k, 0), [, b] = toXY(0, k);
        x.beginPath(); x.moveTo(a, 0); x.lineTo(a, W); x.stroke();
        x.beginPath(); x.moveTo(0, b); x.lineTo(W, b); x.stroke();
      }
      const bar = st * Math.max(1, Math.round((2 * half) / 4 / st));
      x.fillStyle = 'rgba(4,8,10,.75)'; x.fillRect(10, W - 34, px(bar) + 20, 24);
      x.strokeStyle = '#fff'; x.lineWidth = 2; x.beginPath(); x.moveTo(20, W - 18); x.lineTo(20 + px(bar), W - 18); x.stroke();
      x.fillStyle = '#fff'; x.font = '10.5px IBM Plex Mono'; x.textAlign = 'left';
      x.fillText(bar >= 1 ? `${bar} km` : `${Math.round(bar * 1000)} m`, 22, W - 22);
      x.textAlign = 'center'; x.fillText('▲ 북', W - 26, 18);

      // 기지 (착륙 먼지 반경은 공개 근거가 없어 그리지 않는다)
      for (const b of p.bases) {
        const [e, n] = localEN(p.lat, p.lon, b.lat_deg, b.lon_deg);
        const [a, c2] = toXY(e, n);
        if (a < -20 || a > W + 20 || c2 < -20 || c2 > W + 20) continue;
        x.fillStyle = '#140f05'; x.fillRect(a - 7, c2 - 7, 14, 14);
        x.strokeStyle = '#D9A24E'; x.lineWidth = 2; x.strokeRect(a - 7, c2 - 7, 14, 14);
        x.font = '600 10.5px IBM Plex Sans KR'; x.textAlign = 'left';
        const tw = x.measureText(b.name).width;
        x.fillStyle = 'rgba(4,8,10,.75)'; x.fillRect(a + 10, c2 - 8, tw + 8, 16);
        x.fillStyle = '#F2D9A8'; x.fillText(b.name, a + 14, c2 + 4);
      }

      // 착륙지 (가운데)
      x.strokeStyle = '#fff'; x.lineWidth = 2; x.beginPath(); x.arc(W / 2, W / 2, 9, 0, 7); x.stroke();
      x.beginPath(); x.moveTo(W / 2 - 14, W / 2); x.lineTo(W / 2 - 5, W / 2); x.moveTo(W / 2 + 5, W / 2); x.lineTo(W / 2 + 14, W / 2);
      x.moveTo(W / 2, W / 2 - 14); x.lineTo(W / 2, W / 2 - 5); x.moveTo(W / 2, W / 2 + 5); x.lineTo(W / 2, W / 2 + 14); x.stroke();
      const nm = p.name.length > 18 ? `${p.name.slice(0, 18)}…` : p.name;
      x.font = '600 11px IBM Plex Sans KR'; x.textAlign = 'left';
      const tw = x.measureText(nm).width;
      x.fillStyle = 'rgba(4,8,10,.8)'; x.fillRect(W / 2 + 14, W / 2 - 24, tw + 10, 18);
      x.fillStyle = '#fff'; x.fillText(nm, W / 2 + 19, W / 2 - 11);
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(c);
    return () => ro.disconnect();
  }, [wac, local, useLocal, p.lat, p.lon, p.name, p.sizeM, p.bases]);

  return (
    <div className="mapwrap localmap">
      <canvas
        ref={ref}
        style={{ cursor: p.disabled ? 'not-allowed' : 'crosshair' }}
        onClick={(e) => {
          if (p.disabled) return;
          const r = e.currentTarget.getBoundingClientRect();
          const half = p.sizeM / 2000;
          const ee = ((e.clientX - r.left) / r.width - 0.5) * 2 * half, nn = (0.5 - (e.clientY - r.top) / r.height) * 2 * half;
          const [la, lo] = destinationLL(p.lat, p.lon, Math.atan2(ee, nn) * R2D, Math.hypot(ee, nn));
          p.onPick(+la.toFixed(5), +lo.toFixed(5));
        }}
      />
    </div>
  );
}
