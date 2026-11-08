/**
 * Pure trade management for one open position on day i. The simulator applies the returned actions.
 * RULEBOOK "Trade management and exits" and "Stop rules". Order of checks each day:
 *  1. pending exit-at-open from yesterday's close signal → sell all at the open;
 *  2. stop: open ≤ stop → sell all at the open (gap through, sO2bPsS9KwE); else low ≤ stop → sell all at the stop;
 *  3. partial: high ≥ entry + partialR × R → sell partialFraction at max(open, target) (jfr-kMHSEI4, TJq0CkT-viw);
 *  4. breakeven: high ≥ entry + breakevenR × R → from tomorrow stop = max(stop, entry × 1.003) (Eenfov1IwM4);
 *  5. at the close: parabolic (ZcK5RBAoIY8), 3rd strong day (jMhKXuR0kyk), climax top (n2XnFVrmdRs) sell at the close;
 *     trailing EMA close (KzJIVw2E7g8), optional time stop (CcVEU0M7uPQ) and earnings blackout (1q_GXwfoZqE)
 *     schedule an exit at the next open.
 * Entry day (conservative, documented in DECISIONS.md): if the entry bar's low ≤ stop we assume the stop was hit
 * after the fill and sell at the stop. Otherwise partial/breakeven are allowed on the entry day, because the
 * day's high is necessarily printed at or after a buy-stop fill.
 */
import type { ISODate } from './types.js';
import { partialR, trailEmaPeriod, type SetupName, type StrategyConfig, type StrategySetup } from './config.js';
import { addCalendarDays, anyDateInRange, weekKey } from './dates.js';
import { emaOf, type Features } from './indicators.js';
import { ceilTick } from './ticks.js';

export type ExitReason =
  | 'stop'
  | 'stopGap'
  | 'breakevenStop'
  | 'entryDayStop'
  | 'partial'
  | 'parabolic'
  | 'thirdStrongDay'
  | 'climax'
  | 'trail'
  | 'timeStop'
  | 'earningsBlackout'
  | 'failedBreakout'
  | 'bigRedCandle'
  | 'signalExit'
  | 'rebalance'
  | 'endOfTest';

/** Stop-type exits (for the stop-cluster rule). */
export const STOP_REASONS: ReadonlySet<ExitReason> = new Set<ExitReason>(['stop', 'stopGap', 'breakevenStop', 'entryDayStop']);

export type ExitTiming = 'open' | 'intraday' | 'close';

export interface ExitAction {
  /** Fraction of the CURRENTLY open quantity to sell (1 = everything left). */
  fraction: number;
  /** Price before slippage. */
  price: number;
  reason: ExitReason;
  when: ExitTiming;
}

export interface PositionState {
  setup: StrategySetup;
  /** Whether `stop` is traded (false = nominal stop for R only, e.g. hi52). */
  hardStop: boolean;
  /** Entry price per share (actual fill incl. slippage). */
  entryPrice: number;
  initialStop: number;
  stop: number;
  /** R per share = entryPrice − initialStop. */
  riskPerShare: number;
  /** Bar index of the entry bar in the instrument's Features. */
  entryIndex: number;
  /** Bars managed after the entry bar. */
  barsHeld: number;
  partialTaken: boolean;
  breakevenPending: boolean;
  breakevenMoved: boolean;
  parabolicTaken: boolean;
  thirdStrongTaken: boolean;
  /** Exit scheduled for the next open (set at a close). */
  pendingExit: ExitReason | null;
  /** Partial target in R for this position (set at entry; regime-dependent). */
  partialR: number;
  /** Highest high / lowest low seen since entry (for MFE/MAE). */
  maxHigh: number;
  minLow: number;
  closed: boolean;
}

export interface ManageContext {
  /** Results dates for the instrument, ascending (empty = unknown). */
  resultsDates: readonly ISODate[];
}

export interface ManageResult {
  state: PositionState;
  actions: ExitAction[];
}

