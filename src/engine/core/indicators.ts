/**
 * Causal per-instrument feature arrays. Every value at index i depends only on bars 0..i.
 * Arrays are Float64Array, NaN until warm. Periods count bars (trading days the stock traded),
 * the same way Chartink and TradingView count them.
 *
 * RULEBOOK "Numeric glossary" (RVol gmCnvstswjw; turnover wnhGCYBk4Gg; ADR wnhGCYBk4Gg).
 */
import type { Bar } from './types.js';
import { requiredEmaPeriods, type StrategyConfig } from './config.js';

/**
 * EMA seeded with the SMA of the first `period` values (TradingView `ta.ema`). NaN before index period−1.
 * Inputs must be finite.
 */
export function ema(values: ArrayLike<number>, period: number): Float64Array {
  const n = values.length;
  const out = new Float64Array(n).fill(NaN);
  if (period < 1 || n < period) return out;
  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i] as number;
  let prev = sum / period;
  out[period - 1] = prev;
  for (let i = period; i < n; i++) {
    prev = prev + k * ((values[i] as number) - prev);
    out[i] = prev;
  }
  return out;
}

/** Simple moving average over a window that includes today (Chartink SMA). NaN before index period−1. */
export function sma(values: ArrayLike<number>, period: number): Float64Array {
  const n = values.length;
  const out = new Float64Array(n).fill(NaN);
  if (period < 1) return out;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += values[i] as number;
    if (i >= period) sum -= values[i - period] as number;
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/**
 * Rolling max over the last `period` values incl. today (monotonic deque, O(n)).
 * NaN until `minPeriod` values exist (default = period); shorter histories use what exists.
 */
export function rollingMax(values: ArrayLike<number>, period: number, minPeriod = period): Float64Array {
  return rollingExtreme(values, period, minPeriod, true);
}

/** Rolling min, see rollingMax. */
export function rollingMin(values: ArrayLike<number>, period: number, minPeriod = period): Float64Array {
  return rollingExtreme(values, period, minPeriod, false);
}

function rollingExtreme(values: ArrayLike<number>, period: number, minPeriod: number, isMax: boolean): Float64Array {
  const n = values.length;
  const out = new Float64Array(n).fill(NaN);
  const dq = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < n; i++) {
    const v = values[i] as number;
    while (tail > head) {
      const last = values[dq[tail - 1] as number] as number;
      if (isMax ? last <= v : last >= v) tail--;
      else break;
    }
    dq[tail++] = i;
    while ((dq[head] as number) <= i - period) head++;
    if (i + 1 >= minPeriod) out[i] = values[dq[head] as number] as number;
  }
  return out;
}

/** Range% = (high − low) / close × 100. */
export function rangePctOf(high: number, low: number, close: number): number {
  return ((high - low) / close) * 100;
}

/** Change% = (close / prevClose − 1) × 100. NaN if prevClose ≤ 0. */
export function changePctOf(close: number, prevClose: number): number {
  return prevClose > 0 ? (close / prevClose - 1) * 100 : NaN;
}

/** values[i − n], or NaN when out of range. */
export function barsAgo(values: ArrayLike<number>, i: number, n: number): number {
  const j = i - n;
  return j >= 0 && j < values.length ? (values[j] as number) : NaN;
}

/**
 * Least-squares slope of values[from..to] (inclusive) per bar, as % of the mean value.
 * NaN if fewer than 2 points. RULEBOOK Flag "Slope" (D-UPlB1XQOk) — APPROX via regression.
 */
export function linRegSlopePct(values: ArrayLike<number>, from: number, to: number): number {
  const m = to - from + 1;
  if (m < 2 || from < 0 || to >= values.length) return NaN;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (let k = 0; k < m; k++) {
    const y = values[from + k] as number;
    sx += k;
    sy += y;
    sxx += k * k;
    sxy += k * y;
  }
  const den = m * sxx - sx * sx;
  const slope = (m * sxy - sx * sy) / den;
  const mean = sy / m;
  return (slope / mean) * 100;
}

