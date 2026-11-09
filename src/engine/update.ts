/**
 * Add new sessions to the rolling price store.
 * Order per stock and session: ISIN change → split/bonus adjustment of the history → the session's bar; then bands,
 * trimming to WINDOW sessions and dropping stocks that stopped trading.
 *
 * SessionsUpdater works one stock at a time so the Cloudflare Worker can stream the store (128 MB memory):
 *   const u = new SessionsUpdater(head, sessions, WINDOW, head.isins);   // mutates head: dates, indices, asOf
 *   for each stored stock: const s2 = u.update(s); if (s2) keep s2
 *   for (const s of u.finish()) keep s                                  // new listings
 * appendSession() is the in-memory wrapper (tests, local scripts) and uses the same code.
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

const FIELDS = ["o", "h", "l", "c", "v"] as const;

function lastClose(s: StockSeries, before: number): number | null {
  for (let k = before - 1; k >= 0; k--) {
    const c = s.c[k];
    if (c !== null && c !== undefined) return c;
  }
  return null;
}

export type StoreHeadMut = Pick<PriceStore, "dates" | "asOf" | "indices">;

export class SessionsUpdater {
  readonly log: string[] = [];
  private readonly base: number;
  private readonly extra: number;
  private readonly isins: Set<string>;
  private readonly byIsin: Map<string, BhavRow>[];
  private readonly bySymbol: Map<string, BhavRow>[];
  private readonly consumed: Set<string>[];
  private readonly actions: CorpAction[][];
  private readonly bands: Map<string, number | null> | undefined;
  private added = 0;
  private adjusted = 0;
  private dropped = 0;

  constructor(head: StoreHeadMut, private readonly inputs: SessionInput[], private readonly window = WINDOW, storeIsins: Iterable<string> = []) {
    let prev = head.dates.length ? head.asOf : "";
    for (const inp of inputs) {
      if (prev && inp.date <= prev) throw new Error(`session ${inp.date} is not after ${prev}`);
      prev = inp.date;
    }
    this.base = head.dates.length;
    this.isins = new Set(storeIsins);
    this.byIsin = inputs.map((inp) => new Map(inp.rows.map((r) => [r.isin, r])));
    this.bySymbol = inputs.map((inp) => new Map(inp.rows.map((r) => [r.symbol, r])));
    this.consumed = inputs.map(() => new Set<string>());
    this.actions = inputs.map((inp) => (inp.corpActions ?? []).filter((a) => a.exDate === inp.date));
    this.bands = [...inputs].reverse().find((inp) => inp.bands)?.bands;
    // Head: new dates and index closes, then trim to the window.
    for (const inp of inputs) {
      head.dates.push(inp.date);
      const k = head.dates.length - 1;
      for (const arr of Object.values(head.indices)) while (arr.length <= k) arr.push(null);
      for (const [name, close] of inp.indexCloses) {
        const arr = (head.indices[name] ??= Array<number | null>(head.dates.length).fill(null));
        arr[k] = close;
      }
    }
    this.extra = Math.max(0, head.dates.length - window);
    if (this.extra) {
      head.dates.splice(0, this.extra);
      for (const arr of Object.values(head.indices)) arr.splice(0, this.extra);
    }
    if (inputs.length) head.asOf = inputs[inputs.length - 1]!.date;
  }

  /** Apply the sessions to one stored stock (mutated); null if it should be dropped (stopped trading). */
  update(s: StockSeries, startSession = 0): StockSeries | null {
    for (let j = startSession; j < this.inputs.length; j++) {
      const k = this.base + j;
      for (const f of FIELDS) while (s[f].length <= k) s[f].push(null);
      let row = this.byIsin[j]!.get(s.isin);
      if (!row) {
        const bySym = this.bySymbol[j]!.get(s.symbol);
        if (bySym && !this.isins.has(bySym.isin) && !this.consumed[j]!.has(bySym.isin)) {
          // Same symbol, new ISIN (NSE issues a new ISIN on some splits): follow it.
          this.log.push(`${s.symbol}: ISIN ${s.isin} → ${bySym.isin}`);
          s.isin = bySym.isin;
          this.isins.add(bySym.isin);
          row = bySym;
        }
      }
      if (!row) continue;
      this.consumed[j]!.add(row.isin);
      // Split / bonus on this ex-date: API first, else an unexplained ≥ 1.9× gap snapped to a common ratio.
      const action = this.actions[j]!.find((a) => a.symbol === row.symbol || (a.isin !== null && a.isin === row.isin));
      let factor = action ? corpActionFactor(action.subject) : null;
      const lc = lastClose(s, k);
      if (factor === null && lc !== null && !action) {
        const g = gapFactor(lc, row.open, row.close);
        if (g !== null) {
          factor = g;
          this.log.push(`${row.symbol}: unexplained ${(lc / row.close).toFixed(2)}× gap treated as a ${g}× split/bonus`);
        }
      }
      if (factor !== null && factor !== 1 && k > 0) {
        applyFactor(s, factor, k);
        this.adjusted++;
        this.log.push(`${row.symbol}: history adjusted by ${factor} (${action?.subject ?? "price gap"})`);
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
    if (this.bands?.has(s.symbol)) s.band = this.bands.get(s.symbol) ?? null;
    if (this.extra) for (const f of FIELDS) s[f].splice(0, this.extra);
    const n = s.c.length;
    let seen = false;
    for (let j = Math.max(0, n - STALE_SESSIONS); j < n && !seen; j++) if (s.c[j] !== null) seen = true;
    if (!seen) {
      this.dropped++;
      return null;
    }
    return s;
  }

  /** New listings: rows no stored stock claimed. Call after every stored stock went through update(). */
  finish(): StockSeries[] {
    const out: StockSeries[] = [];
    for (let j = 0; j < this.inputs.length; j++) {
      for (const row of this.inputs[j]!.rows) {
        if (this.consumed[j]!.has(row.isin) || this.isins.has(row.isin)) continue;
        this.isins.add(row.isin);
        const len = this.base + j;
        const nulls = () => Array<number | null>(len).fill(null);
        const s: StockSeries = {
          isin: row.isin, symbol: row.symbol, name: row.name || row.symbol, series: row.series, industry: null, band: null,
          listed: this.inputs[j]!.date, o: nulls(), h: nulls(), l: nulls(), c: nulls(), v: nulls(),
        };
        const kept = this.update(s, j);
        if (kept) {
          out.push(kept);
          this.added++;
        }
      }
    }
    for (const inp of this.inputs) {
      this.log.unshift(`${inp.date}: ${inp.rows.length} stocks, ${inp.indexCloses.size} indices`);
    }
    this.log.push(`${this.added} new, ${this.adjusted} adjusted, ${this.dropped} dropped`);
    return out;
  }
}

/** In-memory wrapper: add one session to a whole store (mutated). Returns the log. */
export function appendSession(store: PriceStore, input: SessionInput, window = WINDOW): string[] {
  const u = new SessionsUpdater(store, [input], window, Object.keys(store.stocks));
  const next: Record<string, StockSeries> = {};
  for (const s of Object.values(store.stocks)) {
    const kept = u.update(s);
    if (kept) next[kept.isin] = kept;
  }
  for (const s of u.finish()) next[s.isin] = s;
  store.stocks = next;
  return u.log;
}
