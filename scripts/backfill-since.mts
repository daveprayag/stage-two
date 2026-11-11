/**
 * Back-fill the Momentum-leaders stretch state (src/engine/since.ts) by replaying the screen on every stored session
 * from <from> to the store's latest, as the EOD job would have seen it on each day (prices up to that day only).
 *   pnpm tsx scripts/backfill-since.mts <head.json> <stocks.ndjson.gz> <sectors.json> <from> <out.json>
 * then upload <out.json> to meta/momentum-since.json in R2 and rebuild the screen (/api/run/eod?rebuild=1).
 * Caveat: early sessions see less than a year of history (the store keeps 300 sessions), so their RS uses shorter
 * horizons than the live screen did; sessions from about 252 sessions after the store's first date are exact.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { computeScreen } from "../src/engine/screen";
import { updateSince, type SinceFile } from "../src/engine/since";
import { decodeStore, type StoreHeadFile } from "../src/engine/storefile";
import type { PriceStore } from "../src/engine/types";

const [headPath, stocksPath, sectorsPath, from, out] = process.argv.slice(2);
if (!headPath || !stocksPath || !sectorsPath || !from || !out) throw new Error("usage: backfill-since.mts <head.json> <stocks.ndjson.gz> <sectors.json> <from> <out.json>");
const head = JSON.parse(readFileSync(headPath, "utf8")) as StoreHeadFile;
const full = await decodeStore(head, readFileSync(stocksPath));
const sectors = JSON.parse(readFileSync(sectorsPath, "utf8"));
let state: SinceFile | null = null;
for (let k = 0; k < full.dates.length; k++) {
  const d = full.dates[k] as string;
  if (d < from) continue;
  const cut = (a: (number | null)[]) => a.slice(0, k + 1);
  const st: PriceStore = { version: 1, asOf: d, dates: full.dates.slice(0, k + 1), indices: Object.fromEntries(Object.entries(full.indices).map(([n, a]) => [n, cut(a)])), ema0: full.ema0, stocks: {} };
  for (const s of Object.values(full.stocks)) st.stocks[s.isin] = { ...s, o: cut(s.o), h: cut(s.h), l: cut(s.l), c: cut(s.c), v: cut(s.v) };
  const members = computeScreen(st, sectors).rows.filter((r) => r.tags.includes("momentum")).map((r) => r.isin);
  state = updateSince(state, d, full.dates, members);
  console.error(d, members.length);
}
if (!state) throw new Error(`no sessions from ${from}`);
writeFileSync(out, JSON.stringify(state));
console.log(`state ${state.from} → ${state.asOf}: ${Object.keys(state.runs).length} stretches`);
