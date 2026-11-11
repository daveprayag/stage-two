/**
 * Price store on disk / R2, streamable one stock at a time:
 *   prices/head.json          { version: 2, asOf, dates, indices, isins }
 *   prices/stocks.ndjson.gz   one StockSeries per line, gzip
 * Uses Web Streams (DecompressionStream / CompressionStream), available in Cloudflare Workers and Node 18+.
 */
import type { EmaSeed, ISODate, PriceStore, StockSeries } from "./types";

export interface StoreHeadFile {
  version: 2;
  asOf: ISODate;
  dates: ISODate[];
  indices: Record<string, (number | null)[]>;
  /** Every stock's current ISIN (the updater needs them before streaming, to tell ISIN changes from new listings). */
  isins: string[];
  /** Index name → 50/150/200-day EMAs just before the first stored session (types.ts EmaSeed). */
  ema0?: Record<string, EmaSeed>;
}

/** Stream StockSeries out of a gzipped NDJSON body. */
export async function* readStocks(body: ReadableStream<Uint8Array>): AsyncGenerator<StockSeries> {
  // Casts: the DOM lib types the compression streams over BufferSource, which does not line up with Uint8Array.
  const gunzip = new DecompressionStream("gzip") as unknown as TransformStream<Uint8Array, Uint8Array>;
  const lines = body.pipeThrough(gunzip).pipeThrough(new TextDecoderStream() as unknown as TransformStream<Uint8Array, string>).getReader();
  let buf = "";
  for (;;) {
    const { value, done } = await lines.read();
    if (value) buf += value;
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (line.trim()) yield JSON.parse(line) as StockSeries;
    }
    if (done) break;
  }
  if (buf.trim()) yield JSON.parse(buf) as StockSeries;
}

/** Accumulates stocks as gzipped NDJSON in memory (the compressed store is ~10 MB). */
export class StocksWriter {
  private readonly writer: WritableStreamDefaultWriter<Uint8Array>;
  private readonly chunks: Uint8Array[] = [];
  private readonly done: Promise<void>;
  private readonly enc = new TextEncoder();
  count = 0;

  constructor() {
    const gz = new CompressionStream("gzip") as unknown as TransformStream<Uint8Array, Uint8Array>;
    this.writer = gz.writable.getWriter();
    const reader = gz.readable.getReader();
    this.done = (async () => {
      for (;;) {
        const { value, done } = await reader.read();
        if (value) this.chunks.push(value);
        if (done) break;
      }
    })();
  }

  async write(s: StockSeries): Promise<void> {
    this.count++;
    await this.writer.write(this.enc.encode(`${JSON.stringify(s)}\n`));
  }

  async finish(): Promise<Uint8Array> {
    await this.writer.close();
    await this.done;
    const total = this.chunks.reduce((a, c) => a + c.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const c of this.chunks) {
      out.set(c, off);
      off += c.length;
    }
    return out;
  }
}

export const headOf = (store: PriceStore): StoreHeadFile => ({
  version: 2, asOf: store.asOf, dates: store.dates, indices: store.indices, isins: Object.keys(store.stocks),
  ...(store.ema0 ? { ema0: store.ema0 } : {}),
});

/** Whole store → the two files (local scripts, migration). */
export async function encodeStore(store: PriceStore): Promise<{ head: StoreHeadFile; stocks: Uint8Array }> {
  const w = new StocksWriter();
  for (const s of Object.values(store.stocks)) await w.write(s);
  return { head: headOf(store), stocks: await w.finish() };
}

/** The two files → whole store (local scripts, tests). */
export async function decodeStore(head: StoreHeadFile, stocks: Uint8Array): Promise<PriceStore> {
  const out: PriceStore = { version: 1, asOf: head.asOf, dates: head.dates, indices: head.indices, stocks: {}, ...(head.ema0 ? { ema0: head.ema0 } : {}) };
  for await (const s of readStocks(new Blob([stocks as Uint8Array<ArrayBuffer>]).stream())) out.stocks[s.isin] = s;
  return out;
}
