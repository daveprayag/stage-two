/**
 * Setup registry and per-day signal detection.
 *
 * v1 setups: reContraction, ema20Pullback, depProxy.
 * TODO(v1.1): classic VCP (RULEBOOK "Base and VCP", JiAaLcY6Y1Y) — needs contraction-depth detection.
 * TODO(v1.1): IPO / post-listing (RULEBOOK "IPO and post-listing", TJq0CkT-viw, jvDKg7QzsMI) — uses Instrument.listedInWindow.
 * TODO(v1.1): shakeout (RULEBOOK "Shakeout", QPj8hpHO0rc, w1sbooFlgLY).
 * These are explicitly out of scope for v1.
 *
 * Priority when several setups fire on the same bar: depProxy > reContraction > ema20Pullback
 * (the task brief: "if a bar qualifies for both depProxy and reContraction, emit only depProxy"; the 20 EMA
 * pullback is the lowest-conviction variant). One signal per instrument per day.
 */
import type { SetupName, StrategyConfig } from '../config.js';
import { addCalendarDays, anyDateInRange } from '../dates.js';
import { checkUniverse } from '../universe.js';
import { qualityFailure } from '../quality.js';
import { sectorBlock, type SectorState } from '../sectors.js';
import { scoreSignal, type BenchmarkLookup, type InstrumentContext, type Signal } from './common.js';
import { detectDepProxy } from './depProxy.js';
import { detectEma20Pullback } from './ema20Pullback.js';
import { detectReContraction } from './reContraction.js';
import { detectBaseVcp } from './baseVcp.js';

export * from './common.js';
export { detectDepProxy, latestDepDay } from './depProxy.js';
export { detectEma20Pullback } from './ema20Pullback.js';
export { detectReContraction, latestReDay } from './reContraction.js';
export { detectBaseVcp, findContractions, type Contraction } from './baseVcp.js';

export type SetupDetector = (ctx: InstrumentContext, i: number, cfg: StrategyConfig, trace?: string[]) => Signal | null;

export const SETUP_PRIORITY: readonly SetupName[] = ['depProxy', 'baseVcp', 'reContraction', 'ema20Pullback'];

export const DETECTORS: Readonly<Record<SetupName, SetupDetector>> = {
  depProxy: detectDepProxy,
  reContraction: detectReContraction,
  ema20Pullback: detectEma20Pullback,
  baseVcp: detectBaseVcp,
};

export interface DetectOptions {
  benchmark?: BenchmarkLookup;
  /** Sector baskets (sectors.ts); when given and cfg.sectors.gate/chase are on, blocked sectors give no signal. */
  sectors?: SectorState;
  /** If given, every check runs and each failure is pushed here (for the case harness). */
  trace?: string[];
}

/**
 * Earnings blackout for new entries: no regular setups with results due within ~7 days
 * (RULEBOOK Universe "Earnings blackout", 1q_GXwfoZqE, jvDKg7QzsMI). Assumes the date is known by then.
 */
export function inEarningsBlackout(ctx: InstrumentContext, i: number, cfg: StrategyConfig, setup: SetupName): boolean {
  const eb = cfg.exits.earningsBlackout;
  if (!eb.enabled || ctx.resultsDates.length === 0 || eb.exemptSetups.includes(setup)) return false;
  const d = ctx.f.bars[i]?.date;
  if (!d) return false;
  return anyDateInRange(ctx.resultsDates, d, addCalendarDays(d, eb.calendarDays));
}

export interface DetectAllResult {
  universeOk: boolean;
  /** Every enabled setup that produced a valid signal (priority order). */
  signals: Signal[];
  /** The one signal the engine would act on (highest priority), or null. */
  chosen: Signal | null;
}

/** Evaluate all enabled setups on bar i (for diagnostics). Uses data ≤ i only. */
export function detectAll(ctx: InstrumentContext, i: number, cfg: StrategyConfig, opts: DetectOptions = {}): DetectAllResult {
  const trace = opts.trace;
  let universeOk = checkUniverse(ctx.f, i, cfg, trace);
  const block = sectorBlock(opts.sectors, ctx.isin, ctx.f.bars[i]?.date ?? '', cfg.sectors);
  if (block !== null) {
    trace?.push(`sector: ${block}`);
    universeOk = false;
  }
  const signals: Signal[] = [];
  for (const name of SETUP_PRIORITY) {
    if (!cfg.setups.enabled.includes(name)) continue;
    const sig = DETECTORS[name](ctx, i, cfg, trace);
    if (!sig) continue;
    if (inEarningsBlackout(ctx, i, cfg, name)) {
      trace?.push(`${name}: results due within ${cfg.exits.earningsBlackout.calendarDays} days`);
      continue;
    }
    if (qualityFailure(ctx, i, cfg, name, trace) !== null) continue;
    sig.score = scoreSignal(ctx.f, i, cfg, opts.benchmark);
    signals.push(sig);
  }
  return { universeOk, signals, chosen: universeOk ? (signals[0] ?? null) : null };
}

/** Fast path: the single signal for bar i, or null. Uses data ≤ i only. */
export function detectSignal(ctx: InstrumentContext, i: number, cfg: StrategyConfig, opts: DetectOptions = {}): Signal | null {
  if (opts.trace) return detectAll(ctx, i, cfg, opts).chosen;
  if (!checkUniverse(ctx.f, i, cfg)) return null;
  if (sectorBlock(opts.sectors, ctx.isin, ctx.f.bars[i]?.date ?? '', cfg.sectors) !== null) return null;
  for (const name of SETUP_PRIORITY) {
    if (!cfg.setups.enabled.includes(name)) continue;
    const sig = DETECTORS[name](ctx, i, cfg);
    if (!sig || inEarningsBlackout(ctx, i, cfg, name) || qualityFailure(ctx, i, cfg, name) !== null) continue;
    sig.score = scoreSignal(ctx.f, i, cfg, opts.benchmark);
    return sig;
  }
  return null;
}
