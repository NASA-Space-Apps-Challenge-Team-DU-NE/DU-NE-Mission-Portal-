// 2D 남극 지도 (UI 예시 drawMap): 75°S 이남 방위 등거리, 위쪽 = 경도 0°. 배경 LROC WAC 남극 모자이크 + 격자 레이어 색.
import { useEffect, useMemo, useRef, useState } from 'react';
import { textureUrl } from '../adapters/data';
import { DEG, R_MOON_KM } from '../core/constants';
import { greatCircleKm } from '../core/vec';
import { useData } from '../state/data';
import { useBases } from '../state/derived';
import { useGridRun } from '../state/gridRun';
import { useResolvedSite } from '../state/hooks';
import { useNormLayer } from '../state/layerNorm';
import { useApp } from '../state/store';
import { rampRGB } from './kit';
import { useArtemisVintage } from '../state/artemis';

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

export function SouthMap(p: { where: 'site' | 'base'; onPick(lat: number, lon: number): void }) {
  const app = useApp();
  const grid = useData((d) => d.grid);
  const sites = useData((d) => d.sites.items);
  const regions = useData((d) => d.artemisRegions);
  const vint = useArtemisVintage();
  const res = useGridRun((g) => g.result);
  const rs = useResolvedSite();
  const bases = useBases();
  const nl = useNormLayer();
  const wac = useWac();
  const ref = useRef<HTMLCanvasElement>(null);

  const layerImg = useMemo(() => {
    if (!grid || !nl.v || p.where === 'base' || !app.colorOn) return null;
    const { nx, ny } = grid.manifest;
    const c = document.createElement('canvas');
    c.width = nx; c.height = ny;
    const x = c.getContext('2d')!;
    const im = x.createImageData(nx, ny);
    for (let i = 0; i < grid.cells.length; i++) {
      const v = nl.v[i];
      if (!Number.isFinite(v)) continue;
      let a = app.opacity;
      if (nl.pass && !nl.pass[i]) a = app.failMode === 'hide' ? 0 : app.failMode === 'dim' ? a * 0.18 : a;
      const [r, g, b] = rampRGB(v);
      im.data.set([r, g, b, a * 255], grid.cells[i] * 4);
    }
    x.putImageData(im, 0, 0);
    return c;
  }, [grid, nl, app.opacity, app.failMode, app.colorOn, p.where]);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const draw = () => {
      const W = c.clientWidth || 400, dpr = window.devicePixelRatio || 1;
      c.width = c.height = Math.round(W * dpr);
      const x = c.getContext('2d')!;
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
      x.fillStyle = '#04080A'; x.fillRect(0, 0, W, W);
      x.save(); x.beginPath(); x.arc(W / 2, W / 2, W / 2, 0, 7); x.clip();
      if (wac) x.drawImage(wac, 0, 0, W, W);
      if (layerImg && grid) {
        const ext = (grid.manifest.nx * grid.manifest.cell_km) / 2, s = (W * ext) / RAD_KM;
        x.imageSmoothingEnabled = true;
        x.drawImage(layerImg, W / 2 - s / 2, W / 2 - s / 2, s, s);
      }
      x.restore();
      x.strokeStyle = 'rgba(229,238,236,.18)'; x.lineWidth = 1;
      for (const lat of [-80, -85]) { x.beginPath(); x.arc(W / 2, W / 2, (W / 2) * ((90 + lat) / SPAN), 0, 7); x.stroke(); }
      for (let lon = 0; lon < 360; lon += 30) { const [a, b] = mapXY(-75, lon, W); x.beginPath(); x.moveTo(W / 2, W / 2); x.lineTo(a, b); x.stroke(); }
      x.fillStyle = 'rgba(229,238,236,.6)'; x.font = '10px IBM Plex Mono'; x.textAlign = 'center';
      ([['0°', 0], ['90°E', 90], ['180°', 180], ['90°W', -90]] as Array<[string, number]>).forEach(([l, lon]) => { const [a, b] = mapXY(-75.6, lon, W); x.fillText(l, a, b + 3); });
      x.fillText('80°S', W / 2 + 3, W / 2 - (W / 2) * (10 / 15) + 11);
      x.fillText('85°S', W / 2 + 3, W / 2 - (W / 2) * (5 / 15) + 11);
      // 아르테미스 III 후보 지역 공식 경계 (USGS 2024)
      x.save(); x.strokeStyle = '#8FD6C9'; x.lineWidth = 1.5; x.setLineDash([4, 3]);
      for (const r of regions) for (const ring of r.rings) {
        x.beginPath(); ring.forEach(([lo, la], k) => { const [a, b] = mapXY(la, lo, W); if (k) x.lineTo(a, b); else x.moveTo(a, b); }); x.closePath(); x.stroke();
      }
      x.setLineDash([]); x.fillStyle = '#8FD6C9'; x.font = '600 9.5px IBM Plex Mono'; x.textAlign = 'center';
      for (const r of regions) { const ring = r.rings[0]; let sa = 0, sb = 0; ring.forEach(([lo, la]) => { const [a, b] = mapXY(la, lo, W); sa += a; sb += b; }); x.fillText(r.code, sa / ring.length, sb / ring.length + 3); }
      x.restore();
      const mk = (lat: number, lon: number, fn: (a: number, b: number) => void) => { if (lat > -75) return; const [a, b] = mapXY(lat, lon, W); fn(a, b); };
      for (const s of sites) mk(s.lat_deg, s.lon_deg, (a, b) => { x.save(); x.translate(a, b); x.rotate(Math.PI / 4); if (s.category === 'artemis') { const y = vint.get(s.id)?.year; x.strokeStyle = y === 2024 ? '#8FD6C9' : y === 2022 ? '#9FB3B0' : '#E5EEEC'; x.lineWidth = 1.5; if (y === 2022) x.setLineDash([2, 2]); x.strokeRect(-5, -5, 10, 10); x.setLineDash([]); } else { x.fillStyle = '#E5EEEC'; x.fillRect(-3.5, -3.5, 7, 7); } x.restore(); });
      if (p.where !== 'base') (res?.top ?? []).forEach((c2, i) => mk(c2.lat_deg, c2.lon_deg, (a, b) => { x.fillStyle = '#061412'; x.fillRect(a - 8, b - 8, 16, 16); x.strokeStyle = css('--accent'); x.lineWidth = 2; x.strokeRect(a - 8, b - 8, 16, 16); x.fillStyle = '#fff'; x.font = '600 9.5px IBM Plex Mono'; x.textAlign = 'center'; x.fillText(String(i + 1), a, b + 3.5); }));
      for (const bs of bases) mk(bs.lat_deg, bs.lon_deg, (a, b) => {
        x.fillStyle = '#140f05'; x.fillRect(a - 7, b - 7, 14, 14); x.strokeStyle = css('--amber'); x.lineWidth = 2; x.strokeRect(a - 7, b - 7, 14, 14);
      });
      if (rs) mk(rs.site.lat_deg, rs.site.lon_deg, (a, b) => {
        x.strokeStyle = '#fff'; x.lineWidth = 2; x.beginPath(); x.arc(a, b, 10, 0, 7); x.stroke();
        const n = rs.site.name, tt = n.length > 16 ? `${n.slice(0, 16)}…` : n;
        x.font = '600 11px IBM Plex Sans KR'; const tw = x.measureText(tt).width;
        x.fillStyle = 'rgba(4,8,10,.8)'; x.fillRect(a + 13, b - 9, tw + 10, 18); x.fillStyle = '#fff'; x.textAlign = 'left'; x.fillText(tt, a + 18, b + 4);
      });
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(c);
    return () => ro.disconnect();
  }, [wac, layerImg, grid, sites, regions, vint, res, bases, rs, p.where]);

  return (
    <div className="mapwrap">
      <canvas
        ref={ref}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect(), px = ((e.clientX - r.left) / r.width) * 2 - 1, py = 1 - ((e.clientY - r.top) / r.height) * 2, rr = Math.hypot(px, py);
          if (rr > 1) return;
          p.onPick(-90 + rr * SPAN, Math.atan2(px, py) * R2D);
        }}
      />
    </div>
  );
}

/** 지도·3D 클릭: 가까운 카탈로그 착륙지 → 상위 후보 칸 → 좌표 그대로 */
export function pickNear(lat: number, lon: number, kmLimit = 8) {
  const app = useApp.getState();
  const sites = useData.getState().sites.items;
  const res = useGridRun.getState().result;
  const near = sites.find((s) => greatCircleKm(lat, lon, s.lat_deg, s.lon_deg) < kmLimit);
  if (near) return app.setSite({ kind: 'catalog', id: near.id });
  let best = -1, bd = 1e9;
  for (const c of res?.top ?? []) { const d = greatCircleKm(lat, lon, c.lat_deg, c.lon_deg); if (d < bd) { bd = d; best = c.cell; } }
  if (best >= 0 && bd < kmLimit) return app.setSite({ kind: 'cell', cell: best });
  app.setSite({ kind: 'custom', lat: +lat.toFixed(3), lon: +lon.toFixed(3) });
}
