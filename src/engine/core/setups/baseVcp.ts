/**
 * Base / VCP pivot (rulebook v2). RULEBOOK "Base and VCP" (JiAaLcY6Y1Y, Eenfov1IwM4, 3NIn2dlLSCY, Vycp0gRhxnU,
 * w1sbooFlgLY): a stage-2 stock after a prior advance builds a base of ≥ 2 contractions, each shallower than the last
 * with higher lows; the last contraction is single-digit %; volume dries up; buy above the tightest, lowest-volume bar
 * (PDH entry, Eenfov1IwM4) in the upper part of the base; never wait for the whole base's high.
 *
 * Detection on bars ≤ i only:
 *  1. Base start s = highest high in [i − maxBaseBars, i − minBaseBars]. Prior advance into s: high[s] ≥
 *     (1 + priorMovePct%) × lowest low of the `priorMoveLookbackBars` bars before s ("institutional footprint").
 *  2. Base depth (high[s] − lowest low in [s, i]) / high[s] ≤ maxDepthPct (re-base ≤ 35%, WABVcgG2MSE).
 *  3. Swing highs inside the base: a bar whose high is the max of [k − 2, k + 2] with k + 2 ≤ i (confirmed, causal).
 *     Contraction j = from swing high H_j to the lowest low before the next swing high (the last one runs to i).
 *     Contractions shallower than minContractionPct are noise and merged away.
 *  4. ≥ minContractions contractions; the last ≤ maxDepthRatio × the deepest earlier one, its low above the base low,
 *     and ≤ maxLastContractionPct (single digit).
 *  5. Trend: close > EMA50 and EMA50 > EMA200 (stage 2 / trend template, JiAaLcY6Y1Y).
 *  6. Setup bar i: range ≤ maxRangePct, |change| ≤ maxAbsChangePct, RVol ≤ maxRvol and volume below the average of the
 *     previous `dryUpBars` bars; close in the upper `upperFraction` of the base range.
 * Stop = setup-bar low minus buffer (tight-range max 4%). Trails on the 'base' EMA (20).
 */
import type { StrategyConfig } from '../config.js';
import { maxOf, minOf } from '../indicators.js';
import { floorTick } from '../ticks.js';
import { buildSignal, fmt, stopFor, type InstrumentContext, type Signal } from './common.js';

const NAME = 'baseVcp';

export interface Contraction {
  highIdx: number;
  lowIdx: number;
  depthPct: number;
}

/**
 * Contractions in [s, i] from confirmed swing highs (causal: a swing high at k needs bars up to k + 2 ≤ i).
 * Depth = (swing high − lowest low before the next swing high) / swing high. Contractions shallower than
 * minDepthPct are noise and dropped; a later swing high at/above the previous one that also undercuts its low
 * replaces it (one wide contraction, not two).
 */
export function findContractions(high: ArrayLike<number>, low: ArrayLike<number>, s: number, i: number, minDepthPct: number): Contraction[] {
  const pivots: number[] = [s];
  for (let k = s + 1; k <= i - 2; k++) {
    const h = high[k] as number;
    let isMax = true;
    for (let j = k - 2; j <= k + 2; j++) {
      if (j !== k && j >= s && (high[j] as number) > h) {
        isMax = false;
        break;
      }
    }
    if (isMax) pivots.push(k);
  }
  const out: Contraction[] = [];
  for (let p = 0; p < pivots.length; p++) {
    const hi = pivots[p] as number;
    const end = p + 1 < pivots.length ? (pivots[p + 1] as number) - 1 : i;
    if (end <= hi) continue;
    let lowIdx = hi + 1;
    for (let k = hi + 1; k <= end; k++) if ((low[k] as number) < (low[lowIdx] as number)) lowIdx = k;
    const depthPct = (1 - (low[lowIdx] as number) / (high[hi] as number)) * 100;
    if (depthPct < minDepthPct) continue;
    const prev = out[out.length - 1];
    if (prev && (high[hi] as number) >= (high[prev.highIdx] as number) && (low[lowIdx] as number) <= (low[prev.lowIdx] as number)) {
      out[out.length - 1] = { highIdx: hi, lowIdx, depthPct };
      continue;
    }
    out.push({ highIdx: hi, lowIdx, depthPct });
  }
  return out;
}

