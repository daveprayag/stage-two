/**
 * Research replay (livermore DECISIONS 2026-11-15): run Stage Two's own screen (analyseStock + rankWork, sector buffer
 * carried day to day as live) on every session in [from, to] from livermore's adjusted price history, and write one row
 * per liquid stock with what the site would have shown and what happened next.
 *
 *   NODE_OPTIONS=--max-old-space-size=12000 pnpm tsx scripts/replay-history.mts <from> <to> <out.csv> [--nifty <out.csv>]
 *
 * Each day sees at most WINDOW sessions of history ending that day (no later data). EMAs start TradingView-style at
 * the window start (no stored seeds), so they match the live ones once the window is long. News is not replayed.
 * Forward outcomes (ret60, ret120 and, for Momentum leaders, a trade) use later bars, for measurement only.
 */
import { createWriteStream } from "node:fs";
import { analyseStock, BENCHMARK, rankWork, type Work } from "../src/engine/screen";
import type { PriceStore, StockSeries } from "../src/engine/types";
// livermore's loader (reads its adjusted Parquet store); research only, not part of the app.
import { loadMarketData } from "../../livermore/packages/data/src/index";

const WINDOW = 500;
const HOLD = 120;
const COST = 0.005;
const args = process.argv.slice(2);
const [from, to, out] = args;
const niftyOut = args.includes("--nifty") ? args[args.indexOf("--nifty") + 1] : undefined;
if (!from || !to || !out) throw new Error("usage: replay-history.mts <from> <to> <out.csv> [--nifty <out.csv>]");

