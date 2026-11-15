// UI 예시(lunar-base-planner-ui.html)의 화면 조각을 React 로 옮긴 것. 클래스 이름은 예시와 같다.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { Outcome, TerrainKind } from '../core/types';
import { LAYER_UI, LGROUPS, type LayerUi } from '../state/layerUi';
import { useApp } from '../state/store';
import { vintageLabel, vintageTitle, type ArtemisVintage } from '../state/artemis';

export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
export const pct = (v: number | null | undefined, d = 0) => (v == null || !Number.isFinite(v) ? '—' : `${(v * 100).toFixed(d)}%`);
export const hrs = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : v < 48 ? `${Math.round(v)} h` : `${Math.round(v)} h (${(v / 24).toFixed(1)}일)`);
export const deg = (v: number | null | undefined, d = 1) => (v == null || !Number.isFinite(v) ? '—' : `${v.toFixed(d)}°`);
export const km = (v: number | null | undefined, d = 1) => (v == null || !Number.isFinite(v) ? '—' : `${v.toFixed(d)} km`);
export const utc = (t: number | null | undefined) => (t == null || !Number.isFinite(t) ? '—' : new Date(t).toISOString().slice(0, 16).replace('T', ' '));
export const signed = (v: number, d = 0, u = '') => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(d)}${u}`;
export const dur = (ms: number | null | undefined) => {
  if (ms == null) return '60일 안에 없음';
  const h = ms / 3_600_000;
  return h < 1 ? `${Math.round(h * 60)}분` : h < 48 ? `${h.toFixed(1)}시간` : `${(h / 24).toFixed(1)}일`;
};

/** 빨강 → 노랑 → 초록(청록) (예시와 같은 색) */
export function rampRGB(v: number): [number, number, number] {
  const A = [217, 100, 90], B = [224, 168, 79], C = [59, 184, 155];
  v = clamp01(v);
  const [p, q, t] = v < 0.5 ? [A, B, v * 2] : [B, C, (v - 0.5) * 2];
  return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
}
export const rampCss = (v: number) => { const [r, g, b] = rampRGB(v); return `rgb(${r | 0},${g | 0},${b | 0})`; };

export function Card(p: { title: ReactNode; sub?: ReactNode; tag?: ReactNode; children: ReactNode; np?: boolean; cls?: string; style?: CSSProperties }) {
  return (
    <section className={`card ${p.cls ?? ''}`} style={p.style}>
      <div className="hd">
        <h2>{p.title}{p.sub ? <> <small>{p.sub}</small></> : null}</h2>
        {p.tag ? <div className="acts">{p.tag}</div> : null}
      </div>
      <div className={`bd ${p.np ? 'np' : ''}`}>{p.children}</div>
    </section>
  );
}

export function Kpi(p: { l: string; v: ReactNode; s?: string; tone?: 'good' | 'bad' | '' }) {
  return (
    <div className={`kpi ${p.tone ?? ''}`}>
      <span>{p.l}</span>
      <b>{p.v}</b>
      {p.s ? <small title={p.s}>{p.s}</small> : null}
    </div>
  );
}

export function Seg<T extends string | number>(p: { value: T; opts: Array<[NoInfer<T>, ReactNode]>; onChange(v: NoInfer<T>): void; wrap?: boolean }) {
  return (
    <span className={`seg ${p.wrap ? 'wrap' : ''}`}>
      {p.opts.map(([v, l]) => (
        <button key={String(v)} aria-pressed={String(p.value) === String(v)} onClick={() => p.onChange(v)}>{l}</button>
      ))}
    </span>
  );
}

export const Help = ({ children }: { children: ReactNode }) => <p className="help">{children}</p>;

export function NoData({ what, why }: { what: string; why?: string }) {
  return <div className="nodata">자료 없음 · {what}{why ? <small>{why}</small> : null}</div>;
}

export const ScoreChip = ({ v }: { v: number }) => <span className="sc" style={{ background: rampCss(v / 100) }}>{Math.round(v)}</span>;

const OUT: Record<Outcome, string> = { success: '성공', partial: '부분 성공', failure: '실패' };
export const OutBadge = ({ o }: { o: Outcome }) => <span className={`badge ${o === 'success' ? 'ok' : o === 'partial' ? 'approx' : 'warn'}`}>{OUT[o]}</span>;

const TERR: Record<TerrainKind, [string, string]> = { site: ['지형 반영', 'ok'], grid: ['격자 근사', 'approx'], flat: ['지형 미반영', 'warn'] };
export const TerrBadge = ({ k }: { k: TerrainKind }) => <span className={`badge ${TERR[k][1]}`}>{TERR[k][0]}</span>;
export const terrLabel = (k: TerrainKind) => TERR[k][0];

export function Progress({ p }: { p: number | null }) {
  if (p == null) return null;
  return <div className="prog"><i style={{ width: `${Math.round(p * 100)}%` }} /></div>;
}

export const Empty = ({ children }: { children: ReactNode }) => <div className="empty">{children}</div>;

// ───────── 지도 레이어 고르기 ─────────
let openPop: ((anchor: HTMLElement) => void) | null = null;

export function LayerPickButton({ where }: { where: 'map' | 'rail' }) {
  const layer = useApp((s) => s.mapLayer);
  const l = LAYER_UI[layer] ?? LAYER_UI.composite;
  return (
    <button className="lpick" title="지도 레이어 고르기" onClick={(e) => { e.stopPropagation(); openPop?.(e.currentTarget); }} data-where={where}>
      <span className="g">{l.g}</span>
      <b>{l.name}</b>
      <span className="muted">▾</span>
    </button>
  );
}

export function LayerPopover() {
  const app = useApp();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [group, setGroup] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });
  useEffect(() => {
    openPop = (a) => { setAnchor(a); setGroup(null); };
    return () => { openPop = null; };
  }, []);
  useEffect(() => {
    if (!anchor) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAnchor(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAnchor(null); };
    document.addEventListener('click', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('click', close); document.removeEventListener('keydown', esc); };
  }, [anchor]);
  useEffect(() => {
    if (!anchor || !ref.current) return;
    const r = anchor.getBoundingClientRect(), pw = ref.current.offsetWidth, ph = ref.current.offsetHeight;
    setPos({ left: Math.max(12, Math.min(r.left, window.innerWidth - pw - 12)), top: r.bottom + 6 + ph > window.innerHeight ? Math.max(12, r.top - ph - 6) : r.bottom + 6 });
  }, [anchor, group]);
  if (!anchor) return null;
  const cur = LAYER_UI[app.mapLayer] ?? LAYER_UI.composite;
  const g = group ?? cur.g;
  const items = Object.values(LAYER_UI).filter((l) => l.g === g);
  return (
    <div className="pop" ref={ref} style={pos} onClick={(e) => e.stopPropagation()}>
      <div className="phd">
        <b>지도 레이어 고르기</b>
        <span className="small muted">초록 = 좋은 쪽 · 빨강 = 나쁜 쪽</span>
        <button className="ibtn" aria-label="닫기" style={{ width: 26, height: 26 }} onClick={() => setAnchor(null)}>✕</button>
      </div>
      <div className="grps">
        {LGROUPS.map((x) => (
          <button key={x} aria-selected={x === g} onClick={() => setGroup(x)}>{x} <span className="tiny muted">{Object.values(LAYER_UI).filter((l) => l.g === x).length}</span></button>
        ))}
      </div>
      <div className="items">
        {items.map((l: LayerUi) => (
          <button key={l.id} className="lopt" aria-pressed={app.mapLayer === l.id} onClick={() => { app.setMap({ mapLayer: l.id }); setAnchor(null); }}>
            <b>{l.name}{l.tag ? <> <span className="badge">{l.tag}</span></> : null}</b>
            <span className={`badge ${l.kind === '실제' ? 'ok' : ''}`}>{l.kind}</span>
            <p>{l.desc}</p>
            <span className="scale"><span>{l.lo}</span><i /><span>{l.hi}</span></span>
            <span className="meta"><span className="badge">해상도 {l.res}</span><span className="badge">출처 {l.src}</span>{l.warn ? <span className="badge warn">{l.warn}</span> : null}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ───────── 알림 ─────────
let toastFn: ((m: string) => void) | null = null;
export const toast = (m: string) => toastFn?.(m);
export function Toast() {
  const [m, setM] = useState<string | null>(null);
  useEffect(() => {
    let timer: number | undefined;
    toastFn = (x) => { setM(x); window.clearTimeout(timer); timer = window.setTimeout(() => setM(null), 1800); };
    return () => { toastFn = null; };
  }, []);
  return m ? <div className="toast">{m}</div> : null;
}

/** 아르테미스 후보 목록 연도 (2024 공식 경계 안 / 2022 발표만) */
export function ArtemisBadge({ v }: { v?: ArtemisVintage }) {
  if (!v) return null;
  return <span className={`badge ${v.year === 2024 ? 'art24' : 'art22'}`} title={vintageTitle(v)}>{vintageLabel(v)}</span>;
}