export function detectBaseVcp(ctx: InstrumentContext, i: number, cfg: StrategyConfig, trace?: string[]): Signal | null {
  const b = cfg.setups.baseVcp;
  const f = ctx.f;
  const no = (msg: string): null => {
    trace?.push(`${NAME}: ${msg}`);
    return null;
  };
  if (i < b.maxBaseBars + b.priorMoveLookbackBars) return no('not enough history');
  // 5. Trend template first (cheap).
  const c = f.close[i] as number;
  const e50 = f.ema50[i] as number;
  const e200 = f.ema200[i] as number;
  if (!(c > e50 && e50 > e200)) return no(`not stage 2: close ${fmt(c)}, EMA50 ${fmt(e50)}, EMA200 ${fmt(e200)}`);
  // 6. Setup bar tight and dry.
  const r = f.rangePct[i] as number;
  const chg = f.changePct[i] as number;
  const rv = f.rvol[i] as number;
  if (!(r <= b.maxRangePct)) return no(`range ${fmt(r)}% > ${b.maxRangePct}`);
  if (!(Math.abs(chg) <= b.maxAbsChangePct)) return no(`|change| ${fmt(chg)}% > ${b.maxAbsChangePct}`);
  if (!(rv <= b.maxRvol)) return no(`RVol ${fmt(rv, 0)} > ${b.maxRvol}`);
  // Dry: below the average volume of the previous `dryUpBars` bars (calibrated on SHYAMMETL 2023-12-04 and RAMKY
  // 2022-12-01, whose entry bars were dry but not the single lowest-volume bar; DECISIONS.md 2026-11-08).
  let sumVol = 0;
  for (let k = i - b.dryUpBars; k <= i - 1; k++) sumVol += f.volume[k] as number;
  const avgPrev = sumVol / b.dryUpBars;
  if (!((f.volume[i] as number) < avgPrev)) return no(`volume ${fmt(f.volume[i] as number, 0)} not below the ${b.dryUpBars}-bar average ${fmt(avgPrev, 0)}`);
  // 1. Base start and prior advance.
  let s = i - b.maxBaseBars;
  for (let k = i - b.maxBaseBars; k <= i - b.minBaseBars; k++) if ((f.high[k] as number) >= (f.high[s] as number)) s = k;
  const priorLow = minOf(f.low, s - b.priorMoveLookbackBars, s - 1);
  const advance = ((f.high[s] as number) / priorLow - 1) * 100;
  if (!(advance >= b.priorMovePct)) return no(`prior advance ${fmt(advance, 0)}% < ${b.priorMovePct}% into the base high on ${f.bars[s]?.date}`);
  if ((maxOf(f.high, s + 1, i) as number) > (f.high[s] as number)) return no('price already above the base high');
  // 2. Depth.
  const baseLow = minOf(f.low, s, i);
  const depth = (1 - baseLow / (f.high[s] as number)) * 100;
  if (!(depth <= b.maxDepthPct)) return no(`base depth ${fmt(depth, 1)}% > ${b.maxDepthPct}%`);
  const pos = ((c - baseLow) / ((f.high[s] as number) - baseLow));
  if (!(pos >= 1 - b.upperFraction)) return no(`close in the lower part of the base (position ${fmt(pos)})`);
  // 3–4. Contractions.
  const cs = findContractions(f.high, f.low, s, i, b.minContractionPct);
  if (cs.length < b.minContractions) return no(`${cs.length} contraction(s) < ${b.minContractions}`);
  // Tightening left to right, read the way he reads charts (SHYAMMETL 2023-12-04 "13% → 9% → 3%" skips an October
  // swing that undercut September's low): the last contraction is ≤ maxDepthRatio × the deepest earlier one and its
  // low stays above the base's lowest low (higher low on the right side). APPROX, DECISIONS.md 2026-11-08.
  const last = cs[cs.length - 1] as Contraction;
  const deepestEarlier = Math.max(...cs.slice(0, -1).map((x) => x.depthPct));
  if (!(last.depthPct <= deepestEarlier * b.maxDepthRatio)) return no(`last contraction ${fmt(last.depthPct, 1)}% not tighter than the deepest earlier ${fmt(deepestEarlier, 1)}%`);
  if (!((f.low[last.lowIdx] as number) > baseLow)) return no('last contraction undercut the base low (no higher low)');
  const lastDepth = last.depthPct;
  if (!(lastDepth <= b.maxLastContractionPct)) return no(`last contraction ${fmt(lastDepth, 1)}% > ${b.maxLastContractionPct}%`);
  const stop =
    b.stopMode === 'lastContraction'
      ? floorTick(Math.min(f.low[last.lowIdx] as number, f.low[i] as number) * (1 - cfg.stops.bufferPct / 100), cfg.entry.tick)
      : stopFor(f, i, cfg);
  const depths = cs.map((x) => fmt(x.depthPct, 0)).join('→');
  return buildSignal(
    ctx, i, cfg, NAME, s, stop,
    [
      `base from ${f.bars[s]?.date} after +${fmt(advance, 0)}%; depth ${fmt(depth, 1)}%; ${cs.length}T ${depths}%`,
      `tight dry bar: range ${fmt(r)}%, change ${fmt(chg)}%, RVol ${fmt(rv, 0)}; position in base ${fmt(pos)}`,
    ],
    { baseStart: f.bars[s]?.date ?? '', contractions: cs.length, depths, depthPct: depth, rvol: rv },
    trace,
  );
}