export function openPosition(p: { setup: StrategySetup; entryPrice: number; stop: number; entryIndex: number; partialR?: number; hardStop?: boolean }): PositionState {
  return {
    setup: p.setup,
    hardStop: p.hardStop ?? true,
    entryPrice: p.entryPrice,
    initialStop: p.stop,
    stop: p.stop,
    riskPerShare: p.entryPrice - p.stop,
    entryIndex: p.entryIndex,
    barsHeld: 0,
    partialTaken: false,
    breakevenPending: false,
    breakevenMoved: false,
    parabolicTaken: false,
    thirdStrongTaken: false,
    partialR: p.partialR ?? Number.NaN,
    pendingExit: null,
    maxHigh: p.entryPrice,
    minLow: p.entryPrice,
    closed: false,
  };
}

/**
 * Climax-top weekly test (RULEBOOK Exits "Climax top", n2XnFVrmdRs). APPROX: weekly candle = close-to-close change
 * of Monday-based weeks; the current (possibly partial) week's change vs the previous `lookbackWeeks − 1` weeks.
 */
export function weeklyChanges(f: Features, i: number, lookbackWeeks: number): { current: number; maxPrior: number } | null {
  const dateAt = (k: number): ISODate => (f.bars[k] as { date: ISODate }).date;
  const cur = weekKey(dateAt(i));
  let k = i;
  while (k >= 0 && weekKey(dateAt(k)) === cur) k--;
  const weekEnds: number[] = [];
  while (k >= 0 && weekEnds.length < lookbackWeeks) {
    const wk = weekKey(dateAt(k));
    weekEnds.push(f.close[k] as number);
    while (k >= 0 && weekKey(dateAt(k)) === wk) k--;
  }
  const base = weekEnds[0];
  if (base === undefined) return null;
  const current = ((f.close[i] as number) / base - 1) * 100;
  let maxPrior = -Infinity;
  for (let j = 0; j + 1 < weekEnds.length; j++) {
    const chg = ((weekEnds[j] as number) / (weekEnds[j + 1] as number) - 1) * 100;
    if (chg > maxPrior) maxPrior = chg;
  }
  return { current, maxPrior };
}

