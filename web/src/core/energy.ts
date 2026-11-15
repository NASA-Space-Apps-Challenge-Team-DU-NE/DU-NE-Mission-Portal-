// 에너지 수지 시뮬레이션 (묶음 E, CLAUDE.md 8.8). 타임랩스·임무 시뮬레이션 공용.
import { DARK_FRAC } from './constants';
import { mountIrradiance } from './horizon';
import { intervalHours } from './timeline';
import type { Lander, Requirements, TimeMs, TimelineSample } from './types';

export const CHARGE_EFF = 0.9;
export const START_SOC = 0.8;

export interface SimSystem {
  panel_area_m2: number;
  efficiency: number;
  loss: number;
  mount: Lander['mount'];
  panel_azimuth_deg?: number;
  battery_wh: number;
  battery_min_fraction: number;
  load_active_w: number;
  load_idle_w: number;
  load_survival_w: number;
  rate_kbps: number;
  /** 발전 방식. 'constant' 는 햇빛과 무관한 정격 출력(연료전지·RTG·핵분열). 없으면 태양전지 */
  source?: 'solar' | 'constant';
  /** source='constant' 정격 출력 (W) */
  const_w?: number;
  /** source='constant' 쓸 수 있는 연료 에너지 (Wh). 없거나 null 이면 무제한(RTG·핵분열) */
  fuel_wh?: number | null;
}

export function systemFromLander(l: Lander, loss = 0.1): SimSystem {
  return {
    panel_area_m2: l.panel_area_m2,
    efficiency: l.efficiency,
    loss,
    mount: l.mount,
    panel_azimuth_deg: l.panel_azimuth_deg,
    battery_wh: l.battery_wh,
    battery_min_fraction: l.battery_min_fraction,
    load_active_w: l.load_active_w,
    load_idle_w: l.load_idle_w,
    load_survival_w: l.load_survival_w,
    rate_kbps: l.rate_kbps,
  };
}

export type StopCause = 'sun_blocked' | 'earth_blocked' | 'over_consumption';
export type Verdict = 'met' | 'partial' | 'not_met';

export interface SimResult {
  t: TimeMs[];
  soc: Float32Array;
  gen_w: Float32Array;
  load_w: Float32Array;
  sent_mb: Float32Array;
  comm: Uint8Array;
  ops_h: number;
  total_sent_mb: number;
  verdict: Verdict;
  /** 배터리 하한에 처음 닿은 시각 */
  stop_t: TimeMs | null;
  stop_index: number | null;
  stop_cause: StopCause | null;
}

const fin = (v: unknown, lo = 0) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, v) : lo);

/** 유한값·허용범위 검사: 음수·NaN·빈 입력은 0, 비율은 0~1 */
export function sanitizeSystem(sys: SimSystem): SimSystem {
  return {
    ...sys,
    panel_area_m2: fin(sys.panel_area_m2),
    efficiency: Math.min(1, fin(sys.efficiency)),
    loss: Math.min(1, fin(sys.loss)),
    battery_wh: fin(sys.battery_wh),
    battery_min_fraction: Math.min(1, fin(sys.battery_min_fraction)),
    load_active_w: fin(sys.load_active_w),
    load_idle_w: fin(sys.load_idle_w),
    load_survival_w: fin(sys.load_survival_w),
    rate_kbps: fin(sys.rate_kbps),
    const_w: fin(sys.const_w),
    fuel_wh: sys.fuel_wh == null ? null : fin(sys.fuel_wh),
  };
}

/**
 * 표본 i 의 상태로 구간 [t_i, t_{i+1}) 을 적분한다. soc[i] 는 t_i 시점(소비 전) 값.
 * 운용은 (배터리 여유 + 발전)으로 부하를 감당할 수 있는 동안만 이어지고,
 * 구간 중간에 하한에 닿으면 그 시각을 보간해 멈춘다. 0 Wh 배터리는 발전 ≥ 부하인 동안만 운용(태양광 직결).
 */
