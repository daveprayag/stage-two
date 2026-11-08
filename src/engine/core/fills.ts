/**
 * Next-session entry fill for a buy-stop-limit order, evaluated on the fill day's daily bar.
 * RULEBOOK "Entry mechanics": trigger at the setup bar's high, limit 0.5–1% above, never market (YBl0Orf-5I4);
 * gap skip if the open is > 3% above the trigger, don't chase (sO2bPsS9KwE, jfr-kMHSEI4, w1sbooFlgLY);
 * don't buy a stock already up 8–9% on the day (w1sbooFlgLY). Daily-bar rules (HANDOFF step 3):
 *
 *  1. open > trigger × (1 + gapSkipPct%)            → cancelled ('gapSkip')
 *  2. high < trigger                                 → not triggered
 *  3. open ≤ limit                                   → fill at max(open, trigger)
 *  4. limit < open ≤ trigger × (1 + gapSkipPct%)     → fill at the limit if low ≤ limit, else 'limitMissed'
 *  5. fill ≥ prevClose × (1 + dayMoveCapPct%)        → skipped ('dayMoveCap')
 *
 * Prices are before slippage; the simulator applies slippage and charges (costs.ts).
 */
import type { Bar } from './types.js';
import type { EntryConfig } from './config.js';
import { floorTick } from './ticks.js';

export type FillOutcome = 'filled' | 'gapSkip' | 'notTriggered' | 'limitMissed' | 'dayMoveCap';

export type FillResult = { kind: 'filled'; price: number } | { kind: Exclude<FillOutcome, 'filled'> };

export interface EntryOrder {
  trigger: number;
  limit: number;
}

export function fillEntry(order: EntryOrder, bar: Pick<Bar, 'open' | 'high' | 'low' | 'prevClose'>, entry: EntryConfig): FillResult {
  const { trigger, limit } = order;
  const gapCap = trigger * (1 + entry.gapSkipPct / 100);
  if (bar.open > gapCap) return { kind: 'gapSkip' };
  if (bar.high < trigger) return { kind: 'notTriggered' };
  let price: number;
  if (bar.open <= limit) price = Math.max(bar.open, trigger);
  else if (bar.low <= limit) price = limit;
  else return { kind: 'limitMissed' };
  if (bar.prevClose > 0 && price >= bar.prevClose * (1 + entry.dayMoveCapPct / 100)) return { kind: 'dayMoveCap' };
  return { kind: 'filled', price };
}

/**
 * Market-on-open fill for systematic strategies (decided at the prior close): fill at the open unless it gaps above
 * the order's limit (signal close × (1 + max gap %)). Price before slippage.
 */
export function fillAtOpen(order: { limit: number }, bar: Pick<Bar, 'open'>): FillResult {
  return bar.open <= order.limit ? { kind: 'filled', price: bar.open } : { kind: 'gapSkip' };
}

/**
 * Protective stop for a market-on-open entry: placed after the fill at `stopPct` below the fill price (rounded down to
 * the tick). The signal-day stop (from the prior close) would sit above the fill after a gap down.
 */
export function openEntryStop(fillPrice: number, stopPct: number, tick: number): number {
  return floorTick(fillPrice * (1 - stopPct / 100), tick);
}
