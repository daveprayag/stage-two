/**
 * Demat holdings (stocks and ETFs) from Paytm Money's read-only API, joined with the screener and live NSE prices.
 * Pure helpers; the Worker fetches them with the read-only token, keeps the last copy under private/ in R2 and serves
 * them only with the passcode. Mutual funds are not in this API.
 */
import { bizView, type BizView, type BusinessFile } from "./business";
import type { LiveFile } from "./jobs";
import type { ISODate, NewsBundle, ScreenRow } from "./types";

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

/**
 * One buy, for the tested plan: stop at the 10-session low before the buy (set once), hold 6 months. Paytm Money's API
 * has no trade history, so buys are found by comparing each holdings read with the last one: a new stock or a higher
 * quantity is a buy, priced from the change in Paytm Money's average cost. Shares held before tracking began have no
 * date. Sells take the oldest shares first (as Indian tax rules count them).
 */
export interface Lot {
  qty: number;
  /** Buy price; for shares held before tracking began, Paytm Money's average cost then. */
  price: number;
  /** Session of the buy (IST); null = held before tracking began. */
  date: ISODate | null;
  /** The read before this buy was seen (ISO): the buy happened after it. */
  after: string | null;
  /** The plan's stop: the 10-session low up to the last close before the buy, from that day's lists; null if not screened. */
  stop: number | null;
  /** The lists were from the session just before the buy, so the stop is exactly the tested one. */
  stopExact: boolean;
}

export interface LotsFile {
  version: 1;
  /** The read these lots match (ISO). */
  updatedAt: string;
  byIsin: Record<string, { symbol: string; qty: number; avg: number; lots: Lot[] }>;
}

/** Calendar months later (the site's "6 months" hold), ISO date. */
export function addMonths(d: ISODate, m: number): ISODate {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCMonth(x.getUTCMonth() + m);
  return x.toISOString().slice(0, 10);
}

const IST_MS = 330 * 60_000;
const istDate = (iso: string): ISODate => new Date(Date.parse(iso) + IST_MS).toISOString().slice(0, 10);

/** The session a buy seen at `now` belongs to: today once the market has opened on a weekday, else the last close. */
export function buySession(now: string, lastClose: ISODate | null): ISODate {
  const t = new Date(Date.parse(now) + IST_MS);
  const wd = t.getUTCDay();
  const opened = wd >= 1 && wd <= 5 && t.getUTCHours() * 60 + t.getUTCMinutes() >= 9 * 60 + 15;
  return opened || !lastClose ? t.toISOString().slice(0, 10) : lastClose;
}

/** Take `n` shares off, oldest first (shares held before tracking count as oldest). */
function sell(lots: Lot[], n: number): Lot[] {
  const ordered = [...lots].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  const out: Lot[] = [];
  let left = n;
  for (const l of ordered) {
    if (left >= l.qty) {
      left -= l.qty;
      continue;
    }
    out.push(left > 0 ? { ...l, qty: l.qty - left } : l);
    left = 0;
  }
  return out;
}

/**
 * Lots after a new holdings read. `asOf` is the session the screener's lists (and their 10-day lows) come from.
 * An empty read while lots exist is treated as a glitch and changes nothing.
 */
export function updateLots(prev: LotsFile | null, file: HoldingsFile, ctx: { rows: ScreenRow[]; asOf: ISODate | null }): LotsFile {
  if (prev && !file.holdings.length && Object.keys(prev.byIsin).length) return prev;
  const byIsinRow = new Map(ctx.rows.map((r) => [r.isin, r]));
  const date = buySession(file.fetchedAt, ctx.asOf);
  const byIsin: LotsFile["byIsin"] = {};
  for (const h of file.holdings) {
    const p = prev?.byIsin[h.isin];
    const lot = (qty: number, price: number): Lot => {
      const row = byIsinRow.get(h.isin);
      const stop = row?.low10 ?? null;
      const exact = !!ctx.asOf && ctx.asOf < date && !!prev && istDate(prev.updatedAt) >= ctx.asOf;
      return { qty, price, date, after: prev?.updatedAt ?? null, stop, stopExact: stop !== null && exact };
    };
    let lots: Lot[];
    if (!prev) lots = [{ qty: h.qty, price: h.avg, date: null, after: null, stop: null, stopExact: false }];
    else if (!p) lots = [lot(h.qty, h.avg)];
    else if (h.qty === p.qty) lots = p.lots;
    else {
      const before = p.qty * p.avg;
      const after = h.qty * h.avg;
      const f = h.qty / p.qty;
      if (before > 0 && Math.abs(after - before) / before < 0.01 && (f >= 1.4 || f <= 0.72)) {
        // Same money, a much different share count: a bonus or split, not a trade. Rescale the lots.
        lots = p.lots.map((l) => ({ ...l, qty: l.qty * f, price: l.price / f, stop: l.stop === null ? null : l.stop / f }));
      } else if (h.qty > p.qty) {
        const added = h.qty - p.qty;
        const price = (after - before) / added;
        lots = [...p.lots, lot(added, price > 0 ? price : h.avg)];
      } else lots = sell(p.lots, p.qty - h.qty);
    }
    byIsin[h.isin] = { symbol: h.symbol, qty: h.qty, avg: h.avg, lots };
  }
  return { version: 1, updatedAt: file.fetchedAt, byIsin };
}

