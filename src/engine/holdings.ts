/**
 * Demat holdings (stocks and ETFs) from Paytm Money's read-only API, joined with the screener and live NSE prices.
 * Pure helpers; the Worker fetches them with the read-only token, keeps the last copy under private/ in R2 and serves
 * them only with the passcode. Mutual funds are not in this API.
 */
import type { LiveFile } from "./jobs";
import type { NewsBundle, ScreenRow } from "./types";

export interface Holding {
  isin: string;
  symbol: string;
  name: string;
  qty: number;
  /** Average buy price (Paytm Money's cost price). */
  avg: number;
  /** Paytm Money's last price and previous close at the sync. */
  ltp: number | null;
  prevClose: number | null;
  sector: string | null;
  /** "Large Cap" / "Mid Cap" / "Small Cap" as Paytm Money labels it. */
  mcap: string | null;
  etf: boolean;
}

export interface HoldingsFile {
  version: 1;
  /** When Paytm Money last answered (ISO). */
  fetchedAt: string;
  holdings: Holding[];
}

export interface HoldingRow extends Holding {
  /** Price used: live NSE if current, else Paytm Money's from a sync today, else the last close. */
  price: number | null;
  priceFrom: "nse" | "paytm" | "close" | null;
  value: number | null;
  invested: number;
  pnl: number | null;
  pnlPct: number | null;
  /** Today's move, % and ₹ on this holding; null when not known for today. */
  dayPct: number | null;
  dayPnl: number | null;
  /** Share of the portfolio's current value, %. */
  weight: number | null;
  /** How the screener sees it (from the last close's lists). */
  inScreen: boolean;
  momentum: boolean;
  stage: number | null;
  rs: number | null;
  phase: string | null;
  /** The AI news summary is negative or found a red flag. */
  redFlag: boolean;
  /** Fell 5%+ on 3× volume after its latest results. */
  resultsDrop: boolean;
}

export interface HoldingsSummary {
  n: number;
  value: number;
  invested: number;
  pnl: number;
  pnlPct: number | null;
  dayPnl: number | null;
  dayPct: number | null;
  /** Holdings that are Momentum leaders today. */
  leaders: number;
}

const num = (x: unknown): number | null => {
  const n = typeof x === "number" ? x : typeof x === "string" && x.trim() !== "" ? Number(x) : Number.NaN;
  return Number.isFinite(n) ? n : null;
};
const str = (x: unknown): string | null => (typeof x === "string" && x.trim() ? x.trim() : null);

/** Paytm Money's /holdings/v1/get-user-holdings-data body → holdings (data.results[], or data[] in older answers). */
export function parsePaytmHoldings(body: unknown): Holding[] {
  const data = (body as { data?: unknown } | null)?.data;
  const list = Array.isArray(data) ? data : Array.isArray((data as { results?: unknown } | null)?.results) ? (data as { results: unknown[] }).results : null;
  if (!list) throw new Error("Paytm Money answered without a holdings list.");
  const out: Holding[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const h = raw as Record<string, unknown>;
    const qty = num(h.quantity) ?? 0;
    const isin = str(h.isin_code);
    const symbol = str(h.nse_symbol) ?? str(h.bse_symbol);
    if (!isin || !symbol || qty <= 0) continue;
    const name = str(h.display_name) ?? symbol;
    out.push({
      isin,
      symbol,
      name,
      qty,
      avg: num(h.cost_price) ?? 0,
      ltp: num(h.last_traded_price),
      prevClose: num(h.pc),
      sector: str(h.sector),
      mcap: str(h.mcap_type),
      etf: /\bETF\b|BEES$/i.test(name) || /BEES$|ETF$/i.test(symbol),
    });
  }
  return out;
}

export interface HoldingsContext {
  /** Every liquid stock's row from the last close. */
  rows: ScreenRow[];
  news: Record<string, NewsBundle>;
  /** Live NSE prices, only if current (liveIsFresh). */
  live: Pick<LiveFile, "q"> | null;
  /** symbol → [isin, latest close]. */
  closes: Record<string, [string, number]> | null;
  /** The holdings were fetched today (IST), so Paytm Money's day change is today's. */
  syncedToday: boolean;
}

/** Holdings priced and joined with the screener, biggest first, plus totals. */
export function holdingsView(file: HoldingsFile, ctx: HoldingsContext): { rows: HoldingRow[]; summary: HoldingsSummary } {
  const byIsin = new Map(ctx.rows.map((r) => [r.isin, r]));
  const bySymbol = new Map(ctx.rows.map((r) => [r.symbol, r]));
  const rows: HoldingRow[] = file.holdings.map((h) => {
    let price: number | null = null;
    let priceFrom: HoldingRow["priceFrom"] = null;
    let dayPct: number | null = null;
    const q = ctx.live?.q[h.symbol];
    if (q) {
      [price, dayPct] = [q[0], q[1]];
      priceFrom = "nse";
    } else if (ctx.syncedToday && h.ltp !== null) {
      price = h.ltp;
      priceFrom = "paytm";
      dayPct = h.prevClose ? (h.ltp / h.prevClose - 1) * 100 : null;
    } else {
      const c = ctx.closes?.[h.symbol]?.[1] ?? h.ltp;
      if (c !== null && c !== undefined) {
        price = c;
        priceFrom = "close";
      }
    }
    const invested = h.qty * h.avg;
    const value = price !== null ? h.qty * price : null;
    const pnl = value !== null ? value - invested : null;
    const row = byIsin.get(h.isin) ?? bySymbol.get(h.symbol);
    const ai = ctx.news[h.symbol]?.ai;
    return {
      ...h,
      price,
      priceFrom,
      value,
      invested,
      pnl,
      pnlPct: pnl !== null && invested > 0 ? (pnl / invested) * 100 : null,
      dayPct,
      dayPnl: value !== null && dayPct !== null ? value - value / (1 + dayPct / 100) : null,
      weight: null,
      inScreen: !!row,
      momentum: !!row?.tags.includes("momentum"),
      stage: row?.stage ?? null,
      rs: row?.rs ?? null,
      phase: row?.phase ?? null,
      redFlag: !!ai && (ai.sentiment === "negative" || ai.redFlags.length > 0),
      resultsDrop: row?.resultsReaction?.kind === "breakdown",
    };
  });
  const value = rows.reduce((a, r) => a + (r.value ?? 0), 0);
  for (const r of rows) r.weight = r.value !== null && value > 0 ? (r.value / value) * 100 : null;
  rows.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  const priced = rows.filter((r) => r.value !== null);
  const invested = priced.reduce((a, r) => a + r.invested, 0);
  const pnl = value - invested;
  const withDay = rows.filter((r) => r.dayPnl !== null);
  const dayPnl = withDay.length ? withDay.reduce((a, r) => a + (r.dayPnl as number), 0) : null;
  return {
    rows,
    summary: {
      n: rows.length,
      value,
      invested,
      pnl,
      pnlPct: invested > 0 ? (pnl / invested) * 100 : null,
      dayPnl,
      dayPct: dayPnl !== null && value - dayPnl > 0 ? (dayPnl / (value - dayPnl)) * 100 : null,
      leaders: rows.filter((r) => r.momentum).length,
    },
  };
}

/** The expiry in a JWT's payload (not verified: only to tell the user when to log in again); null if absent. */
export function jwtExpiry(token: string): string | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    const exp = (JSON.parse(atob(b64)) as { exp?: unknown }).exp;
    return typeof exp === "number" && exp > 0 ? new Date(exp * 1000).toISOString() : null;
  } catch {
    return null;
  }
}