const addMonths = (d: string, m: number) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCMonth(x.getUTCMonth() + m);
  return x.toISOString().slice(0, 10);
};
const t0 = Date.now();
const md = await loadMarketData({ dataDir: "/Users/prayagcruit/Documents/Dev/livermore/data", from, to: addMonths(to, 14), warmupDays: WINDOW });
const cal = md.calendar;
const N = cal.length;
const at = new Map(cal.map((d, k) => [d, k]));
console.error(`loaded ${md.instruments.size} stocks, ${N} sessions ${cal[0]} → ${cal[N - 1]} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);

type Arr = (number | null)[];
interface Inst { isin: string; symbol: string; industry: string | null; o: Arr; h: Arr; l: Arr; c: Arr; v: Arr; eq: boolean[]; band: (number | null)[]; ema21: Arr }
const insts: Inst[] = [];
for (const ins of md.instruments.values()) {
  const mk = (): Arr => new Array(N).fill(null);
  const x: Inst = { isin: ins.isin, symbol: ins.symbol, industry: md.sectors?.get(ins.isin) ?? null, o: mk(), h: mk(), l: mk(), c: mk(), v: mk(), eq: new Array(N).fill(false), band: new Array(N).fill(null), ema21: mk() };
  for (const b of ins.bars) {
    const k = at.get(b.date);
    if (k === undefined) continue;
    x.o[k] = b.open; x.h[k] = b.high; x.l[k] = b.low; x.c[k] = b.close; x.v[k] = b.volume;
    x.eq[k] = b.series === "EQ";
    x.band[k] = b.priceBand ?? null;
  }
  let e: number | null = null;
  const a = 2 / 22;
  for (let k = 0; k < N; k++) {
    const c = x.c[k];
    if (c !== null && c !== undefined) e = e === null ? c : e + a * (c - e);
    x.ema21[k] = e;
  }
  insts.push(x);
}
const benchFull: Arr = new Array(N).fill(null);
for (const b of md.indices.get(BENCHMARK)?.bars ?? []) {
  const k = at.get(b.date);
  if (k !== undefined) benchFull[k] = b.close;
}
if (niftyOut) {
  const w = createWriteStream(niftyOut);
  w.write("date,close\n");
  for (let k = 0; k < N; k++) if (benchFull[k] !== null) w.write(`${cal[k]},${benchFull[k]}\n`);
  w.end();
}

/** Last close at or before session k (null if none within 10 sessions). */
function closeAt(x: Inst, k: number): number | null {
  for (let j = Math.min(k, N - 1); j >= Math.max(0, k - 10); j--) if (x.c[j] !== null) return x.c[j] as number;
  return null;
}

/** Enter at the next open; stop; sell at the next open after a close below the 21 EMA; at most HOLD sessions. */
function trade(x: Inst, k: number, stop: number): { pct: number; r: number; stopped: boolean; days: number } | null {
  const e = k + 1;
  const entry = x.o[e];
  if (entry === null || entry === undefined || !(entry > stop)) return null;
  const risk = (entry - stop) / entry;
  let exit: number | null = null;
  let stopped = false;
  let j = e;
  for (; j < N && j <= e + HOLD; j++) {
    const o = x.o[j], l = x.l[j], c = x.c[j];
    if (o === null || l === null || c === null) continue;
    if (j > e && o <= stop) { exit = o; stopped = true; break; }
    if (l <= stop) { exit = stop; stopped = true; break; }
    if (j === e + HOLD) { exit = c; break; }
    if (c < (x.ema21[j] as number)) {
      for (let q = j + 1; q < N; q++) if (x.o[q] !== null) { exit = x.o[q] as number; j = q; break; }
      break;
    }
  }
  if (exit === null) return null;
  const pct = exit / entry - 1 - COST;
  return { pct, r: pct / risk, stopped, days: j - e };
}

const w = createWriteStream(out);
w.write("date,isin,symbol,close,rs,stage,phase,adr,sectorRank,sectorLeaders,tags,score,ret3m,pctAboveLow,resDays,resStop,resPivot,resPauseLow,ret60,ret120,tPct,tR,tStopped,tDays,tKind\n");
const kFrom = cal.findIndex((d) => d >= from);
let kTo = -1;
for (let k = 0; k < N; k++) if (cal[k]! <= to) kTo = k;
let prev = new Set<string>();
const f = (x: number | null | undefined, p = 2) => (x === null || x === undefined || !Number.isFinite(x) ? "" : Number(x.toFixed(p)));
for (let k = Math.max(1, kFrom - 1); k <= kTo; k++) {
  const ws = Math.max(0, k - WINDOW + 1);
  const dates = cal.slice(ws, k + 1);
  const store: Pick<PriceStore, "asOf" | "dates" | "indices"> = { asOf: cal[k]!, dates, indices: { [BENCHMARK]: benchFull.slice(ws, k + 1) } };
  const bench = store.indices[BENCHMARK]!;
  const work: Work[] = [];
  const byIsin = new Map<string, Inst>();
  for (const x of insts) {
    if (!x.eq[k] || x.c[k] === null) continue;
    const s: StockSeries = {
      isin: x.isin, symbol: x.symbol, name: x.symbol, series: "EQ", industry: x.industry, band: x.band[k] ?? null, listed: null,
      o: x.o.slice(ws, k + 1), h: x.h.slice(ws, k + 1), l: x.l.slice(ws, k + 1), c: x.c.slice(ws, k + 1), v: x.v.slice(ws, k + 1),
    };
    const wk = analyseStock(store, s, bench);
    if (wk) { work.push(wk); byIsin.set(x.isin, x); }
  }
  const { all } = rankWork(work, prev);
  prev = new Set(all.filter((r) => r.tags.includes("momentum")).map((r) => r.isin));
  if (k < kFrom) continue;
  for (const r of all) {
    const x = byIsin.get(r.isin)!;
    const c = r.close;
    const c60 = k + 60 < N ? closeAt(x, k + 60) : null;
    const c120 = k + 120 < N ? closeAt(x, k + 120) : null;
    let t: ReturnType<typeof trade> = null;
    let kind = "";
    if (r.tags.includes("momentum")) {
      const res = r.resume;
      if (res && res.daysAgo === 0 && res.stopPct <= 12) { t = trade(x, k, res.pauseLow); kind = "buy"; }
      else {
        let lo = Infinity;
        for (let j = Math.max(0, k - 9); j <= k; j++) if (x.l[j] !== null) lo = Math.min(lo, x.l[j] as number);
        t = trade(x, k, lo); kind = "other";
      }
    }
    const res = r.resume;
    w.write([
      cal[k], r.isin, r.symbol, f(c), r.rs, r.stage, r.phase ?? "", f(r.adr), f(r.sectorRank, 3), r.sectorLeaders ?? 0, r.tags.join("|"), r.score,
      f(r.ret3m), f(r.pctAboveLow), res ? res.daysAgo : "", res ? f(res.stopPct) : "", res ? f(res.pivot) : "", res ? f(res.pauseLow) : "",
      c60 === null ? "" : f((c60 / c - 1) * 100), c120 === null ? "" : f((c120 / c - 1) * 100),
      t ? f(t.pct * 100) : "", t ? f(t.r, 3) : "", t ? (t.stopped ? 1 : 0) : "", t ? t.days : "", kind,
    ].join(",") + "\n");
  }
  if (k % 20 === 0) console.error(`${cal[k]} liquid ${all.length} momentum ${prev.size} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}
w.end();
console.error(`done ${from} → ${to} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
