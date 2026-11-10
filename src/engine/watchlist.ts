/**
 * Watchlist: stocks the user adds by hand, with a snapshot of how the screener saw them at that moment (starred or not,
 * price, NIFTY 500), and how they have done since. The point is to check, on stocks the user actually looked at,
 * whether starred stocks really rally more than the rest. Pure helpers; the Worker stores the file and serves the API.
 */
import type { ISODate } from "./types";

export interface WatchItem {
  symbol: string;
  isin: string;
  name: string;
  /** When it was added (ISO time). */
  addedAt: string;
  /** Latest session in the price store when added; outcomes count from the sessions after it. */
  session: ISODate;
  /** Price when added: the live NSE price if fresh, else that session's close. */
  price: number;
  /** NIFTY 500 when added, same rule. */
  nifty: number | null;
  /** How the screener saw it when added. */
  starred: boolean;
  starCount: number | null;
  momentum: boolean;
  rs: number | null;
  stage: number | null;
  phase: string | null;
}

export interface WatchFile {
  version: 1;
  items: WatchItem[];
}

/** Daily-bar facts for one item, from the sessions after it was added (cacheable per session). */
export interface WatchHistory {
  sessions: number;
  high: number | null;
  low: number | null;
  close: number | null;
}

export interface WatchRow extends WatchItem {
  /** Latest price and where it came from. */
  now: number | null;
  live: boolean;
  /** % since added. */
  ret: number | null;
  /** Best and worst point since added, % (daily highs/lows, plus today's live price). */
  best: number | null;
  worst: number | null;
  /** Return minus the NIFTY 500's over the same time, percentage points. */
  vsNifty: number | null;
  sessions: number;
  /** How the screener sees it today. */
  starredNow: boolean;
  starCountNow: number | null;
}

export interface WatchSummary {
  key: "starred" | "other" | "all";
  label: string;
  n: number;
  avgRet: number | null;
  avgVsNifty: number | null;
  pctUp: number | null;
  /** Share that rose 10%+ at some point since added. */
  pctHit10: number | null;
  /** Share that fell 8%+ at some point since added. */
  pctDown8: number | null;
  avgBest: number | null;
  avgWorst: number | null;
}

const pct = (a: number, b: number) => (a / b - 1) * 100;

/** High, low and last close over the sessions after `session`. */
export function historyFor(
  session: ISODate,
  dates: ISODate[],
  s: { h: (number | null)[]; l: (number | null)[]; c: (number | null)[] },
): WatchHistory {
  let high: number | null = null;
  let low: number | null = null;
  let close: number | null = null;
  let sessions = 0;
  for (let i = 0; i < dates.length; i++) {
    if ((dates[i] as ISODate) <= session) continue;
    const h = s.h[i], l = s.l[i], c = s.c[i];
    if (c === null || c === undefined) continue;
    sessions++;
    close = c;
    if (h !== null && h !== undefined) high = high === null ? h : Math.max(high, h);
    if (l !== null && l !== undefined) low = low === null ? l : Math.min(low, l);
  }
  return { sessions, high, low, close };
}

export function watchRow(
  item: WatchItem,
  hist: WatchHistory,
  latest: { price: number | null; live: boolean },
  niftyNow: number | null,
  nowStar: { starred: boolean; count: number | null },
): WatchRow {
  const now = latest.price ?? hist.close;
  const pts = [hist.high, hist.low, now].filter((x): x is number => x !== null);
  const ret = now !== null ? pct(now, item.price) : null;
  const niftyRet = niftyNow !== null && item.nifty ? pct(niftyNow, item.nifty) : null;
  return {
    ...item,
    now,
    live: latest.live && latest.price !== null,
    ret,
    best: pts.length ? pct(Math.max(...pts), item.price) : null,
    worst: pts.length ? pct(Math.min(...pts), item.price) : null,
    vsNifty: ret !== null && niftyRet !== null ? ret - niftyRet : null,
    sessions: hist.sessions,
    starredNow: nowStar.starred,
    starCountNow: nowStar.count,
  };
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const share = (xs: boolean[]) => (xs.length ? (xs.filter(Boolean).length / xs.length) * 100 : null);

function summarise(key: WatchSummary["key"], label: string, rows: WatchRow[]): WatchSummary {
  const r = rows.filter((x) => x.ret !== null);
  return {
    key,
    label,
    n: rows.length,
    avgRet: mean(r.map((x) => x.ret as number)),
    avgVsNifty: mean(r.filter((x) => x.vsNifty !== null).map((x) => x.vsNifty as number)),
    pctUp: share(r.map((x) => (x.ret as number) > 0)),
    pctHit10: share(r.map((x) => (x.best ?? 0) >= 10)),
    pctDown8: share(r.map((x) => (x.worst ?? 0) <= -8)),
    avgBest: mean(r.filter((x) => x.best !== null).map((x) => x.best as number)),
    avgWorst: mean(r.filter((x) => x.worst !== null).map((x) => x.worst as number)),
  };
}

/** Starred-when-added vs the rest vs all: the comparison the watchlist exists for. */
export function watchSummary(rows: WatchRow[]): WatchSummary[] {
  return [
    summarise("starred", "Starred when added", rows.filter((r) => r.starred)),
    summarise("other", "Not starred when added", rows.filter((r) => !r.starred)),
    summarise("all", "All watched", rows),
  ];
}

/** Add (or keep, if already watched) a stock; newest first. */
export function addItem(file: WatchFile, item: WatchItem): WatchFile {
  if (file.items.some((x) => x.symbol === item.symbol)) return file;
  return { version: 1, items: [item, ...file.items] };
}

export function removeItem(file: WatchFile, symbol: string): WatchFile {
  return { version: 1, items: file.items.filter((x) => x.symbol !== symbol) };
}
