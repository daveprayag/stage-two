/**
 * One-time: upload a price store (exported from livermore's adjusted NSE data) to Blob and build the first screen.
 *   pnpm tsx --env-file=.env.local scripts/bootstrap.mts .bootstrap/prices.json.gz
 * Needs BLOB_READ_WRITE_TOKEN (vercel env pull). Refuses to overwrite a newer store.
 */
import { readFileSync } from "node:fs";
import { gunzipSync, strFromU8 } from "fflate";
import { PATHS, readJson, writeJson } from "../src/engine/blob";
import { computeScreen } from "../src/engine/screen";
import type { PriceStore, ScreenFile } from "../src/engine/types";

const file = process.argv[2] ?? ".bootstrap/prices.json.gz";
const store = JSON.parse(strFromU8(gunzipSync(readFileSync(file)))) as PriceStore;
const existing = await readJson<PriceStore>(PATHS.prices, true);
if (existing && existing.asOf >= store.asOf && !process.argv.includes("--overwrite")) {
  console.log(`Blob already has a store as of ${existing.asOf}; not overwriting (pass --overwrite to force).`);
  process.exit(0);
}
await writeJson(PATHS.prices, store);
const screen: ScreenFile = { ...computeScreen(store), news: {}, newsAt: null };
await writeJson(PATHS.screen, screen);
await writeJson(PATHS.screenOn(screen.asOf), screen);
console.log(`uploaded store as of ${store.asOf} (${Object.keys(store.stocks).length} stocks); screen rows ${screen.rows.length}`);
