/**
 * Delayed episodic pivot, proxy version. RULEBOOK "Setups / Delayed episodic pivot" (jfr-kMHSEI4, GPhf8HpPW_c,
 * 7gNrxbSksOE):
 * - Reaction day d0 (scanners.depReactionAt): volume scan + gap ≥ 3% or change ≥ 8% + strong close + neglected
 *   before (pre-run-up ≤ 25%). The catalyst is NOT verified (we have no news feed); if resultsDates has a date in
 *   [d0 − 2 calendar days, d0], meta.catalyst = true.
 * - Never buy day 1. Setup bar in d0+2..d0+10: tight (range ≤ 3%, |change| ≤ 2.5%), RVol ≤ 60 ("back to ~40–60%"),
 *   gap held (lowest low since d0 ≥ d0's prevClose), close ≥ EMA10 × (1 − nearEma10Pct%).
 * - Only the first consolidation after the event (EXACT). APPROX: the first qualifying bar starts it; following
 *   bars re-signal (trigger lowering, KzJIVw2E7g8) only while every bar keeps qualifying and none traded above the
 *   previous bar's trigger. Once it triggers or a bar fails, no more depProxy signals for that d0.
 * Max stop 5%; 50% at 3R; trail the rest on EMA20.
 */
import type { StrategyConfig } from '../config.js';
import { addCalendarDays, anyDateInRange } from '../dates.js';
import { minOf } from '../indicators.js';
import { ceilTick } from '../ticks.js';
import { depReactionWhy } from '../scanners.js';
import { buildSignal, fmt, stopFor, type InstrumentContext, type Signal } from './common.js';

const NAME = 'depProxy';

/** Latest DEP reaction day ≤ i within the lookback, or −1. */
export function latestDepDay(ctx: InstrumentContext, i: number, lookback: number): number {
  const lo = Math.max(0, i - lookback);
  for (let k = i; k >= lo; k--) if (ctx.scans.depDay[k] === 1) return k;
  return -1;
}

/** Why bar s fails the consolidation test after reaction day d0 (null = qualifies). */
function consolidationFailure(ctx: InstrumentContext, d0: number, s: number, cfg: StrategyConfig): string | null {
  const f = ctx.f;
  const d = cfg.setups.depProxy;
  const r = f.rangePct[s] as number;
  if (!(r <= d.maxRangePct)) return `range ${fmt(r)}% > ${d.maxRangePct}`;
  const chg = f.changePct[s] as number;
  if (!(Math.abs(chg) <= d.maxAbsChangePct)) return `|change| ${fmt(chg)}% > ${d.maxAbsChangePct}`;
  const rv = f.rvol[s] as number;
  if (!(rv <= d.maxRvol)) return `RVol ${fmt(rv, 0)} > ${d.maxRvol}`;
  const lowSince = minOf(f.low, d0 + 1, s);
  const pc0 = f.prevClose[d0] as number;
  if (!(lowSince >= pc0)) return `gap not held: low ${fmt(lowSince)} < reaction-day prevClose ${fmt(pc0)}`;
  const c = f.close[s] as number;
  const e10 = f.ema10[s] as number;
  if (!(c >= e10 * (1 - cfg.nearEma10Pct / 100))) return `close ${fmt(c)} more than ${cfg.nearEma10Pct}% below EMA10 ${fmt(e10)}`;
  return null;
}

export function detectDepProxy(ctx: InstrumentContext, i: number, cfg: StrategyConfig, trace?: string[]): Signal | null {
  const d = cfg.setups.depProxy;
  const f = ctx.f;
  const d0 = latestDepDay(ctx, i, d.maxBarsAfter);
  if (d0 < 0) {
    if (trace) {
      // Explain the latest range-expansion day that did not qualify as a reaction day (diagnostics only).
      let re = -1;
      for (let k = i; k >= Math.max(0, i - d.maxBarsAfter); k--) if (ctx.scans.reDay[k] === 1) { re = k; break; }
      trace.push(
        re >= 0
          ? `${NAME}: RE day ${f.bars[re]?.date} is not a reaction day: ${depReactionWhy(f, re, cfg) ?? '?'}`
          : `${NAME}: no reaction day in the last ${d.maxBarsAfter} bars`,
      );
    }
    return null;
  }
  if (i - d0 < d.minBarsAfter) {
    trace?.push(`${NAME}: reaction day ${f.bars[d0]?.date} too recent (never buy day 1)`);
    return null;
  }
  // Find the first qualifying consolidation bar s in [d0 + minBarsAfter, i].
  let s = -1;
  for (let k = d0 + d.minBarsAfter; k <= i; k++) {
    if (consolidationFailure(ctx, d0, k, cfg) === null) {
      s = k;
      break;
    }
  }
  if (s < 0) {
    if (trace) trace.push(`${NAME}: ${consolidationFailure(ctx, d0, i, cfg) ?? 'no consolidation yet'}`);
    return null;
  }
  // Only the first consolidation: every bar s+1..i must qualify and none may have triggered the previous bar's order.
  for (let k = s + 1; k <= i; k++) {
    const why = consolidationFailure(ctx, d0, k, cfg);
    if (why !== null) {
      trace?.push(`${NAME}: first consolidation (from ${f.bars[s]?.date}) ended on ${f.bars[k]?.date}: ${why}`);
      return null;
    }
    if ((f.high[k] as number) >= ceilTick(f.high[k - 1] as number, cfg.entry.tick)) {
      trace?.push(`${NAME}: first consolidation already triggered on ${f.bars[k]?.date}`);
      return null;
    }
  }
  // EP needs a ≥ 10% band (or no band) on the setup bar — EXACT (jfr-kMHSEI4).
  const band = f.bars[i]?.priceBand;
  if (typeof band === 'number' && band < d.minPriceBand) {
    trace?.push(`${NAME}: price band ${band}% < ${d.minPriceBand}%`);
    return null;
  }
  const d0Date = f.bars[d0]?.date ?? '';
  const catalyst =
    ctx.resultsDates.length > 0 && anyDateInRange(ctx.resultsDates, addCalendarDays(d0Date, -d.catalystWindowDays), d0Date);
  if (d.requireCatalyst && !catalyst) {
    trace?.push(`${NAME}: no results date within ${d.catalystWindowDays} days before ${d0Date}`);
    return null;
  }
  const stop = stopFor(f, i, cfg);
  const pc0 = f.prevClose[d0] as number;
  return buildSignal(
    ctx,
    i,
    cfg,
    NAME,
    d0,
    stop,
    [
      `reaction day ${d0Date}: gap ${fmt(((f.open[d0] as number) / pc0 - 1) * 100)}%, change +${fmt(f.changePct[d0] as number)}%, RVol ${fmt(f.rvol[d0] as number, 0)}`,
      `first consolidation bar ${i - d0} bars later: range ${fmt(f.rangePct[i] as number)}%, RVol ${fmt(f.rvol[i] as number, 0)}`,
      catalyst ? 'catalyst: results date at the reaction day' : 'catalyst: not verified (proxy)',
    ],
    { reactionDate: d0Date, barsSinceReaction: i - d0, catalyst, rvol: f.rvol[i] as number },
    trace,
  );
}
