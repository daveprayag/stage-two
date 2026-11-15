/**
 * Research (livermore DECISIONS 2026-11-15, exit-rule test): with the Momentum leaders from the replay
 * (scripts/replay-history.mts), compare exit rules as single trades and as a 10-slot portfolio at fixed capital.
 *
 *   NODE_OPTIONS=--max-old-space-size=12000 pnpm tsx scripts/replay-exits.mts <replay dir> <out.txt>
 *
 * Every rule: buy at the next open; initial stop = lowest low of the last 10 sessions up to the signal day; at most
 * 120 sessions; 0.25% costs each side. Only the profit-side exit differs (E1–E5 below).
 */
import { createReadStream, readdirSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { loadMarketData } from "../../livermore/packages/data/src/index";

const HOLD = 120;
const SIDE_COST = 0.0025;
const SLOTS = 10;
const SLOT = 10; // of 100 starting capital
const SEEDS = 20;
const START = "2011-08-01";
const [dir, out] = process.argv.slice(2);
if (!dir || !out) throw new Error("usage: replay-exits.mts <replay dir> <out.txt>");

type Rule = "E1" | "E2" | "E3" | "E4" | "E5";
const RULES: { key: Rule; name: string }[] = [
  { key: "E1", name: "E1 21 EMA close (current)" },
  { key: "E2", name: "E2 50 EMA close" },
  { key: "E3", name: "E3 off Momentum leaders" },
  { key: "E4", name: "E4 hold (stop + 120 sessions)" },
  { key: "E5", name: "E5 1/3 at 2R, rest 21 EMA" },
];

const t0 = Date.now();
const md = await loadMarketData({ dataDir: "/Users/prayagcruit/Documents/Dev/livermore/data", from: "2010-01-04", to: "2026-12-31", warmupDays: 0 });
const cal = md.calendar;
const N = cal.length;
const at = new Map(cal.map((d, k) => [d, k]));

type Arr = (number | null)[];
interface Inst { isin: string; o: Arr; h: Arr; l: Arr; c: Arr; e21: Arr; e50: Arr }
const byIsin = new Map<string, Inst>();
for (const ins of md.instruments.values()) {
  const mk = (): Arr => new Array(N).fill(null);
  const x: Inst = { isin: ins.isin, o: mk(), h: mk(), l: mk(), c: mk(), e21: mk(), e50: mk() };
  for (const b of ins.bars) {
    const k = at.get(b.date);
    if (k === undefined) continue;
    x.o[k] = b.open; x.h[k] = b.high; x.l[k] = b.low; x.c[k] = b.close;
  }
  let a: number | null = null, b: number | null = null;
  for (let k = 0; k < N; k++) {
    const c = x.c[k];
    if (c !== null) {
      a = a === null ? c : a + (2 / 22) * (c - a);
      b = b === null ? c : b + (2 / 51) * (c - b);
    }
    x.e21[k] = a; x.e50[k] = b;
  }
  byIsin.set(ins.isin, x);
}

// Momentum leaders per session, from the replay.
const lists: Set<string>[] = Array.from({ length: N }, () => new Set<string>());
for (const f of readdirSync(dir).filter((f) => /^p\d+\.csv$/.test(f)).sort()) {
  const rl = createInterface({ input: createReadStream(`${dir}/${f}`) });
  let first = true;
  for await (const line of rl) {
    if (first) { first = false; continue; }
    const p = line.split(",");
    const k = at.get(p[0]!);
    if (k !== undefined && p[10]!.split("|").includes("momentum")) lists[k]!.add(p[1]!);
  }
}
let lastList = 0;
for (let k = 0; k < N; k++) if (lists[k]!.size) lastList = k;
console.error(`loaded ${byIsin.size} stocks, ${N} sessions, lists to ${cal[lastList]} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);

interface Sale { k: number; atOpen: boolean; frac: number; px: number }
interface Trade { isin: string; e: number; entry: number; stop: number; sales: Sale[]; done: boolean; stopped: boolean }

/** One trade from a signal on session k under `rule`; null if it can't be entered. Open trades end at the data's end. */
function runTrade(x: Inst, k: number, rule: Rule): Trade | null {
  const e = k + 1;
  const entry = e < N ? x.o[e] : null;
  if (entry === null || entry === undefined) return null;
  let stop = Infinity;
  for (let j = Math.max(0, k - 9); j <= k; j++) if (x.l[j] !== null) stop = Math.min(stop, x.l[j] as number);
  if (!(entry > stop)) return null;
  const target = entry + 2 * (entry - stop);
  const t: Trade = { isin: x.isin, e, entry, stop, sales: [], done: false, stopped: false };
  let left = 1, took = false, pending = false;
  const sell = (k2: number, atOpen: boolean, frac: number, px: number) => { t.sales.push({ k: k2, atOpen, frac, px }); left -= frac; };
  for (let j = e; j < N; j++) {
    const o = x.o[j], h = x.h[j], l = x.l[j], c = x.c[j];
    if (o === null || h === null || l === null || c === null) continue;
    if (j > e) {
      if (pending) { sell(j, true, left, o); t.done = true; return t; }
      if (o <= stop) { sell(j, true, left, o); t.done = t.stopped = true; return t; }
      if (rule === "E5" && !took && o >= target) { sell(j, true, 1 / 3, o); took = true; }
    }
    if (l <= stop) { sell(j, false, left, stop); t.done = t.stopped = true; return t; }
    if (rule === "E5" && !took && h >= target) { sell(j, false, 1 / 3, target); took = true; }
    if (j >= e + HOLD) { sell(j, false, left, c); t.done = true; return t; }
    if (rule === "E1" || rule === "E5") pending = c < (x.e21[j] as number);
    else if (rule === "E2") pending = c < (x.e50[j] as number);
    else if (rule === "E3") pending = j <= lastList && !lists[j]!.has(x.isin);
  }
  return t; // still open at the end of the data
}

const pctOf = (t: Trade) => t.sales.reduce((s, x) => s + x.frac * x.px * (1 - SIDE_COST), 0) / (t.entry * (1 + SIDE_COST)) - 1;
const period = (d: string) => {
  const y = Number(d.slice(0, 4));
  return y === 2011 ? "2011 (shown only)" : y <= 2015 ? "2012-15" : y <= 2024 ? "2016-24" : "2025-26 (hold-out)";
};
const PERIODS = ["2011 (shown only)", "2012-15", "2016-24", "2025-26 (hold-out)"];
const lines: string[] = [];
const say = (s: string) => { lines.push(s); console.log(s); };
const f1 = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(1)}`;
const f2 = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(2)}`;
const kStart = cal.findIndex((d) => d >= START);

// ------------------------------------------------------------------ per trade (secondary)
say(`EXIT TEST — Momentum leaders from the replay, ${cal[kStart]} → ${cal[lastList]}; buy next open, stop = 10-session low, ≤ ${HOLD} sessions, 0.5% costs`);
say("\nPer trade, every Momentum-leader day (completed trades only; reported, not judged):");
for (const r of RULES) {
  say(`  ${r.name}`);
  const by = new Map<string, number[][]>();
  for (let k = kStart; k <= lastList; k++) {
    for (const isin of lists[k]!) {
      const t = runTrade(byIsin.get(isin)!, k, r.key);
      if (!t || !t.done) continue;
      const last = t.sales[t.sales.length - 1]!.k;
      const p = period(cal[k]!);
      if (!by.has(p)) by.set(p, []);
      by.get(p)!.push([pctOf(t) * 100, last - t.e + (t.sales[t.sales.length - 1]!.atOpen ? 0 : 1), t.stopped ? 1 : 0]);
    }
  }
  for (const p of PERIODS) {
    const v = by.get(p) ?? [];
    if (!v.length) continue;
    const pct = v.map((x) => x[0]!).sort((a, b) => a - b);
    const mean = pct.reduce((s, x) => s + x, 0) / v.length;
    const days = v.reduce((s, x) => s + x[1]!, 0) / v.length;
    say(`    ${p.padEnd(20)} n=${String(v.length).padStart(7)}  mean ${f2(mean)}%  median ${f2(pct[Math.floor(v.length / 2)]!)}%  win ${((v.filter((x) => x[0]! > 0).length / v.length) * 100).toFixed(1)}%  stopped ${((v.filter((x) => x[2] === 1).length / v.length) * 100).toFixed(1)}%  days ${days.toFixed(1)}  per session held ${f2(mean / days)}%`);
  }
}

// ------------------------------------------------------------------ portfolio (primary)
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

interface Pos { t: Trade; shares: number; next: number }
const cache = new Map<string, Trade | null>();
/** Daily equity (100 = starting capital, fixed slot size) from START to the last list day + exits. */
function portfolio(rule: Rule, seed: number) {
  const rand = rng(seed * 7919 + 17);
  let cash = 100;
  let held: Pos[] = [];
  const eq: number[] = new Array(N).fill(NaN);
  let trades = 0, slotDays = 0, days = 0;
  const get = (isin: string, k: number) => {
    const key = `${rule}|${isin}|${k}`;
    if (!cache.has(key)) cache.set(key, runTrade(byIsin.get(isin)!, k, rule));
    return cache.get(key)!;
  };
  const settle = (p: Pos, j: number, atOpen: boolean | null) => {
    while (p.next < p.t.sales.length && p.t.sales[p.next]!.k === j && (atOpen === null || p.t.sales[p.next]!.atOpen === atOpen)) {
      const s = p.t.sales[p.next]!;
      cash += s.frac * p.shares * s.px * (1 - SIDE_COST);
      p.next++;
    }
  };
  const finished = (p: Pos) => p.t.done && p.next >= p.t.sales.length;
  const lastClose = (x: Inst, j: number) => { for (let q = j; q >= 0; q--) if (x.c[q] !== null) return x.c[q] as number; return 0; };
  for (let j = kStart; j < N; j++) {
    // Sales at the open, then fills at the open, then the rest of the day.
    for (const p of held) settle(p, j, true);
    held = held.filter((p) => !finished(p));
    if (j - 1 <= lastList && j - 1 >= kStart) {
      const have = new Set(held.map((p) => p.t.isin));
      const cand = [...lists[j - 1]!].filter((i) => !have.has(i));
      for (let i = cand.length - 1; i > 0; i--) { const r = Math.floor(rand() * (i + 1)); [cand[i], cand[r]] = [cand[r]!, cand[i]!]; }
      for (const isin of cand) {
        if (held.length >= SLOTS) break;
        const t = get(isin, j - 1);
        if (!t) continue;
        const shares = SLOT / t.entry;
        cash -= SLOT * (1 + SIDE_COST);
        held.push({ t, shares, next: 0 });
        trades++;
      }
    }
    for (const p of held) settle(p, j, null);
    held = held.filter((p) => !finished(p));
    let v = cash;
    for (const p of held) {
      const sold = p.t.sales.slice(0, p.next).reduce((s, x) => s + x.frac, 0);
      v += (1 - sold) * p.shares * lastClose(byIsin.get(p.t.isin)!, j);
    }
    eq[j] = v;
    if (j <= lastList) { slotDays += held.length; days++; }
    if (j > lastList && !held.length) break;
  }
  return { eq, trades, fill: slotDays / days / SLOTS };
}

const years = [...new Set(cal.slice(kStart, lastList + 1).map((d) => d.slice(0, 4)))];
/** Year → change in equity over the year (points of starting capital = % at fixed capital), to the last list day. */
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
const pYears: Record<string, string[]> = { "2011 (shown only)": ["2011"], "2012-15": ["2012", "2013", "2014", "2015"], "2016-24": ["2016", "2017", "2018", "2019", "2020", "2021", "2022", "2023", "2024"], "2025-26 (hold-out)": ["2025", "2026"] };
const span = (p: string) => {
  const ys = pYears[p]!;
  const ks = cal.map((d, k) => [d, k] as const).filter(([d, k]) => k >= kStart && k <= lastList && ys.includes(d.slice(0, 4)));
  return { from: ks[0]![1], to: ks[ks.length - 1]![1], years: ks.length / 248 };
};

say(`\nPortfolio: ${SLOTS} slots of ${SLOT}% of starting capital, fixed size (no compounding), random pick from the previous session's Momentum leaders, ${SEEDS} seeds. Return per year = % of starting capital.`);
const res = new Map<Rule, { year: Map<string, number>; per: Map<string, number>; perMin: Map<string, number>; perMax: Map<string, number>; dd: Map<string, number>; trades: number; fill: number }>();
for (const r of RULES) {
  const yr = new Map<string, number>(); const per = new Map<string, number[]>(); const dd = new Map<string, number>();
  let trades = 0, fill = 0;
  for (let s = 0; s < SEEDS; s++) {
    const p = portfolio(r.key, s);
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
  res.set(r.key, { year: yr, per: mean, perMin: new Map([...per].map(([k, v]) => [k, Math.min(...v)])), perMax: new Map([...per].map(([k, v]) => [k, Math.max(...v)])), dd, trades, fill });
  console.error(`${r.key} done (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}
for (const p of PERIODS) {
  say(`  ${p}`);
  for (const r of RULES) {
    const x = res.get(r.key)!;
    say(`    ${r.name.padEnd(32)} ${f1(x.per.get(p)!)}%/yr (seeds ${f1(x.perMin.get(p)!)} … ${f1(x.perMax.get(p)!)})  max drawdown ${x.dd.get(p)!.toFixed(1)}%`);
  }
}
say("\n  By calendar year (% of starting capital, mean of seeds):");
say(`    ${"year".padEnd(6)}${RULES.map((r) => r.key.padStart(8)).join("")}`);
for (const y of years) say(`    ${y.padEnd(6)}${RULES.map((r) => f1(res.get(r.key)!.year.get(y)!).padStart(8)).join("")}`);
say(`  trades over the whole run / slots in use: ${RULES.map((r) => `${r.key} ${Math.round(res.get(r.key)!.trades)} / ${(res.get(r.key)!.fill * 100).toFixed(0)}%`).join(", ")}`);

say("\nVerdicts (beats E1: higher return per year in 2012-15, 2016-24 and 2025-26, and ahead in ≥ 9 of the 15 years 2012–2026):");
const e1 = res.get("E1")!;
const judged = PERIODS.slice(1);
const judgedYears = years.filter((y) => y >= "2012");
for (const r of RULES.slice(1)) {
  const x = res.get(r.key)!;
  const periodsOk = judged.every((p) => x.per.get(p)! > e1.per.get(p)!);
  const ahead = judgedYears.filter((y) => x.year.get(y)! > e1.year.get(y)!).length;
  const ddFlag = judged.filter((p) => x.dd.get(p)! > 1.5 * e1.dd.get(p)!);
  say(`  ${r.name.padEnd(32)} periods higher: ${judged.map((p) => (x.per.get(p)! > e1.per.get(p)! ? "yes" : "no")).join("/")}, years ahead ${ahead}/${judgedYears.length} → ${periodsOk && ahead >= 9 ? "BEATS E1" : "does not beat E1"}${ddFlag.length ? `  (drawdown > 1.5× E1 in ${ddFlag.join(", ")})` : ""}`);
}
writeFileSync(out, lines.join("\n") + "\n");
console.error(`done in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