/** Manage one position for bar i. Pure: returns a new state and the sells to execute. */
export function manageDay(
  pos: PositionState,
  f: Features,
  i: number,
  cfg: StrategyConfig,
  mctx: ManageContext,
  isEntryDay = false,
): ManageResult {
  const s: PositionState = { ...pos };
  const actions: ExitAction[] = [];
  if (s.closed) return { state: s, actions };
  // manageDay runs Ankur's setups only; systematic setups use manageSystematic (systematic.ts).
  const setup = s.setup as SetupName;
  const o = f.open[i] as number;
  const h = f.high[i] as number;
  const l = f.low[i] as number;
  const c = f.close[i] as number;
  const ex = cfg.exits;
  const R = s.riskPerShare;
  const closeAll = (price: number, reason: ExitReason, when: ExitTiming): ManageResult => {
    actions.push({ fraction: 1, price, reason, when });
    s.closed = true;
    s.pendingExit = null;
    return { state: s, actions };
  };

  if (isEntryDay) {
    // Conservative entry-day stop: the low may have printed after the fill (HANDOFF step 3).
    // 'lowFirst' sensitivity: an intraday fill above the open with a close above the stop means the low came first.
    const lowFirst = ex.entryDayStopPolicy === 'lowFirst' && o < s.entryPrice && c > s.stop;
    if (l <= s.stop && !lowFirst) {
      s.minLow = Math.min(s.minLow, l);
      return closeAll(s.stop, 'entryDayStop', 'intraday');
    }
  } else {
    s.barsHeld += 1;
    // 1. Pending exit at the open.
    if (s.pendingExit !== null) {
      s.minLow = Math.min(s.minLow, o);
      s.maxHigh = Math.max(s.maxHigh, o);
      return closeAll(o, s.pendingExit, 'open');
    }
    // Breakeven scheduled yesterday takes effect today.
    if (s.breakevenPending) {
      s.stop = Math.max(s.stop, ceilTick(s.entryPrice * (1 + ex.breakevenOffsetPct / 100), cfg.entry.tick));
      s.breakevenMoved = true;
      s.breakevenPending = false;
    }
    // 2. Stop: gap through → open; else intraday at the stop (GTT).
    if (o <= s.stop) {
      s.minLow = Math.min(s.minLow, o);
      return closeAll(o, 'stopGap', 'open');
    }
    if (l <= s.stop) {
      s.minLow = Math.min(s.minLow, s.stop);
      s.maxHigh = Math.max(s.maxHigh, h);
      return closeAll(s.stop, s.breakevenMoved ? 'breakevenStop' : 'stop', 'intraday');
    }
  }
  s.maxHigh = Math.max(s.maxHigh, h);
  s.minLow = Math.min(s.minLow, l);

  // 3. First partial target.
  if (!s.partialTaken && R > 0) {
    const target = s.entryPrice + (Number.isFinite(s.partialR) ? s.partialR : partialR(cfg, setup)) * R;
    if (h >= target) {
      actions.push({ fraction: ex.partialFraction, price: Math.max(o, target), reason: 'partial', when: 'intraday' });
      s.partialTaken = true;
    }
  }
  // 4. Breakeven (effective from tomorrow).
  if (!s.breakevenMoved && !s.breakevenPending && R > 0 && h >= s.entryPrice + ex.breakevenR * R) {
    s.breakevenPending = true;
  }

  // 5. At the close.
  const pb = ex.parabolic;
  if (pb.enabled && !s.parabolicTaken && i - pb.bars >= 0 && c >= (1 + pb.gainPct / 100) * (f.close[i - pb.bars] as number)) {
    actions.push({ fraction: pb.sellFraction, price: c, reason: 'parabolic', when: 'close' });
    s.parabolicTaken = true;
  }
  const ts = ex.thirdStrongDay;
  if (ts.enabled && !s.thirdStrongTaken && R > 0 && c >= s.entryPrice + ts.minR * R && i - ts.days + 1 >= 0) {
    let all = true;
    for (let k = i - ts.days + 1; k <= i; k++) {
      if (!((f.changePct[k] as number) >= ts.minChangePct)) {
        all = false;
        break;
      }
    }
    if (all) {
      actions.push({ fraction: ts.sellFraction, price: c, reason: 'thirdStrongDay', when: 'close' });
      s.thirdStrongTaken = true;
    }
  }
  const cl = ex.climax;
  if (cl.enabled && c >= s.entryPrice * (1 + cl.minGainFromEntryPct / 100)) {
    const w = weeklyChanges(f, i, cl.lookbackWeeks);
    if (w && w.current >= cl.minWeeklyChangePct && w.current > w.maxPrior) {
      return closeAll(c, 'climax', 'close');
    }
  }
  // Big red candle = setup failed (w1sbooFlgLY @76m; KPuDFFG0Mjc @6m): exit at the close.
  if (ex.bigRedCandle.enabled && !isEntryDay && (f.changePct[i] as number) <= -ex.bigRedCandle.minDropPct) {
    return closeAll(c, 'bigRedCandle', 'close');
  }
  // Failed breakout (J6fSgtkB0gg): a close back below the buy point early in the trade → exit at the next open.
  if (ex.closeBelowEntry.enabled && !s.partialTaken && s.barsHeld <= ex.closeBelowEntry.maxBars && c < s.entryPrice) {
    s.pendingExit = 'failedBreakout';
  }
  // Trailing exit: decisive close below the trailing EMA → next open.
  const trail = emaOf(f, trailEmaPeriod(cfg, setup))[i] as number;
  if (s.pendingExit === null && c < trail * (1 - ex.decisiveClosePct / 100)) {
    s.pendingExit = 'trail';
  }
  const tm = ex.timeStop;
  if (s.pendingExit === null && tm.enabled && s.barsHeld >= tm.bars && R > 0 && (s.maxHigh - s.entryPrice) / R < tm.minMfeR) {
    s.pendingExit = 'timeStop';
  }
  const eb = ex.earningsBlackout;
  if (s.pendingExit === null && eb.enabled && mctx.resultsDates.length > 0 && !eb.exemptSetups.includes(setup)) {
    const d = (f.bars[i] as { date: ISODate }).date;
    if (anyDateInRange(mctx.resultsDates, d, addCalendarDays(d, eb.calendarDays))) s.pendingExit = 'earningsBlackout';
  }
  return { state: s, actions };
}