export function simulate(samples: TimelineSample[], _step_h: number, sysIn: SimSystem, req: Pick<Requirements, 'min_ops_h' | 'data_mb'>): SimResult {
  const sys = sanitizeSystem(sysIn);
  const n = samples.length;
  const w = intervalHours(samples);
  const soc = new Float32Array(n), gen = new Float32Array(n), load = new Float32Array(n), sent = new Float32Array(n), comm = new Uint8Array(n);
  const cap = sys.battery_wh;
  let E = START_SOC * cap;
  const minE = sys.battery_min_fraction * cap;
  let ops = 0, mb = 0;
  let stopIdx: number | null = null, stopT: TimeMs | null = null;
  const charge = (e: number, net: number, h: number) => Math.min(cap, Math.max(0, e + net * h * (net > 0 ? CHARGE_EFF : 1)));
  const constant = sys.source === 'constant';
  let fuel = sys.fuel_wh ?? Infinity;
  for (let i = 0; i < n; i++) {
    const s = samples[i];
    const dt = w[i];
    // 햇빛과 무관한 발전: 연료가 남은 동안 정격 출력 (구간 중간에 바닥나면 그 구간 평균으로)
    let pg: number;
    if (constant) {
      const cw = sys.const_w ?? 0;
      pg = dt > 0 && cw * dt > fuel ? fuel / dt : fuel > 0 ? cw : 0;
      fuel = Math.max(0, fuel - pg * dt);
    } else pg = mountIrradiance(s.sun, s.sun_frac, sys.mount, sys.panel_azimuth_deg) * sys.panel_area_m2 * sys.efficiency * (1 - sys.loss);
    const pl = s.earth_visible ? sys.load_active_w : sys.load_idle_w;
    soc[i] = cap > 0 ? E / cap : 0;
    gen[i] = pg;
    comm[i] = s.earth_visible ? 1 : 0;
    // 운용 가능한 시간 비율 f (0~1)
    let f: number;
    if (pg >= pl) f = 1;
    else if (E <= minE) f = 0;
    else f = dt > 0 ? Math.min(1, (E - minE) / (pl - pg) / dt) : 1;
    load[i] = f * pl + (1 - f) * sys.load_survival_w;
    if (dt > 0) {
      E = charge(E, pg - pl, f * dt);
      if (f < 1) E = charge(E, pg - sys.load_survival_w, (1 - f) * dt);
      ops += f * dt;
      if (s.earth_visible) mb += (sys.rate_kbps * 3600 * f * dt) / 8000;
      if (stopIdx === null && f < 1) { stopIdx = i; stopT = s.t + f * dt * 3_600_000; }
    }
    sent[i] = mb;
  }
  const opsOk = ops >= req.min_ops_h, dataOk = mb >= req.data_mb;
  return {
    t: samples.map((s) => s.t),
    soc, gen_w: gen, load_w: load, sent_mb: sent, comm,
    ops_h: ops,
    total_sent_mb: mb,
    verdict: opsOk && dataOk ? 'met' : opsOk || dataOk ? 'partial' : 'not_met',
    stop_t: stopT,
    stop_index: stopIdx,
    stop_cause: stopIdx === null ? null : constant ? (samples[stopIdx].earth_visible ? 'over_consumption' : stopCauseNoSun(samples, stopIdx, w[0] > 0 ? w[0] : 1)) : stopCause(samples, stopIdx, w[0] > 0 ? w[0] : 1),
  };
}

/** 햇빛과 무관한 발전: 일조 차단은 원인이 될 수 없다 (지구 가림 또는 소비 과다) */
function stopCauseNoSun(samples: TimelineSample[], idx: number, step_h: number): StopCause {
  const k = Math.max(1, Math.round(12 / step_h));
  let noComm = 0, c = 0;
  for (let i = Math.max(0, idx - k + 1); i <= idx; i++) { c++; if (!samples[i].earth_visible) noComm++; }
  return noComm > c / 2 ? 'earth_blocked' : 'over_consumption';
}

/** 직전 12 h: frac≈0 과반 → 일조 차단, 교신 불가 과반 → 지구 가림, 그 외 소비 과다 */
export function stopCause(samples: TimelineSample[], idx: number, step_h: number): StopCause {
  const k = Math.max(1, Math.round(12 / step_h));
  const from = Math.max(0, idx - k + 1);
  let dark = 0, noComm = 0, c = 0;
  for (let i = from; i <= idx; i++) {
    c++;
    if (samples[i].sun_frac <= DARK_FRAC) dark++;
    if (!samples[i].earth_visible) noComm++;
  }
  if (dark > c / 2) return 'sun_blocked';
  if (noComm > c / 2) return 'earth_blocked';
  return 'over_consumption';
}

