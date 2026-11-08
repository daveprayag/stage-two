/**
 * Horizontal support/resistance and trendlines, drawn the way chartists draw them by hand:
 *  - A swing high is a bar whose high is the highest of the `k` bars on each side (swing low: lowest low).
 *  - Swing points within `tolPct` of each other form one level; more touches = a level more traders watch.
 *  - A trendline joins two swing lows (rising support) or two swing highs (falling resistance) such that no bar in
 *    between closes through it; the longest such line is the one that matters.
 * Everything at bar i uses bars ≤ i. Swing points need k bars after them, so the newest k bars cannot be pivots.
 */
import type { Level, TrendLine } from "./types";

export interface Ohlc {
  dates: readonly string[];
  high: ArrayLike<number>;
  low: ArrayLike<number>;
  close: ArrayLike<number>;
}

export function swingHighs(high: ArrayLike<number>, from: number, to: number, k: number): number[] {
  const out: number[] = [];
  for (let j = Math.max(from, k); j <= to - k; j++) {
    const h = high[j] as number;
    let ok = true;
    for (let d = 1; d <= k && ok; d++) if ((high[j - d] as number) > h || (high[j + d] as number) >= h) ok = false;
    if (ok) out.push(j);
  }
  return out;
}

export function swingLows(low: ArrayLike<number>, from: number, to: number, k: number): number[] {
  const out: number[] = [];
  for (let j = Math.max(from, k); j <= to - k; j++) {
    const l = low[j] as number;
    let ok = true;
    for (let d = 1; d <= k && ok; d++) if ((low[j - d] as number) < l || (low[j + d] as number) <= l) ok = false;
    if (ok) out.push(j);
  }
  return out;
}

/** Group pivot prices that sit within tolPct of the group's first (lowest) price. */
export function cluster(points: { idx: number; price: number }[], tolPct: number, dates: readonly string[]): Level[] {
  const sorted = [...points].sort((a, b) => a.price - b.price);
  const out: Level[] = [];
  let group: { idx: number; price: number }[] = [];
  const flush = () => {
    if (!group.length) return;
    const price = group.reduce((a, p) => a + p.price, 0) / group.length;
    const last = Math.max(...group.map((p) => p.idx));
    out.push({ price: Math.round(price * 100) / 100, touches: group.length, last: dates[last] ?? "" });
    group = [];
  };
  for (const p of sorted) {
    if (group.length && p.price > (group[0] as { price: number }).price * (1 + tolPct / 100)) flush();
    group.push(p);
  }
  flush();
  return out;
}

export interface LevelOptions {
  lookback: number;
  k: number;
  tolPct: number;
  max: number;
  /** Prefer levels with at least this many touches; single-touch levels only fill remaining slots. */
  preferTouches?: number;
}

export const DEFAULT_LEVELS: LevelOptions = { lookback: 200, k: 5, tolPct: 2.5, max: 3 };

/** Resistance levels above the close (nearest first) and support levels below (nearest first). */
export function supportResistance(d: Ohlc, i: number, opts: LevelOptions = DEFAULT_LEVELS): { resistance: Level[]; support: Level[] } {
  const from = Math.max(0, i - opts.lookback);
  const c = d.close[i] as number;
  const highs = swingHighs(d.high, from, i, opts.k).map((j) => ({ idx: j, price: d.high[j] as number }));
  const lows = swingLows(d.low, from, i, opts.k).map((j) => ({ idx: j, price: d.low[j] as number }));
  // A level is resistance if above the close, support if below, whichever kind of pivot formed it.
  const levels = cluster([...highs, ...lows], opts.tolPct, d.dates);
  const pick = (side: Level[]) => {
    const p = opts.preferTouches ?? 1;
    const strong = side.filter((l) => l.touches >= p);
    const chosen = strong.slice(0, opts.max);
    if (chosen.length < Math.min(2, opts.max)) chosen.push(...side.filter((l) => l.touches < p).slice(0, Math.min(2, opts.max) - chosen.length));
    return chosen;
  };
  const resistance = pick(levels.filter((l) => l.price > c).sort((a, b) => a.price - b.price)).sort((a, b) => a.price - b.price);
  const support = pick(levels.filter((l) => l.price <= c).sort((a, b) => b.price - a.price)).sort((a, b) => b.price - a.price);
  return { resistance, support };
}

/**
 * Base pivot for a breakout: the highest high of the `len` bars before bar i, if those bars form a base (range ≤
 * maxDepthPct, and the high is at least `minAge` bars old, so a stock rising every day has no "base").
 */
export function basePivot(d: Ohlc, i: number, len = 40, maxDepthPct = 35, minAge = 5): number | null {
  if (i - len < 0) return null;
  let hi = -Infinity;
  let hiIdx = -1;
  let lo = Infinity;
  for (let j = i - len; j < i; j++) {
    if ((d.high[j] as number) > hi) {
      hi = d.high[j] as number;
      hiIdx = j;
    }
    lo = Math.min(lo, d.low[j] as number);
  }
  if (!(hi > 0) || (1 - lo / hi) * 100 > maxDepthPct || i - hiIdx < minAge) return null;
  return hi;
}

/**
 * Longest valid trendline ending at bar i: 'support' joins two rising swing lows that no later close breaks
 * (> tolPct below the line); 'resistance' joins two falling swing highs that no later close breaks above.
 */
export function trendline(d: Ohlc, i: number, kind: "support" | "resistance", lookback = 160, k = 5, tolPct = 1, minSpan = 15): TrendLine | null {
  const from = Math.max(0, i - lookback);
  const series = kind === "support" ? d.low : d.high;
  const pivots = kind === "support" ? swingLows(d.low, from, i, k) : swingHighs(d.high, from, i, k);
  let best: { a: number; b: number } | null = null;
  for (let x = 0; x < pivots.length; x++) {
    for (let y = x + 1; y < pivots.length; y++) {
      const a = pivots[x] as number;
      const b = pivots[y] as number;
      if (b - a < minSpan) continue;
      const pa = series[a] as number;
      const pb = series[b] as number;
      if (kind === "support" ? !(pb > pa) : !(pb < pa)) continue;
      const slope = (pb - pa) / (b - a);
      let ok = true;
      for (let j = a + 1; j <= i && ok; j++) {
        const line = pa + slope * (j - a);
        const c = d.close[j] as number;
        if (kind === "support" ? c < line * (1 - tolPct / 100) : c > line * (1 + tolPct / 100)) ok = false;
      }
      if (ok && (!best || b - a > best.b - best.a || (b - a === best.b - best.a && b > best.b))) best = { a, b };
    }
  }
  if (!best) return null;
  const pa = series[best.a] as number;
  const pb = series[best.b] as number;
  const slope = (pb - pa) / (best.b - best.a);
  const now = pa + slope * (i - best.a);
  const r2 = (x: number) => Math.round(x * 100) / 100;
  return {
    from: { date: d.dates[best.a] ?? "", price: r2(pa) },
    to: { date: d.dates[i] ?? "", price: r2(now) },
    now: r2(now),
  };
}
