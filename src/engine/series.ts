/** Helpers to turn the aligned store into per-stock bar arrays (traded sessions only) and simple indicators. */
import type { Bar } from "./core/types";
import type { PriceStore, Stage, StockSeries } from "./types";

export interface Compact {
  dates: string[];
  /** Index of each bar in store.dates. */
  gidx: number[];
  open: number[];
  high: number[];
  low: number[];
  close: number[];
  volume: number[];
}

export function compact(store: PriceStore, s: StockSeries): Compact {
  const out: Compact = { dates: [], gidx: [], open: [], high: [], low: [], close: [], volume: [] };
  for (let k = 0; k < store.dates.length; k++) {
    const c = s.c[k];
    if (c === null || c === undefined) continue;
    out.dates.push(store.dates[k] as string);
    out.gidx.push(k);
    out.open.push(s.o[k] ?? c);
    out.high.push(s.h[k] ?? c);
    out.low.push(s.l[k] ?? c);
    out.close.push(c);
    out.volume.push(s.v[k] ?? 0);
  }
  return out;
}

/** Bars in the shape livermore's rule engine expects. */
export function toBars(cp: Compact, s: StockSeries): Bar[] {
  return cp.dates.map((date, j) => ({
    date,
    open: cp.open[j] as number,
    high: cp.high[j] as number,
    low: cp.low[j] as number,
    close: cp.close[j] as number,
    prevClose: j > 0 ? (cp.close[j - 1] as number) : 0,
    volume: cp.volume[j] as number,
    turnover: (cp.volume[j] as number) * (cp.close[j] as number),
    trades: null,
    series: s.series,
    priceBand: s.band,
  }));
}

/** Simple moving average; NaN until `period` values exist. */
export function smaArr(values: readonly number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(Number.NaN);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i] as number;
    if (i >= period) sum -= values[i - period] as number;
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function maxIn(values: readonly number[], from: number, to: number): number {
  let m = -Infinity;
  for (let j = Math.max(0, from); j <= to; j++) m = Math.max(m, values[j] as number);
  return m;
}

export function minIn(values: readonly number[], from: number, to: number): number {
  let m = Infinity;
  for (let j = Math.max(0, from); j <= to; j++) m = Math.min(m, values[j] as number);
  return m;
}

/** % return over n bars, null without enough history. */
export function retPct(close: readonly number[], i: number, n: number): number | null {
  const j = i - n;
  if (j < 0) return null;
  return ((close[i] as number) / (close[j] as number) - 1) * 100;
}

/**
 * Stan Weinstein's stages from the 30-week (≈150-day) average: 2 = price above a rising average, 4 = below a falling
 * one; with a flat average, 3 if it was rising before (a top), 1 if not (a base). Rising/falling = more than ±1% over
 * 20 sessions.
 */
export function stageAt(close: readonly number[], ma150: readonly number[], i: number): Stage | null {
  const m = ma150[i] as number;
  const m20 = ma150[i - 20];
  if (!Number.isFinite(m) || m20 === undefined || !Number.isFinite(m20)) return null;
  const slope = m / m20 - 1;
  const c = close[i] as number;
  if (slope > 0.01) return c > m ? 2 : 3;
  if (slope < -0.01) return c < m ? 4 : 1;
  const m60 = ma150[i - 60];
  const prior = m60 !== undefined && Number.isFinite(m60) ? m20 / m60 - 1 : 0;
  return prior > 0.02 ? 3 : 1;
}

export function median(xs: number[]): number {
  if (!xs.length) return Number.NaN;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}

/** A rally ("leg"): a rise of at least 20% (closes) not interrupted by a pullback of 10% or more. */
export const RALLY_MIN_RISE_PCT = 20;
export const RALLY_PULLBACK_PCT = 10;
/** Ankur: "no buys after leg 2", "3–4 legs (2 if parabolic) = extended" (livermore RULEBOOK "Momentum cycle"). The
 * entry-timing study found rallies of 80%+ followed by weaker 20-day returns. */
export const LATE_RALLIES = 3;
export const PARABOLIC_RALLY_PCT = 80;

export interface RallyCount {
  /** Rallies since `from` (the current one included if it has reached the minimum rise). */
  count: number;
  /** Size of the largest rally (%), low close → high close. */
  largestPct: number;
  /** Size of the latest rally (%), or 0 if none yet. */
  lastPct: number;
}

/** Count rallies in close[from..to]: up-swings of ≥ minRise% that end when price pulls back ≥ minPull% from the swing high. */
export function countRallies(close: readonly number[], from: number, to: number, minRise = RALLY_MIN_RISE_PCT, minPull = RALLY_PULLBACK_PCT): RallyCount {
  let count = 0;
  let largest = 0;
  let last = 0;
  let low = close[from] as number;
  let high = low;
  let inRally = false;
  for (let j = from + 1; j <= to; j++) {
    const c = close[j] as number;
    if (!inRally) {
      if (c < low) low = c;
      if (c >= low * (1 + minRise / 100)) {
        count++;
        inRally = true;
        high = c;
      }
    } else {
      if (c > high) high = c;
      if (c <= high * (1 - minPull / 100)) {
        inRally = false;
        low = c;
      }
    }
    if (inRally) {
      last = (high / low - 1) * 100;
      largest = Math.max(largest, last);
    }
  }
  return { count, largestPct: largest, lastPct: count ? last : 0 };
}

export type Phase = "early" | "mid" | "late";

/** Where a stage 2 stock is in its advance: early = base breakout or first rally; mid = second; late = third or more, or any 80%+ rally. */
export function phaseOf(stage: Stage, r: RallyCount): Phase | null {
  if (stage !== 2) return null;
  if (r.count >= LATE_RALLIES || r.largestPct >= PARABOLIC_RALLY_PCT) return "late";
  return r.count <= 1 ? "early" : "mid";
}

/** Closes below the 150-day average for this many sessions in a row = a real dip (end of a base or a stage 2 break). */
export const STAGE2_RESET_BARS = 5;

/**
 * Start of the current advance: the base low before price last left a real dip below the 150-day average (5+ closes
 * below it). Returns the index of that low, or null if price has been above the average for all the history we hold.
 */
export function advanceStart(close: readonly number[], ma150: readonly number[], i: number): number | null {
  let below = 0;
  for (let j = i; j >= 0; j--) {
    const m = ma150[j] as number;
    if (!Number.isFinite(m)) return null;
    if ((close[j] as number) < m) {
      below++;
      if (below >= STAGE2_RESET_BARS) {
        const end = j + below - 1; // most recent close of that dip
        let low = end;
        for (let k = Math.max(0, end - 40); k <= Math.min(i, end + 10); k++) if ((close[k] as number) < (close[low] as number)) low = k;
        return low;
      }
    } else below = 0;
  }
  return null;
}
