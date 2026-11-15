// 에너지 수지 시뮬레이션 (묶음 E, CLAUDE.md 8.8). 타임랩스·임무 시뮬레이션 공용.
import { DARK_FRAC } from './constants';
import { mountIrradiance } from './horizon';
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

export function simulate(samples: TimelineSample[], step_h: number, sys: SimSystem, req: Pick<Requirements, 'min_ops_h' | 'data_mb'>): SimResult {
  const n = samples.length;
  const soc = new Float32Array(n), gen = new Float32Array(n), load = new Float32Array(n), sent = new Float32Array(n), comm = new Uint8Array(n);
  let E = START_SOC * sys.battery_wh;
  const minE = sys.battery_min_fraction * sys.battery_wh;
  let ops = 0, mb = 0;
  let stopIdx: number | null = null;
  for (let i = 0; i < n; i++) {
    const s = samples[i];
    const pg = mountIrradiance(s.sun, s.sun_frac, sys.mount, sys.panel_azimuth_deg) * sys.panel_area_m2 * sys.efficiency * (1 - sys.loss);
    const survival = E < minE;
    const active = !survival && s.earth_visible;
    const pl = survival ? sys.load_survival_w : active ? sys.load_active_w : sys.load_idle_w;
    const net = pg - pl;
    E = Math.min(sys.battery_wh, Math.max(0, E + net * step_h * (net > 0 ? CHARGE_EFF : 1)));
    if (!survival) ops += step_h;
    if (active) mb += (sys.rate_kbps * 3600 * step_h) / 8000;
    gen[i] = pg;
    load[i] = pl;
    soc[i] = sys.battery_wh > 0 ? E / sys.battery_wh : 0;
    sent[i] = mb;
    comm[i] = s.earth_visible ? 1 : 0;
    if (stopIdx === null && E <= minE) stopIdx = i;
  }
  const opsOk = ops >= req.min_ops_h, dataOk = mb >= req.data_mb;
  return {
    t: samples.map((s) => s.t),
    soc, gen_w: gen, load_w: load, sent_mb: sent, comm,
    ops_h: ops,
    total_sent_mb: mb,
    verdict: opsOk && dataOk ? 'met' : opsOk || dataOk ? 'partial' : 'not_met',
    stop_t: stopIdx === null ? null : samples[stopIdx].t,
    stop_index: stopIdx,
    stop_cause: stopIdx === null ? null : stopCause(samples, stopIdx, step_h),
  };
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

export function simulateBase(samples: TimelineSample[], step_h: number, loads: BaseLoads, sys: BaseSystem): BaseSimResult {
  const n = samples.length;
  const soc = new Float32Array(n), gen = new Float32Array(n), load = new Float32Array(n);
  const cap = sys.battery_kwh;
  let E = START_SOC * cap;
  let isru = true, black = false, commOk = true;
  let upH = 0, blackH = 0, gapH = 0, isruH = 0;
  const events: BaseEvent[] = [];
  for (let i = 0; i < n; i++) {
    const s = samples[i];
    const pg = (s.irr_vertical_w_m2 * sys.panel_area_m2 * sys.efficiency * (1 - sys.loss)) / 1000;
    const frac = cap > 0 ? E / cap : 0;
    if (isru && frac < sys.isru_off_below) { isru = false; events.push({ t: s.t, kind: 'isru_off' }); }
    else if (!isru && frac >= sys.isru_on_above) { isru = true; events.push({ t: s.t, kind: 'isru_on' }); }
    const pl = loads.habitat_kw + loads.constant_kw + (isru ? loads.isru_kw : 0);
    const net = pg - pl;
    const next = E + net * step_h * (net > 0 ? CHARGE_EFF : 1);
    const out = next < 0;
    E = Math.min(cap, Math.max(0, next));
    if (out && !black) { black = true; events.push({ t: s.t, kind: 'blackout_start' }); }
    if (!out && black && net >= 0) { black = false; events.push({ t: s.t, kind: 'blackout_end' }); }
    if (black) blackH += step_h; else upH += step_h;
    if (isru && !black) isruH += step_h;
    if (commOk && !s.earth_visible) { commOk = false; events.push({ t: s.t, kind: 'comm_lost' }); }
    if (!commOk && s.earth_visible) { commOk = true; events.push({ t: s.t, kind: 'comm_back' }); }
    if (!s.earth_visible) gapH += step_h;
    soc[i] = cap > 0 ? E / cap : 0;
    gen[i] = pg;
    load[i] = pl;
  }
  const total = n * step_h;
  return { t: samples.map((s) => s.t), soc, gen_kw: gen, load_kw: load, uptime: upH / total, blackout_h: blackH, comm_gap_h: gapH, isru_uptime: isruH / total, events };
}
