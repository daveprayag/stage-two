/**
 * Range expansion → contraction (covers flags and mini-VCP).
 * RULEBOOK "Setups / Core engine": track from the range-expansion day (QOY0tFTAskY); wait for ranges to shrink and
 * RVol to fall (gmCnvstswjw); entry bar = tightest, lowest-volume day (PfeoiKLTNPo, CcVEU0M7uPQ);
 * flags rest near the 10 EMA (wnhGCYBk4Gg). "Flag": skip rising "in the air" flags (D-UPlB1XQOk). Mini VCP (3NIn2dlLSCY).
 * Max stop = tight-range max (4%, ZcK5RBAoIY8). Trails on the 'flag' EMA (10).
 */
import type { StrategyConfig } from '../config.js';
import { linRegSlopePct, minOf } from '../indicators.js';
import { buildSignal, fmt, stopFor, type InstrumentContext, type Signal } from './common.js';

const NAME = 'reContraction';

/** Latest RE day ≤ i within the lookback, or −1. */
export function latestReDay(ctx: InstrumentContext, i: number, lookback: number): number {
  const lo = Math.max(0, i - lookback);
  for (let k = i; k >= lo; k--) if (ctx.scans.reDay[k] === 1) return k;
  return -1;
}

export function detectReContraction(
  ctx: InstrumentContext,
  i: number,
  cfg: StrategyConfig,
  trace?: string[],
): Signal | null {
  const sc = cfg.setups.reContraction;
  const f = ctx.f;
  const d0 = latestReDay(ctx, i, sc.maxBarsAfterRe);
  if (d0 < 0) {
    trace?.push(`${NAME}: no range-expansion day in the last ${sc.maxBarsAfterRe} bars`);
    return null;
  }
  // "No newer RE day": the latest RE day must be at least minBarsAfterRe bars back.
  if (i - d0 < sc.minBarsAfterRe) {
    trace?.push(`${NAME}: RE day ${f.bars[d0]?.date} too recent (${i - d0} bars < ${sc.minBarsAfterRe})`);
    return null;
  }
  let ok = true;
  const fail = (msg: string): void => {
    ok = false;
    trace?.push(`${NAME}: ${msg}`);
  };
  const r = f.rangePct[i] as number;
  const chg = f.changePct[i] as number;
  const rv = f.rvol[i] as number;
  const c = f.close[i] as number;
  // Tight bar: range% ≤ 3.0 and the smallest range since d0 (APPROX; tight bar ~2–2.5%, CcVEU0M7uPQ).
  if (!(r <= sc.maxRangePct)) {
    if (!trace) return null;
    fail(`range ${fmt(r)}% > ${sc.maxRangePct}`);
  }
  const minPrevRange = minOf(f.rangePct, d0 + 1, i - 1);
  if (!(r <= minPrevRange)) {
    if (!trace) return null;
    fail(`range ${fmt(r)}% not the tightest since RE day (min ${fmt(minPrevRange)}%)`);
  }
  // Quiet day: |change| ≤ 2.5% (flag scan tightness, scanner 5).
  if (!(Math.abs(chg) <= sc.maxAbsChangePct)) {
    if (!trace) return null;
    fail(`|change| ${fmt(chg)}% > ${sc.maxAbsChangePct}`);
  }
  // Volume dry-up: RVol ≤ 100 and below the RE day's RVol (gmCnvstswjw).
  const rv0 = f.rvol[d0] as number;
  if (!(rv <= sc.maxRvol && rv < rv0)) {
    if (!trace) return null;
    fail(`RVol ${fmt(rv, 0)} not ≤ ${sc.maxRvol} and < RE-day RVol ${fmt(rv0, 0)}`);
  }
  // Held the move: lowest low since d0 ≥ d0's low; close ≥ EMA20.
  const lowSince = minOf(f.low, d0 + 1, i);
  const low0 = f.low[d0] as number;
  if (!(lowSince >= low0)) {
    if (!trace) return null;
    fail(`gave back the RE day: low since ${fmt(lowSince)} < RE-day low ${fmt(low0)}`);
  }
  const e20 = f.ema20[i] as number;
  if (!(c >= e20)) {
    if (!trace) return null;
    fail(`close ${fmt(c)} < EMA20 ${fmt(e20)}`);
  }
  // Near the 10 EMA, not extended above it (APPROX 6%; wnhGCYBk4Gg flags rest near the 10 EMA).
  const e10 = f.ema10[i] as number;
  if (!(c <= e10 * (1 + sc.maxAboveEma10Pct / 100))) {
    if (!trace) return null;
    fail(`close ${fmt(((c / e10) - 1) * 100)}% above EMA10 > ${sc.maxAboveEma10Pct}%`);
  }
  // Flag slope: rising "in the air" flags are skipped (D-UPlB1XQOk). APPROX: regression slope ≤ +0.4%/bar.
  let slope = NaN;
  if (sc.maxSlopePctPerBar !== null) {
    slope = linRegSlopePct(f.close, d0 + 1, i);
    if (!(slope <= sc.maxSlopePctPerBar)) {
      if (!trace) return null;
      fail(`flag slope ${fmt(slope)}%/bar > ${sc.maxSlopePctPerBar}`);
    }
  }
  if (!ok) return null;
  const stop = stopFor(f, i, cfg);
  const d0Date = f.bars[d0]?.date ?? '';
  return buildSignal(
    ctx,
    i,
    cfg,
    NAME,
    d0,
    stop,
    [
      `RE day ${d0Date}: +${fmt(f.changePct[d0] as number)}%, RVol ${fmt(rv0, 0)}`,
      `tight bar ${i - d0} bars later: range ${fmt(r)}%, change ${fmt(chg)}%, RVol ${fmt(rv, 0)}`,
      `held RE-day low; close ${fmt(((c / e10) - 1) * 100)}% vs EMA10; slope ${fmt(slope)}%/bar`,
    ],
    { reDate: d0Date, barsSinceRe: i - d0, rangePct: r, rvol: rv, slopePct: Number.isFinite(slope) ? slope : 0 },
    trace,
  );
}