/** A lot as the page shows it: with the hold-until date and where the price is against the stop. */
export interface LotView extends Lot {
  holdUntil: ISODate | null;
  /** % from the price down to the stop (negative: below it). */
  toStop: number | null;
  belowStop: boolean;
  /** Six months are up. */
  due: boolean;
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
  /** Buys, oldest first (empty until lots are tracked). */
  lots: LotView[];
  /** % below the 52-week high (from the last close's lists). */
  pctFromHigh: number | null;
  /** Sector, from the screener's labels, else Paytm Money's. */
  sectorName: string;
  /**
   * The price picture the laggard test judged (livermore DECISIONS.md 2026-11-16): weak = falling trend (stage 4) with
   * RS under 30; deep = falling trend and 30%+ below the 52-week high. Such stocks trailed the average stock over the
   * next 6 months in 2012–15, 2016–24 and 2025–26.
   */
  weak: boolean;
  deep: boolean;
  /** Last 8 quarters of the business (NSE results filings); null for ETFs or before the history is read. */
  business: BizView | null;
}

export interface ReviewSummary {
  /** Positions under SMALL_WEIGHT % of the portfolio. */
  small: { n: number; weight: number; symbols: string[] };
  /** Sectors by weight, biggest first. */
  sectors: { sector: string; weight: number; n: number }[];
  weak: { n: number; weight: number };
  deep: { n: number; weight: number };
  business: { growing: number; mixed: number; shrinking: number; unknown: number };
}

/** A position this small barely moves the portfolio either way. */
export const SMALL_WEIGHT = 2;
/** One sector holding more than this share of the money is concentrated. */
export const SECTOR_LIMIT = 25;

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
  review: ReviewSummary;
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
  lots?: LotsFile | null;
  /** Today (IST), for "six months are up". */
  today?: ISODate;
  business?: BusinessFile | null;
}

function lotView(l: Lot, price: number | null, today: ISODate): LotView {
  const holdUntil = l.date ? addMonths(l.date, 6) : null;
  const toStop = l.stop !== null && price !== null && price > 0 ? (1 - l.stop / price) * 100 : null;
  return { ...l, holdUntil, toStop, belowStop: l.stop !== null && price !== null && price < l.stop, due: !!holdUntil && today >= holdUntil };
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
      lots: (ctx.lots?.byIsin[h.isin]?.lots ?? []).map((l) => lotView(l, price, ctx.today ?? istDate(new Date().toISOString()))).sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "")),
      pctFromHigh: row ? Math.round(row.pctFromHigh * 10) / 10 : null,
      sectorName: h.etf ? "ETFs" : row?.industry ?? h.sector ?? "Other",
      weak: row?.stage === 4 && row.rs < 30,
      deep: row?.stage === 4 && row.pctFromHigh >= 30,
      business: h.etf ? null : (() => {
        const b = ctx.business?.bySymbol[h.symbol];
        return b ? bizView(b, price) : null;
      })(),
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
      review: review(rows),
    },
  };
}

function review(rows: HoldingRow[]): ReviewSummary {
  const w = (xs: HoldingRow[]) => Math.round(xs.reduce((a, r) => a + (r.weight ?? 0), 0) * 10) / 10;
  const small = rows.filter((r) => r.weight !== null && r.weight < SMALL_WEIGHT);
  const bySector = new Map<string, HoldingRow[]>();
  for (const r of rows) bySector.set(r.sectorName, [...(bySector.get(r.sectorName) ?? []), r]);
  const stocks = rows.filter((r) => !r.etf);
  const count = (t: string | null) => stocks.filter((r) => (r.business?.trend ?? null) === t).length;
  return {
    small: { n: small.length, weight: w(small), symbols: small.map((r) => r.symbol) },
    sectors: [...bySector].map(([sector, xs]) => ({ sector, weight: w(xs), n: xs.length })).sort((a, b) => b.weight - a.weight),
    weak: { n: rows.filter((r) => r.weak).length, weight: w(rows.filter((r) => r.weak)) },
    deep: { n: rows.filter((r) => r.deep).length, weight: w(rows.filter((r) => r.deep)) },
    business: { growing: count("growing"), mixed: count("mixed"), shrinking: count("shrinking"), unknown: count(null) },
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
