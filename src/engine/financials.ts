/**
 * Quarterly results figures from NSE's own filings, so the news summary can see what a quarter actually was (small
 * companies' results often get no press, and a filing title alone reads "submitted financial results").
 *
 * Since the quarter to 31 Mar 2025, results are filed as "Integrated Filing - Financials"; NSE lists them per stock
 * (integrated-filing-results) with an XBRL file for each. Each XBRL holds the quarter and the year to date only, so the
 * year-ago quarter comes from its own filing. Figures are in rupees in the XBRL; stored in crore. Parsed filings never
 * change, so they are cached by URL and each one is fetched once. Pure helpers; the news job fetches and stores.
 */
import type { ISODate } from "./types";

export const integratedResultsUrl = (symbol: string) =>
  `https://www.nseindia.com/api/integrated-filing-results?symbol=${encodeURIComponent(symbol)}&type=Integrated%20Filing-%20Financials`;

export type Basis = "Consolidated" | "Standalone";

export interface ResultsFiling {
  /** Quarter end. */
  qe: ISODate;
  basis: Basis;
  xbrl: string;
  /** When NSE broadcast it (ISO date). */
  filed: ISODate;
}

export interface QuarterFigures {
  /** Revenue from operations (interest earned for banks; total income if neither is filed), ₹ crore. */
  revenueCr: number | null;
  revenueKind: "operations" | "interest" | "income" | null;
  /** Net profit for the period (total, as the press reports it), ₹ crore. */
  profitCr: number | null;
  /** 3 for a quarter; 6 when the company files half-years only (some smaller companies). Missing = 3. */
  months?: 3 | 6;
}

export interface StockResults {
  qe: ISODate;
  basis: Basis;
  filed: ISODate;
  now: QuarterFigures;
  /** The same quarter a year earlier, on the same basis; null if NSE has no such filing. */
  yearAgo: QuarterFigures | null;
  revenueYoY: number | null;
  profitYoY: number | null;
}

export interface FinancialsFile {
  version: 1;
  /** symbol → latest quarter, and when it was last checked (ISO time). */
  bySymbol: Record<string, StockResults & { checked: string }>;
  /** symbol → when a check last found no usable filing (so it is not retried every night). */
  missing?: Record<string, string>;
  /** XBRL URL → parsed figures (filings never change). */
  parsed: Record<string, QuarterFigures>;
}

const MON: Record<string, string> = { JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06", JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12" };

/** "30-SEP-2026" or "05-Nov-2026 21:44:07" → "2026-09-30" / "2026-11-05"; null otherwise. */
export function nseDay(s: unknown): ISODate | null {
  const m = typeof s === "string" ? /^(\d{1,2})-([A-Za-z]{3})-(\d{4})/.exec(s.trim()) : null;
  const mm = m ? MON[m[2]!.toUpperCase()] : undefined;
  return m && mm ? `${m[3]}-${mm}-${m[1]!.padStart(2, "0")}` : null;
}

/** The integrated-filing list → financial-results filings, the latest broadcast per quarter and basis. */
export function parseFilingList(json: unknown): ResultsFiling[] {
  const data = (json as { data?: unknown[] } | null)?.data;
  if (!Array.isArray(data)) return [];
  const best = new Map<string, ResultsFiling & { at: string }>();
  for (const raw of data) {
    const x = raw as Record<string, unknown>;
    if (typeof x.type !== "string" || !x.type.startsWith("Integrated Filing- Financials")) continue;
    const qe = nseDay(x.qe_Date);
    // Revisions come with an empty broadcast date; their creation date orders them after the original.
    const stamp = nseDay(x.broadcast_Date) ? String(x.broadcast_Date) : String(x.creation_Date ?? "");
    const filed = nseDay(stamp);
    const basis = x.consolidated === "Consolidated" ? "Consolidated" : x.consolidated === "Standalone" ? "Standalone" : null;
    if (!qe || !filed || !basis || typeof x.xbrl !== "string" || !x.xbrl.endsWith(".xml")) continue;
    const at = `${filed} ${stamp.slice(12)}`;
    const k = `${qe}|${basis}`;
    const prev = best.get(k);
    if (!prev || at > prev.at) best.set(k, { qe, basis, xbrl: x.xbrl, filed, at });
  }
  return [...best.values()].map(({ at: _at, ...f }) => f).sort((a, b) => b.qe.localeCompare(a.qe));
}

