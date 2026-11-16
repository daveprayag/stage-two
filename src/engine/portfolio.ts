/**
 * Price history for the holdings page's charts: daily closes of the held stocks and ETFs, and NIFTY 500, from the
 * price store (split/bonus-adjusted). Pure: the Worker reads the store and caches the result.
 *
 * The portfolio line is today's holdings at today's quantities, priced back in time. It is not your past returns:
 * buys and sells are not in it. Each day's return is the value-weighted return of the holdings that traded on both
 * days, so a stock that listed later joins the line on its first day instead of jumping it.
 */
import type { StoreHeadFile } from "./storefile";
import type { ISODate, StockSeries } from "./types";

export const HISTORY_SESSIONS = 260;

export interface HoldingsHistory {
  version: 1;
  asOf: ISODate;
  dates: ISODate[];
  nifty500: (number | null)[];
  /** Closes aligned with `dates`, by symbol (null = did not trade or not listed yet). */
  closes: Record<string, (number | null)[]>;
}

/** The last HISTORY_SESSIONS sessions of the held symbols (series found by ISIN, else by symbol). */
export function buildHoldingsHistory(head: Pick<StoreHeadFile, "asOf" | "dates" | "indices">, series: StockSeries[], held: { isin: string; symbol: string }[], n = HISTORY_SESSIONS): HoldingsHistory {
  const from = Math.max(0, head.dates.length - n);
  const byIsin = new Map(series.map((s) => [s.isin, s]));
  const bySymbol = new Map(series.map((s) => [s.symbol, s]));
  const closes: HoldingsHistory["closes"] = {};
  for (const h of held) {
    const s = byIsin.get(h.isin) ?? bySymbol.get(h.symbol);
    if (s) closes[h.symbol] = s.c.slice(from);
  }
  return { version: 1, asOf: head.asOf, dates: head.dates.slice(from), nifty500: (head.indices["NIFTY 500"] ?? []).slice(from), closes };
}

/** Cache key: the session and the held symbols. */
export const historyKey = (asOf: string, symbols: string[]) => `${asOf}|${[...symbols].sort().join(",")}`;

/**
 * Growth of today's holdings (₹1 → x) over the sessions from `start`, chain-linked from daily value-weighted returns.
 * `extra` appends a point (live prices now) as { closes by symbol }.
 */
export function basketGrowth(h: Pick<HoldingsHistory, "dates" | "closes">, qty: Record<string, number>, start: number, extra?: Record<string, number | null>): number[] {
  const syms = Object.keys(qty).filter((s) => h.closes[s]);
  const at = (s: string, i: number): number | null => (i < h.dates.length ? h.closes[s]![i] ?? null : extra?.[s] ?? null);
  const end = h.dates.length + (extra ? 1 : 0);
  const out = [1];
  for (let i = start + 1; i < end; i++) {
    let before = 0;
    let after = 0;
    for (const s of syms) {
      const a = at(s, i - 1);
      const b = at(s, i);
      if (a === null || b === null || a <= 0) continue;
      before += qty[s]! * a;
      after += qty[s]! * b;
    }
    out.push(out[out.length - 1]! * (before > 0 ? after / before : 1));
  }
  return out;
}

/** An index or a stock as growth (first known close → 1); null before it has a close. */
export function growth(values: (number | null)[], start: number, extra?: number | null): (number | null)[] {
  const xs = [...values.slice(start), ...(extra !== undefined ? [extra] : [])];
  const base = xs.find((x) => x !== null && x > 0) ?? null;
  return xs.map((x) => (x === null || base === null ? null : x / base));
}
