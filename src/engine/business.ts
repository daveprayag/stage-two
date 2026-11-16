/**
 * Business trend for the stocks you hold: revenue, net profit and EPS for the last 12 quarters from NSE's own results
 * filings, so the Holdings review can show how each business is doing next to how its price is doing.
 *
 * Quarters to Dec 2024 come from NSE's per-stock results list (corporates-financial-results, XBRL since about 2018);
 * from the Mar-2025 quarter, from the integrated filing (financials.ts). One basis per stock: consolidated when it covers
 * at least as many of the last 8 quarters as standalone. Revisions replace the original (the page shows the latest
 * figures). Pure helpers; the Worker fetches and stores them in private/business.json.
 *
 * The "Growing / Mixed / Shrinking" label uses the definition fixed in livermore's DECISIONS.md (2026-11-16). That
 * fundamentals test was shelved (results are fetched for held stocks only), so the label is shown as untested.
 */
import { growth, nseDay, parseFilingList, quarterLabel, type Basis, type QuarterFigures, type ResultsFiling } from "./financials";
import type { ISODate } from "./types";

export const resultsHistoryUrl = (symbol: string) =>
  `https://www.nseindia.com/api/corporates-financial-results?index=equities&symbol=${encodeURIComponent(symbol)}&period=Quarterly`;

/** Quarters kept per stock (8 shown, with the year before each for growth). */
export const BIZ_QUARTERS = 12;

