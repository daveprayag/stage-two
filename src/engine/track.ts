/**
 * Forward track record: each session's picks per list, saved with that day's close, so their later performance can be
 * compared with the NIFTY 500 over the same days. Starts at launch (8 Nov 2026); nothing is back-filled, so it is an
 * honest out-of-sample record. Pure helpers; the jobs write PATHS.track.
 */
import { isStar } from "./star";
import { isTopSetup } from "./topsetup";
import type { ISODate, PriceStore, ScreenFile, ScreenRow } from "./types";

export const TRACK_LISTS = [
  { key: "star", label: "Starred", shown: true },
  { key: "leader", label: "Strongest", shown: true },
  { key: "momentum", label: "Momentum leaders", shown: true },
  { key: "momentumEarly", label: "Momentum leaders, early phase", shown: true },
  { key: "resuming", label: "Resuming after a pause", shown: true },
  // Removed from the screener (2026-11-10) but still recorded, so the forward record can show whether that was right.
  { key: "top", label: "Top setups", shown: false },
  { key: "breakout", label: "Breaking out", shown: false },
  { key: "setup", label: "Tight near highs", shown: false },
  { key: "fresh2", label: "New uptrends", shown: false },
] as const;

/** Keys of the lists the Track record page shows. */
export const SHOWN_TRACK: ReadonlySet<string> = new Set(TRACK_LISTS.filter((l) => l.shown).map((l) => l.key));

export type TrackListKey = (typeof TRACK_LISTS)[number]["key"];

export interface TrackPick {
  symbol: string;
  isin: string;
  close: number;
}

export interface TrackEntry {
  date: ISODate;
  nifty: number | null;
  lists: Partial<Record<TrackListKey, TrackPick[]>>;
}

const inList = (key: TrackListKey, r: ScreenRow, s: ScreenFile): boolean => {
  switch (key) {
    case "top":
      return isTopSetup(r, s.news[r.symbol]);
    case "star":
      return isStar(r, s.news[r.symbol]);
    case "momentumEarly":
      return r.tags.includes("momentum") && r.phase === "early";
    default:
      return r.tags.includes(key);
  }
};

export function picksFor(screen: ScreenFile): TrackEntry {
  const lists: TrackEntry["lists"] = {};
  for (const { key } of TRACK_LISTS) {
    lists[key] = screen.rows.filter((r) => inList(key, r, screen)).map((r) => ({ symbol: r.symbol, isin: r.isin, close: r.close }));
  }
  return { date: screen.asOf, nifty: screen.market?.close ?? null, lists };
}

/** Insert or replace the entry for its date, oldest first. */
export function upsertEntry(entries: TrackEntry[], e: TrackEntry): TrackEntry[] {
  return [...entries.filter((x) => x.date !== e.date), e].sort((a, b) => a.date.localeCompare(b.date));
}

export interface ListPerformance {
  key: TrackListKey;
  label: string;
  /** Sessions with at least one pick. */
  days: number;
  picks: number;
  /** Mean over pick days of the day's average return since the pick (equal weight per day), %. */
  avgReturn: number | null;
  /** Same days, NIFTY 500 return since the pick date, %. */
  niftyReturn: number | null;
  /** Share of pick days whose average beat the NIFTY 500. */
  beatShare: number | null;
  /** Share of individual picks that are up. */
  upShare: number | null;
}

export interface DayPerformance {
  date: ISODate;
  sessionsSince: number;
  nifty: number | null;
  lists: Partial<Record<TrackListKey, { n: number; avg: number | null }>>;
}

export interface PriceLookup {
  dates: ISODate[];
  latestClose: (isin: string, symbol: string) => number | null;
  niftyNow: number | null;
}

/** Lookup over a whole in-memory store. */
export function storeLookup(store: PriceStore): PriceLookup {
  const last = store.dates.length - 1;
  const bySymbol = new Map(Object.values(store.stocks).map((x) => [x.symbol, x]));
  const latestClose = (isin: string, symbol: string): number | null => {
    const s = store.stocks[isin] ?? bySymbol.get(symbol);
    if (!s) return null;
    for (let k = last; k >= 0; k--) if (s.c[k] !== null && s.c[k] !== undefined) return s.c[k] as number;
    return null;
  };
  const niftyArr = store.indices["NIFTY 500"] ?? [];
  let niftyNow: number | null = null;
  for (let k = last; k >= 0 && niftyNow === null; k--) niftyNow = niftyArr[k] ?? null;
  return { dates: store.dates, latestClose, niftyNow };
}

/** Lookup over the small closes file (symbol → [isin, close]) and the store head. */
export function closesLookup(dates: ISODate[], closes: Record<string, [string, number]>, indices: Record<string, (number | null)[]>): PriceLookup {
  const byIsin = new Map(Object.values(closes).map(([isin, c]) => [isin, c]));
  const nifty = indices["NIFTY 500"] ?? [];
  let niftyNow: number | null = null;
  for (let k = nifty.length - 1; k >= 0 && niftyNow === null; k--) niftyNow = nifty[k] ?? null;
  return { dates, latestClose: (isin, symbol) => byIsin.get(isin) ?? closes[symbol]?.[1] ?? null, niftyNow };
}

/** Performance of every saved pick to the store's latest close (pure). */
export function trackPerformance(entries: TrackEntry[], store: PriceStore | PriceLookup): { lists: ListPerformance[]; days: DayPerformance[] } {
  const look = "latestClose" in store ? store : storeLookup(store);
  const last = look.dates.length - 1;
  const latestClose = look.latestClose;
  const niftyNow = look.niftyNow;
  const days: DayPerformance[] = entries.map((e) => {
    const idx = look.dates.indexOf(e.date);
    const lists: DayPerformance["lists"] = {};
    for (const { key } of TRACK_LISTS) {
      const picks = e.lists[key] ?? [];
      const rets = picks.map((p) => {
        const now = latestClose(p.isin, p.symbol);
        return now === null ? null : (now / p.close - 1) * 100;
      }).filter((x): x is number => x !== null);
      lists[key] = { n: picks.length, avg: rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : null };
    }
    return {
      date: e.date,
      sessionsSince: idx >= 0 ? last - idx : 0,
      nifty: e.nifty && niftyNow ? (niftyNow / e.nifty - 1) * 100 : null,
      lists,
    };
  });
  const lists: ListPerformance[] = TRACK_LISTS.map(({ key, label }) => {
    const withPicks = days.filter((d) => (d.lists[key]?.n ?? 0) > 0 && d.lists[key]?.avg !== null && d.sessionsSince > 0);
    const allPicks = entries.flatMap((e) => (days.find((d) => d.date === e.date)?.sessionsSince ?? 0) > 0 ? (e.lists[key] ?? []) : []);
    const up = allPicks.map((p) => {
      const now = latestClose(p.isin, p.symbol);
      return now === null ? null : now > p.close;
    }).filter((x): x is boolean => x !== null);
    const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
    const nif = withPicks.map((d) => d.nifty).filter((x): x is number => x !== null);
    return {
      key, label, days: withPicks.length, picks: allPicks.length,
      avgReturn: mean(withPicks.map((d) => d.lists[key]?.avg as number)),
      niftyReturn: mean(nif),
      beatShare: withPicks.length ? withPicks.filter((d) => d.nifty !== null && (d.lists[key]?.avg as number) > d.nifty).length / withPicks.length : null,
      upShare: up.length ? up.filter(Boolean).length / up.length : null,
    };
  });
  return { lists, days: [...days].reverse() };
}
