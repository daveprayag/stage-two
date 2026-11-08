/** Dev helper: run the screener on a local prices.json.gz (e.g. .bootstrap/prices.json.gz) and print a summary. */
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync, strFromU8 } from "fflate";
import { computeScreen } from "../src/engine/screen";
import type { PriceStore } from "../src/engine/types";

const file = process.argv[2] ?? ".bootstrap/prices.json.gz";
const t0 = Date.now();
const store = JSON.parse(strFromU8(gunzipSync(readFileSync(file)))) as PriceStore;
const t1 = Date.now();
const screen = computeScreen(store);
const t2 = Date.now();
console.log(`load ${t1 - t0} ms, screen ${t2 - t1} ms, asOf ${screen.asOf}, rows ${screen.rows.length}`);
console.log("market", screen.market);
const count = (t: string) => screen.rows.filter((r) => r.tags.includes(t as never)).length;
console.log({ breakout: count("breakout"), setup: count("setup"), fresh2: count("fresh2"), leader: count("leader"), ankur: count("ankur") });
for (const r of screen.rows.slice(0, 15)) console.log(r.symbol.padEnd(12), r.score, "rs", r.rs, "stage", r.stage, r.stageAge, "tpl", r.template, "hi", r.pctFromHigh.toFixed(1), "tight", r.tight10.toFixed(1), r.tags.join(","), r.scans.join("|"), r.setup ?? "");
console.log("sectors", screen.sectors.slice(0, 6).map((s) => `${s.industry} rs${s.rs} s2 ${(s.stage2 * 100).toFixed(0)}%`));
if (process.argv[3]) writeFileSync(process.argv[3], JSON.stringify(screen));
