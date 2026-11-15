// 2D 지도 (UI 예시 drawMap): 남극·북극 75° 이상 방위 등거리, 전역 75°S–75°N 등장방형. 배경 LROC WAC 남극 모자이크 / 전역 회색 텍스처 + 격자 레이어 색.
import { useEffect, useMemo, useRef, useState } from 'react';
import { textureUrl } from '../adapters/data';
import { DEG, R_MOON_KM } from '../core/constants';
import { greatCircleKm } from '../core/vec';
import { useData } from '../state/data';
import { useBases } from '../state/derived';
import { useGridRun } from '../state/gridRun';
import { useResolvedSite } from '../state/hooks';
import { useNormLayer } from '../state/layerNorm';
import { useApp, viewRefOf } from '../state/store';
import { rampRGB } from './kit';
import { useArtemisVintage } from '../state/artemis';
import type { GridRegion } from '../core/gridScore';

const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const SPAN = 15; // 75°S → 지도 반지름
const RAD_KM = R_MOON_KM * SPAN * DEG;
const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
export const mapXY = (lat: number, lon: number, W: number): [number, number] => { const r = (90 + lat) / SPAN; return [W / 2 + (W / 2) * r * Math.sin(lon * D2R), W / 2 - (W / 2) * r * Math.cos(lon * D2R)]; };

let wacImg: HTMLImageElement | null = null;
export function useWac(): HTMLImageElement | null {
  const tex = useData((d) => d.textures);
  const [img, setImg] = useState<HTMLImageElement | null>(wacImg);
  useEffect(() => {
    const f = tex?.wac ?? tex?.hillshade;
    if (!f || wacImg) return;
    const im = new Image();
    im.onload = () => { wacImg = im; setImg(im); };
    im.src = textureUrl(f.file);
  }, [tex]);
  return img;
}

// ───────── 지역별 투영 (남극·북극 방위 등거리, 전역 등장방형 75°S–75°N) ─────────
export const REGION_LABEL: Record<GridRegion, string> = { south: '남극', north: '북극', global: '전역' };
export const regionSub = (r: GridRegion) =>
  r === 'south' ? '75°S 이남 · 위쪽이 경도 0°' : r === 'north' ? '75°N 이북 · 아래쪽이 경도 0°' : '75°S–75°N · 등장방형 · 가운데 경도 0°';
const BAND = 75;
/** 지도 가로:세로 (극 지도 1, 전역 360:150) */
export const regionAspect = (r: GridRegion) => (r === 'global' ? 360 / (2 * BAND) : 1);
/** 위경도 → 지도 픽셀 (W = 가로 픽셀). 범위 밖이면 null */
export function regionXY(r: GridRegion, lat: number, lon: number, W: number): [number, number] | null {
  if (r === 'south') return lat <= -90 + SPAN ? mapXY(lat, lon, W) : null;
  if (r === 'north') {
    if (lat < 90 - SPAN) return null;
    const q = (90 - lat) / SPAN;
    return [W / 2 + (W / 2) * q * Math.sin(lon * D2R), W / 2 + (W / 2) * q * Math.cos(lon * D2R)];
  }
  if (Math.abs(lat) > BAND) return null;
  const H = W / regionAspect('global');
  return [((lon + 180) / 360) * W, ((BAND - lat) / (2 * BAND)) * H];
}
/** 지도 픽셀 → 위경도 (밖이면 null) */
function regionInverse(r: GridRegion, u: number, v: number, W: number, H: number): [number, number] | null {
  if (r === 'global') return [BAND - (v / H) * 2 * BAND, (u / W) * 360 - 180];
  const px = (u / W) * 2 - 1, py = 1 - (v / H) * 2, rr = Math.hypot(px, py);
  if (rr > 1) return null;
  return r === 'south' ? [-90 + rr * SPAN, Math.atan2(px, py) * R2D] : [90 - rr * SPAN, Math.atan2(px, -py) * R2D];
}

