/** Where the jobs keep their data. The Cloudflare Worker implements it on R2; tests use MemoryStorage. */
export interface Storage {
  get(path: string): Promise<ReadableStream<Uint8Array> | null>;
  getBytes(path: string): Promise<Uint8Array | null>;
  getJson<T>(path: string): Promise<T | null>;
  putJson(path: string, value: unknown): Promise<void>;
  putBytes(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
}

export const P = {
  head: "prices/head.json",
  stocks: "prices/stocks.ndjson.gz",
  stocksPrev: "prices/stocks.previous.ndjson.gz",
  /** symbol → [isin, latest close]; for the track record and quick lookups. */
  closes: "prices/closes.json",
  screen: "screens/latest.json",
  screenOn: (d: string) => `screens/${d}.json`,
  /** Headlines + Gemini verdicts per stock for one session (so re-runs only pay for changed filings). */
  enrichOn: (d: string) => `enrich/${d}.json`,
  /** Every liquid stock's row (tagged or not), for stock pages. */
  rows: "screens/rows.json",
  announcements: "news/announcements.json",
  runs: "runs/log.json",
  eodState: "meta/eod.json",
  filingsState: "meta/filings.json",
  liveState: "meta/live.json",
  /** The user's watchlist (written only with the WATCHLIST_KEY passcode). */
  watchlist: "user/watchlist.json",
  /** Quarterly results meeting dates by symbol (NSE board meetings), last 30 days to 35 days ahead. */
  results: "news/results.json",
  /** Latest quarter's revenue and profit per stock from NSE's results filings (src/engine/financials.ts). */
  financials: "news/financials.json",
  sectors: "meta/sectors.json",
  track: "track/picks.json",
  /** When each stock's current stretch on Momentum leaders began (src/engine/since.ts). */
  since: "meta/momentum-since.json",
  live: "live/latest.json",
  /** Never served as is: only the passcode-protected /api/holdings reads these (worker/src/index.ts). */
  /** Paytm Money read-only token (the full-access token is never stored). */
  paytmToken: "private/paytm-token.json",
  /** A login started from the Holdings page: its state, valid for 10 minutes. */
  paytmLogin: "private/paytm-login.json",
  /** Last demat holdings Paytm Money returned (src/engine/holdings.ts). */
  holdings: "private/holdings.json",
  /** Buys found by comparing holdings reads, with the plan's stop (src/engine/holdings.ts updateLots). */
  lots: "private/lots.json",
  /** Last 12 quarters' results for held stocks, from NSE filings (src/engine/business.ts). */
  business: "private/business.json",
  /** Daily closes of the held stocks and NIFTY 500 for the holdings charts (portfolio.ts), rebuilt each session. */
  holdingsHistory: "private/holdings-history.json",
} as const;

export class MemoryStorage implements Storage {
  readonly files = new Map<string, Uint8Array>();
  async get(path: string) {
    const b = this.files.get(path);
    return b ? new Blob([b as Uint8Array<ArrayBuffer>]).stream() : null;
  }
  async getBytes(path: string) {
    return this.files.get(path) ?? null;
  }
  async getJson<T>(path: string) {
    const b = this.files.get(path);
    return b ? (JSON.parse(new TextDecoder().decode(b)) as T) : null;
  }
  async putJson(path: string, value: unknown) {
    this.files.set(path, new TextEncoder().encode(JSON.stringify(value)));
  }
  async putBytes(path: string, bytes: Uint8Array, _contentType?: string) {
    void _contentType;
    this.files.set(path, bytes);
  }
}
