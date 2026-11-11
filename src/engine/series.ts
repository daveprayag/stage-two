/** Helpers to turn the aligned store into per-stock bar arrays (traded sessions only) and simple indicators. */
import type { Bar } from "./core/types";
import type { EmaSeed, PriceStore, Stage, StockSeries } from "./types";

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

export function compact(store: Pick<PriceStore, "dates">, s: StockSeries): Compact {
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

/**
 * Price averages are EMAs (livermore DECISIONS.md "Moving averages: EMA", 2026-11-11): the 50-, 150- and 200-day lines,
 * stage, base detection and the market filter. Volume and traded-value averages stay simple averages.
 */
export const EMA_PERIODS = [50, 150, 200] as const;

export type { EmaSeed } from "./types";

/**
 * Exponential moving average, α = 2 / (period + 1). From `seed` (the EMA before values[0]) when given; otherwise as
 * TradingView's ta.ema: the simple average of the first `period` values, then exponential (NaN before that).
 */
export function emaArr(values: readonly number[], period: number, seed?: number | null): number[] {
  const out = new Array<number>(values.length).fill(Number.NaN);
  const a = 2 / (period + 1);
  let e: number;
  let from: number;
  if (seed !== undefined && seed !== null && Number.isFinite(seed)) {
    e = seed;
    from = 0;
  } else {
    if (values.length < period) return out;
    let sum = 0;
    for (let i = 0; i < period; i++) sum += values[i] as number;
    e = sum / period;
    out[period - 1] = e;
    from = period;
  }
  for (let i = from; i < values.length; i++) {
    e = a * (values[i] as number) + (1 - a) * e;
    out[i] = e;
  }
  return out;
}

/** The 50/150/200-day EMAs of a compact close series, continuing from the stored seed. */
export function emaLines(close: readonly number[], seed?: EmaSeed | null): { ma50: number[]; ma150: number[]; ma200: number[] } {
  const [ma50, ma150, ma200] = EMA_PERIODS.map((p, k) => emaArr(close, p, seed?.[k])) as [number[], number[], number[]];
  return { ma50, ma150, ma200 };
}

/**
 * The seed after the window drops its first `drop` slots. `values` are the slot values before dropping (null = no
 * trade that day). The new seed is the line's value at the last dropped close, so the remaining line is unchanged.
 * Without a seed (a recent listing) the line is TradingView-style; if it starts after the drop point, its first value
 * is stepped back (e[j−1] = (e[j] − α·v[j]) / (1 − α)) to the seed that reproduces it exactly from the new start.
 */
export function rollSeed(seed: EmaSeed | null | undefined, values: readonly (number | null | undefined)[], drop: number): EmaSeed | null {
  const all = values.filter((v): v is number => v !== null && v !== undefined);
  const dropped = values.slice(0, drop).filter((v): v is number => v !== null && v !== undefined).length;
  if (!dropped) return seed ?? null;
  const next = EMA_PERIODS.map((p, k) => {
    const line = emaArr(all, p, seed?.[k]);
    let e = line[dropped - 1] as number;
    if (Number.isFinite(e)) return e;
    if (all.length < p) return null; // no line yet: it will start TradingView-style from the bars that remain
    const a = 2 / (p + 1);
    e = line[p - 1] as number;
    for (let j = p - 1; j >= dropped; j--) e = (e - a * (all[j] as number)) / (1 - a);
    return e;
  });
  return next.some((x) => x !== null) ? next : null;
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

/**
 * Where a stage 2 stock is in its advance, counting rallies since it left its latest base: early = still in or just out
 * of the base, or the first rally; mid = second; late = third or more, any 80%+ rally, or no base in our history.
 */
export function phaseOf(stage: Stage, r: RallyCount, hasBase = true): Phase | null {
  if (stage !== 2) return null;
  if (!hasBase || r.count >= LATE_RALLIES || r.largestPct >= PARABOLIC_RALLY_PCT) return "late";
  return r.count <= 1 ? "early" : "mid";
}

/**
 * A base (sideways range): BASE_BARS sessions whose closes span at most BASE_MAX_DEPTH_PCT (high/low) and end within
 * BASE_MAX_DRIFT_PCT of where they started. Ankur: "a re-base of 8+ weeks and ≤ 35% depth resets the count" (livermore
 * RULEBOOK "Momentum cycle", oCuI_gBkD0g). The drift limit is ours: it separates a sideways range from a steady climb.
 */
export const BASE_BARS = 40;
export const BASE_MAX_DEPTH_PCT = 35;
export const BASE_MAX_DRIFT_PCT = 12;
/** A side trend flattens the 50-day average: it moves at most this much (%) across the base window. A pause inside an
 * uptrend (Ankur's 4–5 bar contraction, a few weeks of flag) keeps it rising, so it does not reset the count. */
export const BASE_MAX_MA50_CHANGE_PCT = 5;

export interface Base {
  /** Index of the base's last session (the bar before price left the range, or the latest bar if still inside). */
  end: number;
  /** Highest and lowest close of the base window. */
  high: number;
  low: number;
  /** Price is still inside the range (has not closed above its top since). */
  inBase: boolean;
}

/** The most recent side-trend base before or at bar i (needs the 50-day average), or null if none in the history given. */
export function findBase(close: readonly number[], ma50: readonly number[], i: number, bars = BASE_BARS): Base | null {
  for (let b = i; b >= bars - 1; b--) {
    const a = b - bars + 1;
    const m0 = ma50[a] as number;
    const m1 = ma50[b] as number;
    if (!Number.isFinite(m0)) break;
    if (Math.abs(m1 / m0 - 1) * 100 > BASE_MAX_MA50_CHANGE_PCT) continue;
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = a; j <= b; j++) {
      const c = close[j] as number;
      if (c > hi) hi = c;
      if (c < lo) lo = c;
    }
    const depth = (hi / lo - 1) * 100;
    const drift = Math.abs((close[b] as number) / (close[a] as number) - 1) * 100;
    if (depth <= BASE_MAX_DEPTH_PCT && drift <= BASE_MAX_DRIFT_PCT) {
      // Bars at the end of the window that close above everything before them are the breakout, not the base.
      let top = b;
      const maxBefore = (k: number) => {
        let m = -Infinity;
        for (let j = a; j < k; j++) m = Math.max(m, close[j] as number);
        return m;
      };
      while (top > a + bars / 2 && (close[top] as number) > maxBefore(top)) top--;
      hi = maxBefore(top + 1);
      lo = Infinity;
      for (let j = a; j <= top; j++) lo = Math.min(lo, close[j] as number);
      // Extend the base to the last bar before price first closed above its top.
      let end = top;
      while (end < i && (close[end + 1] as number) <= hi) end++;
      return { end, high: hi, low: lo, inBase: end === i };
    }
  }
  return null;
}

/**
 * "Resuming after a pause": a rally of ≥ minRallyPct into a high (the pivot), then ≥ minPauseBars sessions below it
 * without falling more than maxDepthPct, then a close back above the pivot within the last `recentBars` sessions, with
 * the price now no more than maxExtensionPct above it. The pause low is the natural stop.
 */
export interface Resume {
  /** The pause's top (the high price broke back above). */
  pivot: number;
  /** The pause's lowest low: where a stop would go. */
  pauseLow: number;
  /** Distance from today's close down to pauseLow, %. */
  stopPct: number;
  /** Sessions since the close above the pivot (0 = today). */
  daysAgo: number;
  /** Size of the rally into the pivot, %. */
  rallyPct: number;
  /** Length of the pause, sessions. */
  pauseBars: number;
}

export const RESUME = { minRallyPct: 20, rallyLookback: 60, minPauseBars: 5, maxPauseBars: 40, maxDepthPct: 25, recentBars: 5, maxExtensionPct: 8 } as const;

export function findResume(close: readonly number[], high: readonly number[], low: readonly number[], i: number, o = RESUME): Resume | null {
  for (let d = i; d > i - o.recentBars && d > o.maxPauseBars + o.rallyLookback; d--) {
    let pIdx = d - 1;
    for (let j = d - 1 - o.maxPauseBars; j < d; j++) if ((high[j] as number) > (high[pIdx] as number)) pIdx = j;
    const pivot = high[pIdx] as number;
    const pauseBars = d - 1 - pIdx;
    if (pauseBars < o.minPauseBars) continue;
    if (!((close[d] as number) > pivot && (close[d - 1] as number) <= pivot)) continue;
    let pauseLow = Infinity;
    for (let j = pIdx + 1; j < d; j++) pauseLow = Math.min(pauseLow, low[j] as number);
    if ((1 - pauseLow / pivot) * 100 > o.maxDepthPct) continue;
    let rallyLow = Infinity;
    for (let j = pIdx - o.rallyLookback; j <= pIdx; j++) rallyLow = Math.min(rallyLow, low[j] as number);
    const rallyPct = (pivot / rallyLow - 1) * 100;
    if (rallyPct < o.minRallyPct) continue;
    const c = close[i] as number;
    if (c < pivot * 0.97 || c > pivot * (1 + o.maxExtensionPct / 100)) return null;
    return { pivot, pauseLow, stopPct: (1 - pauseLow / c) * 100, daysAgo: i - d, rallyPct, pauseBars };
  }
  return null;
}
