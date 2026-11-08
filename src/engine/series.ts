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
