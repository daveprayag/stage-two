/**
 * Shared setup types and helpers: trigger/limit/stop construction and ranking score.
 * RULEBOOK "Entry mechanics" (trigger = tight bar's high, limit 0.5–1% above, YBl0Orf-5I4),
 * "Stop rules" (low of the tight bar minus a few rupees, w1sbooFlgLY; max by setup) and glossary "Ranking".
 */
import type { Instrument, ISODate } from '../types.js';
import { maxStopPct, type SetupName, type StrategyConfig, type StrategySetup } from '../config.js';
import { computeFeatures, minOf, type Features } from '../indicators.js';
import { computeScanFlags, type ScanFlags } from '../scanners.js';
import { ceilTick, floorTick } from '../ticks.js';
import { fmt } from '../universe.js';

/** A buy setup for the next session: buy-stop at `trigger`, limit `limit`, protective stop `stop`. */
export interface Signal {
  isin: string;
  symbol: string;
  /** Signal date (the setup bar's date). Orders are valid for the next session only. */
  date: ISODate;
  setup: StrategySetup;
  /** 'stop' (default) = buy-stop at trigger with limit; 'open' = buy at the next open if open ≤ limit. */
  entry?: 'stop' | 'open';
  /** Date anchoring the setup instance (RE / reaction day, or first EMA touch). Instance = isin + setup + anchorDate. */
  anchorDate: ISODate;
  trigger: number;
  limit: number;
  stop: number;
  /** (trigger − stop) / trigger × 100. */
  stopPct: number;
  /** Ranking score, higher = better (see scoreSignal). */
  score: number;
  reasons: string[];
  meta: Record<string, number | string | boolean>;
}

/** Everything a setup needs about one instrument. Built once per backtest. */
export interface InstrumentContext {
  isin: string;
  symbol: string;
  f: Features;
  scans: ScanFlags;
  /** Results/board-meeting dates, ascending (empty if unknown). */
  resultsDates: readonly ISODate[];
}

/** Close of the regime/benchmark index on or before a date (NaN if unknown). */
export type BenchmarkLookup = (date: ISODate) => number;

export function prepareInstrument(
  inst: Pick<Instrument, 'isin' | 'symbol' | 'bars'>,
  cfg: StrategyConfig,
  resultsDates: readonly ISODate[] = [],
): InstrumentContext {
  const f = computeFeatures(inst.bars, cfg);
  return { isin: inst.isin, symbol: inst.symbol, f, scans: computeScanFlags(f, cfg), resultsDates };
}

/** Trigger = setup bar's high rounded up to the tick (RULEBOOK Entry "Default trigger", Eenfov1IwM4). */
export function triggerFor(f: Features, i: number, cfg: StrategyConfig): number {
  return ceilTick(f.high[i] as number, cfg.entry.tick);
}

/** Limit = trigger × (1 + limitPct%), rounded down to the tick but never below the trigger (YBl0Orf-5I4). */
export function limitFor(trigger: number, cfg: StrategyConfig): number {
  return Math.max(trigger, floorTick(trigger * (1 + cfg.entry.limitPct / 100), cfg.entry.tick));
}

/**
 * Stop = lowest low of the last `bars` bars (1 = setup bar only) × (1 − buffer%), rounded down to the tick.
 * RULEBOOK Stop "Placement" (Eenfov1IwM4) and "Buffer" (w1sbooFlgLY).
 */
export function stopFor(f: Features, i: number, cfg: StrategyConfig, bars?: number): number {
  const n = bars ?? (cfg.stops.mode === 'lowestLow' ? cfg.stops.lowestLowBars : 1);
  const base = minOf(f.low, Math.max(0, i - n + 1), i);
  return floorTick(base * (1 - cfg.stops.bufferPct / 100), cfg.entry.tick);
}

/**
 * Ranking score (RULEBOOK glossary "Ranking": prefer the hit closest to its 52-week high, w1sbooFlgLY):
 *   score = close / maxHigh(252 bars)  +  rsWeight × clamp(RS3m, ±rsClamp)
 *   RS3m  = (close / close 63 bars ago − 1) − (index / index on that bar's date − 1)
 * Proximity is in (0, 1]; the RS bonus is at most ±0.05 with defaults. RS = 0 when unavailable.
 */
export function scoreSignal(f: Features, i: number, cfg: StrategyConfig, benchmark?: BenchmarkLookup): number {
  const c = f.close[i] as number;
  const hh = f.highestHigh[i] as number;
  const proximity = hh > 0 ? c / hh : 0;
  const rk = cfg.ranking;
  let rs = 0;
  const j = i - rk.rsLookbackBars;
  if (j >= 0) {
    const stockRet = c / (f.close[j] as number) - 1;
    let idxRet = 0;
    if (benchmark) {
      const b1 = benchmark((f.bars[i] as { date: ISODate }).date);
      const b0 = benchmark((f.bars[j] as { date: ISODate }).date);
      if (b0 > 0 && b1 > 0) idxRet = b1 / b0 - 1;
    }
    rs = stockRet - idxRet;
    if (!Number.isFinite(rs)) rs = 0;
  }
  const clamped = Math.max(-rk.rsClamp, Math.min(rk.rsClamp, rs));
  return proximity + rk.rsWeight * clamped;
}

/**
 * Build a signal from the setup bar or return null (with a trace reason) if the stop is too wide.
 * RULEBOOK Stop "Too-wide stop": skip the trade (ahFVnEzFcag).
 */
export function buildSignal(
  ctx: InstrumentContext,
  i: number,
  cfg: StrategyConfig,
  setup: SetupName,
  anchorIdx: number,
  stop: number,
  reasons: string[],
  meta: Record<string, number | string | boolean>,
  trace?: string[],
): Signal | null {
  const f = ctx.f;
  const trigger = triggerFor(f, i, cfg);
  const limit = limitFor(trigger, cfg);
  const stopPct = ((trigger - stop) / trigger) * 100;
  const maxStop = maxStopPct(cfg, setup);
  if (!(stopPct > 0 && stopPct <= maxStop)) {
    trace?.push(`${setup}: stop ${fmt(stopPct)}% wider than max ${maxStop}%`);
    return null;
  }
  const bar = f.bars[i];
  const anchor = f.bars[anchorIdx];
  if (!bar || !anchor) return null;
  return {
    isin: ctx.isin,
    symbol: ctx.symbol,
    date: bar.date,
    setup,
    anchorDate: anchor.date,
    trigger,
    limit,
    stop,
    stopPct,
    score: 0,
    reasons,
    meta,
  };
}

/** Instance key for attempt counting (RULEBOOK Stop "Attempts": max 3 per setup). */
export function instanceKey(s: Pick<Signal, 'isin' | 'setup' | 'anchorDate'>): string {
  return `${s.isin}|${s.setup}|${s.anchorDate}`;
}

export { fmt };
