// UI 예시의 차트 그리기(lineChart·bandChart·drawPano·drawDome·scatter)를 실제 계산 결과에 연결한 것.
import { useEffect, useRef } from 'react';
import { horizonAt, type MaskLike } from '../core/horizon';
import type { AzEl, TimelineSample } from '../core/types';
import { useApp } from '../state/store';
import { utc } from './kit';

const D2R = Math.PI / 180;
const DAY = 86_400_000, HOUR = 3_600_000;
const css = (n: string) => (n.startsWith('--') ? getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#000' : n);
const wrap360 = (x: number) => ((x % 360) + 360) % 360;
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const PADL = 42, PADR = 10;

type Draw = (x: CanvasRenderingContext2D, w: number, h: number) => void;

function useCv(draw: Draw, deps: unknown[], h: number) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dr = useRef(draw);
  dr.current = draw;
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const paint = () => {
      const w = c.clientWidth || c.parentElement?.clientWidth || 300, dpr = window.devicePixelRatio || 1;
      c.style.height = `${h}px`;
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      const x = c.getContext('2d');
      if (!x) return;
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
      x.clearRect(0, 0, w, h);
      dr.current(x, w, h);
    };
    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(c);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, h]);
  return ref;
}

function timeAxis(x: CanvasRenderingContext2D, w: number, h: number, t0: number, t1: number, padB = 16) {
  x.fillStyle = css('--muted');
  x.font = '10px IBM Plex Mono';
  x.textAlign = 'center';
  const days = (t1 - t0) / DAY, stepD = days > 120 ? 30 : days > 40 ? 10 : days > 12 ? 5 : 1;
  for (let d = 0; d <= days; d += stepD) {
    const px = PADL + ((w - PADL - PADR) * d) / days;
    x.fillText(d === 0 ? utc(t0).slice(5, 10) : `+${d}일`, px, h - 3);
    x.fillStyle = css('--line');
    x.fillRect(px, 4, 1, h - padB - 4);
    x.fillStyle = css('--muted');
  }
}
function cursorLine(x: CanvasRenderingContext2D, w: number, h: number, t0: number, t1: number, t: number, padB = 16) {
  if (t < t0 || t > t1) return;
  const px = PADL + ((w - PADL - PADR) * (t - t0)) / (t1 - t0);
  x.fillStyle = css('--fg');
  x.fillRect(px - 0.5, 2, 1.5, h - padB - 2);
}

/** 차트를 누르면 그 시각으로 이동 */
function usePick(times: number[] | null, on: boolean) {
  const setT = useApp((s) => s.setT);
  return (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!on || !times || times.length < 2) return;
    const r = e.currentTarget.getBoundingClientRect();
    const f = clamp((e.clientX - r.left - PADL) / (r.width - PADL - PADR));
    const t0 = times[0], t1 = times[times.length - 1];
    setT(Math.round((t0 + f * (t1 - t0)) / HOUR) * HOUR);
  };
}

export interface LSeries { values: ArrayLike<number>; color: string; fill?: boolean; dash?: boolean }

