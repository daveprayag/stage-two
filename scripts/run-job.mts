/** Run a nightly job locally against Blob: pnpm tsx --env-file=.env.local scripts/run-job.mts eod|news [--force] */
import { runEod, runNews } from "../src/engine/pipeline";
const job = process.argv[2];
const force = process.argv.includes("--force");
const back = process.argv.find((a) => a.startsWith("--back="));
const rec = job === "news" ? await runNews({ force, ...(back ? { backDays: Number(back.slice(7)) } : {}) }) : await runEod({ force });
console.log(JSON.stringify({ ...rec, log: rec.log.slice(0, 30) }, null, 2));
