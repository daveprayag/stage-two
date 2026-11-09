/**
 * Merge a symbol → NSE sector map (exported from livermore's industries.parquet) into R2 meta/sectors.json.
 * Incoming non-empty values win; symbols the Worker labelled itself and the file lacks are kept.
 *   pnpm tsx scripts/upload-sectors.mts sectors.json
 * Then rebuild the screen with the new labels: GET https://stage-two-engine.prayagdave.workers.dev/api/run/eod?rebuild=1
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const KEY = "stage-two-data/meta/sectors.json";
const wrangler = (...args: string[]) =>
  execFileSync("npx", ["-y", "wrangler@4.158.0", ...args], { cwd: new URL("../worker/", import.meta.url), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

const incoming = JSON.parse(readFileSync(process.argv[2] ?? "sectors.json", "utf8")) as Record<string, string>;
let current: Record<string, string> = {};
try {
  current = JSON.parse(wrangler("r2", "object", "get", KEY, "--remote", "--pipe")) as Record<string, string>;
} catch {
  console.log("no sectors in R2 yet");
}
const merged = { ...current };
for (const [k, v] of Object.entries(incoming)) if (v) merged[k] = v;
const file = join(mkdtempSync(join(tmpdir(), "sectors-")), "sectors.json");
writeFileSync(file, JSON.stringify(merged));
wrangler("r2", "object", "put", KEY, "--file", file, "--content-type", "application/json", "--remote");
console.log(`sectors: ${Object.keys(incoming).length} incoming, ${Object.values(merged).filter(Boolean).length} labelled symbols in R2`);