export function LineChart(p: { h: number; times: number[]; series: LSeries[]; yMin?: number; yMax?: number; unit?: string; marks?: number[]; pick?: boolean; noCursor?: boolean }) {
  const t = useApp((s) => s.t);
  const tc = p.noCursor ? 0 : t;
  const ref = useCv((x, w, h) => {
    const times = p.times;
    if (times.length < 2) return;
    const t0 = times[0], t1 = times[times.length - 1], padB = 16;
    let lo = p.yMin ?? Infinity, hi = p.yMax ?? -Infinity;
    if (p.yMin == null || p.yMax == null)
      for (const s of p.series) for (let i = 0; i < s.values.length; i++) { const v = s.values[i]; if (!Number.isFinite(v)) continue; if (p.yMin == null) lo = Math.min(lo, v); if (p.yMax == null) hi = Math.max(hi, v); }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return;
    if (hi - lo < 1e-6) hi = lo + 1;
    const X = (tt: number) => PADL + ((w - PADL - PADR) * (tt - t0)) / (t1 - t0), Y = (v: number) => 4 + (h - padB - 8) * (1 - (v - lo) / (hi - lo));
    timeAxis(x, w, h, t0, t1, padB);
    x.fillStyle = css('--muted'); x.textAlign = 'right'; x.font = '10px IBM Plex Mono';
    for (const v of [lo, (lo + hi) / 2, hi]) x.fillText((Math.abs(v) >= 100 ? Math.round(v) : v.toFixed(1)) + (p.unit ?? ''), PADL - 4, Y(v) + 3);
    for (const s of p.series.filter((q) => q.fill)) {
      x.fillStyle = css(s.color) + '33';
      x.beginPath(); x.moveTo(X(t0), Y(lo));
      times.forEach((tt, i) => x.lineTo(X(tt), Y(Number.isFinite(s.values[i]) ? s.values[i] : lo)));
      x.lineTo(X(t1), Y(lo)); x.fill();
    }
    for (const s of p.series) {
      x.strokeStyle = css(s.color); x.lineWidth = 1.5; x.setLineDash(s.dash ? [4, 3] : []);
      x.beginPath();
      let st = false;
      times.forEach((tt, i) => { const v = s.values[i]; if (!Number.isFinite(v)) { st = false; return; } if (st) x.lineTo(X(tt), Y(v)); else { x.moveTo(X(tt), Y(v)); st = true; } });
      x.stroke();
    }
    x.setLineDash([]);
    for (const m of p.marks ?? []) { x.fillStyle = css('--warn'); x.fillRect(X(m) - 1, 2, 2, h - padB - 2); }
    if (!p.noCursor) cursorLine(x, w, h, t0, t1, tc, padB);
  }, [p.times, p.series, p.yMin, p.yMax, p.unit, p.marks, tc], p.h);
  const pick = usePick(p.times, !!p.pick);
  return <canvas className="chart" ref={ref} onClick={pick} style={p.pick ? { cursor: 'pointer' } : undefined} />;
}

export interface BRow { label: string; values: ArrayLike<number>; color: string; grad?: boolean }

export function BandChart(p: { h: number; times: number[]; rows: BRow[]; pick?: boolean }) {
  const t = useApp((s) => s.t);
  const ref = useCv((x, w, h) => {
    const times = p.times;
    if (times.length < 2 || !p.rows.length) return;
    const t0 = times[0], t1 = times[times.length - 1], padB = 16, rh = (h - padB - 4) / p.rows.length;
    timeAxis(x, w, h, t0, t1, padB);
    const dx = (w - PADL - PADR) / (times.length - 1 || 1);
    p.rows.forEach((r, k) => {
      const y = 2 + k * rh;
      x.fillStyle = css('--panel2'); x.fillRect(PADL, y + 1, w - PADL - PADR, rh - 3);
      x.fillStyle = css('--muted'); x.font = '10px IBM Plex Sans KR'; x.textAlign = 'right'; x.fillText(r.label, PADL - 4, y + rh / 2 + 3);
      const col = css(r.color);
      for (let i = 0; i < times.length; i++) {
        const v = r.values[i];
        if (v > 0) { x.globalAlpha = r.grad ? clamp(v) : 1; x.fillStyle = col; x.fillRect(PADL + i * dx - dx / 2, y + 1, dx + 0.6, rh - 3); }
      }
      x.globalAlpha = 1;
    });
    cursorLine(x, w, h, t0, t1, t, padB);
  }, [p.times, p.rows, t], p.h);
  const pick = usePick(p.times, !!p.pick);
  return <canvas className="chart" ref={ref} onClick={pick} style={p.pick ? { cursor: 'pointer' } : undefined} />;
}

export interface PanoLayer { track: TimelineSample[] | null | undefined; dashed?: boolean }
type Now = { sun: AzEl; earth: AzEl } | null;

