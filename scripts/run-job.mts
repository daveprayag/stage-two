/** Run a nightly job locally against Blob: pnpm tsx --env-file=.env.local scripts/run-job.mts eod|news|filings [--force] */
import { runEod, runFilings, runNews } from "../src/engine/pipeline";
const job = process.argv[2];
const force = process.argv.includes("--force");
const back = process.argv.find((a) => a.startsWith("--back="));
const rec =
  job === "news" ? await runNews({ force, source: "manual", ...(back ? { backDays: Number(back.slice(7)) } : {}) }) : job === "filings" ? await runFilings({ force, source: "manual" }) : await runEod({ force, source: "manual" });
console.log(JSON.stringify({ ...rec, log: rec.log.slice(0, 30) }, null, 2));
