// 화면 언어 (기본 영어). 화면 문구는 한국어로 쓰여 있고, 영어일 때 i18n-en.ts 표로 화면의 글자를 바꾼다.
// - 글자(텍스트 노드)와 title · aria-label · placeholder 속성을 바꾼다. 입력칸 값은 건드리지 않는다.
// - 캔버스 글자(fillText)도 같은 표로 바꾼다.
// - 표에 없는 문구는 한국어로 남는다. "한국어 (English)" 꼴 이름은 괄호 안 영어를 쓴다.
import { create } from 'zustand';
import { EN } from './i18n-en';

export type Lang = 'en' | 'ko';
const HANGUL = /[가-힣]/;
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const KEYS = Object.keys(EN).sort((a, b) => b.length - a.length);
const RE = new RegExp(KEYS.map(escRe).join('|'), 'g');
const PAREN = /^[^()]*[가-힣][^()]*\(([^()가-힣]+)\)$/;

let cur: Lang = 'en';
try { const v = localStorage.getItem('dune.lang'); if (v === 'ko' || v === 'en') cur = v; } catch { /* 저장소를 못 쓰면 기본값 */ }

/** 한 문자열을 지금 언어로 */
export function tx(s: string): string {
  if (cur !== 'en' || !s || !HANGUL.test(s)) return s;
  const t = s.trim();
  if (EN[t] !== undefined) return s.replace(t, EN[t]);
  const m = t.match(PAREN);
  if (m && !HANGUL.test(m[1])) return s.replace(t, m[1].trim());
  // "한국어 (English)" 가 문장 안에 있거나 잘려 있으면: 괄호 안 영어만 남기거나, 잘린 괄호는 버린다
  const s2 = s.replace(/[가-힣][가-힣0-9 -]*?\s*\(([A-Za-z][^()가-힣]*)\)/g, '$1').replace(/([가-힣][가-힣0-9 -]*?)\s*\([A-Za-z][^()가-힣]*$/, '$1');
  return s2.replace(RE, (k) => EN[k]);
}

// ── 화면 글자 바꾸기 ──
const ATTRS = ['title', 'aria-label', 'placeholder'] as const;
const srcText = new WeakMap<Node, string>(); // 원문
const shown = new WeakMap<Node, string>(); // 우리가 넣은 값
const srcAttr = new WeakMap<Element, Record<string, string>>();
const shownAttr = new WeakMap<Element, Record<string, string>>();

function doText(n: Text) {
  const v = n.nodeValue ?? '';
  const src = shown.get(n) === v ? srcText.get(n) ?? v : v; // 리액트가 새 값을 넣었으면 그게 원문
  srcText.set(n, src);
  const out = tx(src);
  shown.set(n, out);
  if (out !== v) n.nodeValue = out;
}
function doAttrs(el: Element) {
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (v == null) continue;
    const sa = srcAttr.get(el) ?? {}, sh = shownAttr.get(el) ?? {};
    const src = sh[a] === v ? sa[a] ?? v : v;
    sa[a] = src; srcAttr.set(el, sa);
    const out = tx(src);
    sh[a] = out; shownAttr.set(el, sh);
    if (out !== v) el.setAttribute(a, out);
  }
}
function walk(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) { doText(root as Text); return; }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const el = root as Element;
  if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') return;
  doAttrs(el);
  const it = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = it.nextNode(); n; n = it.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) { const p = n.parentElement; if (p && (p.tagName === 'SCRIPT' || p.tagName === 'STYLE')) continue; doText(n as Text); }
    else doAttrs(n as Element);
  }
}

const TITLE_KO = document.title;
function applyDoc() {
  document.documentElement.lang = cur === 'en' ? 'en-GB' : 'ko';
  document.title = tx(TITLE_KO);
}

let started = false;
export function startI18n() {
  if (started) return;
  started = true;
  // 캔버스 글자
  const P = CanvasRenderingContext2D.prototype;
  const fill = P.fillText, stroke = P.strokeText, measure = P.measureText;
  P.fillText = function (this: CanvasRenderingContext2D, t: string, x: number, y: number, w?: number) { return w === undefined ? fill.call(this, tx(String(t)), x, y) : fill.call(this, tx(String(t)), x, y, w); };
  P.strokeText = function (this: CanvasRenderingContext2D, t: string, x: number, y: number, w?: number) { return w === undefined ? stroke.call(this, tx(String(t)), x, y) : stroke.call(this, tx(String(t)), x, y, w); };
  P.measureText = function (this: CanvasRenderingContext2D, t: string) { return measure.call(this, tx(String(t))); };
  applyDoc();
  walk(document.body);
  new MutationObserver((ms) => {
    for (const m of ms) {
      if (m.type === 'characterData') doText(m.target as Text);
      else if (m.type === 'attributes') doAttrs(m.target as Element);
      else m.addedNodes.forEach((n) => walk(n));
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] });
}

export const useLang = create<{ lang: Lang; setLang(l: Lang): void }>((set) => ({
  lang: cur,
  setLang: (l) => {
    cur = l;
    try { localStorage.setItem('dune.lang', l); } catch { /* 무시 */ }
    applyDoc();
    walk(document.body);
    set({ lang: l });
  },
}));
