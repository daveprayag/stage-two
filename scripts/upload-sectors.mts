/**
 * Upload a symbol → NSE sector map (exported from livermore's industries.parquet) to Blob as meta/sectors.json,
 * merged over what is there (entries already present win only if the file has no value for that symbol).
 *   pnpm tsx --env-file=.env.local scripts/upload-sectors.mts sectors.json
 */
import { readFileSync } from "node:fs";
import { PATHS, readJson, writeJson } from "../src/engine/blob";

const incoming = JSON.parse(readFileSync(process.argv[2] ?? "sectors.json", "utf8")) as Record<string, string>;
const current = (await readJson<Record<string, string>>(PATHS.sectors, true)) ?? {};
const merged = { ...current };
for (const [k, v] of Object.entries(incoming)) if (v) merged[k] = v;
await writeJson(PATHS.sectors, merged);
console.log(`sectors: ${Object.keys(incoming).length} incoming, ${Object.values(merged).filter(Boolean).length} labelled symbols in Blob`);
