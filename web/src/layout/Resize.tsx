// 파티션 크기 조절: 왼쪽 사이드바 폭 | 오른쪽 레일 폭 | 3D 달 높이(현장 뷰와의 경계).
// 손잡이를 끌면 CSS 변수(--side-w, --rail-w, --moon-h)를 바꾼다. 가운데 단계 화면과 현장 뷰가 일정 크기 아래로 줄지 않게 막아
// 전체 구성이 깨지지 않게 한다. 두 번 누르면 기본 크기로. 값은 이 브라우저에만 저장(편의 기능).
import { useEffect, useRef } from 'react';

type Kind = 'side' | 'rail' | 'moon';
const KEY = 'luna-nav.layout.v1';
/** 가운데 단계 화면 최소 폭, 현장 뷰 최소 높이 (px) */
const MIN_MAIN = 520, MIN_FIELD = 200;
const LIM = { side: [180, 340], rail: [300, 900], moon: [240, 2000] } as const;
const VAR: Record<Kind, string> = { side: '--side-w', rail: '--rail-w', moon: '--moon-h' };

type Sizes = Partial<Record<Kind, number>>;
function load(): Sizes { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Sizes; } catch { return {}; } }
function save(s: Sizes) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* 저장 못 해도 동작은 같다 */ } }

const px = (sel: string, dim: 'width' | 'height') => (document.querySelector(sel) as HTMLElement | null)?.getBoundingClientRect()[dim] ?? 0;

/** 지금 창 크기에서 허용하는 범위 */
function bounds(k: Kind): [number, number] {
  const [lo, hi] = LIM[k];
  if (k === 'side') return [lo, Math.max(lo, Math.min(hi, window.innerWidth - px('.rail', 'width') - MIN_MAIN))];
  if (k === 'rail') return [lo, Math.max(lo, Math.min(hi, window.innerWidth - px('.side', 'width') - MIN_MAIN))];
  return [lo, Math.max(lo, Math.min(hi, px('.rail', 'height') - MIN_FIELD))];
}

function apply(k: Kind, v: number | undefined) {
  const r = document.documentElement.style;
  if (v == null) r.removeProperty(VAR[k]);
  else r.setProperty(VAR[k], `${Math.round(v)}px`);
}

/** 저장된 크기를 처음 한 번 적용하고, 창 크기가 바뀌면 범위 안으로 다시 맞춘다 */
export function useLayoutSizes() {
  useEffect(() => {
    const fit = () => {
      const s = load();
      (Object.keys(VAR) as Kind[]).forEach((k) => { const v = s[k]; if (v == null) return apply(k, undefined); const [lo, hi] = bounds(k); apply(k, Math.max(lo, Math.min(hi, v))); });
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
}

export function Resizer({ kind }: { kind: Kind }) {
  const ref = useRef<HTMLDivElement>(null);
  const onDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const el = ref.current!;
    el.setPointerCapture(e.pointerId);
    el.classList.add('on'); document.body.classList.add('resizing');
    const start = kind === 'moon' ? e.clientY : e.clientX;
    const base = kind === 'side' ? px('.side', 'width') : kind === 'rail' ? px('.rail', 'width') : px('.moon', 'height');
    const [lo, hi] = bounds(kind);
    let v = base;
    const move = (ev: PointerEvent) => {
      const d = (kind === 'moon' ? ev.clientY : ev.clientX) - start;
      v = Math.max(lo, Math.min(hi, kind === 'rail' ? base - d : base + d));
      apply(kind, v);
    };
    const up = () => {
      el.classList.remove('on'); document.body.classList.remove('resizing');
      el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
      save({ ...load(), [kind]: v });
    };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  };
  const reset = () => { apply(kind, undefined); const s = load(); delete s[kind]; save(s); };
  const label = kind === 'side' ? '단계 목록 폭' : kind === 'rail' ? '오른쪽 3D 달·현장 뷰 폭' : '3D 달 높이';
  return <div ref={ref} className={`rsz ${kind === 'moon' ? 'h' : 'v'}`} role="separator" aria-orientation={kind === 'moon' ? 'horizontal' : 'vertical'} aria-label={`${label} 조절 (두 번 누르면 기본)`} title={`끌어서 ${label} 조절 · 두 번 누르면 기본 크기`} onPointerDown={onDown} onDoubleClick={reset} />;
}