/** 전역 등장방형 텍스처 이미지 (북극·전역 지도 배경). 북극은 극 투영으로 다시 그린다 */
let globeImg: HTMLImageElement | null = null;
function useGlobeImage(on: boolean): HTMLImageElement | null {
  const tex = useData((d) => d.textures);
  const [img, setImg] = useState<HTMLImageElement | null>(globeImg);
  useEffect(() => {
    const f = tex?.globe_2k;
    if (!on || !f || globeImg) return;
    const im = new Image();
    im.onload = () => { globeImg = im; setImg(im); };
    im.src = textureUrl(f.file);
  }, [tex, on]);
  return img;
}
const northBgCache = new WeakMap<HTMLImageElement, HTMLCanvasElement>();
function northBackground(img: HTMLImageElement): HTMLCanvasElement {
  const hit = northBgCache.get(img);
  if (hit) return hit;
  const src = document.createElement('canvas');
  src.width = img.naturalWidth; src.height = img.naturalHeight;
  const sx = src.getContext('2d')!; sx.drawImage(img, 0, 0);
  const sd = sx.getImageData(0, 0, src.width, src.height).data;
  const N = 512, out = document.createElement('canvas'); out.width = out.height = N;
  const ox = out.getContext('2d')!, od = ox.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const ll = regionInverse('north', x + 0.5, y + 0.5, N, N);
    if (!ll) continue;
    const u = Math.min(src.width - 1, Math.floor(((ll[1] + 180) / 360) * src.width)), v = Math.min(src.height - 1, Math.floor(((90 - ll[0]) / 180) * src.height));
    const k = (v * src.width + u) * 4, o = (y * N + x) * 4;
    od.data[o] = sd[k]; od.data[o + 1] = sd[k + 1]; od.data[o + 2] = sd[k + 2]; od.data[o + 3] = 255;
  }
  ox.putImageData(od, 0, 0);
  northBgCache.set(img, out);
  return out;
}

/** LOLA 경사 그림(relief_*) 이미지. 북극·전역 2D 지도의 지형 음영에 쓴다 */
const reliefImgs: Partial<Record<'relief_north' | 'relief_global', HTMLImageElement>> = {};
function useReliefImage(key: 'relief_north' | 'relief_global' | null): HTMLImageElement | null {
  const tex = useData((d) => d.textures);
  const [, bump] = useState(0);
  useEffect(() => {
    if (!key) return;
    const f = tex?.[key];
    if (!f || reliefImgs[key]) return;
    const im = new Image();
    im.onload = () => { reliefImgs[key] = im; bump((n) => n + 1); };
    im.src = textureUrl(f.file);
  }, [tex, key]);
  return key ? reliefImgs[key] ?? null : null;
}