const yearBefore = (d: ISODate): ISODate => `${Number(d.slice(0, 4)) - 1}${d.slice(4)}`;

/** Latest quarter and its year-ago filing, preferring a basis filed for both (consolidated first). */
export function chooseFilings(list: ResultsFiling[]): { now: ResultsFiling; yearAgo: ResultsFiling | null } | null {
  const qe = list[0]?.qe;
  if (!qe) return null;
  const ago = yearBefore(qe);
  const at = (q: ISODate, b: Basis) => list.find((f) => f.qe === q && f.basis === b) ?? null;
  for (const b of ["Consolidated", "Standalone"] as const) {
    const now = at(qe, b);
    const before = at(ago, b);
    if (now && before) return { now, yearAgo: before };
  }
  const now = at(qe, "Consolidated") ?? at(qe, "Standalone");
  return now ? { now, yearAgo: null } : null;
}

const REVENUE: [string, QuarterFigures["revenueKind"]][] = [["RevenueFromOperations", "operations"], ["InterestEarned", "interest"], ["Income", "income"]];
// Total profit first: it is the figure the press reports, and some filings leave the owners' share at 0 or fill it oddly.
const PROFIT = ["ProfitLossForPeriod", "ProfitLossForThePeriod", "ProfitLossAfterTaxesMinorityInterestAndShareOfProfitLossOfAssociates", "ProfitOrLossAttributableToOwnersOfParent"];

/** First day of the period of `months` months ending on `end`. */
function periodStart(end: ISODate, months: number): ISODate {
  const y = Number(end.slice(0, 4));
  const m = Number(end.slice(5, 7)) - months + 1;
  return m >= 1 ? `${y}-${String(m).padStart(2, "0")}-01` : `${y - 1}-${String(m + 12).padStart(2, "0")}-01`;
}

/**
 * Revenue and profit for the period ending `qe` from a results XBRL (contexts without dimensions only): the quarter,
 * or the half-year when the company files half-years (or when `months` asks for it). A 0 counts as not filled.
 */
export function parseResultsXbrl(xml: string, qe: ISODate, months?: 3 | 6): QuarterFigures {
  const contexts: { id: string; start: string; end: string }[] = [];
  for (const m of xml.matchAll(/<xbrli:context\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/xbrli:context>/g)) {
    const body = m[2]!;
    if (/<xbrli:(segment|scenario)\b/.test(body)) continue;
    const s = /<xbrli:startDate>\s*([\d-]+)\s*</.exec(body)?.[1];
    const e = /<xbrli:endDate>\s*([\d-]+)\s*</.exec(body)?.[1];
    if (s && e) contexts.push({ id: m[1]!, start: s, end: e });
  }
  for (const span of months ? [months] : ([3, 6] as const)) {
    const ids = new Set(contexts.filter((c) => c.end === qe && c.start === periodStart(qe, span)).map((c) => c.id));
    const fig = figuresFor(xml, ids);
    if (fig.revenueCr !== null || fig.profitCr !== null) return { ...fig, months: span };
  }
  return { revenueCr: null, revenueKind: null, profitCr: null };
}

