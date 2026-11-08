/**
 * Shared data contract between @livermore/data (producer) and
 * @livermore/core + @livermore/backtest (consumers).
 *
 * Do not change field names or meanings without updating both sides and DECISIONS.md.
 */

/** Trading date in IST, 'YYYY-MM-DD'. String comparison == chronological comparison. */
export type ISODate = string;

/** One daily bar for one security. Prices and volume are split/bonus-adjusted; turnover is not. */
export interface Bar {
  date: ISODate;
  open: number;
  high: number;
  low: number;
  close: number;
  /** Exchange "previous close" for this day, adjusted the same way as OHLC. */
  prevClose: number;
  /** Shares traded, split/bonus-adjusted (multiplied by the adjustment factor). */
  volume: number;
  /** Value traded that day in INR. NOT adjusted (it is money). */
  turnover: number;
  /** Number of trades, if the source provides it. */
  trades: number | null;
  /** NSE series code that day: EQ, BE, BZ, SM, ST, ... */
  series: string;
  /**
   * NSE daily price band in % that day (2, 5, 10, 20), null = no band (F&O stocks), undefined = unknown
   * (no band file). Added 2026-11-08 (DECISIONS.md "Price bands").
   */
  priceBand?: number | null;
}

/** Full daily history of one security, keyed by ISIN (symbols change; ISIN is stable). */
export interface Instrument {
  isin: string;
  /** Latest symbol seen in the data. */
  symbol: string;
  /** Ascending by date. Only days the security actually traded (a gap = not traded / suspended). */
  bars: Bar[];
  /** First date this ISIN appears in the dataset. */
  firstDate: ISODate;
  /** Last date this ISIN appears in the dataset (< calendar end => delisted/suspended/renamed-out). */
  lastDate: ISODate;
  /**
   * True if the first trade happened after the dataset's first calendar day,
   * i.e. the security listed (IPO) inside the window. Used by IPO rules.
   */
  listedInWindow: boolean;
}

/** Daily bars of an index. volume/turnover/prevClose may be 0 when the source lacks them; series = 'INDEX'. */
export interface IndexSeries {
  /** Canonical names: 'NIFTY 50', 'NIFTY 500', 'NIFTY MIDCAP 150', 'NIFTY SMALLCAP 250', plus sector index names as published by NSE. */
  name: string;
  bars: Bar[];
}

/** Everything the backtester needs, loaded once into memory. */
export interface MarketData {
  /** All trading days in [from - warmup, to], ascending, from the exchange calendar (days with a bhavcopy). */
  calendar: ISODate[];
  instruments: Map<string, Instrument>;
  indices: Map<string, IndexSeries>;
  /** Optional: results/board-meeting dates per ISIN (ascending). Empty map if the source is unavailable. */
  resultsDates: Map<string, ISODate[]>;
  /** Optional: chain ISIN → NSE broad industry ("sector"). Added 2026-11-08 (DECISIONS.md "Sector gate"). */
  sectors?: Map<string, string>;
}

/**
 * Loader signature implemented by @livermore/data:
 *
 *   loadMarketData(opts: LoadOptions): Promise<MarketData>
 *
 * Reads the adjusted Parquet store produced by the data pipeline.
 */
export interface LoadOptions {
  /** Repo-relative or absolute path to the data directory (default 'data'). */
  dataDir: string;
  /** First date of interest (signals/trades start here). */
  from: ISODate;
  /** Last date of interest, inclusive. */
  to: ISODate;
  /** Extra trading days of history loaded before `from` for indicator warm-up (default 300). */
  warmupDays?: number;
  /** Series to include for instruments (default: all; the rule engine filters). */
  series?: string[];
}
