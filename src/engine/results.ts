/**
 * Quarterly results: when a stock reports next, and how it reacted to its last results.
 *
 * Why (livermore docs/EXPERIMENTS.md "Results-day moves", 2020–24, liquid NSE stocks): buying a results-day gap-up at
 * the open lost money (closed below the open 65% of the time), so this is not an entry signal. A results-day breakout
 * (up 5%+ on 3× volume, strong close) drifted up on average but only through a minority of big winners; a results-day
 * breakdown (down 5%+ on 3× volume) kept lagging the NIFTY 500 by a median 5.6 points over 60 sessions. So: know when
 * results are due before buying, and treat a breakdown as a red flag. Pure; the EOD job supplies the dates.
 */
import type { ISODate } from "./types";

export const BOARD_MEETINGS_URL = "https://www.nseindia.com/api/corporate-board-meetings?index=equities";

/** Days before today the results file keeps (reactions are shown for 10 sessions) and days ahead it asks NSE for. */
export const RESULTS_BACK_DAYS = 30;
export const RESULTS_AHEAD_DAYS = 35;

export interface ResultsFile {
  at: string;
  /** symbol → results meeting dates, ascending. */
  bySymbol: Record<string, ISODate[]>;
}

export interface ResultsReaction {
  /** The session the market reacted on (the meeting day or the next session, whichever traded more). */
  date: ISODate;
  /** Close-to-close change that day, %. */
  chg: number;
  /** Volume as a multiple of the previous 50 sessions' average. */
  volX: number;
  kind: "breakout" | "breakdown" | "neutral";
  /** Sessions since the reaction day (0 = the latest session). */
  sessionsAgo: number;
}

const MONTHS: Record<string, string> = { JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06", JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12" };

/** "07-Nov-2026" → "2026-11-07". */
function nseDay(s: string): ISODate | null {
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})/.exec(s.trim());
  const mm = m ? MONTHS[m[2]!.toUpperCase()] : undefined;
  return m && mm ? `${m[3]}-${mm}-${m[1]!.padStart(2, "0")}` : null;
}

const isResults = (text: string) => /financial\s+results?|\bresults?\b|quarterly|audited|unaudited/i.test(text);

/** NSE board-meetings JSON → results meetings by symbol. */
export function parseBoardMeetings(json: unknown): Record<string, ISODate[]> {
  const rows = Array.isArray(json) ? json : ((json as { data?: unknown[] } | null)?.data ?? []);
  const out: Record<string, Set<ISODate>> = {};
  for (const r of rows as Record<string, unknown>[]) {
    const symbol = String(r["bm_symbol"] ?? "").trim().toUpperCase();
    const date = nseDay(String(r["bm_date"] ?? ""));
    const text = `${String(r["bm_purpose"] ?? "")} ${String(r["bm_desc"] ?? "")}`;
    if (!symbol || !date || !isResults(text)) continue;
    (out[symbol] ??= new Set()).add(date);
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v].sort()]));
}

/** Merge a fresh fetch into the stored file, dropping dates older than `keepFrom`. */
export function mergeResults(prev: Record<string, ISODate[]> | undefined, next: Record<string, ISODate[]>, keepFrom: ISODate): Record<string, ISODate[]> {
  const out: Record<string, ISODate[]> = {};
  for (const sym of new Set([...Object.keys(prev ?? {}), ...Object.keys(next)])) {
    const dates = [...new Set([...(prev?.[sym] ?? []), ...(next[sym] ?? [])])].filter((d) => d >= keepFrom).sort();
    if (dates.length) out[sym] = dates;
  }
  return out;
}

/** The next results meeting after the latest session, if within `days` calendar days of it. */
export function nextResults(dates: ISODate[] | undefined, asOf: ISODate, days = 30): ISODate | null {
  if (!dates) return null;
  const limit = new Date(Date.parse(`${asOf}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
  return dates.find((d) => d > asOf && d <= limit) ?? null;
}

/**
 * How the stock reacted to its latest results meeting on or before the latest session, if the reaction day is within
 * the last `maxAgo` sessions. Bars are the stock's own sessions, oldest first.
 */
export function resultsReaction(
  dates: ISODate[] | undefined,
  bars: { dates: ISODate[]; high: number[]; low: number[]; close: number[]; volume: number[] },
  maxAgo = 10,
): ResultsReaction | null {
  if (!dates?.length) return null;
  const n = bars.dates.length;
  const asOf = bars.dates[n - 1] as ISODate;
  const meeting = [...dates].reverse().find((d) => d <= asOf);
  if (!meeting) return null;
  const j = bars.dates.findIndex((d) => d >= meeting);
  if (j < 51) return null;
  const volX = (k: number) => {
    let sum = 0;
    for (let m = k - 50; m < k; m++) sum += bars.volume[m] as number;
    return sum > 0 ? (bars.volume[k] as number) / (sum / 50) : 0;
  };
  // Results often come after the close, so the market answers the next session: take whichever traded more.
  const k = j + 1 < n && volX(j + 1) > volX(j) ? j + 1 : j;
  if (n - 1 - k > maxAgo) return null;
  const c = bars.close[k] as number;
  const pc = bars.close[k - 1] as number;
  const chg = (c / pc - 1) * 100;
  const vx = volX(k);
  const h = bars.high[k] as number;
  const l = bars.low[k] as number;
  const strongClose = c >= l + 0.5 * (h - l);
  const kind = chg >= 5 && vx >= 3 && strongClose ? "breakout" : chg <= -5 && vx >= 3 ? "breakdown" : "neutral";
  return { date: bars.dates[k] as ISODate, chg, volX: vx, kind, sessionsAgo: n - 1 - k };
}