export function Pano(p: { h: number; mask: MaskLike; layers: PanoLayer[]; now: Now; maskB?: MaskLike | null }) {
  const ref = useCv((x, w, h) => {
    const lo = -3, hi = 9;
    const X = (az: number) => (w * wrap360(az)) / 360, Y = (el: number) => (h - 14) * (1 - (el - lo) / (hi - lo));
    const m = (a: number) => horizonAt(p.mask, a);
    x.fillStyle = css('--sky'); x.fillRect(0, 0, w, h - 14);
    x.strokeStyle = css('--line'); x.lineWidth = 1;
    for (let e = -2; e <= 8; e += 2) { x.beginPath(); x.moveTo(0, Y(e)); x.lineTo(w, Y(e)); x.stroke(); }
    x.fillStyle = css('--muted'); x.font = '10px IBM Plex Mono'; x.textAlign = 'left';
    for (let e = 0; e <= 8; e += 4) x.fillText(`${e}°`, 2, Y(e) - 2);
    x.fillStyle = css('--terrain'); x.beginPath(); x.moveTo(0, h - 14);
    for (let a = 0; a <= 360; a++) x.lineTo(a === 360 ? w : X(a), Y(m(a % 360)));
    x.lineTo(w, h - 14); x.fill();
    x.strokeStyle = css('--terrain-line'); x.lineWidth = 1; x.beginPath();
    for (let a = 0; a <= 360; a++) { const px = a === 360 ? w : X(a); if (a) x.lineTo(px, Y(m(a % 360))); else x.moveTo(px, Y(m(0))); }
    x.stroke();
    if (p.maskB) {
      const mb = p.maskB;
      x.strokeStyle = css('--fg'); x.setLineDash([4, 3]); x.beginPath();
      for (let a = 0; a <= 360; a++) { const px = a === 360 ? w : X(a); const v = horizonAt(mb, a % 360); if (a) x.lineTo(px, Y(v)); else x.moveTo(px, Y(v)); }
      x.stroke(); x.setLineDash([]);
    }
    for (const L of p.layers) for (const q of L.track ?? []) {
      x.fillStyle = q.sun_frac > 0.5 ? css('--sun') : '#55666a'; x.globalAlpha = L.dashed ? 0.55 : 1; x.fillRect(X(q.sun.az_deg) - 1, Y(q.sun.el_deg) - 1, 2, 2);
      x.fillStyle = q.earth_visible ? css('--earth') : '#55666a'; x.fillRect(X(q.earth.az_deg) - 1, Y(q.earth.el_deg) - 1, L.dashed ? 1.5 : 2, L.dashed ? 1.5 : 2);
    }
    x.globalAlpha = 1;
    if (p.now) {
      const disc = (az: number, el: number, col: string, r: number) => { x.fillStyle = col; x.beginPath(); x.arc(X(az), Y(el), r, 0, 7); x.fill(); x.strokeStyle = '#fff'; x.lineWidth = 1.5; x.stroke(); };
      disc(p.now.sun.az_deg, p.now.sun.el_deg, css('--sun'), 5);
      disc(p.now.earth.az_deg, p.now.earth.el_deg, css('--earth'), 5);
    }
    x.fillStyle = css('--muted'); x.textAlign = 'center';
    ([['N', 0], ['E', 90], ['S', 180], ['W', 270]] as Array<[string, number]>).forEach(([l, a]) => x.fillText(`${l} ${a}°`, Math.max(14, X(a)), h - 3));
  }, [p.mask, p.layers, p.now, p.maskB], p.h);
  return <canvas className="chart" ref={ref} />;
}

