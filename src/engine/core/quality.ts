/**
 * Setup-quality filters ("identification", rulebook v2). Applied after a setup detector produced a signal, so they work
 * for every setup. Each filter is a config toggle with Ankur's numbers and cites its source. Uses data ≤ i only.
 *
 * - choppyBase: RULEBOOK "Base and VCP" quality — more green than red bars; no repeated red bars above the 50-day
 *   average volume, especially on the right side (Vycp0gRhxnU, JTbqYRS9o1Y, KzJIVw2E7g8 @22m).
 * - lateStage: +60–70% in 2–3 months without a close below the 20 EMA = late stage, remove (jUHD91ep8xY @11m):
 *   measured as the run since the last close below the 20 EMA within the lookback.
 * - legCount: remove stocks that already have 3 legs (CcVEU0M7uPQ @24–25m); leg = a range-expansion (volume-scan) day.
 * - upperTwoThirds: buy only in the upper two thirds of the base in normal markets (bICwUuwOgNU @12–14m).
 * - pullbackCount: only the 1st or 2nd pullback of a leg (ZcK5RBAoIY8 @19m), for ema20Pullback.
 */
import type { QualityConfig, SetupName, StrategyConfig } from './config.js';
import type { InstrumentContext } from './setups/common.js';
import { fmt } from './universe.js';

/** Returns null if the setup bar passes every enabled quality filter, else the first failure reason. */
export function qualityFailure(ctx: InstrumentContext, i: number, cfg: StrategyConfig, setup: SetupName, trace?: string[]): string | null {
  const q: QualityConfig = cfg.quality;
  const f = ctx.f;
  const reasons: string[] = [];
  const fail = (msg: string): boolean => {
    reasons.push(msg);
    trace?.push(`quality: ${msg}`);
    return !trace; // stop at the first failure unless tracing
  };

  if (q.choppyBase.enabled && !q.choppyBase.exemptSetups.includes(setup)) {
    const lo = Math.max(1, i - q.choppyBase.lookbackBars + 1);
    let red = 0;
    let green = 0;
    let redHiVolRight = 0;
    const rightLo = i - q.choppyBase.rightSideBars + 1;
    for (let k = lo; k <= i; k++) {
      const c = f.close[k] as number;
      const pc = f.prevClose[k] as number;
      if (c < pc) {
        red++;
        if (k >= rightLo && (f.volume[k] as number) > (f.volSma50[k] as number)) redHiVolRight++;
      } else green++;
    }
    if (red > green && fail(`choppy base: ${red} red vs ${green} green bars in ${q.choppyBase.lookbackBars}`)) return reasons[0] ?? null;
    if (redHiVolRight > q.choppyBase.maxRedHighVolBars &&
      fail(`choppy base: ${redHiVolRight} red bars above the 50-day average volume in the last ${q.choppyBase.rightSideBars}`)) return reasons[0] ?? null;
  }

  if (q.lateStage.enabled) {
    // The run since the last close below the 20 EMA (within the lookback; else since the lookback's low).
    const lo = Math.max(0, i - q.lateStage.lookbackBars + 1);
    let lastBelow = -1;
    for (let k = i; k >= lo; k--) {
      if ((f.close[k] as number) < (f.ema20[k] as number)) {
        lastBelow = k;
        break;
      }
    }
    let low = Infinity;
    for (let k = lastBelow >= 0 ? lastBelow : lo; k <= i; k++) low = Math.min(low, f.low[k] as number);
    const runUp = ((f.close[i] as number) / low - 1) * 100;
    if (runUp >= q.lateStage.minRunUpPct &&
      fail(`late stage: +${fmt(runUp, 0)}% since the last close below the 20 EMA (≤ ${q.lateStage.lookbackBars} bars)`)) return reasons[0] ?? null;
  }

  if (q.legCount.enabled) {
    const lo = Math.max(0, i - q.legCount.lookbackBars + 1);
    let legs = 0;
    let prev = -10;
    for (let k = lo; k <= i; k++) {
      // Consecutive RE days are one leg (a leg = 1–2 big expansion candles, ahFVnEzFcag).
      if (ctx.scans.reDay[k] === 1) {
        if (k - prev > 2) legs++;
        prev = k;
      }
    }
    if (legs > q.legCount.maxLegs && fail(`not young: ${legs} range-expansion legs in ${q.legCount.lookbackBars} bars`)) return reasons[0] ?? null;
  }

  if (q.upperTwoThirds.enabled) {
    const lo = Math.max(0, i - q.upperTwoThirds.lookbackBars + 1);
    let hh = -Infinity;
    let ll = Infinity;
    for (let k = lo; k <= i; k++) {
      hh = Math.max(hh, f.high[k] as number);
      ll = Math.min(ll, f.low[k] as number);
    }
    const pos = hh > ll ? ((f.close[i] as number) - ll) / (hh - ll) : 1;
    if (pos < 1 / 3 && fail(`lower third of the ${q.upperTwoThirds.lookbackBars}-bar base (position ${fmt(pos)})`)) return reasons[0] ?? null;
  }

  if (q.pullbackCount.enabled && setup === 'ema20Pullback') {
    // Pullbacks since the leg began: separate touches of the 20 EMA (low ≤ EMA20 × 1.01) since the lowest low of
    // the lookback, counting a touch once per run of touching bars.
    const lo = Math.max(1, i - q.pullbackCount.lookbackBars + 1);
    let lowIdx = lo;
    for (let k = lo; k <= i; k++) if ((f.low[k] as number) < (f.low[lowIdx] as number)) lowIdx = k;
    let touches = 0;
    let inTouch = false;
    for (let k = lowIdx + 1; k <= i; k++) {
      const t = (f.low[k] as number) <= (f.ema20[k] as number) * 1.01;
      if (t && !inTouch) touches++;
      inTouch = t;
    }
    if (touches > q.pullbackCount.maxPullbacks &&
      fail(`pullback #${touches} of the leg (only the 1st/2nd are taken)`)) return reasons[0] ?? null;
  }

  return reasons[0] ?? null;
}
