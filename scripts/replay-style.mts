/**
 * Research (livermore DECISIONS 2026-11-17, short-swing "early and rising" test, pre-registered): do Momentum leaders
 * that are early-phase, out of their side-trend base and up over the last month (S) beat the other leaders (C) over
 * 15/20/30-session holds, and does a short-swing portfolio of S pay, or beat the current plan (all leaders, stop + 120)?
 *
 *   NODE_OPTIONS=--max-old-space-size=12000 pnpm tsx scripts/replay-style.mts <replay dir> <out.txt>
 *
 * Trade as in the exit test (scripts/replay-exits.mts): buy at the next open; stop = lowest low of the 10 sessions to
 * the signal day, set once (skip if the open is at or below it); sell at the stop, or at the close of the H-th session
 * held; 0.25% costs each side.
 */
import { createReadStream, readdirSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { loadMarketData } from "../../livermore/packages/data/src/index";
import { emaArr, findBase } from "../src/engine/series";

const HOLDS = [15, 20, 30, 120] as const;
const SIDE_COST = 0.0025;
const SLOTS = 10;
const SLOT = 10;
const SEEDS = 20;
const START = "2011-08-01";
const [dir, out] = process.argv.slice(2);
if (!dir || !out) throw new Error("usage: replay-style.mts <replay dir> <out.txt>");

const t0 = Date.now();
const md = await loadMarketData({ dataDir: "/Users/prayagcruit/Documents/Dev/livermore/data", from: "2010-01-04", to: "2026-12-31", warmupDays: 0 });
const cal = md.calendar;
const N = cal.length;
const at = new Map(cal.map((d, k) => [d, k]));

type Arr = (number | null)[];
interface Inst { isin: string; o: Arr; h: Arr; l: Arr; c: Arr; local: Int32Array; closes: number[]; ema50: number[] }
const byIsin = new Map<string, Inst>();
for (const ins of md.instruments.values()) {
  const mk = (): Arr => new Array(N).fill(null);
  const x: Inst = { isin: ins.isin, o: mk(), h: mk(), l: mk(), c: mk(), local: new Int32Array(N).fill(-1), closes: [], ema50: [] };
  for (const b of ins.bars) {
    const k = at.get(b.date);
    if (k === undefined) continue;
    x.o[k] = b.open; x.h[k] = b.high; x.l[k] = b.low; x.c[k] = b.close;
    x.local[k] = x.closes.length;
    x.closes.push(b.close);
  }
  x.ema50 = emaArr(x.closes, 50);
  byIsin.set(ins.isin, x);
}

// Momentum leaders per session from the replay, split into S (the user's style) and C (the rest).
const S: Set<string>[] = Array.from({ length: N }, () => new Set<string>());
const C: Set<string>[] = Array.from({ length: N }, () => new Set<string>());
const ALL: Set<string>[] = Array.from({ length: N }, () => new Set<string>());
let why = { early: 0, outOfBase: 0, rising: 0, leaders: 0 };
for (const f of readdirSync(dir).filter((f) => /^p\d+\.csv$/.test(f)).sort()) {
  const rl = createInterface({ input: createReadStream(`${dir}/${f}`) });
  let first = true;
  for await (const line of rl) {
    if (first) { first = false; continue; }
    const p = line.split(",");
    const k = at.get(p[0]!);
    if (k === undefined || !p[10]!.split("|").includes("momentum")) continue;
    const isin = p[1]!;
    const x = byIsin.get(isin);
    if (!x || ALL[k]!.has(isin)) continue;
    ALL[k]!.add(isin);
    why.leaders++;
    let s = false;
    const li = x.local[k]!;
    if (p[6] === "early" && li >= 21) {
      why.early++;
      const base = findBase(x.closes, x.ema50, li);
      if (base && !base.inBase) {
        why.outOfBase++;
        if (x.closes[li]! / x.closes[li - 21]! > 1) { why.rising++; s = true; }
      }
    }
    (s ? S : C)[k]!.add(isin);
  }
}
let lastList = 0;
for (let k = 0; k < N; k++) if (ALL[k]!.size) lastList = k;
console.error(`loaded ${byIsin.size} stocks, lists to ${cal[lastList]}; ${JSON.stringify(why)} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);

interface Trade { isin: string; e: number; entry: number; exitK: number; exitPx: number; atOpen: boolean; done: boolean; stopped: boolean }
function runTrade(x: Inst, k: number, hold: number): Trade | null {
  const e = k + 1;
  const entry = e < N ? x.o[e] : null;
  if (entry === null || entry === undefined) return null;
  let stop = Infinity;
  for (let j = Math.max(0, k - 9); j <= k; j++) if (x.l[j] !== null) stop = Math.min(stop, x.l[j] as number);
  if (!(entry > stop)) return null;
  const t: Trade = { isin: x.isin, e, entry, exitK: -1, exitPx: 0, atOpen: false, done: false, stopped: false };
  const end = (j: number, px: number, atOpen: boolean, stopped: boolean) => { t.exitK = j; t.exitPx = px; t.atOpen = atOpen; t.done = true; t.stopped = stopped; return t; };
  for (let j = e; j < N; j++) {
    const o = x.o[j], l = x.l[j], c = x.c[j];
    if (o === null || l === null || c === null) continue;
    if (j > e && o <= stop) return end(j, o, true, true);
    if (l <= stop) return end(j, stop, false, true);
    if (j >= e + hold - 1) return end(j, c, false, false);
  }
  return t;
}
const pctOf = (t: Trade) => (t.exitPx * (1 - SIDE_COST)) / (t.entry * (1 + SIDE_COST)) - 1;

const period = (d: string) => {
  const y = Number(d.slice(0, 4));
  return y === 2011 ? "2011 (shown only)" : y <= 2015 ? "2012-15" : y <= 2024 ? "2016-24" : "2025-26";
};
const PERIODS = ["2011 (shown only)", "2012-15", "2016-24", "2025-26"];
const JUDGED = PERIODS.slice(1);
const lines: string[] = [];
const say = (s: string) => { lines.push(s); console.log(s); };
const f1 = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(1)}`;
const f2 = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(2)}`;
const kStart = cal.findIndex((d) => d >= START);

say(`SHORT-SWING TEST — Momentum leaders from the replay, ${cal[kStart]} → ${cal[lastList]}; buy next open, stop = 10-session low (set once), sell at the stop or the close of the H-th session; 0.5% costs a round trip`);
say(`Leader days ${why.leaders}: early ${why.early}, early and out of base ${why.outOfBase}, and up over 21 sessions (S) ${why.rising}`);

// ------------------------------------------------------------------ Q1: per trade, S vs C
const cache = new Map<string, Trade | null>();
const trade = (isin: string, k: number, hold: number) => {
  const key = `${hold}|${isin}|${k}`;
  if (!cache.has(key)) cache.set(key, runTrade(byIsin.get(isin)!, k, hold));
  return cache.get(key)!;
};
const q1 = new Map<number, boolean>();
say("\nQ1 per trade (completed trades; monthly = trades grouped by signal month):");
for (const H of HOLDS) {
  say(`  H = ${H} sessions`);
  const month = new Map<string, { s: number[]; c: number[] }>();
  const pooled = new Map<string, { s: number[][]; c: number[][] }>();
  for (let k = kStart; k <= lastList; k++) {
    for (const [grp, set] of [["s", S[k]!], ["c", C[k]!]] as const) {
      for (const isin of set) {
        const t = trade(isin, k, H);
        if (!t || !t.done) continue;
        const m = cal[k]!.slice(0, 7), p = period(cal[k]!);
        if (!month.has(m)) month.set(m, { s: [], c: [] });
        if (!pooled.has(p)) pooled.set(p, { s: [], c: [] });
        const r = pctOf(t) * 100;
        month.get(m)![grp].push(r);
        pooled.get(p)![grp].push([r, t.stopped ? 1 : 0, t.exitK - t.e + 1]);
      }
    }
  }
  let all = true;
  for (const p of PERIODS) {
    const g = pooled.get(p);
    if (!g) continue;
    const desc = (v: number[][]) => {
      if (!v.length) return "n=0";
      const r = v.map((x) => x[0]!).sort((a, b) => a - b);
      const mean = r.reduce((a, b) => a + b, 0) / r.length;
      return `n=${String(v.length).padStart(6)} mean ${f2(mean)}% median ${f2(r[r.length >> 1]!)}% win ${((r.filter((x) => x > 0).length / r.length) * 100).toFixed(0)}% stopped ${((v.filter((x) => x[1] === 1).length / v.length) * 100).toFixed(0)}% days ${(v.reduce((a, x) => a + x[2]!, 0) / v.length).toFixed(1)}`;
    };
    const diffs: number[] = [];
    for (const [m, v] of month) {
      if (period(`${m}-01`) !== p || !v.s.length || !v.c.length) continue;
      diffs.push(v.s.reduce((a, b) => a + b, 0) / v.s.length - v.c.reduce((a, b) => a + b, 0) / v.c.length);
    }
    const md2 = diffs.reduce((a, b) => a + b, 0) / (diffs.length || 1);
    const sd = Math.sqrt(diffs.reduce((a, b) => a + (b - md2) ** 2, 0) / Math.max(1, diffs.length - 1));
    const ahead = diffs.filter((d) => d > 0).length;
    const ok = md2 > 0 && ahead > diffs.length / 2;
    if (JUDGED.includes(p) && !ok) all = false;
    say(`    ${p.padEnd(18)} S ${desc(g.s)}`);
    say(`    ${"".padEnd(18)} C ${desc(g.c)}`);
    say(`    ${"".padEnd(18)} S − C by month ${f2(md2)} pp ± ${(2 * sd / Math.sqrt(diffs.length || 1)).toFixed(2)} (2 SE), S ahead ${ahead}/${diffs.length}${JUDGED.includes(p) ? (ok ? "  ok" : "  not ok") : ""}`);
  }
  q1.set(H, all);
}

// ------------------------------------------------------------------ Q2/Q3: portfolio
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
interface Pos { t: Trade; shares: number }
function portfolio(lists: Set<string>[], hold: number, seed: number) {
  const rand = rng(seed * 7919 + 17);
  let cash = 100;
  let held: Pos[] = [];
  const eq: number[] = new Array(N).fill(NaN);
  let trades = 0, slotDays = 0, days = 0;
  const lastClose = (x: Inst, j: number) => { for (let q = j; q >= 0; q--) if (x.c[q] !== null) return x.c[q] as number; return 0; };
  const sellIf = (j: number, atOpen: boolean) => {
    held = held.filter((p) => {
      if (p.t.done && p.t.exitK === j && p.t.atOpen === atOpen) { cash += p.shares * p.t.exitPx * (1 - SIDE_COST); return false; }
      return true;
    });
  };
  for (let j = kStart; j < N; j++) {
    sellIf(j, true);
    if (j - 1 <= lastList && j - 1 >= kStart) {
      const have = new Set(held.map((p) => p.t.isin));
      const cand = [...lists[j - 1]!].filter((i) => !have.has(i));
      for (let i = cand.length - 1; i > 0; i--) { const r = Math.floor(rand() * (i + 1)); [cand[i], cand[r]] = [cand[r]!, cand[i]!]; }
      for (const isin of cand) {
        if (held.length >= SLOTS) break;
        const t = trade(isin, j - 1, hold);
        if (!t) continue;
        cash -= SLOT * (1 + SIDE_COST);
        held.push({ t, shares: SLOT / t.entry });
        trades++;
      }
    }
    sellIf(j, false);
    let v = cash;
    for (const p of held) v += p.shares * lastClose(byIsin.get(p.t.isin)!, j);
    eq[j] = v;
    if (j <= lastList) { slotDays += held.length; days++; }
    if (j > lastList && !held.length) break;
  }
  return { eq, trades, fill: slotDays / days / SLOTS };
}
const years = [...new Set(cal.slice(kStart, lastList + 1).map((d) => d.slice(0, 4)))];
function yearly(eq: number[]) {
  const r = new Map<string, number>();
  let prev = 100;
  for (const y of years) {
    let endK = -1;
    for (let k = kStart; k <= lastList; k++) if (cal[k]!.startsWith(y)) endK = k;
    r.set(y, eq[endK]! - prev);
    prev = eq[endK]!;
  }
  return r;
}
function maxDD(eq: number[], from: number, to: number) {
  let peak = -Infinity, dd = 0;
  for (let k = from; k <= to; k++) { if (!Number.isFinite(eq[k]!)) continue; peak = Math.max(peak, eq[k]!); dd = Math.max(dd, peak - eq[k]!); }
  return dd;
}
const pYears: Record<string, string[]> = { "2011 (shown only)": ["2011"], "2012-15": ["2012", "2013", "2014", "2015"], "2016-24": ["2016", "2017", "2018", "2019", "2020", "2021", "2022", "2023", "2024"], "2025-26": ["2025", "2026"] };
const span = (p: string) => {
  const ks = cal.map((d, k) => [d, k] as const).filter(([d, k]) => k >= kStart && k <= lastList && pYears[p]!.includes(d.slice(0, 4)));
  return { from: ks[0]![1], to: ks[ks.length - 1]![1], years: ks.length / 248 };
};

const CONFIGS = [
  { key: "S15", name: "S, hold 15", lists: S, hold: 15 },
  { key: "S20", name: "S, hold 20", lists: S, hold: 20 },
  { key: "S30", name: "S, hold 30", lists: S, hold: 30 },
  { key: "S120", name: "S, stop + 120 (Q3)", lists: S, hold: 120 },
  { key: "ALL120", name: "all leaders, stop + 120 (current plan)", lists: ALL, hold: 120 },
];
say(`\nPortfolio: ${SLOTS} slots of ${SLOT}% of starting capital, fixed size, random pick from the previous session's list (slots stay empty if none), ${SEEDS} seeds. %/yr = % of starting capital.`);
type Res = { year: Map<string, number>; per: Map<string, number>; lo: Map<string, number>; hi: Map<string, number>; dd: Map<string, number>; trades: number; fill: number };
const res = new Map<string, Res>();
for (const c of CONFIGS) {
  const yr = new Map<string, number>(), per = new Map<string, number[]>(), dd = new Map<string, number>();
  let trades = 0, fill = 0;
  for (let s = 0; s < SEEDS; s++) {
    const p = portfolio(c.lists, c.hold, s);
    trades += p.trades / SEEDS; fill += p.fill / SEEDS;
    const y = yearly(p.eq);
    for (const [k, v] of y) yr.set(k, (yr.get(k) ?? 0) + v / SEEDS);
    for (const pp of PERIODS) {
      const sp = span(pp);
      const tot = [...y].filter(([k]) => pYears[pp]!.includes(k)).reduce((a, [, v]) => a + v, 0);
      per.set(pp, [...(per.get(pp) ?? []), tot / sp.years]);
      dd.set(pp, (dd.get(pp) ?? 0) + maxDD(p.eq, sp.from, sp.to) / SEEDS);
    }
  }
  const mean = new Map([...per].map(([k, v]) => [k, v.reduce((a, b) => a + b, 0) / v.length]));
  res.set(c.key, { year: yr, per: mean, lo: new Map([...per].map(([k, v]) => [k, Math.min(...v)])), hi: new Map([...per].map(([k, v]) => [k, Math.max(...v)])), dd, trades, fill });
  console.error(`${c.key} done (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}
for (const p of PERIODS) {
  say(`  ${p}`);
  for (const c of CONFIGS) {
    const x = res.get(c.key)!;
    say(`    ${c.name.padEnd(40)} ${f1(x.per.get(p)!)}%/yr (seeds ${f1(x.lo.get(p)!)} … ${f1(x.hi.get(p)!)})  max drawdown ${x.dd.get(p)!.toFixed(1)}%`);
  }
}
say("\n  By calendar year (% of starting capital, mean of seeds):");
say(`    ${"year".padEnd(6)}${CONFIGS.map((c) => c.key.padStart(8)).join("")}`);
for (const y of years) say(`    ${y.padEnd(6)}${CONFIGS.map((c) => f1(res.get(c.key)!.year.get(y)!).padStart(8)).join("")}`);
say(`  trades over the run / slots in use: ${CONFIGS.map((c) => `${c.key} ${Math.round(res.get(c.key)!.trades)} / ${(res.get(c.key)!.fill * 100).toFixed(0)}%`).join(", ")}`);

say("\nVerdicts (pre-registered, DECISIONS 2026-11-17):");
for (const H of [15, 20, 30]) say(`  Q1 S beats C at H=${H}: ${q1.get(H) ? "PASS" : "FAIL"}`);
say(`  Q1 S beats C at H=120 (reported): ${q1.get(120) ? "yes" : "no"}`);
const cur = res.get("ALL120")!;
const judgedYears = years.filter((y) => y >= "2012");
for (const k of ["S15", "S20", "S30", "S120"]) {
  const x = res.get(k)!;
  const pays = JUDGED.every((p) => x.per.get(p)! > 0);
  const higher = JUDGED.map((p) => x.per.get(p)! > cur.per.get(p)!);
  const ahead = judgedYears.filter((y) => x.year.get(y)! > cur.year.get(y)!).length;
  const beats = higher.every(Boolean) && ahead >= 9;
  say(`  ${k.padEnd(5)} ${k === "S120" ? "Q3" : "Q2"}: ${k === "S120" ? "" : `pays in all periods ${pays ? "YES" : "NO"}; `}higher than current plan ${higher.map((h) => (h ? "yes" : "no")).join("/")}, years ahead ${ahead}/${judgedYears.length} → ${beats ? "BEATS THE CURRENT PLAN" : "does not beat the current plan"}`);
}
writeFileSync(out, lines.join("\n") + "\n");
console.error(`done in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