const RELIEF_GAIN = 255;
const LIGHT: [number, number, number] = (() => { const el = 40 * D2R; return [Math.cos(el) * Math.sin(-Math.PI / 4), Math.cos(el) * Math.cos(-Math.PI / 4), Math.sin(el)]; })();
/** 경사(동·북) → 화면 왼쪽 위에서 비춘 음영. 배경 그림이며 계산에는 쓰지 않는다 */
const shadedCache = new Map<string, HTMLCanvasElement>();
function shadedBackground(region: 'north' | 'global', relief: HTMLImageElement, albedo: HTMLImageElement | null): HTMLCanvasElement {
  const key = `${region}|${relief.src}|${albedo?.src ?? ''}`;
  const hit = shadedCache.get(key);
  if (hit) return hit;
  const read = (img: HTMLImageElement) => {
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const x = c.getContext('2d', { willReadFrequently: true })!; x.drawImage(img, 0, 0);
    return { w: c.width, h: c.height, d: x.getImageData(0, 0, c.width, c.height).data };
  };
  const rl = read(relief), al = albedo ? read(albedo) : null;
  const ex = region === 'north' ? 3 : 5;
  let OW: number, OH: number;
  if (region === 'north') { OW = OH = 1024; } else { OW = 2304; OH = Math.round(OW / regionAspect('global')); }
  const out = document.createElement('canvas'); out.width = OW; out.height = OH;
  const ox = out.getContext('2d')!, od = ox.createImageData(OW, OH);
  // 알베도 평균(정규화용)
  let amean = 1;
  if (al) { let s = 0, n = 0; for (let k = 0; k < al.d.length; k += 4 * 97) { s += al.d[k]; n++; } amean = s / n / 255 || 1; }
  for (let y = 0; y < OH; y++) for (let xx = 0; xx < OW; xx++) {
    let lat: number, lon: number, ru: number, rv: number;
    if (region === 'north') {
      const ll = regionInverse('north', xx + 0.5, y + 0.5, OW, OH);
      if (!ll) continue;
      [lat, lon] = ll;
      ru = Math.floor(((xx + 0.5) / OW) * rl.w); rv = Math.floor(((y + 0.5) / OH) * rl.h);
    } else {
      lat = BAND - ((y + 0.5) / OH) * 2 * BAND; lon = ((xx + 0.5) / OW) * 360 - 180;
      ru = Math.floor(((lon + 180) / 360) * rl.w); rv = Math.floor(((90 - lat) / 180) * rl.h);
    }
    ru = Math.min(rl.w - 1, Math.max(0, ru)); rv = Math.min(rl.h - 1, Math.max(0, rv));
    const k = (rv * rl.w + ru) * 4;
    const gE = ((rl.d[k] - 128) / RELIEF_GAIN) * ex, gN = ((rl.d[k + 1] - 128) / RELIEF_GAIN) * ex;
    // 동·북 단위벡터의 화면 방향 (x 오른쪽, y 위쪽)
    let gx = gE, gy = gN;
    if (region === 'north') { const c = Math.cos(lon * D2R), s = Math.sin(lon * D2R); gx = gE * c - gN * s; gy = gE * s + gN * c; }
    const nz = 1 / Math.hypot(gx, gy, 1);
    const sh = Math.max(0, (-gx * LIGHT[0] - gy * LIGHT[1] + LIGHT[2]) * nz) / LIGHT[2];
    let a = 1;
    if (al) {
      const au = Math.min(al.w - 1, Math.floor(((lon + 180) / 360) * al.w)), av = Math.min(al.h - 1, Math.floor(((90 - lat) / 180) * al.h));
      a = 0.55 + 0.45 * (al.d[(av * al.w + au) * 4] / 255 / amean);
    }
    const v = Math.max(0, Math.min(255, 150 * sh * a));
    const o = (y * OW + xx) * 4;
    od.data[o] = v; od.data[o + 1] = v; od.data[o + 2] = v; od.data[o + 3] = 255;
  }
  ox.putImageData(od, 0, 0);
  shadedCache.set(key, out);
  return out;
}

/** 지도 지역 고르기 (남극·북극·전역) */
export function RegionSeg() {
  const region = useData((d) => d.mapRegion);
  const loading = useData((d) => d.regionLoading);
  const set = useData((d) => d.setMapRegion);
  return (
    <span className="seg" aria-label="지도 지역">
      {(['south', 'north', 'global'] as const).map((r) => (
        <button key={r} aria-pressed={region === r} onClick={() => void set(r)} title={regionSub(r)}>{REGION_LABEL[r]}{loading === r ? '…' : ''}</button>
      ))}
    </span>
  );
}

