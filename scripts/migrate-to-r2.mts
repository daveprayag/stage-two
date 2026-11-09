/**
 * One-off: copy Stage Two's data from Vercel Blob into a local folder laid out like the R2 bucket (src/engine/storage.ts
 * P), converting the price store to the streamed format and adding rows/closes. Upload with scripts/upload-r2.sh.
 *   pnpm tsx --env-file=.env.local scripts/migrate-to-r2.mts .r2
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { PATHS, readJson } from "../src/engine/blob";
import { allRows } from "../src/engine/screen";
import { P } from "../src/engine/storage";
import { encodeStore } from "../src/engine/storefile";
import type { PriceStore } from "../src/engine/types";

const out = process.argv[2] ?? ".r2";
const put = (key: string, data: string | Uint8Array) => {
  const f = join(out, key);
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, data);
};
const store = await readJson<PriceStore>(PATHS.prices, true);
if (!store) throw new Error("no price store in Blob");
const sectors = (await readJson<Record<string, string>>(PATHS.sectors, true)) ?? {};
const { head, stocks } = await encodeStore(store);
put(P.head, JSON.stringify(head));
put(P.stocks, stocks);
const closes: Record<string, [string, number]> = {};
for (const s of Object.values(store.stocks)) {
  for (let k = s.c.length - 1; k >= 0; k--) if (s.c[k] !== null) { closes[s.symbol] = [s.isin, s.c[k] as number]; break; }
}
put(P.closes, JSON.stringify(closes));
put(P.rows, JSON.stringify([...allRows(store, sectors).values()]));
for (const [key, blobPath] of [[P.screen, PATHS.screen], [P.announcements, PATHS.announcements], [P.runs, PATHS.runs], [P.track, PATHS.track], [P.sectors, PATHS.sectors], [P.eodState, PATHS.eodState], [P.filingsState, PATHS.filingsState]] as const) {
  const v = await readJson<unknown>(blobPath, true);
  if (v !== null) put(key, JSON.stringify(v));
}
const screen = await readJson<{ asOf: string }>(PATHS.screen, true);
if (screen) put(P.screenOn(screen.asOf), JSON.stringify(screen));
console.log(`store ${store.asOf}: ${Object.keys(store.stocks).length} stocks, ${(stocks.length / 1e6).toFixed(1)} MB compressed → ${out}/`);
