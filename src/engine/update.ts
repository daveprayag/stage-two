/**
 * Append one session to the rolling price store (pure; mutates the store passed in).
 * Order: ISIN changes → split/bonus adjustment of the history → today's bar → indices → bands → trim.
 */
import { applyFactor, corpActionFactor, gapFactor } from "./adjust";
import type { BhavRow, CorpAction } from "./nse";
import type { ISODate, PriceStore, StockSeries } from "./types";

export const WINDOW = 300;
/** Stocks with no trade in this many sessions are dropped (delisted / suspended). */
export const STALE_SESSIONS = 30;

export interface SessionInput {
  date: ISODate;
  rows: BhavRow[];
  indexCloses: Map<string, number>;
  /** symbol → band (null = no band); undefined when the band file was unavailable. */
  bands?: Map<string, number | null>;
  /** Corporate actions (any dates; only this session's ex-dates are used); undefined when the API failed. */
  corpActions?: CorpAction[];
}

function lastClose(s: StockSeries, before: number): number | null {
  for (let k = before - 1; k >= 0; k--) {
    const c = s.c[k];
    if (c !== null && c !== undefined) return c;
  }
  return null;
}

function emptySeries(row: BhavRow, len: number, date: ISODate): StockSeries {
  const nulls = () => Array<number | null>(len).fill(null);
  return {
    isin: row.isin, symbol: row.symbol, name: row.name || row.symbol, series: row.series, industry: null, band: null,
    listed: date, o: nulls(), h: nulls(), l: nulls(), c: nulls(), v: nulls(),
  };
}

export function appendSession(store: PriceStore, input: SessionInput, window = WINDOW): string[] {
  const log: string[] = [];
  const { date } = input;
  if (store.dates.length && date <= store.asOf) throw new Error(`session ${date} is not after ${store.asOf}`);
  store.dates.push(date);
  const k = store.dates.length - 1;
  for (const s of Object.values(store.stocks)) for (const key of ["o", "h", "l", "c", "v"] as const) s[key].push(null);
  for (const arr of Object.values(store.indices)) arr.push(null);

  const today = new Set(input.rows.map((r) => r.isin));
  const bySymbol = new Map(Object.values(store.stocks).map((s) => [s.symbol, s]));
  const actions = (input.corpActions ?? []).filter((a) => a.exDate === date);
  let added = 0;
  let adjusted = 0;

  for (const row of input.rows) {
    let s = store.stocks[row.isin];
    if (!s) {
      const prev = bySymbol.get(row.symbol);
      if (prev && !today.has(prev.isin)) {
        // Same symbol, new ISIN (NSE issues a new ISIN on some splits): follow it.
        delete store.stocks[prev.isin];
        log.push(`${row.symbol}: ISIN ${prev.isin} → ${row.isin}`);
        prev.isin = row.isin;
        s = prev;
      } else {
        s = emptySeries(row, store.dates.length, date);
        added++;
      }
      store.stocks[row.isin] = s;
    }
    // Split / bonus on this ex-date: API first, else an unexplained ≥ 1.9× gap snapped to a common ratio.
    const action = actions.find((a) => a.symbol === row.symbol || (a.isin !== null && a.isin === row.isin));
    let factor = action ? corpActionFactor(action.subject) : null;
    const lc = lastClose(s, k);
    if (factor === null && lc !== null && !action) {
      const g = gapFactor(lc, row.open, row.close);
      if (g !== null) {
        factor = g;
        log.push(`${row.symbol}: unexplained ${(lc / row.close).toFixed(2)}× gap treated as a ${g}× split/bonus`);
      }
    }
    if (factor !== null && factor !== 1 && k > 0) {
      applyFactor(s, factor, k);
      adjusted++;
      log.push(`${row.symbol}: history adjusted by ${factor} (${action?.subject ?? "price gap"})`);
    }
    s.o[k] = row.open;
    s.h[k] = row.high;
    s.l[k] = row.low;
    s.c[k] = row.close;
    s.v[k] = row.volume;
    s.symbol = row.symbol;
    s.series = row.series;
    if (row.name) s.name = row.name;
  }

  for (const [name, close] of input.indexCloses) {
    const arr = (store.indices[name] ??= Array<number | null>(store.dates.length).fill(null));
    arr[k] = close;
  }
  if (input.bands) {
    for (const s of Object.values(store.stocks)) {
      if (input.bands.has(s.symbol)) s.band = input.bands.get(s.symbol) ?? null;
    }
  }

  // Trim to the window and drop stale stocks.
  const extra = store.dates.length - window;
  if (extra > 0) {
    store.dates.splice(0, extra);
    for (const s of Object.values(store.stocks)) for (const key of ["o", "h", "l", "c", "v"] as const) s[key].splice(0, extra);
    for (const arr of Object.values(store.indices)) arr.splice(0, extra);
  }
  let dropped = 0;
  const n = store.dates.length;
  for (const [isin, s] of Object.entries(store.stocks)) {
    let seen = false;
    for (let j = Math.max(0, n - STALE_SESSIONS); j < n; j++) if (s.c[j] !== null) seen = true;
    if (!seen) {
      delete store.stocks[isin];
      dropped++;
    }
  }
  store.asOf = date;
  log.unshift(`${date}: ${input.rows.length} stocks, ${input.indexCloses.size} indices, ${added} new, ${adjusted} adjusted, ${dropped} dropped`);
  return log;
}