/** Per-instrument features. All arrays have length n = bars.length. */
export interface Features {
  readonly n: number;
  readonly bars: readonly Bar[];
  readonly open: Float64Array;
  readonly high: Float64Array;
  readonly low: Float64Array;
  readonly close: Float64Array;
  readonly volume: Float64Array;
  /** Previous close per the bar's prevClose (falls back to the previous bar's close if missing). */
  readonly prevClose: Float64Array;
  /** EMA by period (10, 20, 50 and every trailing period in config). */
  readonly ema: ReadonlyMap<number, Float64Array>;
  readonly ema10: Float64Array;
  readonly ema20: Float64Array;
  readonly ema50: Float64Array;
  /** EMA200 (stage-2 / trend template for bases). NaN for the first 199 bars. */
  readonly ema200: Float64Array;
  /** SMA(close, 50). */
  readonly sma50: Float64Array;
  /** SMA(volume, 50), window includes today (Chartink). */
  readonly volSma50: Float64Array;
  /** RVol = volume / SMA50(volume) × 100 (RULEBOOK glossary, gmCnvstswjw). */
  readonly rvol: Float64Array;
  /** SMA50(volume) × close / 1e7 (₹ Cr) — Ankur's liquidity measure (wnhGCYBk4Gg). */
  readonly turnover50Cr: Float64Array;
  /** 20-bar average of (high/low − 1) × 100. */
  readonly adr20: Float64Array;
  readonly rangePct: Float64Array;
  readonly changePct: Float64Array;
  /** Max high over `ranking.highLookbackBars` (uses fewer bars for young stocks). */
  readonly highestHigh: Float64Array;
  /** Min low over `universe.runUpLookbackBars` (uses fewer bars for young stocks). */
  readonly lowestLowRunUp: Float64Array;
}

export const SMA_PERIOD = 50;
export const ADR_PERIOD = 20;

/** Get an EMA array by period; throws if it was not computed (config/feature mismatch). */
export function emaOf(f: Features, period: number): Float64Array {
  const a = f.ema.get(period);
  if (!a) throw new Error(`EMA(${period}) not computed`);
  return a;
}

/** Compute all features for one instrument's bars (ascending). Pure and causal. */
export function computeFeatures(bars: readonly Bar[], cfg: StrategyConfig): Features {
  const n = bars.length;
  const open = new Float64Array(n);
  const high = new Float64Array(n);
  const low = new Float64Array(n);
  const close = new Float64Array(n);
  const volume = new Float64Array(n);
  const prevClose = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const b = bars[i] as Bar;
    open[i] = b.open;
    high[i] = b.high;
    low[i] = b.low;
    close[i] = b.close;
    volume[i] = b.volume;
    prevClose[i] = b.prevClose > 0 ? b.prevClose : i > 0 ? (bars[i - 1] as Bar).close : NaN;
  }
  const emaMap = new Map<number, Float64Array>();
  for (const p of requiredEmaPeriods(cfg)) emaMap.set(p, ema(close, p));
  const sma50 = sma(close, SMA_PERIOD);
  const volSma50 = sma(volume, SMA_PERIOD);
  const rvol = new Float64Array(n);
  const turnover50Cr = new Float64Array(n);
  const rangePct = new Float64Array(n);
  const changePct = new Float64Array(n);
  const hlPct = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const vs = volSma50[i] as number;
    const c = close[i] as number;
    rvol[i] = vs > 0 ? ((volume[i] as number) / vs) * 100 : NaN;
    turnover50Cr[i] = (vs * c) / 1e7;
    rangePct[i] = rangePctOf(high[i] as number, low[i] as number, c);
    changePct[i] = changePctOf(c, prevClose[i] as number);
    const l = low[i] as number;
    hlPct[i] = l > 0 ? ((high[i] as number) / l - 1) * 100 : 0;
  }
  const adr20 = sma(hlPct, ADR_PERIOD);
  const highestHigh = rollingMax(high, cfg.ranking.highLookbackBars, 1);
  const lowestLowRunUp = rollingMin(low, cfg.universe.runUpLookbackBars, 1);
  return {
    n,
    bars,
    open,
    high,
    low,
    close,
    volume,
    prevClose,
    ema: emaMap,
    ema10: emaOf2(emaMap, 10),
    ema20: emaOf2(emaMap, 20),
    ema50: emaOf2(emaMap, 50),
    ema200: emaOf2(emaMap, 200),
    sma50,
    volSma50,
    rvol,
    turnover50Cr,
    adr20,
    rangePct,
    changePct,
    highestHigh,
    lowestLowRunUp,
  };
}

function emaOf2(m: Map<number, Float64Array>, p: number): Float64Array {
  const a = m.get(p);
  if (!a) throw new Error(`EMA(${p}) not computed`);
  return a;
}

/** Min of values[from..to] inclusive (NaN if empty range). */
export function minOf(values: ArrayLike<number>, from: number, to: number): number {
  if (from > to || from < 0) return NaN;
  let m = Infinity;
  for (let k = from; k <= to; k++) {
    const v = values[k] as number;
    if (v < m) m = v;
  }
  return m;
}

/** Max of values[from..to] inclusive (NaN if empty range). */
export function maxOf(values: ArrayLike<number>, from: number, to: number): number {
  if (from > to || from < 0) return NaN;
  let m = -Infinity;
  for (let k = from; k <= to; k++) {
    const v = values[k] as number;
    if (v > m) m = v;
  }
  return m;
}
