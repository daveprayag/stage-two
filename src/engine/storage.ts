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
  /** Every liquid stock's row (tagged or not), for stock pages. */
  rows: "screens/rows.json",
  announcements: "news/announcements.json",
  runs: "runs/log.json",
  eodState: "meta/eod.json",
  filingsState: "meta/filings.json",
  liveState: "meta/live.json",
  sectors: "meta/sectors.json",
  track: "track/picks.json",
  live: "live/latest.json",
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