export function SouthMap(p: { where: 'site' | 'base'; view?: boolean; onPick(lat: number, lon: number): void }) {
  const app = useApp();
  const region = useData((d) => d.mapRegion);
  const grid = useData((d) => d.grid);
  const sites = useData((d) => d.sites.items);
  const regions = useData((d) => d.artemisRegions);
  const vint = useArtemisVintage();
  const res = useGridRun((g) => g.result);
  const viewRef = useApp(viewRefOf);
  const rs = useResolvedSite(p.view ? viewRef : undefined);
  const bases = useBases();
  const nl = useNormLayer();
  const wac = useWac();
  const globe = useGlobeImage(region !== 'south');
  const relief = useReliefImage(region === 'north' ? 'relief_north' : region === 'global' ? 'relief_global' : null);
  const shaded = useMemo(() => (relief && region !== 'south' ? shadedBackground(region, relief, globe) : null), [relief, region, globe]);
  const ref = useRef<HTMLCanvasElement>(null);

  const layerImg = useMemo(() => {
    if (!grid || grid.region !== region || !nl.v || p.where === 'base' || !app.colorOn) return null;
    const alpha = (i: number) => {
      let a = app.opacity;
      if (nl.pass && !nl.pass[i]) a = app.failMode === 'hide' ? 0 : app.failMode === 'dim' ? a * 0.18 : a;
      return a;
    };
    if (grid.region === 'global') {
      // 위도 띠 칸은 띠마다 폭이 달라 0.25° 등장방형 화소로 다시 칠한다
      const Wp = 1440, Hp = 600;
      const c = document.createElement('canvas'); c.width = Wp; c.height = Hp;
      const x = c.getContext('2d')!, im = x.createImageData(Wp, Hp);
      for (let r = 0; r < Hp; r++) {
        const la = BAND - ((r + 0.5) / Hp) * 2 * BAND;
        for (let q = 0; q < Wp; q++) {
          const i = grid.locate(la, ((q + 0.5) / Wp) * 360 - 180);
          if (i < 0) continue;
          const v = nl.v[i];
          if (!Number.isFinite(v)) continue;
          const [rr, gg, bb] = rampRGB(v);
          im.data.set([rr, gg, bb, alpha(i) * 255], (r * Wp + q) * 4);
        }
      }
      x.putImageData(im, 0, 0);
      return c;
    }
    const { nx, ny } = grid.manifest;
    const c = document.createElement('canvas');
    c.width = nx; c.height = ny;
    const x = c.getContext('2d')!;
    const im = x.createImageData(nx, ny);
    for (let i = 0; i < grid.cells.length; i++) {
      const v = nl.v[i];
      if (!Number.isFinite(v)) continue;
      const [r, g, b] = rampRGB(v);
      im.data.set([r, g, b, alpha(i) * 255], grid.cells[i] * 4);
    }
    x.putImageData(im, 0, 0);
    return c;
  }, [grid, region, nl, app.opacity, app.failMode, app.colorOn, p.where]);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const draw = () => {
      const W = c.clientWidth || 400, H = W / regionAspect(region), dpr = window.devicePixelRatio || 1;
      c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
      const x = c.getContext('2d')!;
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
      x.fillStyle = '#04080A'; x.fillRect(0, 0, W, H);
      const XY = (lat: number, lon: number) => regionXY(region, lat, lon, W);
      x.save();
      if (region === 'global') {
        x.beginPath(); x.rect(0, 0, W, H); x.clip();
        // 배경: 등장방형 전역 텍스처의 75°S–75°N 부분
        if (shaded) x.drawImage(shaded, 0, 0, W, H);
        else if (globe) { const ih = globe.naturalHeight, y0 = ((90 - BAND) / 180) * ih; x.drawImage(globe, 0, y0, globe.naturalWidth, ih - 2 * y0, 0, 0, W, H); }
        if (layerImg) { x.imageSmoothingEnabled = false; x.drawImage(layerImg, 0, 0, W, H); }
      } else {
        x.beginPath(); x.arc(W / 2, W / 2, W / 2, 0, 7); x.clip();
        if (region === 'south' && wac) x.drawImage(wac, 0, 0, W, W);
        if (region === 'north' && shaded) x.drawImage(shaded, 0, 0, W, W);
        else if (region === 'north' && globe) x.drawImage(northBackground(globe), 0, 0, W, W);
        if (layerImg && grid) {
          const ext = (grid.manifest.nx * grid.manifest.cell_km) / 2, s = (W * ext) / RAD_KM;
          x.imageSmoothingEnabled = true;
          x.drawImage(layerImg, W / 2 - s / 2, W / 2 - s / 2, s, s);
        }
      }
      x.restore();
      // 경위선
      x.strokeStyle = 'rgba(229,238,236,.18)'; x.lineWidth = 1;
      x.fillStyle = 'rgba(229,238,236,.6)'; x.font = '10px IBM Plex Mono'; x.textAlign = 'center';
      if (region === 'global') {
        for (let lo = -150; lo <= 150; lo += 30) { const a = ((lo + 180) / 360) * W; x.beginPath(); x.moveTo(a, 0); x.lineTo(a, H); x.stroke(); x.fillText(lo === 0 ? '0°' : `${Math.abs(lo)}°${lo > 0 ? 'E' : 'W'}`, a, H - 4); }
        for (const la of [-60, -30, 0, 30, 60]) { const b = ((BAND - la) / (2 * BAND)) * H; x.beginPath(); x.moveTo(0, b); x.lineTo(W, b); x.stroke(); x.textAlign = 'left'; x.fillText(la === 0 ? '0°' : `${Math.abs(la)}°${la > 0 ? 'N' : 'S'}`, 3, b - 3); x.textAlign = 'center'; }
      } else {
        const s = region === 'south' ? -1 : 1;
        for (const d of [5, 10]) { x.beginPath(); x.arc(W / 2, W / 2, (W / 2) * (d / SPAN), 0, 7); x.stroke(); }
        for (let lon = 0; lon < 360; lon += 30) { const e = XY(s * 75, lon); if (!e) continue; x.beginPath(); x.moveTo(W / 2, W / 2); x.lineTo(e[0], e[1]); x.stroke(); }
        ([['0°', 0], ['90°E', 90], ['180°', 180], ['90°W', -90]] as Array<[string, number]>).forEach(([l, lon]) => { const e = XY(s * 75.6, lon); if (e) x.fillText(l, e[0], e[1] + 3); });
        const ns = region === 'south' ? 'S' : 'N';
        x.fillText(`80°${ns}`, W / 2 + 3, W / 2 - (W / 2) * (10 / 15) + 11);
        x.fillText(`85°${ns}`, W / 2 + 3, W / 2 - (W / 2) * (5 / 15) + 11);
      }
      // 아르테미스 III 후보 지역 공식 경계 (USGS 2024, 남극에만)
      if (region === 'south') {
        x.save(); x.strokeStyle = '#8FD6C9'; x.lineWidth = 1.5; x.setLineDash([4, 3]);
        for (const r of regions) for (const ring of r.rings) {
          x.beginPath(); ring.forEach(([lo, la], k) => { const [a, b] = mapXY(la, lo, W); if (k) x.lineTo(a, b); else x.moveTo(a, b); }); x.closePath(); x.stroke();
        }
        x.setLineDash([]); x.fillStyle = '#8FD6C9'; x.font = '600 9.5px IBM Plex Mono'; x.textAlign = 'center';
        for (const r of regions) { const ring = r.rings[0]; let sa = 0, sb = 0; ring.forEach(([lo, la]) => { const [a, b] = mapXY(la, lo, W); sa += a; sb += b; }); x.fillText(r.code, sa / ring.length, sb / ring.length + 3); }
        x.restore();
      }
      const mk = (lat: number, lon: number, fn: (a: number, b: number) => void) => { const e = XY(lat, lon); if (e) fn(e[0], e[1]); };
      for (const s of sites) mk(s.lat_deg, s.lon_deg, (a, b) => { x.save(); x.translate(a, b); x.rotate(Math.PI / 4); if (s.category === 'artemis') { const y = vint.get(s.id)?.year; x.strokeStyle = y === 2024 ? '#8FD6C9' : y === 2022 ? '#9FB3B0' : '#E5EEEC'; x.lineWidth = 1.5; if (y === 2022) x.setLineDash([2, 2]); x.strokeRect(-5, -5, 10, 10); x.setLineDash([]); } else { x.fillStyle = '#E5EEEC'; x.fillRect(-3.5, -3.5, 7, 7); } x.restore(); });
      if (p.where !== 'base' && grid?.region === region) (res?.top ?? []).forEach((c2, i) => mk(c2.lat_deg, c2.lon_deg, (a, b) => { x.fillStyle = '#061412'; x.fillRect(a - 8, b - 8, 16, 16); x.strokeStyle = css('--accent'); x.lineWidth = 2; x.strokeRect(a - 8, b - 8, 16, 16); x.fillStyle = '#fff'; x.font = '600 9.5px IBM Plex Mono'; x.textAlign = 'center'; x.fillText(String(i + 1), a, b + 3.5); }));
      for (const bs of bases) mk(bs.lat_deg, bs.lon_deg, (a, b) => {
        x.fillStyle = '#140f05'; x.fillRect(a - 7, b - 7, 14, 14); x.strokeStyle = css('--amber'); x.lineWidth = 2; x.strokeRect(a - 7, b - 7, 14, 14);
      });
      if (rs) mk(rs.site.lat_deg, rs.site.lon_deg, (a, b) => {
        x.strokeStyle = '#fff'; x.lineWidth = 2; x.beginPath(); x.arc(a, b, 10, 0, 7); x.stroke();
        const n = rs.site.name, tt = n.length > 16 ? `${n.slice(0, 16)}…` : n;
        x.font = '600 11px IBM Plex Sans KR'; const tw = x.measureText(tt).width;
        const lx = a + 13 + tw + 10 > W ? a - 13 - tw - 10 : a + 13;
        x.fillStyle = 'rgba(4,8,10,.8)'; x.fillRect(lx, b - 9, tw + 10, 18); x.fillStyle = '#fff'; x.textAlign = 'left'; x.fillText(tt, lx + 5, b + 4);
      });
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(c);
    return () => ro.disconnect();
  }, [region, wac, globe, shaded, layerImg, grid, sites, regions, vint, res, bases, rs, p.where]);

  return (
    <div className={`mapwrap${region === 'global' ? ' band' : ''}`} style={{ aspectRatio: String(regionAspect(region)) }}>
      <canvas
        ref={ref}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const ll = regionInverse(region, e.clientX - r.left, e.clientY - r.top, r.width, r.height);
          if (ll) p.onPick(ll[0], ll[1]);
        }}
      />
    </div>
  );
}

/** 지도·3D 클릭: 가까운 카탈로그 착륙지 → 상위 후보 칸 → 좌표 그대로 */
/** 지도에서 누른 곳 근처의 착륙지·격자 칸을 고른다. view = true 면 오른쪽(3D 달·현장 뷰)에서만 바꾸고 계획은 그대로 둔다 */
export function pickNear(lat: number, lon: number, kmLimit = 8, view = false) {
  const st = useApp.getState();
  const app = { setSite: view ? st.setViewSite : st.setSite };
  const sites = useData.getState().sites.items;
  const res = useGridRun.getState().result;
  const near = sites.find((s) => greatCircleKm(lat, lon, s.lat_deg, s.lon_deg) < kmLimit);
  if (near) return app.setSite({ kind: 'catalog', id: near.id });
  let best = -1, bd = 1e9;
  for (const c of res?.top ?? []) { const d = greatCircleKm(lat, lon, c.lat_deg, c.lon_deg); if (d < bd) { bd = d; best = c.cell; } }
  if (best >= 0 && bd < kmLimit) return app.setSite({ kind: 'cell', cell: best });
  app.setSite({ kind: 'custom', lat: +lat.toFixed(3), lon: +lon.toFixed(3) });
}