export function Dome(p: { h: number; mask: MaskLike; track: TimelineSample[] | null; now: Now }) {
  const ref = useCv((x, w, h) => {
    const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 12;
    const P = (az: number, el: number): [number, number] => { const r = R * (1 - clamp((el + 4) / 94, 0, 1.2) ** 0.6); return [cx + r * Math.sin(az * D2R), cy - r * Math.cos(az * D2R)]; };
    x.fillStyle = css('--sky'); x.beginPath(); x.arc(cx, cy, R, 0, 7); x.fill();
    x.fillStyle = css('--terrain'); x.beginPath();
    for (let a = 0; a <= 360; a += 2) { const [px, py] = P(a, horizonAt(p.mask, a % 360)); if (a) x.lineTo(px, py); else x.moveTo(px, py); }
    for (let a = 360; a >= 0; a -= 2) { const [px, py] = P(a, -4); x.lineTo(px, py); }
    x.fill();
    x.strokeStyle = css('--line2'); x.beginPath(); x.arc(cx, cy, R, 0, 7); x.stroke(); x.beginPath(); x.arc(cx, cy, R * 0.5, 0, 7); x.stroke();
    for (const q of p.track ?? []) {
      let [px, py] = P(q.sun.az_deg, q.sun.el_deg); x.fillStyle = q.sun_frac > 0.5 ? css('--sun') : '#55666a'; x.fillRect(px - 1, py - 1, 2, 2);
      [px, py] = P(q.earth.az_deg, q.earth.el_deg); x.fillStyle = q.earth_visible ? css('--earth') : '#55666a'; x.fillRect(px - 1, py - 1, 2, 2);
    }
    if (p.now) for (const [b, c] of [[p.now.sun, css('--sun')], [p.now.earth, css('--earth')]] as Array<[AzEl, string]>) { const [px, py] = P(b.az_deg, b.el_deg); x.fillStyle = c; x.beginPath(); x.arc(px, py, 4.5, 0, 7); x.fill(); x.strokeStyle = '#fff'; x.stroke(); }
    x.fillStyle = css('--muted'); x.font = '10px IBM Plex Mono'; x.textAlign = 'center';
    x.fillText('N', cx, cy - R - 2); x.fillText('S', cx, cy + R + 10); x.fillText('E', cx + R + 7, cy + 3); x.fillText('W', cx - R - 7, cy + 3);
  }, [p.mask, p.track, p.now], p.h);
  return <canvas className="chart" ref={ref} />;
}

export function Scatter(p: { h: number; pts: Array<[number, number]>; xl: string; yl: string; diag?: boolean }) {
  const ref = useCv((x, w, h) => {
    const pts = p.pts.filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
    if (!pts.length) return;
    const P = 34;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [a, b] of pts) { x0 = Math.min(x0, a); x1 = Math.max(x1, a); y0 = Math.min(y0, b); y1 = Math.max(y1, b); }
    if (p.diag) { y0 = 0; y1 = 1; x0 = Math.min(x0, 0); x1 = Math.max(x1, 1); }
    const X = (v: number) => P + ((w - P - 8) * (v - x0)) / (x1 - x0 || 1), Y = (v: number) => 6 + (h - P - 6) * (1 - (v - y0) / (y1 - y0 || 1));
    x.strokeStyle = css('--line2'); x.strokeRect(P, 6, w - P - 8, h - P - 6);
    if (p.diag) { x.strokeStyle = css('--muted'); x.setLineDash([4, 3]); x.beginPath(); x.moveTo(X(0), Y(0)); x.lineTo(X(1), Y(1)); x.stroke(); x.setLineDash([]); }
    x.fillStyle = css('--accent'); x.globalAlpha = 0.6; for (const [a, b] of pts) x.fillRect(X(a) - 1.5, Y(b) - 1.5, 3, 3); x.globalAlpha = 1;
    x.fillStyle = css('--muted'); x.font = '10.5px IBM Plex Sans KR'; x.textAlign = 'center'; x.fillText(p.xl, P + (w - P) / 2, h - 6);
    x.save(); x.translate(10, (h - P) / 2); x.rotate(-Math.PI / 2); x.fillText(p.yl, 0, 0); x.restore();
  }, [p.pts, p.xl, p.yl, p.diag], p.h);
  return <canvas className="chart" ref={ref} />;
}
