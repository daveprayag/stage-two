/**
 * 20 EMA pullback. RULEBOOK scanner §3 (Ankur's exact 20 EMA scan, L3fiDFZIpzc) plus the pattern from
 * "Setups / 20 EMA pullback" (L3fiDFZIpzc, ZcK5RBAoIY8): prior leg, pullback to/below the 20 EMA,
 * reclaim, tight range around the 20. APPROX pattern: within the last 10 bars a bar with low ≤ EMA20 × 1.01,
 * a later close > EMA20, and a tight day i. Stop = lowest low of the last 3 bars. Max stop 4%. Trails on EMA20.
 */
import type { StrategyConfig } from '../config.js';
import { ema20MomentumLegs, momentumAny } from '../scanners.js';
import { buildSignal, fmt, stopFor, type InstrumentContext, type Signal } from './common.js';

const NAME = 'ema20Pullback';

export function detectEma20Pullback(
  ctx: InstrumentContext,
  i: number,
  cfg: StrategyConfig,
  trace?: string[],
): Signal | null {
  const f = ctx.f;
  const e = cfg.scanners.ema20;
  const pc = cfg.setups.ema20Pullback;
  let ok = true;
  const fail = (msg: string): void => {
    ok = false;
    trace?.push(`${NAME}: ${msg}`);
  };
  const c = f.close[i] as number;
  const m = f.ema20[i] as number;
  // --- Ankur's exact 20 EMA scan (scanner 3) ---
  if (!(c >= m * (1 - e.bandPct / 100) && c <= m * (1 + e.bandPct / 100))) {
    if (!trace) return null;
    fail(`close ${fmt(c)} not within ±${e.bandPct}% of EMA20 ${fmt(m)}`);
  }
  if (!(c > e.minClose)) {
    if (!trace) return null;
    fail(`close ≤ ${e.minClose}`);
  }
  const t = f.turnover50Cr[i] as number;
  if (!(t >= e.minTurnover50Cr)) {
    if (!trace) return null;
    fail(`turnover50 ${fmt(t)} Cr < ${e.minTurnover50Cr}`);
  }
  const vol = f.volume[i] as number;
  if (!(vol > e.minVolume)) {
    if (!trace) return null;
    fail(`volume ${vol} ≤ ${e.minVolume}`);
  }
  const legs = ema20MomentumLegs(cfg);
  const leg = momentumAny(f, i, legs);
  if (leg === null) {
    if (!trace) return null;
    fail(`no momentum leg (${legs.map((l) => `${l.multiple}×low ${l.barsAgo}b`).join(', ')})`);
  }
  // --- Pattern: touch, then reclaim, then tight day i ---
  const lo = Math.max(0, i - pc.lookbackBars + 1);
  let touch = -1;
  for (let k = lo; k <= i - 1; k++) {
    if ((f.low[k] as number) <= (f.ema20[k] as number) * (1 + pc.touchPct / 100)) {
      touch = k;
      break;
    }
  }
  let reclaim = -1;
  if (touch >= 0) {
    for (let j = touch + 1; j <= i; j++) {
      if ((f.close[j] as number) > (f.ema20[j] as number)) {
        reclaim = j;
        break;
      }
    }
  }
  if (touch < 0) {
    if (!trace) return null;
    fail(`no bar in the last ${pc.lookbackBars} with low ≤ EMA20 × ${1 + pc.touchPct / 100}`);
  } else if (reclaim < 0) {
    if (!trace) return null;
    fail(`no close above EMA20 after the touch on ${f.bars[touch]?.date}`);
  }
  const r = f.rangePct[i] as number;
  const chg = f.changePct[i] as number;
  const rv = f.rvol[i] as number;
  if (!(r <= pc.maxRangePct)) {
    if (!trace) return null;
    fail(`range ${fmt(r)}% > ${pc.maxRangePct}`);
  }
  if (!(Math.abs(chg) <= pc.maxAbsChangePct)) {
    if (!trace) return null;
    fail(`|change| ${fmt(chg)}% > ${pc.maxAbsChangePct}`);
  }
  if (!(rv <= pc.maxRvol)) {
    if (!trace) return null;
    fail(`RVol ${fmt(rv, 0)} > ${pc.maxRvol}`);
  }
  // --- Rulebook v2 pullback quality (toggles) ---
  if (pc.maxOffHighPct !== null) {
    const hiIdx = argMaxHigh(f.high, Math.max(0, i - pc.swingLookbackBars + 1), i);
    const off = (1 - c / (f.high[hiIdx] as number)) * 100;
    if (!(off <= pc.maxOffHighPct)) {
      if (!trace) return null;
      fail(`${fmt(off, 1)}% below the swing high > ${pc.maxOffHighPct}%`);
    }
    if (pc.maxRedHighVolBars !== null) {
      let n = 0;
      for (let k = hiIdx + 3; k <= i; k++) {
        if ((f.close[k] as number) < (f.prevClose[k] as number) && (f.volume[k] as number) > (f.volSma50[k] as number)) n++;
      }
      if (n > pc.maxRedHighVolBars) {
        if (!trace) return null;
        fail(`${n} red bars on above-average volume in the pullback`);
      }
    }
  }
  if (pc.nearEma10Pct !== null) {
    const d10 = (c / (f.ema10[i] as number) - 1) * 100;
    if (!(Math.abs(d10) <= pc.nearEma10Pct)) {
      if (!trace) return null;
      fail(`close ${fmt(d10)}% from EMA10, not within ±${pc.nearEma10Pct}%`);
    }
  }
  if (pc.minTightDaysAfterReclaim > 0 && reclaim >= 0) {
    let tight = 0;
    for (let k = reclaim + 1; k <= i; k++) if ((f.rangePct[k] as number) <= pc.maxRangePct && Math.abs(f.changePct[k] as number) <= pc.maxAbsChangePct) tight++;
    if (tight < pc.minTightDaysAfterReclaim) {
      if (!trace) return null;
      fail(`${tight} tight day(s) after the reclaim on ${f.bars[reclaim]?.date} < ${pc.minTightDaysAfterReclaim}`);
    }
  }
  if (!ok || touch < 0 || leg === null) return null;
  const stop = stopFor(f, i, cfg, pc.stopLowestLowBars);
  const touchDate = f.bars[touch]?.date ?? '';
  return buildSignal(
    ctx,
    i,
    cfg,
    NAME,
    touch,
    stop,
    [
      `20 EMA scan: close ${fmt(((c / m) - 1) * 100)}% vs EMA20; momentum ${leg.multiple}× low ${leg.barsAgo} bars ago`,
      `touched EMA20 on ${touchDate}, reclaimed on ${f.bars[reclaim]?.date}`,
      `tight day: range ${fmt(r)}%, change ${fmt(chg)}%, RVol ${fmt(rv, 0)}`,
    ],
    { touchDate, momentumLeg: `${leg.multiple}x${leg.barsAgo}`, rangePct: r, rvol: rv },
    trace,
  );
}

function argMaxHigh(high: Float64Array, from: number, to: number): number {
  let k = from;
  for (let j = from; j <= to; j++) if ((high[j] as number) >= (high[k] as number)) k = j;
  return k;
}