// ───────── 1년 기지 시뮬레이션 (P1-32) ─────────
export interface BaseLoads {
  habitat_kw: number;
  isru_kw: number;
  constant_kw: number;
}
export interface BaseSystem {
  panel_area_m2: number;
  efficiency: number;
  loss: number;
  battery_kwh: number;
  isru_off_below: number;
  isru_on_above: number;
}
export interface BaseEvent {
  t: TimeMs;
  kind: 'blackout_start' | 'blackout_end' | 'isru_off' | 'isru_on' | 'comm_lost' | 'comm_back';
}
export interface BaseSimResult {
  t: TimeMs[];
  soc: Float32Array;
  gen_kw: Float32Array;
  load_kw: Float32Array;
  uptime: number;
  blackout_h: number;
  comm_gap_h: number;
  isru_uptime: number;
  events: BaseEvent[];
}

/** 기지 입력은 잘못된 수치를 정상 결과로 바꾸지 않고 UI·Worker에서 같은 규칙으로 거부한다. */
export function baseInputError(loads: BaseLoads, sys: BaseSystem): string | null {
  const input = { ...loads, ...sys };
  for (const key of ['habitat_kw', 'isru_kw', 'constant_kw', 'panel_area_m2', 'efficiency', 'loss', 'battery_kwh', 'isru_off_below', 'isru_on_above'] as const) {
    const value = input[key];
    if (!Number.isFinite(value) || value < 0) return `invalid base input: ${key} must be finite and non-negative`;
  }
  for (const key of ['efficiency', 'loss', 'isru_off_below', 'isru_on_above'] as const) {
    if (sys[key] > 1) return `invalid base input: ${key} must be between 0 and 1`;
  }
  if (sys.isru_off_below > sys.isru_on_above) return 'invalid base input: ISRU off threshold must not exceed on threshold';
  return null;
}

export function simulateBase(samples: TimelineSample[], _step_h: number, loads: BaseLoads, sys: BaseSystem): BaseSimResult {
  const inputError = baseInputError(loads, sys);
  if (inputError) throw new RangeError(inputError);
  const n = samples.length;
  const w = intervalHours(samples);
  const soc = new Float32Array(n), gen = new Float32Array(n), load = new Float32Array(n);
  const cap = sys.battery_kwh;
  let E = START_SOC * cap;
  let isru = true, black = false, commOk = true;
  let upH = 0, blackH = 0, gapH = 0, isruH = 0;
  const events: BaseEvent[] = [];
  let total = 0;
  for (let i = 0; i < n; i++) {
    const s = samples[i];
    const step_h = w[i];
    total += step_h;
    const pg = (s.irr_vertical_w_m2 * sys.panel_area_m2 * sys.efficiency * (1 - sys.loss)) / 1000;
    const frac = cap > 0 ? E / cap : 0;
    soc[i] = frac; // t_i의 소비 전 값. 마지막 표본은 실제 종료 SOC다.
    if (isru && frac < sys.isru_off_below) { isru = false; events.push({ t: s.t, kind: 'isru_off' }); }
    else if (!isru && frac >= sys.isru_on_above) { isru = true; events.push({ t: s.t, kind: 'isru_on' }); }
    const pl = loads.habitat_kw + loads.constant_kw + (isru ? loads.isru_kw : 0);
    const net = pg - pl;
    const up = net < 0 ? Math.min(step_h, E / -net) : step_h;
    if (step_h > 0) {
      if (black && up > 0) { black = false; events.push({ t: s.t, kind: 'blackout_end' }); }
      if (up < step_h && !black) { black = true; events.push({ t: s.t + up * 3_600_000, kind: 'blackout_start' }); }
      upH += up;
      blackH += step_h - up;
      if (isru) isruH += up;
      E = Math.min(cap, Math.max(0, E + net * step_h * (net > 0 ? CHARGE_EFF : 1)));
    }
    if (commOk && !s.earth_visible) { commOk = false; events.push({ t: s.t, kind: 'comm_lost' }); }
    if (!commOk && s.earth_visible) { commOk = true; events.push({ t: s.t, kind: 'comm_back' }); }
    if (!s.earth_visible) gapH += step_h;
    gen[i] = pg;
    load[i] = pl;
  }
  events.sort((a, b) => a.t - b.t); // 보간된 정전 시각과 표본 시각의 교신 이벤트를 시간순으로 병합
  return { t: samples.map((s) => s.t), soc, gen_kw: gen, load_kw: load, uptime: total > 0 ? upH / total : 0, blackout_h: blackH, comm_gap_h: gapH, isru_uptime: total > 0 ? isruH / total : 0, events };
}
