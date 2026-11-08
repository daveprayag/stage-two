/**
 * Market regime from a broad index. RULEBOOK "Market regime and exposure":
 * - Healthy: index above its 10 and 20 EMA, both rising — EXACT (w1sbooFlgLY).
 * - Weak (small size, 5% cap): not healthy, but index closes above its 10 EMA (restart after a correction,
 *   bICwUuwOgNU, jToXy0tfgFI) or above its 50 EMA (minimum trend, mwFLohDp8Lc). APPROX combination.
 * - Off: neither → no new entries.
 * Stop cluster: 4–5 stops in about a week → step back (CcVEU0M7uPQ, v2nFQiYX2P0). APPROX: force weak.
 */
import type { IndexSeries, ISODate } from './types.js';
import type { StrategyConfig } from './config.js';
import { ema } from './indicators.js';

export type Regime = 'healthy' | 'weak' | 'off';

export interface RegimeSeries {
  indexName: string;
  dates: ISODate[];
  regime: Regime[];
  close: Float64Array;
  emaFast: Float64Array;
  emaMid: Float64Array;
  emaSlow: Float64Array;
}

/** Pick the configured index, else the fallback; null if neither exists. */
export function selectRegimeIndex(indices: ReadonlyMap<string, IndexSeries>, cfg: StrategyConfig): IndexSeries | null {
  return indices.get(cfg.regime.indexName) ?? indices.get(cfg.regime.fallbackIndexName) ?? null;
}

/** Classify one day. Any NaN (warm-up) → 'off'. */
export function classifyRegime(
  close: number,
  fast: number,
  fastPrev: number,
  mid: number,
  midPrev: number,
  slow: number,
): Regime {
  if (!Number.isFinite(close) || !Number.isFinite(fast) || !Number.isFinite(mid)) return 'off';
  const healthy = close > fast && close > mid && fast > fastPrev && mid > midPrev;
  if (healthy) return 'healthy';
  if (close > fast || close > slow) return 'weak';
  return 'off';
}

/** Per-bar regime for an index series (causal). */
export function computeRegime(index: IndexSeries, cfg: StrategyConfig): RegimeSeries {
  const n = index.bars.length;
  const close = new Float64Array(n);
  const dates: ISODate[] = new Array<ISODate>(n);
  for (let i = 0; i < n; i++) {
    const b = index.bars[i];
    if (!b) continue;
    close[i] = b.close;
    dates[i] = b.date;
  }
  const r = cfg.regime;
  const emaFast = ema(close, r.emaFast);
  const emaMid = ema(close, r.emaMid);
  const emaSlow = ema(close, r.emaSlow);
  const regime: Regime[] = new Array<Regime>(n);
  for (let i = 0; i < n; i++) {
    regime[i] =
      i === 0
        ? 'off'
        : classifyRegime(
            close[i] as number,
            emaFast[i] as number,
            emaFast[i - 1] as number,
            emaMid[i] as number,
            emaMid[i - 1] as number,
            emaSlow[i] as number,
          );
  }
  return { indexName: index.name, dates, regime, close, emaFast, emaMid, emaSlow };
}

/**
 * Align a regime series to a calendar: each calendar day takes the regime of the latest index bar on or
 * before it (carry forward when the index has no bar that day); 'off' before the first index bar.
 */
export function alignRegime(series: RegimeSeries, calendar: readonly ISODate[]): Regime[] {
  const out: Regime[] = new Array<Regime>(calendar.length);
  let j = -1;
  for (let t = 0; t < calendar.length; t++) {
    const d = calendar[t] as string;
    while (j + 1 < series.dates.length && (series.dates[j + 1] as string) <= d) j++;
    out[t] = j >= 0 ? (series.regime[j] as Regime) : 'off';
  }
  return out;
}

/**
 * Stop cluster check for day t: true if ≥ minStops losing stop-outs happened on trading days (t − lookbackDays, t].
 * `stopOutDays` holds calendar indices (one entry per stop-out, any order).
 */
export function stopClusterTriggered(stopOutDays: readonly number[], t: number, cfg: StrategyConfig): boolean {
  const sc = cfg.regime.stopCluster;
  if (!sc.enabled) return false;
  let count = 0;
  for (const d of stopOutDays) if (d <= t && d > t - sc.lookbackDays) count++;
  return count >= sc.minStops;
}

/** New "forced weak until" calendar index after evaluating day t's close. */
export function nextForcedWeakUntil(prevUntil: number, triggered: boolean, t: number, cfg: StrategyConfig): number {
  return triggered ? Math.max(prevUntil, t + cfg.regime.stopCluster.forceWeakDays) : prevUntil;
}

/** Apply the stop-cluster override: a healthy day inside the forced window becomes weak; off stays off. */
export function applyStopCluster(regime: Regime, t: number, forcedWeakUntil: number): Regime {
  return regime === 'healthy' && t <= forcedWeakUntil ? 'weak' : regime;
}

/**
 * Recent-trades pause (57XQ7p0yPTc): among the last `lastN` closed trades whose exits fall within the last `withinDays`
 * trading days (incl. t), if at least `maxBad` exited on a stop or breakeven stop → no new buys until t + pauseDays.
 * `closed` = (exit calendar index, bad?) in exit order. Returns the new "paused until" index.
 */
export function nextRecentTradesPause(
  closed: readonly { t: number; bad: boolean }[],
  t: number,
  prevUntil: number,
  cfg: StrategyConfig,
): number {
  const r = cfg.regime.recentTrades;
  if (!r.enabled) return prevUntil;
  const recent = closed.filter((c) => c.t <= t && c.t > t - r.withinDays).slice(-r.lastN);
  const bad = recent.filter((c) => c.bad).length;
  return bad >= r.maxBad ? Math.max(prevUntil, t + r.pauseDays) : prevUntil;
}
