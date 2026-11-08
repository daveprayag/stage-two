/**
 * Ankur's Chartink scanners, computed from bars. RULEBOOK "His scanners (exact Chartink conditions)".
 * Each function evaluates bar i using data ≤ i only.
 */
import type { StrategyConfig, MomentumLeg } from './config.js';
import type { Features } from './indicators.js';
import { minOf } from './indicators.js';

/**
 * Scanner 1, volume scan = range-expansion day (EXACT). RULEBOOK scanners §1, glossary "Range expansion".
 * change% ≥ 6.5, volume > 3 × SMA50(vol), close > 30, volume > 50,000, SMA50(vol) ≥ 25,000, turnover50 ≥ ₹5 Cr.
 */
export function volumeScanAt(f: Features, i: number, cfg: StrategyConfig): boolean {
  const v = cfg.scanners.volume;
  const vol = f.volume[i] as number;
  const vs = f.volSma50[i] as number;
  return (
    (f.changePct[i] as number) >= v.reDayChangePct &&
    vol > v.volumeMultiple * vs &&
    (f.close[i] as number) > v.minClose &&
    vol > v.minVolume &&
    vs >= v.minVolSma50 &&
    (f.turnover50Cr[i] as number) >= v.minTurnover50Cr
  );
}

/** The 20 EMA scan's momentum legs for the configured variant (RULEBOOK scanners §3, "Settings to test"). */
export function ema20MomentumLegs(cfg: StrategyConfig): readonly MomentumLeg[] {
  const e = cfg.scanners.ema20;
  const cached = legCache.get(e);
  if (cached && cached.variant === e.ema20ScanMomentumLeg) return cached.legs;
  const variant = e.ema20ScanMomentumLeg === '10d1.2' ? e.legVariant10d : e.legVariant20d;
  const legs = [...e.momentumLegs, variant].sort((a, b) => a.barsAgo - b.barsAgo);
  legCache.set(e, { variant: e.ema20ScanMomentumLeg, legs });
  return legs;
}

/** Memo per config object (configs are treated as immutable; deepMerge returns fresh objects). */
const legCache = new WeakMap<object, { variant: string; legs: readonly MomentumLeg[] }>();

/** Any momentum leg passes: close ≥ multiple × low of the bar N bars ago ("low N days ago" = that bar's low). */
export function momentumAny(f: Features, i: number, legs: readonly MomentumLeg[]): MomentumLeg | null {
  const c = f.close[i] as number;
  for (const leg of legs) {
    const j = i - leg.barsAgo;
    if (j < 0) continue;
    if (c >= leg.multiple * (f.low[j] as number)) return leg;
  }
  return null;
}

/**
 * Scanner 3, 20 EMA scan (EXACT, L3fiDFZIpzc): 0.95×EMA20 ≤ close ≤ 1.05×EMA20, close > 30, turnover ≥ ₹5 Cr,
 * volume > 1,00,000, plus any momentum leg. Market-cap > ₹1 Cr is not modelled (no shares-outstanding data).
 */
export function ema20ScanAt(f: Features, i: number, cfg: StrategyConfig, legs: readonly MomentumLeg[]): boolean {
  const e = cfg.scanners.ema20;
  const c = f.close[i] as number;
  const m = f.ema20[i] as number;
  return (
    c >= m * (1 - e.bandPct / 100) &&
    c <= m * (1 + e.bandPct / 100) &&
    c > e.minClose &&
    (f.turnover50Cr[i] as number) >= e.minTurnover50Cr &&
    (f.volume[i] as number) > e.minVolume &&
    momentumAny(f, i, legs) !== null
  );
}

/** Close location in the day's range, 0 = low, 1 = high (1 if high == low). */
export function closeLocation(f: Features, i: number): number {
  const h = f.high[i] as number;
  const l = f.low[i] as number;
  return h > l ? ((f.close[i] as number) - l) / (h - l) : 1;
}

/**
 * Delayed-EP reaction day proxy (RULEBOOK "Delayed episodic pivot", jfr-kMHSEI4, 7gNrxbSksOE):
 * volume scan AND (gap ≥ 3% OR change ≥ 8%) AND strong close AND neglected before
 * (close of d0−1 ≤ 1.25 × lowest low of the 60 bars before d0). No catalyst check here.
 */
export function depReactionAt(f: Features, i: number, cfg: StrategyConfig): boolean {
  return depReactionWhy(f, i, cfg) === null;
}

/** Why bar i is not a delayed-EP reaction day (null = it is). Single implementation behind depReactionAt. */
export function depReactionWhy(f: Features, i: number, cfg: StrategyConfig): string | null {
  const d = cfg.setups.depProxy;
  if (i < d.preRunUpLookbackBars) return `fewer than ${d.preRunUpLookbackBars} bars of history`;
  if (!volumeScanAt(f, i, cfg)) return 'not a volume-scan (range expansion) day';
  const pc = f.prevClose[i] as number;
  const gapPct = ((f.open[i] as number) / pc - 1) * 100;
  const chg = f.changePct[i] as number;
  if (!(gapPct >= d.minGapPct) && !(chg >= d.minChangePct)) {
    return `gap ${gapPct.toFixed(2)}% < ${d.minGapPct}% and change ${chg.toFixed(2)}% < ${d.minChangePct}%`;
  }
  const loc = closeLocation(f, i);
  if (!(loc >= d.minCloseLocation)) return `weak close: location ${loc.toFixed(2)} < ${d.minCloseLocation}`;
  const lowBefore = minOf(f.low, i - d.preRunUpLookbackBars, i - 1);
  const runUp = ((f.close[i - 1] as number) / lowBefore - 1) * 100;
  if (!(runUp <= d.depPreRunUpRejectPct)) {
    return `not neglected: up ${runUp.toFixed(1)}% from the ${d.preRunUpLookbackBars}-bar low before the reaction (> ${d.depPreRunUpRejectPct}%)`;
  }
  return null;
}

/** Precomputed per-bar scan flags (each causal). */
export interface ScanFlags {
  /** Volume-scan range-expansion day. */
  readonly reDay: Uint8Array;
  /** Delayed-EP reaction day proxy. */
  readonly depDay: Uint8Array;
}

export function computeScanFlags(f: Features, cfg: StrategyConfig): ScanFlags {
  const reDay = new Uint8Array(f.n);
  const depDay = new Uint8Array(f.n);
  for (let i = 0; i < f.n; i++) {
    if (volumeScanAt(f, i, cfg)) {
      reDay[i] = 1;
      if (depReactionAt(f, i, cfg)) depDay[i] = 1;
    }
  }
  return { reDay, depDay };
}
