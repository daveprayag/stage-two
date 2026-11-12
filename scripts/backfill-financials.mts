/**
 * One-off fill of P.financials for tonight's news shortlist (the nightly job then keeps it current, 40 stocks a run).
 *   pnpm tsx scripts/backfill-financials.mts <screen.json> <results.json> <watchlist.json> <out.json>
 * then upload <out.json> to news/financials.json in R2. Stays near 1 NSE request a second.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { newsShortlist, refreshFinancials } from "../src/engine/jobs";
import { MemoryStorage, P } from "../src/engine/storage";
import type { ScreenFile } from "../src/engine/types";

const [screenPath, resultsPath, watchPath, out] = process.argv.slice(2);
if (!screenPath || !resultsPath || !watchPath || !out) throw new Error("usage: backfill-financials.mts <screen.json> <results.json> <watchlist.json> <out.json>");
const screen = JSON.parse(readFileSync(screenPath, "utf8")) as ScreenFile;
const meetings = (JSON.parse(readFileSync(resultsPath, "utf8")) as { bySymbol: Record<string, string[]> }).bySymbol;
const watch = JSON.parse(readFileSync(watchPath, "utf8")) as { items: { symbol: string }[] };
const symbols = newsShortlist(screen.rows, undefined, new Set(watch.items.map((w) => w.symbol))).map((r) => r.symbol);
const st = new MemoryStorage();
const log: string[] = [];
for (let k = 0; k < symbols.length; k += 5) {
  await refreshFinancials(st, symbols.slice(k, k + 5), meetings, log, undefined, 5);
  await new Promise((r) => setTimeout(r, 4000));
  console.error(`${Math.min(k + 5, symbols.length)}/${symbols.length}`, log.at(-1));
}
const file = await st.getJson(P.financials);
writeFileSync(out, JSON.stringify(file));
console.log(log.join("\n"));