/** NSE's results list → XBRL filings for quarters (non-cumulative, 3 months), the latest broadcast per quarter and basis. */
export function parseHistoryList(json: unknown): ResultsFiling[] {
  const best = new Map<string, ResultsFiling & { at: string }>();
  for (const raw of Array.isArray(json) ? json : []) {
    const x = raw as Record<string, unknown>;
    const cum = String(x.cumulative ?? "").toLowerCase();
    if (cum && cum !== "non-cumulative") continue;
    const qe = nseDay(x.toDate);
    const from = nseDay(x.fromDate);
    const stamp = typeof x.broadCastDate === "string" && nseDay(x.broadCastDate) ? x.broadCastDate : String(x.filingDate ?? "");
    const filed = nseDay(stamp);
    const basis: Basis | null = x.consolidated === "Consolidated" ? "Consolidated" : x.consolidated === "Non-Consolidated" ? "Standalone" : null;
    if (!qe || !from || !filed || !basis || typeof x.xbrl !== "string" || !x.xbrl.endsWith(".xml")) continue;
    const months = (Number(qe.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(qe.slice(5, 7)) - Number(from.slice(5, 7)) + 1;
    if (months !== 3) continue;
    const at = `${filed} ${stamp.slice(12)}`;
    const key = `${qe}|${basis}`;
    const b = best.get(key);
    if (!b || at > b.at) best.set(key, { qe, basis, xbrl: x.xbrl, filed, at });
  }
  return [...best.values()].map(({ at: _at, ...f }) => f).sort((a, b) => b.qe.localeCompare(a.qe));
}

/** Quarter ends going back from `latest`: [latest, the one before, …]. */
export function quarterEnds(latest: ISODate, n: number): ISODate[] {
  const out: ISODate[] = [];
  let y = Number(latest.slice(0, 4));
  let m = Number(latest.slice(5, 7));
  for (let i = 0; i < n; i++) {
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    out.push(`${y}-${String(m).padStart(2, "0")}-${last}`);
    m -= 3;
    if (m <= 0) {
      m += 12;
      y--;
    }
  }
  return out;
}

/**
 * The filings to read for one stock: the integrated list (Mar 2025 →) and the history list (before), one basis, the
 * last BIZ_QUARTERS quarter ends. Null when neither list has a quarter.
 */
export function chooseHistory(integratedJson: unknown, historyJson: unknown): { basis: Basis; filings: ResultsFiling[] } | null {
  const all = [...parseFilingList(integratedJson).filter((f) => f.qe >= "2025-03-31"), ...parseHistoryList(historyJson).filter((f) => f.qe < "2025-03-31")];
  const latest = all.map((f) => f.qe).sort().pop();
  if (!latest) return null;
  const ends = quarterEnds(latest, BIZ_QUARTERS);
  const pick = (b: Basis) => ends.map((q) => all.find((f) => f.qe === q && f.basis === b)).filter((f): f is ResultsFiling => !!f);
  const cons = pick("Consolidated");
  const solo = pick("Standalone");
  const recent = (l: ResultsFiling[]) => l.filter((f) => ends.slice(0, 8).includes(f.qe)).length;
  const useCons = cons.length > 0 && recent(cons) >= recent(solo);
  return { basis: useCons ? "Consolidated" : "Standalone", filings: useCons ? cons : solo };
}

export interface BizQuarter extends QuarterFigures {
  qe: ISODate;
  filed: ISODate;
}

export interface BizHistory {
  basis: Basis;
  /** Oldest first. */
  quarters: BizQuarter[];
  /** When the lists were last read (ISO). */
  checked: string;
}

export interface BusinessFile {
  version: 1;
  bySymbol: Record<string, BizHistory>;
  /** symbol → when NSE last had no results for it (ISO). */
  missing: Record<string, string>;
  /** XBRL URL → figures (filings never change). */
  parsed: Record<string, QuarterFigures>;
}

export type BizTrend = "growing" | "mixed" | "shrinking";

export interface BizQuarterView {
  qe: ISODate;
  label: string;
  revenueCr: number | null;
  profitCr: number | null;
  revenueYoY: number | null;
  profitYoY: number | null;
  /** Net profit ÷ revenue, %. */
  margin: number | null;
  trend: BizTrend | null;
}

export interface BizView {
  basis: Basis;
  revenueKind: QuarterFigures["revenueKind"];
  /** Up to 8 quarters, oldest first, each with growth against the same quarter a year earlier. */
  quarters: BizQuarterView[];
  /** The latest quarter's trend, by the pre-registered definition. */
  trend: BizTrend | null;
  /** How many quarters in a row (latest backwards) carry that same trend. */
  streak: number;
  /** Last 4 quarters against the 4 before them. */
  ttmRevenueYoY: number | null;
  ttmProfitYoY: number | null;
  /** Sum of the last 4 quarters' basic EPS (₹) and price ÷ it; null if a quarter is missing or the sum is ≤ 0. */
  ttmEps: number | null;
  pe: number | null;
  latestFiled: ISODate;
}

/**
 * Growing = revenue YoY ≥ +10% and net profit YoY ≥ +10% with profit positive in both quarters; Shrinking = revenue
 * down, or profit down 10%+, or a loss; Mixed = the rest. Null without both quarters' figures. (livermore DECISIONS.md
 * 2026-11-16, fundamentals test.)
 */
export function bizTrend(now: QuarterFigures, ago: QuarterFigures | null): BizTrend | null {
  if (!ago || now.revenueCr === null || now.profitCr === null || ago.revenueCr === null || ago.profitCr === null) return null;
  const rev = ago.revenueCr > 0 ? now.revenueCr / ago.revenueCr - 1 : null;
  const prof = ago.profitCr > 0 ? now.profitCr / ago.profitCr - 1 : null;
  if (rev !== null && rev >= 0.1 && now.profitCr > 0 && ago.profitCr > 0 && prof !== null && prof >= 0.1) return "growing";
  if ((rev !== null && rev < 0) || (prof !== null && prof <= -0.1) || now.profitCr < 0) return "shrinking";
  return "mixed";
}

const sum = (xs: (number | null | undefined)[]) => (xs.length && xs.every((x) => typeof x === "number") ? (xs as number[]).reduce((a, b) => a + b, 0) : null);

/**
 * A half-year figure where the quarter before it is on file becomes the quarter (half-year minus that quarter); a
 * company that files only half-years keeps its half-years.
 */
export function quarterize(qs: BizQuarter[]): BizQuarter[] {
  const byQe = new Map(qs.map((q) => [q.qe, q]));
  const minus = (a: number | null | undefined, b: number | null | undefined, digits: number) =>
    typeof a === "number" && typeof b === "number" ? Math.round((a - b) * 10 ** digits) / 10 ** digits : null;
  return qs.map((q) => {
    if (q.months !== 6) return q;
    const prev = byQe.get(quarterEnds(q.qe, 2)[1]!);
    if (!prev || (prev.months ?? 3) !== 3) return q;
    return { ...q, months: 3, revenueCr: minus(q.revenueCr, prev.revenueCr, 2), profitCr: minus(q.profitCr, prev.profitCr, 2), eps: minus(q.eps, prev.eps, 2) };
  });
}

export function bizView(h: BizHistory, price: number | null): BizView | null {
  const qs = quarterize(h.quarters);
  if (!qs.length) return null;
  const byQe = new Map(qs.map((q) => [q.qe, q]));
  const yearBefore = (qe: ISODate) => quarterEnds(qe, 5)[4]!;
  const views: BizQuarterView[] = qs.slice(-8).map((q) => {
    const ago = byQe.get(yearBefore(q.qe)) ?? null;
    return {
      qe: q.qe,
      label: quarterLabel(q.qe, q.months === 6 ? 6 : 3),
      revenueCr: q.revenueCr,
      profitCr: q.profitCr,
      revenueYoY: growth(q.revenueCr, ago?.revenueCr ?? null),
      profitYoY: growth(q.profitCr, ago?.profitCr ?? null),
      margin: q.revenueCr && q.profitCr !== null && q.revenueCr > 0 ? Math.round((q.profitCr / q.revenueCr) * 1000) / 10 : null,
      trend: bizTrend(q, ago),
    };
  });
  const last = views[views.length - 1]!;
  let streak = 0;
  for (let i = views.length - 1; i >= 0 && views[i]!.trend === last.trend && last.trend; i--) streak++;
  const latest = qs[qs.length - 1]!.qe;
  const ends = quarterEnds(latest, 8);
  const get = (qe: ISODate) => byQe.get(qe);
  const recent = ends.slice(0, 4).map(get);
  const before = ends.slice(4, 8).map(get);
  const r4 = sum(recent.map((q) => q?.revenueCr));
  const r8 = sum(before.map((q) => q?.revenueCr));
  const p4 = sum(recent.map((q) => q?.profitCr));
  const p8 = sum(before.map((q) => q?.profitCr));
  const quarterly = [...recent, ...before].every((q) => !q || (q.months ?? 3) === 3);
  const eps = quarterly ? sum(recent.map((q) => q?.eps)) : null;
  return {
    basis: h.basis,
    revenueKind: qs[qs.length - 1]!.revenueKind,
    quarters: views,
    trend: last.trend,
    streak,
    ttmRevenueYoY: quarterly ? growth(r4, r8) : null,
    ttmProfitYoY: quarterly ? growth(p4, p8) : null,
    ttmEps: eps === null ? null : Math.round(eps * 100) / 100,
    pe: eps !== null && eps > 0 && price !== null && price > 0 ? Math.round((price / eps) * 10) / 10 : null,
    latestFiled: qs[qs.length - 1]!.filed,
  };
}
