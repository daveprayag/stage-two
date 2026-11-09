/**
 * Data contracts for Stage Two. Everything is end-of-day NSE cash-equity data.
 *
 * PriceStore: a rolling window of daily bars for every EQ/BE stock (split/bonus-adjusted), aligned on one
 * session calendar so a stock's arrays line up with `dates` (null = did not trade that session).
 */
export type ISODate = string;

export interface StockSeries {
  /** Current ISIN (changes on some splits; we follow it). */
  isin: string;
  symbol: string;
  name: string;
  /** Latest NSE series (EQ, BE). */
  series: string;
  /** NSE broad industry (from index constituent lists), null if unknown. */
  industry: string | null;
  /** Latest daily price band in % (2, 5, 10, 20), null = no band (F&O names) or unknown. */
  band: number | null;
  /** First trading date if the stock listed recently (null = listed before our history starts). */
  listed: ISODate | null;
  o: (number | null)[];
  h: (number | null)[];
  l: (number | null)[];
  c: (number | null)[];
  v: (number | null)[];
}

export interface PriceStore {
  version: 1;
  asOf: ISODate;
  dates: ISODate[];
  /** Keyed by current ISIN. */
  stocks: Record<string, StockSeries>;
  /** Index closes aligned with `dates`, keyed by NSE index name ("NIFTY 500", "NIFTY BANK", ...). */
  indices: Record<string, (number | null)[]>;
}

export type Stage = 1 | 2 | 3 | 4;

/** "qualified" = passes every technical check of a top setup (news is checked after the news job). */
export type ScreenTag = "breakout" | "setup" | "fresh2" | "leader" | "ankur" | "qualified";

export interface Level {
  price: number;
  touches: number;
  /** Most recent touch, as a session date. */
  last: ISODate;
}

export interface TrendLine {
  from: { date: ISODate; price: number };
  to: { date: ISODate; price: number };
  /** Price of the line projected to the latest session. */
  now: number;
}

export interface ScreenRow {
  symbol: string;
  isin: string;
  name: string;
  industry: string | null;
  close: number;
  chgPct: number;
  /** 1–99 percentile of 3/6/9/12-month weighted performance among liquid stocks (IBD-style). */
  rs: number;
  /** Price relative to NIFTY 500 is at a 52-week high. */
  rsLineHigh: boolean;
  ret1m: number | null;
  ret3m: number | null;
  ret6m: number | null;
  pctFromHigh: number;
  pctAboveLow: number;
  sma50: number;
  sma150: number;
  sma200: number | null;
  stage: Stage;
  /** Sessions since the stock last entered stage 2 (null if not in stage 2). */
  stageAge: number | null;
  /** Minervini trend-template criteria met (0–8). */
  template: number;
  /** 10-session high-low range as % of close. */
  tight10: number;
  /** 5-day average volume / 50-day average volume. */
  dryUp: number;
  /** Today's volume as % of its 50-day average. */
  rvol: number;
  adr: number;
  turnoverCr: number;
  band: number | null;
  /** Nearest resistance above the close (from swing highs), and the % distance to it. */
  resistance: number | null;
  pctToResistance: number | null;
  /** Closed above the top of its recent base today on ≥ 1.5× volume. */
  breakout: boolean;
  /** Wilder RSI(14). */
  rsi14: number | null;
  ema20: number;
  ema50: number;
  /** 50-day average rising over the last 10 sessions; 200-day rising over the last 21. */
  ma50Rising: boolean;
  ma200Rising: boolean;
  /** Volume on up days ÷ volume on down days, last 50 sessions (> 1 = buyers in control). */
  upDownVol: number;
  /** % above the lowest low of the last ~2 months (42 sessions). */
  runUp2m: number;
  /** Ankur Patel's Chartink scans that fired today. */
  scans: string[];
  /** Ankur setup (livermore rule engine) that fired today, if any. */
  setup: string | null;
  tags: ScreenTag[];
  /** Ranking score within the screen (higher = earlier and stronger). */
  score: number;
}

export interface SectorRow {
  industry: string;
  stocks: number;
  /** Median RS of members. */
  rs: number;
  /** Share of members in stage 2. */
  stage2: number;
  /** Median 1-month return. */
  ret1m: number;
  leaders: string[];
}

export interface MarketSnapshot {
  index: string;
  close: number;
  chgPct: number;
  stage: Stage;
  aboveSma50: boolean;
  aboveSma200: boolean;
  /** Breadth among liquid stocks. */
  pctAbove50: number;
  pctAbove200: number;
  newHighs: number;
  newLows: number;
  stage2Count: number;
  universe: number;
}

export interface Filing {
  date: string;
  category: string;
  text: string;
  url: string | null;
}

export interface Headline {
  title: string;
  source: string;
  url: string;
  date: string;
}

export interface NewsVerdict {
  summary: string;
  sentiment: "positive" | "negative" | "neutral" | "none";
  catalysts: string[];
  redFlags: string[];
}

export interface NewsBundle {
  filings: Filing[];
  headlines: Headline[];
  ai: NewsVerdict | null;
}

export interface ScreenFile {
  version: 1;
  asOf: ISODate;
  generatedAt: string;
  market: MarketSnapshot | null;
  sectors: SectorRow[];
  rows: ScreenRow[];
  /** News for the shortlisted symbols (filled by the news job). */
  news: Record<string, NewsBundle>;
  newsAt: string | null;
}

export interface RunRecord {
  job: "eod" | "news" | "filings";
  /** What triggered it: "cloudflare" (scheduler Worker), "vercel" (daily backup cron), "manual". */
  source?: string;
  /** Nothing to do (no new data, or checked moments ago). Skipped runs are not written to the history. */
  skipped?: boolean;
  startedAt: string;
  finishedAt: string;
  ok: boolean;
  /** Sessions added (eod) or symbols enriched (news). */
  detail: string;
  log: string[];
}
