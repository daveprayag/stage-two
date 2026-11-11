/**
 * One-off (and repeatable): give the stored price store its EMA seeds — each stock's and index's 50/150/200-day EMA on
 * the session before the store's first date — so the site's EMAs are full-history EMAs (src/engine/series.ts EmaSeed).
 * Seeds come from livermore's history back to 2015:
 *   (livermore) pnpm bt ema-seeds --before <head.dates[0]> --out seeds.json
 *   pnpm tsx scripts/apply-ema-seeds.mts <seeds.json> <head.json> <stocks.ndjson.gz> <out-dir>
 * then upload <out-dir>/head.json and <out-dir>/stocks.ndjson.gz to prices/ in R2.
 *
 * Each seed is scaled by the ratio of the store's closes to livermore's on the first sessions of the window, so any
 * split one side has applied and the other not yet lines up; a stock whose ratio is not steady (within 0.5%) gets no
 * seed and falls back to the TradingView-style start. Stocks listed inside the window have no seed by design.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { compact, emaLines } from "../src/engine/series";
import { readStocks, StocksWriter, type StoreHeadFile } from "../src/engine/storefile";
import type { EmaSeed, StockSeries } from "../src/engine/types";

interface Seed {
  symbol?: string;
  last: string;
  bars: number;
  seed: EmaSeed;
  check: [string, number][];
}
interface SeedFile {
  before: string;
  stocks: Record<string, Seed>;
  indices: Record<string, Seed>;
}

const [seedsPath, headPath, stocksPath, outDir] = process.argv.slice(2);
if (!seedsPath || !headPath || !stocksPath || !outDir) throw new Error("usage: apply-ema-seeds.mts <seeds.json> <head.json> <stocks.ndjson.gz> <out-dir>");
const seeds = JSON.parse(readFileSync(seedsPath, "utf8")) as SeedFile;
const head = JSON.parse(readFileSync(headPath, "utf8")) as StoreHeadFile;
if (seeds.before !== head.dates[0]) throw new Error(`seeds are for a window starting ${seeds.before}, the store starts ${head.dates[0]}`);
const pos = new Map(head.dates.map((d, k) => [d, k]));
const bySymbol = new Map(Object.values(seeds.stocks).filter((x) => x.symbol).map((x) => [x.symbol as string, x]));

/** Store close ÷ livermore close on the alignment sessions, if steady; null otherwise. */
function ratio(seed: Seed, closeAt: (k: number) => number | null | undefined): number | null {
  const rs: number[] = [];
  for (const [d, c] of seed.check) {
    const k = pos.get(d);
    const v = k === undefined ? null : closeAt(k);
    if (v !== null && v !== undefined && c > 0) rs.push(v / c);
  }
  if (!rs.length) return null;
  const sorted = [...rs].sort((a, b) => a - b);
  const mid = sorted[sorted.length >> 1] as number;
  return rs.every((r) => Math.abs(r / mid - 1) <= 0.005) ? mid : null;
}

const scale = (seed: EmaSeed, r: number): EmaSeed => seed.map((e) => (e === null ? null : e * r));

const stats = { seeded: 0, bySymbol: 0, scaled: 0, unsteady: [] as string[], none: 0, listedInWindow: 0 };
const writer = new StocksWriter();
const sample: { symbol: string; ma200: number; ma50: number }[] = [];
for await (const s of readStocks(new Blob([readFileSync(stocksPath)]).stream()) as AsyncGenerator<StockSeries>) {
  delete s.ema0;
  const seed = seeds.stocks[s.isin] ?? bySymbol.get(s.symbol);
  if (!seed) {
    if (s.listed) stats.listedInWindow++;
    else stats.none++;
  } else {
    const r = ratio(seed, (k) => s.c[k]);
    if (r === null) stats.unsteady.push(s.symbol);
    else {
      s.ema0 = scale(seed.seed, r);
      stats.seeded++;
      if (!seeds.stocks[s.isin]) stats.bySymbol++;
      if (Math.abs(r - 1) > 0.005) stats.scaled++;
    }
  }
  if (["RELIANCE", "HDFCBANK", "ACUTAAS", "TCS"].includes(s.symbol)) {
    const lines = emaLines(compact(head, s).close, s.ema0);
    sample.push({ symbol: s.symbol, ma50: lines.ma50.at(-1) as number, ma200: lines.ma200.at(-1) as number });
  }
  await writer.write(s);
}

head.ema0 = {};
const idxMissing: string[] = [];
for (const [name, arr] of Object.entries(head.indices)) {
  const seed = seeds.indices[name];
  const r = seed ? ratio(seed, (k) => arr[k]) : null;
  if (seed && r !== null) head.ema0[name] = scale(seed.seed, r);
  else idxMissing.push(name);
}

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "head.json"), JSON.stringify(head));
writeFileSync(join(outDir, "stocks.ndjson.gz"), await writer.finish());
console.log(JSON.stringify({ ...stats, unsteady: stats.unsteady.length, unsteadySymbols: stats.unsteady.slice(0, 30), stored: writer.count }, null, 1));
console.log(`indices seeded ${Object.keys(head.ema0).length} of ${Object.keys(head.indices).length}; NIFTY 500: ${JSON.stringify(head.ema0["NIFTY 500"])}`);
console.log(`not seeded: ${idxMissing.slice(0, 40).join(", ")}`);
console.log("latest EMAs:", JSON.stringify(sample));