function figuresFor(xml: string, ids: Set<string>): QuarterFigures {
  const value = (tag: string): number | null => {
    if (!ids.size) return null;
    const re = new RegExp(`<[\\w-]+:${tag}\\b[^>]*\\bcontextRef="([^"]+)"[^>]*>\\s*(-?[\\d.]+(?:[eE][-+]?\\d+)?)\\s*<`, "g");
    for (const m of xml.matchAll(re)) if (ids.has(m[1]!) && Number(m[2]) !== 0) return Number(m[2]);
    return null;
  };
  const crore = (x: number | null) => (x === null || !Number.isFinite(x) ? null : Math.round((x / 1e7) * 100) / 100);
  let revenueCr: number | null = null;
  let revenueKind: QuarterFigures["revenueKind"] = null;
  for (const [tag, kind] of REVENUE) {
    const v = value(tag);
    if (v !== null) {
      revenueCr = crore(v);
      revenueKind = kind;
      break;
    }
  }
  let profitCr: number | null = null;
  for (const tag of PROFIT) {
    const v = value(tag);
    if (v !== null) {
      profitCr = crore(v);
      break;
    }
  }
  return { revenueCr, revenueKind, profitCr };
}

/** % change; null unless the base is positive. */
export const growth = (now: number | null, before: number | null): number | null =>
  now === null || before === null || before <= 0 ? null : Math.round((now / before - 1) * 1000) / 10;

export function stockResults(now: ResultsFiling, nowFig: QuarterFigures, yearAgo: QuarterFigures | null): StockResults {
  return {
    qe: now.qe, basis: now.basis, filed: now.filed, now: nowFig, yearAgo,
    revenueYoY: growth(nowFig.revenueCr, yearAgo?.revenueCr ?? null),
    profitYoY: growth(nowFig.profitCr, yearAgo?.profitCr ?? null),
  };
}

const QNAME: Record<string, string> = { "03": "Q4", "06": "Q1", "09": "Q2", "12": "Q3" };
const cr = (x: number) => `₹${x.toLocaleString("en-IN", { maximumFractionDigits: Math.abs(x) >= 100 ? 0 : 1 })} Cr`;

/** "Q2 FY27", or "H1 FY27" for a half-year — Indian fiscal year (April–March). */
export function quarterLabel(qe: ISODate, months: 3 | 6 = 3): string {
  const y = Number(qe.slice(0, 4));
  const m = qe.slice(5, 7);
  const fy = Number(m) <= 3 ? y : y + 1;
  const name = months === 6 ? (m === "09" ? "H1" : m === "03" ? "H2" : "H?") : (QNAME[m] ?? "Q?");
  return `${name} FY${String(fy).slice(2)}`;
}

/** One line for the summary prompt and the stock page. */
export function resultsLine(r: StockResults): string {
  const part = (name: string, now: number | null, before: number | null, g: number | null) => {
    if (now === null) return null;
    const vs = before === null ? "" : g !== null ? ` (${g >= 0 ? "+" : ""}${g.toFixed(0)}% YoY, from ${cr(before)})` : ` (from ${cr(before)} a year earlier)`;
    return `${name} ${cr(now)}${vs}`;
  };
  const rev = part(r.now.revenueKind === "interest" ? "interest earned" : r.now.revenueKind === "income" ? "total income" : "revenue", r.now.revenueCr, r.yearAgo?.revenueCr ?? null, r.revenueYoY);
  const pat = part("net profit", r.now.profitCr, r.yearAgo?.profitCr ?? null, r.profitYoY);
  return `${quarterLabel(r.qe, r.now.months)} ${r.basis.toLowerCase()} results (filed ${r.filed}): ${[rev, pat].filter(Boolean).join("; ") || "figures not readable"}`;
}

/**
 * Does this stock's entry need a fresh look? No entry; a results meeting since the last filing we have (looked at for
 * 10 days after the meeting, until a newer filing appears); or not checked for 30 days.
 */
export function needsCheck(entry: (StockResults & { checked: string }) | undefined, meetings: ISODate[] | undefined, today: ISODate, missingAt?: string): boolean {
  const days = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86_400_000;
  const recentMeeting = (meetings ?? []).some((m) => m <= today && days(m, today) <= 10 && (!entry || m > entry.filed));
  if (!entry) return !missingAt || days(missingAt.slice(0, 10), today) >= 7 || recentMeeting;
  return recentMeeting || days(entry.checked.slice(0, 10), today) >= 30;
}
