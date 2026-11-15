// 점수 색 (CLAUDE.md 9.1): #d07166 → #d3a05c → #2b8f85. 색만으로 의미를 전달하지 않는다.
export type RGB = [number, number, number];
const BAD: RGB = [0xd0, 0x71, 0x66];
const MID: RGB = [0xd3, 0xa0, 0x5c];
const GOOD: RGB = [0x2b, 0x8f, 0x85];

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** v: 0(나쁨)~1(좋음) */
export function scoreColor(v: number): RGB {
  const t = Math.max(0, Math.min(1, v));
  return t < 0.5 ? mix(BAD, MID, t / 0.5) : mix(MID, GOOD, (t - 0.5) / 0.5);
}

/** 연속값 레이어용 (어두운 남색 → 청록 → 밝은 모래색) */
export function rampColor(v: number): RGB {
  const t = Math.max(0, Math.min(1, v));
  const A: RGB = [0x10, 0x2c, 0x39], B: RGB = [0x2e, 0x8b, 0x83], C: RGB = [0xf3, 0xe3, 0xb5];
  return t < 0.5 ? mix(A, B, t / 0.5) : mix(B, C, (t - 0.5) / 0.5);
}

export const rgbCss = (c: RGB, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
